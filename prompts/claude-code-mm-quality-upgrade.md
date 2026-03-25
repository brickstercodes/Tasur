# Task: Upgrade .mm Generator to use thinking-enabled model on BOTH paths

## Context

The .mm Generator agent (`src/mastra/agents/mm-generator.ts` and `src/manual/agents/mm-generator.ts`) is the most critical LLM call in the entire Tasur pipeline. Its output is the single source of truth for the student's entire study session.

Currently, the **PDF path** uses Gemini 2.5 Pro with thinking enabled — and produces good output. The **text path** (DOCX/TXT/OCR) uses `getOrchestratorModel()` (Gemini 2.0 Pro Exp) with **no thinking** and **temperature 0.1** — and produces noticeably less detailed, less exhaustive mindmaps compared to what the same prompt produces in Google AI Studio with thinking enabled.

The root cause: thinking forces the model to plan exhaustively before generating, which is what makes the .mm output comprehensive. Without thinking, the model generates sequentially and tends to summarize rather than exhaustively enumerate.

## Changes Required

### 1. `src/config/model-provider.ts` — Add dedicated .mm generator model getter

Add a new exported function `getMmGeneratorModel()` that:

- Reads from env var `MM_GENERATOR_MODEL` (note: NOT `PDF_MM_MODEL` — that one stays for the PDF-native path)
- Falls back to the same default as `DEFAULT_PDF_MM_MODEL_ID` (currently `gemini-2.5-pro-preview-05-06`)
- **Always uses Google provider** regardless of `LLM_PROVIDER` env var, same pattern as `getPdfMmModel()` — because thinking is a Gemini-specific feature and this is the one place where we need it

Update the file's WHY comment to mention that the .mm generator model is separated from the orchestrator because it needs thinking capability.

Do NOT change `getOrchestratorModel()`, `getSpecialistModel()`, or `getPdfMmModel()` — those stay exactly as they are.

### 2. `src/mastra/agents/mm-generator.ts` — Upgrade text path

In the `executeTextBased()` function:

**a)** Change the model from `getOrchestratorModel()` to `getMmGeneratorModel()` (the new function from step 1). Do this for BOTH the initial call and the retry call.

**b)** Change `TEXT_TEMPERATURE` from `0.1` to `1`. Update the constant's comment to explain: "Thinking models require temperature = 1. Even for the text path, we use a thinking-enabled model for exhaustive content coverage."

**c)** Add `providerOptions` with thinking enabled to the `generateText()` call in the text path — same pattern as the PDF path:
```typescript
providerOptions: {
  google: {
    thinkingConfig: {
      thinkingLevel: 'high' as const,
    },
  },
},
```

**d)** For the retry call in the text path, use `thinkingLevel: 'medium'` (same pattern as the PDF retry — saves tokens on retry while still enabling structured reasoning).

**e)** Update the file's WHY block comment at the top to reflect that BOTH paths now use thinking-enabled models. Remove the language about the text path using "the orchestrator model" — it now uses the dedicated mm-generator model.

### 3. `src/manual/agents/mm-generator.ts` — Mirror changes

Apply the exact same changes to the manual path agent. The manual agent should mirror the mastra agent's model selection and thinking configuration exactly.

### 4. Update import in both agent files

Both agent files need to import `getMmGeneratorModel` from `@/config/model-provider` in addition to (or instead of) their current `getOrchestratorModel` import. Only remove the `getOrchestratorModel` import if it's no longer used anywhere in that file.

## What NOT to change

- Do NOT touch the PDF-native path's model selection — it already uses `getPdfMmModel()` and that's correct
- Do NOT change any prompts (`src/prompts/base/mm-generator.md`)
- Do NOT change the .mm parser (`src/lib/mm-parser/`)
- Do NOT change any schemas, types, or interfaces
- Do NOT change the retry logic structure — just update the model and add thinking config
- Do NOT change `getOrchestratorModel()` or `getSpecialistModel()` defaults
- Do NOT rename `getPdfMmModel()` — it stays as-is for the PDF path

## Verification

After making changes:

1. Run `npx tsc --noEmit` to verify no type errors
2. Run `npm run lint` to verify no lint errors
3. Confirm that `getMmGeneratorModel()` is exported and importable
4. Confirm both agent files (mastra + manual) use `getMmGeneratorModel()` for the text path
5. Confirm both agent files have `thinkingConfig` on the text path's `generateText()` call
6. Confirm `TEXT_TEMPERATURE` is `1` in both agent files
