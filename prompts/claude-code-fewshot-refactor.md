# Task: Refactor .mm Generator to use multi-turn few-shot conversation structure

## Context & Why

When I use Google AI Studio directly to generate .mm mindmaps, the output is significantly more detailed and exhaustive than what Tasur produces — even with the same model and thinking enabled. The root cause is **conversation structure**, not model or temperature.

In AI Studio, the prompt is structured as a multi-turn conversation:
1. **System instruction**: short task description + one worked example
2. **User turn 1**: the PDF file
3. **Assistant turn 1** (pre-filled): a complete, high-quality .mm output (the gold standard)
4. **User turn 2**: the actual new document to process

The model sees its own "previous work" as a conversation turn and pattern-matches that quality level. This is far more effective than embedding an example in the system prompt.

Currently in Tasur, the agent sends:
1. **System**: ~400 lines of detailed rules + one embedded example
2. **User**: the document

The example is buried in the system prompt alongside structural rules. The model spends attention on rule compliance rather than content exhaustiveness.

## Changes Required

### 1. Split the system prompt: `src/prompts/base/mm-generator.md`

**Create two new files** from the existing prompt:

#### `src/prompts/base/mm-generator-system.md` (NEW)
This contains ONLY the task description and structural rules — everything from the current `mm-generator.md` EXCEPT the "Complete Worked Example" section (the big XML block from line ~153 to line ~348 that starts with `## Complete Worked Example` and ends just before `**What makes this example the correct depth standard:**`).

Also remove the paragraph after the example that starts with "**What makes this example the correct depth standard:**" and its bullet points (lines ~350-359). Those observations will be captured differently.

Keep everything else: the job description, content completeness rules, tree structure rules, TRACKABLE node rules, diagram callout convention, negative constraints, output format, student directives section, and mode guidance section.

#### `src/prompts/base/mm-generator-example.xml` (NEW)
This contains ONLY the raw XML from the worked example — the actual `<map>...</map>` content that was embedded in the system prompt. No markdown fencing, no explanation text. Just the XML starting with `<map version="freeplane 1.11.9">` and ending with `</map>`.

This file will be loaded and injected as a pre-filled assistant turn in the conversation.

#### `src/prompts/base/mm-generator.md` (KEEP AS-IS — DO NOT DELETE)
Keep the original file unchanged as a reference. Do not modify or delete it. The new files are additive.

### 2. Update the prompt loader: `src/prompts/loader.ts`

Add a new exported function:

```typescript
/**
 * Loads a raw file from the prompts directory.
 * Used for loading example outputs that are injected as assistant turns
 * rather than embedded in system prompts.
 */
export function loadPromptFile(relativePath: string): string {
  const filePath = path.join(PROMPTS_DIRECTORY, relativePath);
  return fs.readFileSync(filePath, 'utf-8');
}
```

Do NOT modify the existing `loadPrompt()` function.

### 3. Refactor `src/mastra/agents/mm-generator.ts` — text-based path

#### 3a. Update `executeTextBased()` to use multi-turn few-shot

Change the `generateText()` call to use a multi-turn messages array instead of a single user message.

The current call:
```typescript
const { text, usage } = await generateText({
  model: getMmGeneratorModel(),
  system: systemPrompt,
  messages: [{ role: 'user', content: userMessage }],
  temperature: TEXT_TEMPERATURE,
  providerOptions: { ... },
});
```

Should become:
```typescript
const { text, usage } = await generateText({
  model: getMmGeneratorModel(),
  system: systemPrompt,
  messages: [
    {
      role: 'user',
      content: 'Generate a complete Freeplane .mm mindmap from the following study material.\n\nSource material:\n[EXAMPLE_SOURCE_PLACEHOLDER]',
    },
    {
      role: 'assistant',
      content: exampleMmXml,
    },
    {
      role: 'user',
      content: userMessage,
    },
  ],
  temperature: TEXT_TEMPERATURE,
  providerOptions: { ... },
});
```

