import logger from './log';
import { generateWithFailover } from './ai-failover';
import { finishedSummary } from './summary-text';
import { getConfiguredModel, DEFAULT_GEMINI_MODEL } from './gemini-model-discovery';

// Ensure test scripts can read the configured Gemini model name
// Uses centralized configuration from gemini-model-discovery
export const GEMINI_MODEL_NAME = getConfiguredModel();

// Explicit object for compatibility with existing code
// Note: The regex in scripts/test-gemini-health.mjs looks for this exact pattern.
export const GEMINI_MODEL = { model: GEMINI_MODEL_NAME };

/**
 * Generate a repository summary using AI with automatic failover.
 * Attempts multiple AI providers if one fails.
 */
export async function generateRepoSummary(
    repoName: string,
    files: Record<string, string>
): Promise<string | null> {
    let prompt = `You are an expert Technical Product Manager.
Analyze the following files from the repository "${repoName}".

Output a concise, 2-sentence summary of what this project does and who it is for.
Do not use marketing fluff. Be technical and precise.

Files provided:
`;

    for (const [filename, content] of Object.entries(files)) {
        prompt += `\n\n--- ${filename} ---\n${content.slice(0, 5000)}`; // Truncate to avoid huge context
    }

    try {
        const { text } = await generateWithFailover(prompt, { useShortResponse: true });
        // null: nothing finished to save, so the caller keeps the old summary.
        return finishedSummary(text);
    } catch (error) {
        logger.warn('All AI providers failed for repo summary:', error);

        // Return more specific error messages
        if (error instanceof Error) {
            if (error.message.includes('API_KEY') || error.message.includes('not configured')) {
                return 'Summary unavailable (No AI Provider Configured)';
            }
            if (error.message.includes('404') || error.message.includes('not found')) {
                return 'Summary unavailable (Model Not Found)';
            }
            if (error.message.includes('quota') || error.message.includes('limit')) {
                return 'Summary unavailable (API Quota Exceeded)';
            }
        }

        return 'Summary unavailable (AI Service Error)';
    }
}

/**
 * Generate missing documentation using AI with automatic failover.
 */
