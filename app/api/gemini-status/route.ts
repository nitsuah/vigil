import { NextResponse } from 'next/server';
import logger from '@/lib/log';
import { getProviderHealthStatus } from '@/lib/ai-failover';
import { getConfiguredModel, discoverWorkingModel } from '@/lib/gemini-model-discovery';

export async function GET() {
  const apiKey = process.env.BYOK_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  const circuitStatus = getProviderHealthStatus();
  const gemini = circuitStatus['gemini'];
  const configuredModel = getConfiguredModel();

  if (!apiKey) {
    return NextResponse.json({
      healthy: false,
      model: configuredModel,
      error: 'API key not configured',
    });
  }

  // If we've seen recent success and the circuit is closed, report healthy without probing
  if (gemini.healthy && gemini.lastSuccessAt) {
    return NextResponse.json({
      healthy: true,
      model: configuredModel,
      lastSuccessAt: gemini.lastSuccessAt,
      source: 'circuit',
    });
  }

  // Circuit is open or no history yet — run discovery to get an authoritative answer
  try {
    const workingModel = await discoverWorkingModel(apiKey);
    return NextResponse.json({
      healthy: !!workingModel,
      model: workingModel ?? configuredModel,
      ...(workingModel !== configuredModel && workingModel && {
        switched: true,
        configuredModel,
      }),
      ...(gemini.unhealthyUntil && { unhealthyUntil: gemini.unhealthyUntil }),
      ...(gemini.lastError       && { lastError: gemini.lastError }),
    });
  } catch (error) {
    logger.warn('Gemini status check failed:', error);
    return NextResponse.json({
      healthy: false,
      model: configuredModel,
      error: 'Gemini status check failed',
    });
  }
}
