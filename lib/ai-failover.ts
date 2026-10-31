import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import logger from './log';
import { getAvailableProviders, AIProviderConfig, AIProvider, defaultModelFor } from './ai-providers';
import { getWorkingModel } from './gemini-model-discovery';

// --- Circuit breaker ---

interface ProviderHealth {
  consecutiveFailures: number;
  unhealthyUntil: number | null;
  lastError: string | null;
  lastSuccessAt: number | null;
}

const QUOTA_BACKOFF_MS = 30 * 60 * 1000; // 30 min for rate-limit / quota errors
const ERROR_BACKOFF_MS =  5 * 60 * 1000; // 5 min for transient errors

const providerHealth = new Map<string, ProviderHealth>([
  ['gemini',    { consecutiveFailures: 0, unhealthyUntil: null, lastError: null, lastSuccessAt: null }],
  ['openai',    { consecutiveFailures: 0, unhealthyUntil: null, lastError: null, lastSuccessAt: null }],
  ['anthropic', { consecutiveFailures: 0, unhealthyUntil: null, lastError: null, lastSuccessAt: null }],
]);

function isQuotaError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('resource_exhausted') ||
    msg.includes('resource exhausted') ||
    msg.includes('too many requests')
  );
}

function isCircuitOpen(name: string): boolean {
  const h = providerHealth.get(name);
  if (!h?.unhealthyUntil) return false;
  if (Date.now() >= h.unhealthyUntil) {
    h.unhealthyUntil = null; // auto-reset: allow next attempt
    return false;
  }
  return true;
}

function markFailed(name: string, error: Error): void {
  const h = providerHealth.get(name);
  if (!h) return;
  const backoff = isQuotaError(error) ? QUOTA_BACKOFF_MS : ERROR_BACKOFF_MS;
  h.consecutiveFailures++;
  h.unhealthyUntil = Date.now() + backoff;
  h.lastError = error.message;
  const reason = isQuotaError(error) ? 'quota/rate-limit' : 'error';
  logger.warn(
    `[AI Failover] ${name} circuit open (${reason}, ${Math.round(backoff / 60000)} min): ${error.message}`
  );
}

function markHealthy(name: string): void {
  const h = providerHealth.get(name);
  if (!h) return;
  if (h.consecutiveFailures > 0 || h.unhealthyUntil !== null) {
    logger.info(`[AI Failover] ${name} circuit closed (recovered after ${h.consecutiveFailures} failure(s))`);
  }
  h.consecutiveFailures = 0;
  h.unhealthyUntil = null;
  h.lastError = null;
  h.lastSuccessAt = Date.now();
}

export interface ProviderHealthStatus {
  healthy: boolean;
  consecutiveFailures: number;
  unhealthyUntil: string | null;
  lastError: string | null;
  lastSuccessAt: string | null;
}

export function getProviderHealthStatus(): Record<string, ProviderHealthStatus> {
  const out: Record<string, ProviderHealthStatus> = {};
  for (const [name, h] of providerHealth) {
    out[name] = {
      healthy: !isCircuitOpen(name),
      consecutiveFailures: h.consecutiveFailures,
      unhealthyUntil: h.unhealthyUntil ? new Date(h.unhealthyUntil).toISOString() : null,
      lastError: h.lastError,
      lastSuccessAt: h.lastSuccessAt ? new Date(h.lastSuccessAt).toISOString() : null,
    };
  }
  return out;
}

// --- Generation ---

interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  useShortResponse?: boolean;
  /** BYOK: a signed-in user's own provider + API key. Tried first (highest
   * priority), then falls through to the app's own shared providers if it
   * errors — so a revoked/invalid personal key degrades gracefully instead
   * of hard-failing the request. */
  userOverride?: { provider: AIProvider; apiKey: string };
}

export interface FailoverResult {
  text: string;
  /** Which key actually produced the reply -- not just which was attempted.
   * A failed personal key falls through to 'shared', so callers must gate
   * any per-user shared-key budget on this, not on whether an override was
   * configured. */
  servedBy: 'user-override' | 'shared';
}

