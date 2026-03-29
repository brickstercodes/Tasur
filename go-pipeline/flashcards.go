package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"
)

//go:embed prompts/flashcard-generator.md
var flashcardSystemPrompt string

// ── Flashcard generation ──────────────────────────────────────────────────────
// Mirrors src/manual/agents/flashcard-generator.ts: ManualFlashcardGeneratorAgent.execute()

// flashcardResponseSchema is the Vertex AI JSON schema for FlashcardOutput.
var flashcardResponseSchema = map[string]interface{}{
	"type": "object",
	"properties": map[string]interface{}{
		"cards": map[string]interface{}{
			"type": "array",
			"items": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"id":         map[string]interface{}{"type": "string"},
					"concept_id": map[string]interface{}{"type": "string"},
					"type": map[string]interface{}{
						"type": "string",
						"enum": []string{"recall", "application", "explain_simply", "compare_contrast"},
					},
					"front": map[string]interface{}{"type": "string"},
					"back":  map[string]interface{}{"type": "string"},
					"difficulty": map[string]interface{}{
						"type": "string",
						"enum": []string{"easy", "intermediate", "hard"},
					},
					"tags":  map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "string"}},
					"hints": map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "string"}},
				},
				"required": []string{"id", "concept_id", "type", "front", "back", "difficulty", "tags", "hints"},
			},
		},
	},
	"required": []string{"cards"},
}

// FlashcardGeneratorResult is the output of generateFlashcards.
type FlashcardGeneratorResult struct {
	Output       FlashcardOutput
	InputTokens  int
	OutputTokens int
}

// generateFlashcards calls Vertex AI to generate flashcards for the given parsed content.
// Returns an empty card list (not an error) if concepts is empty.
func generateFlashcards(
	ctx context.Context,
	vc *vertexClient,
	parsedContent DocumentParserOutput,
	domain string,
	learningMode string,
) (FlashcardGeneratorResult, error) {
	if len(parsedContent.Concepts) == 0 {
		return FlashcardGeneratorResult{Output: FlashcardOutput{Cards: []Flashcard{}}}, nil
	}

	model := specialistModelID()

	// Build concept summary (same format as TypeScript)
	var conceptLines []string
	for _, c := range parsedContent.Concepts {
		conceptLines = append(conceptLines,
			fmt.Sprintf("- id: %s, name: %s, complexity: %s\n  content: %s",
				c.ID, c.Name, c.Complexity, c.RawContent))
	}
	conceptsSummary := strings.Join(conceptLines, "\n")

	userMessage := fmt.Sprintf(
		"Generate flashcards for the following concepts.\n\nMode: %s\nDomain: %s\n\nConcepts:\n%s",
		learningMode, domain, conceptsSummary,
	)

	req := vertexRequest{
		SystemInstruction: &vertexContent{
			Role:  "user",
			Parts: []vertexPart{{Text: flashcardSystemPrompt}},
		},
		Contents: []vertexContent{
			{
				Role:  "user",
				Parts: []vertexPart{{Text: userMessage}},
			},
		},
		GenerationConfig: vertexGenerationConfig{
			ResponseMIMEType: "application/json",
			ResponseSchema:   flashcardResponseSchema,
		},
	}

	text, inputTok, outputTok, err := vc.generateContent(ctx, model, req)
	if err != nil {
		return FlashcardGeneratorResult{}, fmt.Errorf("flashcard generator: %w", err)
	}

	// Parse JSON response
	text = strings.TrimSpace(text)
	// Strip any accidental markdown fences
	text = stripJSONFences(text)

	var output FlashcardOutput
	if err := json.Unmarshal([]byte(text), &output); err != nil {
		return FlashcardGeneratorResult{}, fmt.Errorf("parse flashcard response: %w (raw: %.200s)", err, text)
	}

	// Ensure nil slices are empty slices for proper JSON serialisation
	for i := range output.Cards {
		if output.Cards[i].Tags == nil {
			output.Cards[i].Tags = []string{}
		}
		if output.Cards[i].Hints == nil {
			output.Cards[i].Hints = []string{}
		}
	}

	return FlashcardGeneratorResult{
		Output:       output,
		InputTokens:  inputTok,
		OutputTokens: outputTok,
	}, nil
}

// stripJSONFences removes ```json ... ``` fencing from LLM responses.
func stripJSONFences(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		end := strings.LastIndex(s, "```")
		if end > 3 {
			s = s[3:end]
			// Remove optional "json" language tag on first line
			if idx := strings.IndexByte(s, '\n'); idx >= 0 {
				firstLine := strings.TrimSpace(s[:idx])
				if firstLine == "json" || firstLine == "" {
					s = s[idx+1:]
				}
			}
		}
	}
	return strings.TrimSpace(s)
}
