import { NextRequest, NextResponse } from 'next/server';
import { getAvailableProviders } from '@/lib/ai-providers';
import { getProviderHealthStatus } from '@/lib/ai-failover';
import { getConfiguredModel } from '@/lib/gemini-model-discovery';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PROVIDER_MODELS: Record<string, string> = {
  openai:    process.env.OPENAI_MODEL    || 'gpt-4-turbo-preview',
  anthropic: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
};

// /api/health is unauthenticated; the probe branch below makes real outbound
// requests to every configured provider, so cap how often it can run to keep
// anonymous callers from burning provider quota.
const PROBE_COOLDOWN_MS = 30_000;
let lastProbeAt = 0;

export async function GET(req: NextRequest) {
  const probe = req.nextUrl.searchParams.get('probe') === 'true';

  if (probe) {
    const now = Date.now();
    if (now - lastProbeAt < PROBE_COOLDOWN_MS) {
      return NextResponse.json(
        {
          status: 'rate_limited',
          message: `Live provider probes are limited to 1 per ${PROBE_COOLDOWN_MS / 1000}s`,
          timestamp: new Date().toISOString(),
        },
        { status: 429 }
      );
    }
    lastProbeAt = now;
  }

  const available = getAvailableProviders();
  const configuredNames = new Set(available.map((p) => p.name));
  const circuitStatus = getProviderHealthStatus();

  const services: Record<string, object> = {};

  for (const name of ['gemini', 'openai', 'anthropic'] as const) {
    const configured = configuredNames.has(name);
    const h = circuitStatus[name];

    services[name] = {
      configured,
      status: !configured
        ? 'not_configured'
        : h.healthy
        ? 'healthy'
        : 'circuit_open',
      model: name === 'gemini' ? getConfiguredModel() : PROVIDER_MODELS[name],
      ...(h.unhealthyUntil         && { unhealthyUntil:         h.unhealthyUntil }),
      ...(h.lastError               && { lastError:               h.lastError }),
      ...(h.lastSuccessAt           && { lastSuccessAt:           h.lastSuccessAt }),
      ...(h.consecutiveFailures > 0 && { consecutiveFailures:     h.consecutiveFailures }),
    };
  }

  // Optional live probes (only when ?probe=true, to avoid wasting tokens on health polls)
  if (probe) {
    await runLiveProbes(services, available.map((p) => p.name));
  }

  const hasHealthy = available.some((p) => circuitStatus[p.name]?.healthy !== false);
  const overall = available.length === 0 ? 'down' : hasHealthy ? 'healthy' : 'degraded';

  return NextResponse.json(
    { status: overall, timestamp: new Date().toISOString(), probe, services },
    { status: overall === 'down' ? 503 : 200 }
  );
}

async function runLiveProbes(
  services: Record<string, object>,
  configured: string[]
): Promise<void> {
  const probes: Promise<void>[] = [];

  if (configured.includes('gemini')) {
    probes.push(
      (async () => {
        const apiKey = process.env.BYOK_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) return;
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=1`
          );
          (services['gemini'] as Record<string, unknown>).probeStatus = res.ok ? 'reachable' : `http_${res.status}`;
        } catch (e) {
          (services['gemini'] as Record<string, unknown>).probeStatus = 'unreachable';
          (services['gemini'] as Record<string, unknown>).probeError = e instanceof Error ? e.message : String(e);
        }
      })()
    );
  }

  if (configured.includes('openai')) {
    probes.push(
      (async () => {
        const apiKey = process.env.BYOK_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
        if (!apiKey) return;
        try {
          const res = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          (services['openai'] as Record<string, unknown>).probeStatus = res.ok ? 'reachable' : `http_${res.status}`;
        } catch (e) {
          (services['openai'] as Record<string, unknown>).probeStatus = 'unreachable';
          (services['openai'] as Record<string, unknown>).probeError = e instanceof Error ? e.message : String(e);
        }
      })()
    );
  }

  if (configured.includes('anthropic')) {
    probes.push(
      (async () => {
        const apiKey = process.env.BYOK_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return;
        try {
          const res = await fetch('https://api.anthropic.com/v1/models', {
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          });
          (services['anthropic'] as Record<string, unknown>).probeStatus = res.ok ? 'reachable' : `http_${res.status}`;
        } catch (e) {
          (services['anthropic'] as Record<string, unknown>).probeStatus = 'unreachable';
          (services['anthropic'] as Record<string, unknown>).probeError = e instanceof Error ? e.message : String(e);
        }
      })()
    );
  }

  await Promise.all(probes);
}
