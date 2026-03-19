/**
 * WHY: Unit tests for the model-provider factory.
 *
 * Verifies that getOrchestratorModel() and getSpecialistModel() return model
 * instances for each supported provider and throw on unknown providers.
 * These are pure unit tests — they check factory behaviour without making
 * any LLM API calls, so they run in CI with no credentials required.
 */

import { describe, expect, it, afterEach, beforeEach } from 'vitest';

describe('model-provider', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env before each test to avoid state leakage.
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
    // Reset module cache so env changes take effect.
    delete process.env.LLM_PROVIDER;
    delete process.env.ORCHESTRATOR_MODEL;
    delete process.env.SPECIALIST_MODEL;
  });

  it('returns a model instance for LLM_PROVIDER=gemini', async () => {
    process.env.LLM_PROVIDER = 'gemini';
    const { getSpecialistModel, getOrchestratorModel } = await import('@/config/model-provider');

    const specialist = getSpecialistModel();
    const orchestrator = getOrchestratorModel();

    // Model objects from AI SDK have a `modelId` or `provider` field.
    expect(specialist).toBeTruthy();
    expect(orchestrator).toBeTruthy();
  });

  it('returns a model instance for LLM_PROVIDER=anthropic', async () => {
    process.env.LLM_PROVIDER = 'anthropic';
    const { getSpecialistModel } = await import('@/config/model-provider');

    const specialist = getSpecialistModel();
    expect(specialist).toBeTruthy();
  });

  it('returns a model instance for LLM_PROVIDER=openai', async () => {
    process.env.LLM_PROVIDER = 'openai';
    const { getSpecialistModel } = await import('@/config/model-provider');

    const specialist = getSpecialistModel();
    expect(specialist).toBeTruthy();
  });

  it('throws on unknown LLM_PROVIDER', async () => {
    process.env.LLM_PROVIDER = 'unknown-provider';
    const { getSpecialistModel } = await import('@/config/model-provider');

    expect(() => getSpecialistModel()).toThrow('Unknown LLM_PROVIDER');
  });
});