export async function generateWithFailover(
  prompt: string,
  options: GenerationOptions = {}
): Promise<FailoverResult> {
  const sharedProviders = getAvailableProviders();

  // The user-override entry is a one-shot best-effort attempt, tracked
  // outside the shared circuit breaker: a bad/revoked personal key must
  // never mark the app's own shared provider unhealthy for every other
  // user, and a shared-provider outage must never block someone whose
  // personal key is working fine.
  const overrideEntry: AIProviderConfig | null = options.userOverride
    ? {
        name: options.userOverride.provider,
        enabled: true,
        apiKey: options.userOverride.apiKey,
        model: defaultModelFor(options.userOverride.provider),
        priority: 0,
      }
    : null;

  const providers = sharedProviders;

  if (providers.length === 0 && !overrideEntry) {
    throw new Error('No AI providers configured. Please set GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY');
  }

  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? (options.useShortResponse ? 1024 : 2048);

  let lastError: Error | null = null;

  if (overrideEntry) {
    try {
      logger.info(`[AI Failover] Trying user-provided key for provider: ${overrideEntry.name}`);
      const result = await generateWithProvider(overrideEntry, prompt, { temperature, maxTokens });
      logger.info(`[AI Failover] Success with user-provided key (${overrideEntry.name})`);
      return { text: result, servedBy: 'user-override' };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.warn(`[AI Failover] User-provided key failed (${overrideEntry.name}), falling back to shared providers: ${err.message}`);
      lastError = err;
    }
  }

  let skippedCount = 0;

  for (const provider of providers) {
    if (isCircuitOpen(provider.name)) {
      const h = providerHealth.get(provider.name)!;
      logger.info(
        `[AI Failover] Skipping ${provider.name} (circuit open until ${new Date(h.unhealthyUntil!).toISOString()})`
      );
      skippedCount++;
      continue;
    }

    try {
      logger.info(`[AI Failover] Trying provider: ${provider.name}`);
      const result = await generateWithProvider(provider, prompt, { temperature, maxTokens });
      markHealthy(provider.name);
      logger.info(`[AI Failover] Success with provider: ${provider.name}`);
      return { text: result, servedBy: 'shared' };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.warn(`[AI Failover] Provider ${provider.name} failed: ${err.message}`);
      markFailed(provider.name, err);
      lastError = err;
    }
  }

  if (providers.length > 0 && skippedCount === providers.length) {
    throw new Error('All AI providers are temporarily unavailable (circuit open due to quota or recent errors)');
  }
  throw new Error(`All AI providers failed. Last error: ${lastError?.message}`);
}

async function generateWithProvider(
  provider: AIProviderConfig,
  prompt: string,
  options: { temperature: number; maxTokens: number }
): Promise<string> {
  switch (provider.name) {
    case 'gemini':    return generateWithGemini(provider, prompt, options);
    case 'openai':    return generateWithOpenAI(provider, prompt, options);
    case 'anthropic': return generateWithAnthropic(provider, prompt, options);
    default:          throw new Error(`Unknown provider: ${provider.name}`);
  }
}

async function generateWithGemini(
  provider: AIProviderConfig,
  prompt: string,
  options: { temperature: number; maxTokens: number }
): Promise<string> {
  if (!provider.apiKey) throw new Error('Gemini API key not configured');

  const workingModel = await getWorkingModel(provider.apiKey);
  const genAI = new GoogleGenerativeAI(provider.apiKey);
  const model = genAI.getGenerativeModel({
    model: workingModel,
    generationConfig: { temperature: options.temperature, maxOutputTokens: options.maxTokens },
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  if (!text || text.trim().length === 0) throw new Error('Empty response from Gemini');
  return text;
}

async function generateWithOpenAI(
  provider: AIProviderConfig,
  prompt: string,
  options: { temperature: number; maxTokens: number }
): Promise<string> {
  if (!provider.apiKey) throw new Error('OpenAI API key not configured');

  const openai = new OpenAI({ apiKey: provider.apiKey });
  const completion = await openai.chat.completions.create({
    model: provider.model!,
    messages: [{ role: 'user', content: prompt }],
    temperature: options.temperature,
    max_tokens: options.maxTokens,
  });

  const text = completion.choices[0]?.message?.content;
  if (!text || text.trim().length === 0) throw new Error('Empty response from OpenAI');
  return text;
}

async function generateWithAnthropic(
  provider: AIProviderConfig,
  prompt: string,
  options: { temperature: number; maxTokens: number }
): Promise<string> {
  if (!provider.apiKey) throw new Error('Anthropic API key not configured');

  const anthropic = new Anthropic({ apiKey: provider.apiKey });
  const message = await anthropic.messages.create({
    model: provider.model!,
    max_tokens: options.maxTokens,
    // The current Anthropic Messages SDK/API no longer accepts sampling temperature.
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
  if (!text || text.trim().length === 0) throw new Error('Empty response from Anthropic');
  return text;
}