Where:
- `systemPrompt` is loaded from the NEW `mm-generator-system.md` (not the old `mm-generator.md`)
- `exampleMmXml` is the raw XML loaded from `mm-generator-example.xml`
- `userMessage` is unchanged (the actual student's document)
- The first user turn says `[EXAMPLE_SOURCE_PLACEHOLDER]` — this is intentional. We don't have the source material for the example, and the model doesn't need it. It just needs to see the example output as its own "previous work." Use the text: `Generate a complete and exhaustive Freeplane .mm mindmap for the following study material about Synchronization in Distributed Computing.`

#### 3b. Load the new prompt files

At the top of `executeTextBased()`, change the system prompt loading:

```typescript
// Old:
const systemPrompt = loadPrompt('mm-generator', input.subjectHint ?? null);

// New:
const systemPrompt = loadPrompt('mm-generator-system', input.subjectHint ?? null);
const exampleMmXml = loadPromptFile('base/mm-generator-example.xml');
```

Import `loadPromptFile` from `@/prompts/loader`.

#### 3c. Apply the same change to the retry call

The retry call should also use multi-turn, but with the retry message as the third user turn. Keep the same pattern: example user → example assistant → retry user message.

### 4. Refactor `src/mastra/agents/mm-generator.ts` — PDF-native path

Apply the SAME multi-turn pattern to `executePdfNative()`:

```typescript
const { text, usage } = await generateText({
  model: getPdfMmModel(),
  system: systemPrompt,
  messages: [
    {
      role: 'user',
      content: 'Generate a complete and exhaustive Freeplane .mm mindmap for the following study material about Synchronization in Distributed Computing.',
    },
    {
      role: 'assistant',
      content: exampleMmXml,
    },
    {
      role: 'user',
      content: [
        {
          type: 'file' as const,
          data: input.fileBuffer!,
          mediaType: 'application/pdf',
        },
        {
          type: 'text' as const,
          text: userTextPart,
        },
      ],
    },
  ],
  temperature: PDF_TEMPERATURE,
  providerOptions: { ... },
});
```

Load the system prompt from `mm-generator-system.md` and the example from `mm-generator-example.xml` — same as the text path.

The PDF retry should also use multi-turn with the same pattern.

### 5. Refactor `src/manual/agents/mm-generator.ts`

Mirror ALL changes from the mastra agent:
- Import `loadPromptFile` from `@/prompts/loader`
- Load system prompt from `mm-generator-system.md`
- Load example XML from `mm-generator-example.xml`
- Use multi-turn messages array: example user → example assistant → actual user
- Apply to both the initial call and the retry call

### 6. Update the imports

Both agent files need:
```typescript
import { loadPrompt, loadPromptFile } from '@/prompts/loader';
```

## What NOT to change

- Do NOT delete or modify `src/prompts/base/mm-generator.md` — keep it as-is for reference
- Do NOT change model selection, temperature, or thinking config — those are already correct
- Do NOT change the validation logic (`validateMmOutput`) or retry structure
- Do NOT change the `extractXmlFromResponse()` helper
- Do NOT change any schemas, types, interfaces, or the mm-parser
- Do NOT change the message builder functions (`buildTextUserMessage`, `buildPdfUserTextPart`) — they stay the same, they're just now used as the third turn instead of the only turn
- Do NOT change `src/prompts/domains/*.md` — domain overlays still compose via `loadPrompt()`
- Do NOT touch any files outside of: `src/prompts/loader.ts`, `src/prompts/base/`, `src/mastra/agents/mm-generator.ts`, `src/manual/agents/mm-generator.ts`

## Verification

After making changes:

1. Run `npx tsc --noEmit` — no type errors
2. Run `npm run lint` — no lint errors
3. Verify `src/prompts/base/mm-generator-system.md` exists and contains the rules (no XML example block)
4. Verify `src/prompts/base/mm-generator-example.xml` exists and contains valid XML starting with `<map` and ending with `</map>`
5. Verify `src/prompts/base/mm-generator.md` still exists unchanged
6. Verify both agent files import `loadPromptFile`
7. Verify both agent files load from `mm-generator-system` (not `mm-generator`)
8. Verify both agent files pass 3 messages (user/assistant/user) to `generateText()`
9. Verify the PDF-native path also uses multi-turn (not just the text path)
