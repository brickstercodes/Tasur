/**
 * WHY: Single source of truth for LLM model instance creation.
 *
 * Both Mastra and manual agent adapters call getOrchestratorModel() or
 * getSpecialistModel() here. The actual provider (Gemini, Anthropic, OpenAI)
 * is selected by LLM_PROVIDER in .env. Switching providers for the entire
 * agent layer is a .env change — no code changes needed anywhere else.
 *
 * Orchestrator model: high-capability, used for complex reasoning (concept explainer).
 * Specialist model:   fast + cheap, used for structured generation (parser, mindmap, etc.).
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

const DEFAULT_ORCHESTRATOR_MODEL_ID = 'gemini-2.0-pro-exp-02-05';
const DEFAULT_SPECIALIST_MODEL_ID = 'gemini-2.0-flash';

function buildModel(modelId: string): LanguageModel {
  const provider = process.env.LLM_PROVIDER ?? 'gemini';

  if (provider === 'gemini') {
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
    return google(modelId);
  }

  if (provider === 'anthropic') {
    const anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    return anthropic(modelId);
  }

  if (provider === 'openai') {
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    return openai(modelId);
  }

  throw new Error(
    `Unknown LLM_PROVIDER: "${provider}". Valid values: "gemini", "anthropic", "openai".`,
  );
}

/**
 * Returns the high-capability model for the orchestrator and concept explainer.
 * Reads ORCHESTRATOR_MODEL from env, falls back to Gemini Pro.
 */
export function getOrchestratorModel(): LanguageModel {
  const modelId = process.env.ORCHESTRATOR_MODEL ?? DEFAULT_ORCHESTRATOR_MODEL_ID;
  return buildModel(modelId);
}

/**
 * Returns the fast, cost-efficient model for structured generation agents.
 * Reads SPECIALIST_MODEL from env, falls back to Gemini Flash.
 */
export function getSpecialistModel(): LanguageModel {
  const modelId = process.env.SPECIALIST_MODEL ?? DEFAULT_SPECIALIST_MODEL_ID;
  return buildModel(modelId);
}
