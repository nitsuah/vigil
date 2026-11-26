import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  providers: [] as Array<{ name: string; enabled: boolean; apiKey: string; model: string; priority: number }>,
  openaiCreate: vi.fn(),
  anthropicCreate: vi.fn(),
  geminiGenerate: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./ai-providers', () => ({
  getAvailableProviders: () => h.providers,
  defaultModelFor: () => 'm',
}));
vi.mock('./gemini-model-discovery', () => ({ getWorkingModel: vi.fn().mockResolvedValue('m') }));
vi.mock('./log', () => ({ default: h.log }));
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: h.openaiCreate } };
  },
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: h.anthropicCreate };
  },
}));
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: h.geminiGenerate };
    }
  },
}));

const provider = (name: string, priority: number) => ({ name, enabled: true, apiKey: 'k', model: 'm', priority });
const openaiOk = (text: string) => ({ choices: [{ message: { content: text } }] });
const anthropicOk = (text: string) => ({ content: [{ type: 'text', text }] });

async function load() {
  vi.resetModules();
  return await import('./ai-failover');
}

const START = new Date('2026-01-01T00:00:00Z');
const MIN = 60 * 1000;

describe('generateWithFailover circuit breaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    h.providers = [provider('openai', 1), provider('anthropic', 2)];
    h.openaiCreate.mockReset();
    h.anthropicCreate.mockReset();
    h.geminiGenerate.mockReset();
    h.log.info.mockReset();
    h.log.warn.mockReset();
    h.log.error.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the first shared provider result', async () => {
    h.openaiCreate.mockResolvedValue(openaiOk('hello'));
    const { generateWithFailover } = await load();
    await expect(generateWithFailover('p')).resolves.toEqual({ text: 'hello', servedBy: 'shared' });
    expect(h.anthropicCreate).not.toHaveBeenCalled();
  });

  it('fails over on a plain error and opens the circuit for about 5 minutes', async () => {
    h.openaiCreate.mockRejectedValue(new Error('boom'));
    h.anthropicCreate.mockResolvedValue(anthropicOk('from-anthropic'));
    const { generateWithFailover, getProviderHealthStatus } = await load();
    await expect(generateWithFailover('p')).resolves.toEqual({ text: 'from-anthropic', servedBy: 'shared' });
    const status = getProviderHealthStatus().openai;
    expect(status.healthy).toBe(false);
    expect(status.consecutiveFailures).toBe(1);
    expect(status.lastError).toBe('boom');
    expect(new Date(status.unhealthyUntil!).getTime()).toBe(START.getTime() + 5 * MIN);
  });

  it.each(['HTTP 429 from upstream', 'quota exceeded'])('opens the circuit for about 30 minutes on "%s"', async (msg) => {
    h.openaiCreate.mockRejectedValue(new Error(msg));
    h.anthropicCreate.mockResolvedValue(anthropicOk('ok'));
    const { generateWithFailover, getProviderHealthStatus } = await load();
    await generateWithFailover('p');
    const status = getProviderHealthStatus().openai;
    expect(new Date(status.unhealthyUntil!).getTime()).toBe(START.getTime() + 30 * MIN);
  });

  it('retries a provider after the backoff and resets its health on success', async () => {
    h.openaiCreate.mockRejectedValueOnce(new Error('boom'));
    h.anthropicCreate.mockResolvedValue(anthropicOk('fallback'));
    const { generateWithFailover, getProviderHealthStatus } = await load();
    await generateWithFailover('p');
    expect(getProviderHealthStatus().openai.healthy).toBe(false);

    vi.setSystemTime(new Date(START.getTime() + 5 * MIN + 1000));
    h.openaiCreate.mockResolvedValue(openaiOk('recovered'));
    await expect(generateWithFailover('p')).resolves.toEqual({ text: 'recovered', servedBy: 'shared' });
    const status = getProviderHealthStatus().openai;
    expect(status.healthy).toBe(true);
    expect(status.consecutiveFailures).toBe(0);
    expect(status.lastError).toBeNull();
    expect(status.lastSuccessAt).not.toBeNull();
  });

  it('throws "temporarily unavailable" when every provider circuit is open', async () => {
    h.openaiCreate.mockRejectedValue(new Error('boom'));
    h.anthropicCreate.mockRejectedValue(new Error('boom2'));
    const { generateWithFailover } = await load();
    await expect(generateWithFailover('p')).rejects.toThrow('All AI providers failed. Last error: boom2');
    await expect(generateWithFailover('p')).rejects.toThrow(/temporarily unavailable/);
  });

  it('throws the last error when all providers fail on a fresh module', async () => {
    h.openaiCreate.mockRejectedValue(new Error('first'));
    h.anthropicCreate.mockRejectedValue(new Error('last one'));
    const { generateWithFailover } = await load();
    await expect(generateWithFailover('p')).rejects.toThrow('All AI providers failed. Last error: last one');
  });

  it('throws when no providers and no override are configured', async () => {
    h.providers = [];
    const { generateWithFailover } = await load();
    await expect(generateWithFailover('p')).rejects.toThrow('No AI providers configured');
  });

  it('serves from the user override without touching shared providers', async () => {
    h.providers = [provider('anthropic', 1)];
    h.openaiCreate.mockResolvedValue(openaiOk('mine'));
    const { generateWithFailover } = await load();
    await expect(
      generateWithFailover('p', { userOverride: { provider: 'openai', apiKey: 'user-key' } })
    ).resolves.toEqual({ text: 'mine', servedBy: 'user-override' });
    expect(h.anthropicCreate).not.toHaveBeenCalled();
  });

  it('falls through to shared providers when the override fails, leaving health untouched', async () => {
    h.providers = [provider('anthropic', 1)];
    h.openaiCreate.mockRejectedValue(new Error('revoked key'));
    h.anthropicCreate.mockResolvedValue(anthropicOk('shared-answer'));
    const { generateWithFailover, getProviderHealthStatus } = await load();
    await expect(
      generateWithFailover('p', { userOverride: { provider: 'openai', apiKey: 'user-key' } })
    ).resolves.toEqual({ text: 'shared-answer', servedBy: 'shared' });
    const status = getProviderHealthStatus();
    expect(status.openai.consecutiveFailures).toBe(0);
    expect(status.openai.healthy).toBe(true);
    expect(status.anthropic.consecutiveFailures).toBe(0);
  });
});
