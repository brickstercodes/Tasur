/**
 * WHY: Single source of truth for LLM model instance creation.
 *
 * Both Mastra and manual agent adapters call getOrchestratorModel() or
 * getSpecialistModel() here. The actual provider (Gemini via Vertex AI,
 * Anthropic, OpenAI) is selected by LLM_PROVIDER in .env. Switching
 * providers for the entire agent layer is a .env change — no code changes
 * needed anywhere else.
 *
 * Vertex AI auth: uses a service account JSON key file. Set
 * GOOGLE_APPLICATION_CREDENTIALS to the absolute path of the key file,
 * and GOOGLE_CLOUD_PROJECT / GOOGLE_CLOUD_LOCATION for project/region.
 *
 * Orchestrator model:    high-capability, used for complex reasoning (concept explainer).
 * Specialist model:      fast + cheap, used for structured generation (parser, mindmap, etc.).
 * .mm Generator model:   separated from the orchestrator because BOTH the PDF-native path and
 *                        the text path need thinking enabled (thinking forces exhaustive
 *                        enumeration rather than sequential summarisation). Thinking is a
 *                        Gemini-specific feature, so this getter always uses Google regardless
 *                        of LLM_PROVIDER.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createVertex } from '@ai-sdk/google-vertex';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

const DEFAULT_ORCHESTRATOR_MODEL_ID = 'gemini-2.5-pro';
const DEFAULT_SPECIALIST_MODEL_ID = 'gemini-2.5-flash';
/** Gemini model used for PDF-native mindmap generation (needs vision + thinking). */
const DEFAULT_PDF_MM_MODEL_ID = 'gemini-2.5-pro';

/** Shared Vertex AI client — reused across all Gemini model getters. */
function getVertexClient(locationOverride?: string) {
  // On Vercel, file-based GOOGLE_APPLICATION_CREDENTIALS is not available.
  // GOOGLE_APPLICATION_CREDENTIALS_JSON holds the raw JSON string instead.
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const googleAuthOptions = credentialsJson
    ? { credentials: JSON.parse(credentialsJson) }
    : undefined;

  return createVertex({
    project: process.env.GOOGLE_CLOUD_PROJECT ?? 'gen-lang-client-0468294301',
    location: locationOverride ?? process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
    googleAuthOptions,
  });
}

function buildModel(modelId: string): LanguageModel {
  const provider = process.env.LLM_PROVIDER ?? 'gemini';

  if (provider === 'gemini') {
    // Gemini 3.x preview models are only available in the "global" location.
    const location = modelId.startsWith('gemini-3') ? 'global' : undefined;
    const vertex = getVertexClient(location);
    return vertex(modelId);
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

/**
 * Returns the Gemini model used for .mm generation on the text-based path.
 *
 * Always uses Google regardless of LLM_PROVIDER — thinking is Gemini-specific
 * and is required for exhaustive content coverage on both the PDF and text paths.
 * Reads MM_GENERATOR_MODEL from env, falls back to Gemini 2.5 Pro.
 */
export function getMmGeneratorModel(): LanguageModel {
  const modelId = process.env.MM_GENERATOR_MODEL ?? DEFAULT_PDF_MM_MODEL_ID;
  // Gemini 3.x preview models are only available in the "global" location.
  const location = modelId.startsWith('gemini-3') ? 'global' : undefined;
  const vertex = getVertexClient(location);
  return vertex(modelId);
}

/**
 * Returns the Gemini model used for PDF-native mindmap generation.
 *
 * Always uses Google regardless of LLM_PROVIDER — PDF multimodal vision is
 * Gemini-specific and this path is only taken for PDF uploads.
 * Reads PDF_MM_MODEL from env, falls back to Gemini 2.5 Pro.
 */
export function getPdfMmModel(): LanguageModel {
  const modelId = process.env.PDF_MM_MODEL ?? DEFAULT_PDF_MM_MODEL_ID;
  // Gemini 3.x preview models are only available in the "global" location.
  const location = modelId.startsWith('gemini-3') ? 'global' : undefined;
  const vertex = getVertexClient(location);
  return vertex(modelId);
}
