import { describe, it, expect, afterEach, vi } from 'vitest';
import { getConfiguredModel } from '../lib/gemini-model-discovery';
import { getAvailableProviders, getPrimaryProvider } from '../lib/ai-providers';
import { runGeminiHealthCheck } from '../scripts/gemini-health-check.mjs';

// The live probe is `npm run test-gemini-health` (run by the Netlify build).
// Unit tests use a fake client so CI never calls the Gemini API.
function fakeClient(generateContent: () => Promise<unknown>) {
  const getGenerativeModel = vi.fn(() => ({ generateContent: vi.fn(generateContent) }));
  return { client: { getGenerativeModel } as never, getGenerativeModel };
}

describe('Gemini API Health check', () => {
  const model = getConfiguredModel();

  it('reports healthy when the configured model answers "ok"', async () => {
    const { client, getGenerativeModel } = fakeClient(async () => ({
      response: { text: () => ' OK \n' },
    }));

    const result = await runGeminiHealthCheck({ model, client });

    expect(getGenerativeModel).toHaveBeenCalledWith({ model });
    expect(result.healthy).toBe(true);
    expect(result.lines.join('\n')).toContain('Gemini API healthy');
    expect(result.lines.join('\n')).toContain(model);
    expect(result.errorLines).toEqual([]);
  });

  it('awaits a promised response and still counts unexpected text as healthy', async () => {
    const { client } = fakeClient(async () => ({
      response: Promise.resolve({ text: () => 'hello there' }),
    }));

    const result = await runGeminiHealthCheck({ model, client });

    expect(result.healthy).toBe(true);
    expect(result.lines.join('\n')).toContain('unexpected output: "hello there"');
  });

  it('reports broken with a model-discovery hint on a 404', async () => {
    const { client } = fakeClient(async () => {
      throw new Error('[404 Not Found] models/gone is not found for API version v1beta');
    });

    const result = await runGeminiHealthCheck({ model: 'models/gone', client });

    expect(result.healthy).toBe(false);
    const errors = result.errorLines.join('\n');
    expect(errors).toContain('Gemini API BROKEN with model "models/gone"');
    expect(errors).toContain('MODEL NOT FOUND');
  });

  it('reports broken without the 404 hint on other errors such as quota', async () => {
    const { client } = fakeClient(async () => {
      throw new Error('[429 Too Many Requests] quota exceeded');
    });

    const result = await runGeminiHealthCheck({ model, client });

    expect(result.healthy).toBe(false);
    const errors = result.errorLines.join('\n');
    expect(errors).toContain('429 Too Many Requests');
    expect(errors).not.toContain('MODEL NOT FOUND');
  });
});

describe('AI provider routing', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  function resetProviderEnv(): void {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.BYOK_GEMINI_API_KEY;
    delete process.env.BYOK_OPENAI_API_KEY;
    delete process.env.BYOK_ANTHROPIC_API_KEY;
    delete process.env.AI_PROVIDER_ORDER;
    delete process.env.AI_DEPRIORITIZE_GEMINI_ON_QUOTA;
    delete process.env.GEMINI_QUOTA_EXCEEDED;
  }

  it('uses default ordering when all provider keys are available', () => {
    process.env = { ...originalEnv };
    resetProviderEnv();

    process.env.GEMINI_API_KEY = 'gem-key';
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';

    const providers = getAvailableProviders();

    expect(providers.map((provider) => provider.name)).toEqual(['gemini', 'openai', 'anthropic']);
    expect(getPrimaryProvider()?.name).toBe('gemini');
  });

  it('respects configured provider order and BYOK precedence', () => {
    process.env = { ...originalEnv };
    resetProviderEnv();

    process.env.GEMINI_API_KEY = 'gem-default';
    process.env.BYOK_GEMINI_API_KEY = 'gem-byok';
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    process.env.AI_PROVIDER_ORDER = 'openai,anthropic,gemini';

    const providers = getAvailableProviders();
    const gemini = providers.find((provider) => provider.name === 'gemini');

    expect(providers.map((provider) => provider.name)).toEqual(['openai', 'anthropic', 'gemini']);
    expect(getPrimaryProvider()?.name).toBe('openai');
    expect(gemini?.apiKey).toBe('gem-byok');
  });

  it('deprioritizes gemini when quota controls are enabled', () => {
    process.env = { ...originalEnv };
    resetProviderEnv();

    process.env.GEMINI_API_KEY = 'gem-key';
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    process.env.AI_PROVIDER_ORDER = 'gemini,openai,anthropic';
    process.env.AI_DEPRIORITIZE_GEMINI_ON_QUOTA = 'true';
    process.env.GEMINI_QUOTA_EXCEEDED = 'true';

    const providers = getAvailableProviders();

    expect(providers.map((provider) => provider.name)).toEqual(['openai', 'anthropic', 'gemini']);
    expect(getPrimaryProvider()?.name).toBe('openai');
  });

  it('uses BYOK key over default key for OpenAI', () => {
    process.env = { ...originalEnv };
    resetProviderEnv();

    process.env.OPENAI_API_KEY = 'openai-default';
    process.env.BYOK_OPENAI_API_KEY = 'openai-byok';

    const providers = getAvailableProviders();
    const openai = providers.find((provider) => provider.name === 'openai');

    expect(openai?.apiKey).toBe('openai-byok');
  });

  it('uses BYOK key over default key for Anthropic', () => {
    process.env = { ...originalEnv };
    resetProviderEnv();

    process.env.ANTHROPIC_API_KEY = 'anthropic-default';
    process.env.BYOK_ANTHROPIC_API_KEY = 'anthropic-byok';

    const providers = getAvailableProviders();
    const anthropic = providers.find((provider) => provider.name === 'anthropic');

    expect(anthropic?.apiKey).toBe('anthropic-byok');
  });
});
