#!/usr/bin/env node
/**
 * Gemini API Health Check
 * 
 * Tests that the configured Gemini model is working.
 * Exits with code 0 if healthy, 1 if broken.
 * 
 * Run: node scripts/test-gemini-health.mjs
 * Or in CI: npm run test:gemini
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runGeminiHealthCheck } from './gemini-health-check.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
config({ path: join(__dirname, '..', '.env.local') });

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error('❌ GEMINI_API_KEY not set in .env.local');
  process.exit(1);
}

// Prefer GEMINI_MODEL_NAME from env, fallback to parsing lib/ai.ts
let configuredModel = process.env.GEMINI_MODEL_NAME;

if (!configuredModel) {
  const aiTsPath = join(__dirname, '..', 'lib', 'ai.ts');
  const aiTsContent = readFileSync(aiTsPath, 'utf-8');
  const modelMatch = aiTsContent.match(/model:\s*['"]([^'"]+)['"]/);
  
  if (!modelMatch) {
    console.error('❌ Could not find model name in lib/ai.ts or GEMINI_MODEL_NAME env var');
    process.exit(1);
  }
  
  configuredModel = modelMatch[1];
}

const { healthy, lines, errorLines } = await runGeminiHealthCheck({
  model: configuredModel,
  client: new GoogleGenerativeAI(apiKey),
});
lines.forEach((line) => console.log(line));
errorLines.forEach((line) => console.error(line));
process.exit(healthy ? 0 : 1);
