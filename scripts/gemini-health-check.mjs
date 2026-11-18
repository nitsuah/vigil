/**
 * Core of the Gemini health check, split out of test-gemini-health.mjs so the
 * unit tests can exercise it with a fake client instead of the live API.
 *
 * @param {object} opts
 * @param {string} opts.model Gemini model name to probe.
 * @param {{ getGenerativeModel: (cfg: { model: string }) => { generateContent: (prompt: string) => Promise<{ response: { text: () => string } | Promise<{ text: () => string }> }> } }} opts.client
 * @returns {Promise<{ healthy: boolean, lines: string[], errorLines: string[] }>}
 */
export async function runGeminiHealthCheck({ model, client }) {
  const lines = [`🔍 Testing configured model: ${model}`];
  const errorLines = [];

  try {
    const generative = client.getGenerativeModel({ model });
    const result = await generative.generateContent('Reply with only the word "ok"');
    const response = await result.response;
    const text = response.text().trim().toLowerCase();

    if (text.includes('ok')) {
      lines.push(`✅ Gemini API healthy - model "${model}" responding`);
    } else {
      // Still healthy: the model answered, just not with the expected word.
      lines.push(`⚠️  Model responded but with unexpected output: "${text}"`);
    }
    return { healthy: true, lines, errorLines };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errorLines.push(`❌ Gemini API BROKEN with model "${model}"`);
    errorLines.push(`   Error: ${message}\n`);

    if (message.includes('404') || message.includes('not found')) {
      errorLines.push('🔧 MODEL NOT FOUND - Google may have changed their models again.');
      errorLines.push('   Run this to find working models:');
      errorLines.push('   node scripts/test-model-names.mjs\n');
    }
    return { healthy: false, lines, errorLines };
  }
}