export async function generateMissingDoc(
    docType: 'roadmap' | 'tasks',
    contextFiles: string
): Promise<string> {
    const prompts = {
        roadmap: "Based on the code structure, draft a high-level ROADMAP.md with 3 quarterly goals.",
        tasks: "Based on the TODOs in the code, draft a TASKS.md checklist."
    };

    const prompt = `${prompts[docType]}
Context: ${contextFiles}`;

    try {
        return (await generateWithFailover(prompt)).text;
    } catch (error) {
        logger.warn('All AI providers failed for missing doc:', error);

        // Throw with more context
        if (error instanceof Error) {
            if (error.message.includes('API_KEY') || error.message.includes('not configured')) {
                throw new Error('No AI Provider Configured');
            }
            if (error.message.includes('404') || error.message.includes('not found')) {
                throw new Error('AI model not found');
            }
            if (error.message.includes('quota') || error.message.includes('limit')) {
                throw new Error('AI API quota exceeded');
            }
        }

        throw new Error('Failed to generate documentation: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
}

export interface FeatureSuggestionContext {
    language: string | null;
    healthScore: number | null;
    existingFeatureCategories: string[];
    plannedRoadmapItems: string[];
    userPrompt?: string;
}

/**
 * Generate prioritized feature suggestions for a repo using AI.
 */
export async function generateFeatureSuggestions(
    repoName: string,
    context: FeatureSuggestionContext
): Promise<string | null> {
    const { language, healthScore, existingFeatureCategories, plannedRoadmapItems, userPrompt } = context;

    const prompt = `You are an expert Technical Product Manager reviewing the "${repoName}" repository.

Repository context:
- Primary language: ${language || 'Unknown'}
- Health score: ${healthScore !== null ? `${healthScore}/100` : 'Unknown'}
- Current feature categories: ${existingFeatureCategories.length > 0 ? existingFeatureCategories.join(', ') : 'none documented'}
- Planned roadmap items: ${plannedRoadmapItems.length > 0 ? plannedRoadmapItems.slice(0, 10).join('; ') : 'none'}
${userPrompt ? `\nUser request: ${userPrompt}` : ''}

Suggest 3-5 concrete, high-impact features to build next. Avoid duplicating existing features or roadmap items.

For each suggestion output exactly this format:
**Feature Title** — one sentence explaining the value and why it should be prioritized.

Be specific to this repo's domain and tech stack. Prioritize by impact.`;

    try {
        return (await generateWithFailover(prompt, { useShortResponse: false })).text;
    } catch (error) {
        logger.warn('All AI providers failed for feature suggestions:', error);
        if (error instanceof Error) {
            if (error.message.includes('API_KEY') || error.message.includes('not configured')) {
                return null;
            }
        }
        return null;
    }
}

export interface RoadmapSuggestionContext {
    language: string | null;
    healthScore: number | null;
    existingItems: Array<{ title: string; quarter: string | null; status: string }>;
    userPrompt?: string;
}

export async function generateRoadmapSuggestions(
    repoName: string,
    context: RoadmapSuggestionContext
): Promise<string | null> {
    const { language, healthScore, existingItems, userPrompt } = context;

    const byQuarter = existingItems.reduce<Record<string, string[]>>((acc, item) => {
        const q = item.quarter || 'Unscheduled';
        (acc[q] = acc[q] || []).push(`[${item.status}] ${item.title}`);
        return acc;
    }, {});
    const roadmapSummary = Object.entries(byQuarter)
        .map(([q, items]) => `${q}:\n${items.map(t => `  - ${t}`).join('\n')}`)
        .join('\n\n');

    const prompt = `You are an expert Technical Product Manager planning the roadmap for the "${repoName}" repository.

Repository context:
- Primary language: ${language || 'Unknown'}
- Health score: ${healthScore !== null ? `${healthScore}/100` : 'Unknown'}
${userPrompt ? `- User focus: ${userPrompt}` : ''}

Current roadmap:
${roadmapSummary || '(empty)'}

Propose 2-3 new quarterly roadmap items that would meaningfully improve this repository. Do not duplicate or reword existing items. Prioritize by impact.

For each suggestion output EXACTLY this format (one per line, no numbering, no extra commentary):
**Goal Title** — one sentence describing the user value and why this quarter.`;

    try {
        return (await generateWithFailover(prompt, { useShortResponse: true })).text;
    } catch (error) {
        logger.warn('All AI providers failed for roadmap suggestions:', error);
        return null;
    }
}

export interface DocImprovementContext {
    docType: string;
    currentContent: string;
    repoName: string;
    userPrompt?: string;
}

/**
 * Generate an improved version of an existing doc using AI.
 * Returns null if all providers fail (caller should surface a 503).
 */
export async function generateDocImprovement(
    context: DocImprovementContext
): Promise<string | null> {
    const docTypeLabel = context.docType.toUpperCase();
    const customInstruction = context.userPrompt
        ? `\n\nAdditional guidance from the user: ${context.userPrompt}`
        : '';

    const prompt = `You are a senior technical writer improving repository documentation for "${context.repoName}".

Below is the current content of ${docTypeLabel}.md. Rewrite it to be clearer, more complete, and better structured — while keeping all existing factual information intact. Preserve the document's intent and audience. Output only the improved Markdown, no preamble or explanation.${customInstruction}

--- CURRENT ${docTypeLabel}.md ---
${context.currentContent.slice(0, 8000)}
--- END ---`;

    try {
        return (await generateWithFailover(prompt, { useShortResponse: false })).text;
    } catch (error) {
        logger.warn('All AI providers failed for doc improvement:', error);
        return null;
    }
}

export interface GenerateAIContentResult {
    text: string;
    /** True only if a personal key actually produced the reply -- false if
     * one was configured but failed and the shared key served the request
     * instead. Callers must gate any shared-key budget on this, not on
     * whether userOverride was passed in. */
    usingOwnKey: boolean;
}

/**
 * Generate AI content with automatic failover across providers.
 *
 * @param userOverride BYOK: a signed-in user's own provider + API key,
 *   tried first before the app's shared providers (see
 *   generateWithFailover's userOverride option).
 */
export async function generateAIContent(
    prompt: string,
    userOverride?: { provider: 'gemini' | 'openai' | 'anthropic'; apiKey: string }
): Promise<GenerateAIContentResult> {
    try {
        const result = await generateWithFailover(prompt, { userOverride });
        return { text: result.text, usingOwnKey: result.servedBy === 'user-override' };
    } catch (error) {
        logger.warn('All AI providers failed for AI content:', error);

        // Throw with more context
        if (error instanceof Error) {
            if (error.message.includes('API_KEY') || error.message.includes('not configured')) {
                throw new Error('No AI Provider Configured');
            }
            if (error.message.includes('404') || error.message.includes('not found')) {
                throw new Error('AI model not found');
            }
            if (error.message.includes('quota') || error.message.includes('limit')) {
                throw new Error('AI API quota exceeded');
            }
        }

        throw new Error('Failed to generate AI content: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
}
