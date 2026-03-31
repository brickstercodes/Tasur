package main

import (
	"context"
	_ "embed"
	"encoding/base64"
	"fmt"
	"log"
	"strings"
)

// ── Prompt embedding ──────────────────────────────────────────────────────────
// Prompts are embedded at build time from the go-pipeline/prompts/ directory.

//go:embed prompts/mm-generator-system.md
var mmGeneratorSystemPrompt string

//go:embed prompts/mm-generator-example.xml
var mmGeneratorExampleXml string

// ── mm-generator ──────────────────────────────────────────────────────────────
// Mirrors src/manual/agents/mm-generator.ts: ManualMmGeneratorAgent.execute()

const mmGeneratorThinkingBudget = 5000
const mmGeneratorRetryBudget = 4096
const mmGeneratorTemperature = 1.0

// mmThinkingConfig returns the appropriate ThinkingConfig for the given model ID.
// gemini-3.x uses thinkingLevel; gemini-2.5 and earlier use thinkingBudget.
func mmThinkingConfig(budget int) *vertexThinkingConfig {
	model := mmGeneratorModelID()
	if strings.HasPrefix(model, "gemini-3") {
		return &vertexThinkingConfig{ThinkingLevel: "HIGH"}
	}
	return &vertexThinkingConfig{ThinkingBudget: budget}
}

// MmGeneratorResult is the output of generateMm.
type MmGeneratorResult struct {
	MmXml        string
	InputTokens  int
	OutputTokens int
}

// generateMm calls Vertex AI Gemini to produce a Freeplane .mm XML string.
// If the initial response fails validation, it retries once with the errors.
//
// For PDFs and images where text extraction yielded nothing (needsVision=true),
// the file bytes are passed as inline data to use Gemini's multimodal capabilities.
func generateMm(
	ctx context.Context,
	vc *vertexClient,
	rawText string,
	fileType FileType,
	fileBytes []byte,
	needsVision bool,
	subjectHint string,
	customInstructions string,
) (MmGeneratorResult, error) {
	model := mmGeneratorModelID()

	systemContent := &vertexContent{
		Role: "user",
		Parts: []vertexPart{
			{Text: buildSystemInstruction(subjectHint)},
		},
	}

	firstUserParts := buildFirstUserParts(rawText, fileType, fileBytes, needsVision, subjectHint, customInstructions)

	req := vertexRequest{
		SystemInstruction: systemContent,
		Contents: []vertexContent{
			{
				Role:  "user",
				Parts: []vertexPart{{Text: "Generate a complete and exhaustive Freeplane .mm mindmap for the following study material about Synchronization in Distributed Computing."}},
			},
			{
				Role:  "model",
				Parts: []vertexPart{{Text: mmGeneratorExampleXml}},
			},
			{
				Role:  "user",
				Parts: firstUserParts,
			},
		},
		GenerationConfig: vertexGenerationConfig{
			Temperature:    mmGeneratorTemperature,
			ThinkingConfig: mmThinkingConfig(mmGeneratorThinkingBudget),
		},
	}

	text, inputTok, outputTok, err := vc.generateContent(ctx, model, req)
	if err != nil {
		return MmGeneratorResult{}, fmt.Errorf("mm-generator: %w", err)
	}

	mmXml := extractXMLFromResponse(text)
	if repaired, didRepair := repairUnclosedNodes(mmXml); didRepair {
		log.Printf("mm-generator: repaired %d unclosed <node> tag(s) in initial output", strings.Count(repaired, "</node>")-strings.Count(mmXml, "</node>"))
		mmXml = repaired
	}
	errs := validateMmOutput(mmXml)

	if len(errs) > 0 {
		// Retry with validation errors in context.
		// Pass fileBytes + needsVision so the retry still has the actual document
		// content — without this, vision-path retries had no source material.
		retryUserParts := buildRetryUserParts(rawText, fileType, fileBytes, needsVision, mmXml, errs)

		retryReq := vertexRequest{
			SystemInstruction: systemContent,
			Contents: []vertexContent{
				{
					Role:  "user",
					Parts: []vertexPart{{Text: "Generate a complete and exhaustive Freeplane .mm mindmap for the following study material about Synchronization in Distributed Computing."}},
				},
				{
					Role:  "model",
					Parts: []vertexPart{{Text: mmGeneratorExampleXml}},
				},
				{
					Role:  "user",
					Parts: retryUserParts,
				},
			},
			GenerationConfig: vertexGenerationConfig{
				Temperature:    mmGeneratorTemperature,
				ThinkingConfig: mmThinkingConfig(mmGeneratorRetryBudget),
			},
		}

		retryText, retryIn, retryOut, err := vc.generateContent(ctx, model, retryReq)
		if err != nil {
			return MmGeneratorResult{}, fmt.Errorf("mm-generator retry: %w", err)
		}

		retriedXml := extractXMLFromResponse(retryText)
		if repaired, didRepair := repairUnclosedNodes(retriedXml); didRepair {
			log.Printf("mm-generator: repaired %d unclosed <node> tag(s) in retry output", strings.Count(repaired, "</node>")-strings.Count(retriedXml, "</node>"))
			retriedXml = repaired
		}
		retryErrs := validateMmOutput(retriedXml)
		if len(retryErrs) > 0 {
			return MmGeneratorResult{}, fmt.Errorf(
				".mm Generator failed validation after retry. Errors:\n%s",
				strings.Join(retryErrs, "\n"),
			)
		}

		return MmGeneratorResult{
			MmXml:        retriedXml,
			InputTokens:  inputTok + retryIn,
			OutputTokens: outputTok + retryOut,
		}, nil
	}

	return MmGeneratorResult{
		MmXml:        mmXml,
		InputTokens:  inputTok,
		OutputTokens: outputTok,
	}, nil
}

// ── Message builders ──────────────────────────────────────────────────────────

// buildSystemInstruction returns the base mm-generator system prompt.
// Domain overlays are intentionally not applied here — the model must derive
// all content solely from the uploaded document, regardless of subject hint.
func buildSystemInstruction(_ string) string {
	return mmGeneratorSystemPrompt
}

// buildFirstUserParts builds the user parts for the initial mm-generation request.
func buildFirstUserParts(
	rawText string,
	fileType FileType,
	fileBytes []byte,
	needsVision bool,
	subjectHint string,
	customInstructions string,
) []vertexPart {
	var lines []string
	lines = append(lines, "Generate a comprehensive Freeplane .mm mindmap for the following study material.")
	if subjectHint != "" {
		lines = append(lines, "Subject hint: "+subjectHint)
	}
	if fileType != "" {
		lines = append(lines, "Source file type: "+string(fileType))
	}
	if customInstructions != "" {
		lines = append(lines,
			"",
			"MANDATORY STUDENT DIRECTIVES:",
			customInstructions,
		)
	}

	if needsVision && len(fileBytes) > 0 {
		// Use Gemini's multimodal capability to read the file directly.
		mimeType := mimeTypeForFileType(fileType)
		lines = append(lines, "", "The source material is provided as an inline file below.")
		return []vertexPart{
			{Text: strings.Join(lines, "\n")},
			{InlineData: &vertexInlineData{
				MIMEType: mimeType,
				Data:     base64.StdEncoding.EncodeToString(fileBytes),
			}},
		}
	}

	lines = append(lines, "", "Source material:", rawText)
	return []vertexPart{{Text: strings.Join(lines, "\n")}}
}

// buildRetryUserParts builds the user parts for the retry attempt after validation failure.
// It re-includes the original document (inline file or raw text) so the model still has
// access to the source material — critical for vision-path PDFs where rawText is empty.
func buildRetryUserParts(
	rawText string,
	fileType FileType,
	fileBytes []byte,
	needsVision bool,
	previousOutput string,
	errors []string,
) []vertexPart {
	truncated := previousOutput
	if len(truncated) > 500 {
		truncated = truncated[:500] + "..."
	}

	lines := []string{
		"Your previous .mm output failed validation. Correct ALL of the following errors and regenerate the complete .mm file:",
		"",
	}
	for _, e := range errors {
		lines = append(lines, "- "+e)
	}
	lines = append(lines,
		"",
		"CRITICAL REMINDERS:",
		"- Output must start with <map and end with </map>",
		"- Every TRACKABLE=\"true\" node must have a unique CONCEPT_ID attribute",
		"- Minimum 3 levels of nesting",
		"- No markdown fencing or extra text outside the XML",
		"",
		"Your previous (failed) output for reference:",
		truncated,
	)

	if needsVision && len(fileBytes) > 0 {
		lines = append(lines, "", "The original source material is provided again as an inline file below.")
		return []vertexPart{
			{Text: strings.Join(lines, "\n")},
			{InlineData: &vertexInlineData{
				MIMEType: mimeTypeForFileType(fileType),
				Data:     base64.StdEncoding.EncodeToString(fileBytes),
			}},
		}
	}

	lines = append(lines, "", "Original source material:", rawText)
	return []vertexPart{{Text: strings.Join(lines, "\n")}}
}

// mimeTypeForFileType returns the MIME type string for a given file type.
func mimeTypeForFileType(ft FileType) string {
	switch ft {
	case FileTypePDF:
		return "application/pdf"
	case FileTypePNG:
		return "image/png"
	case FileTypeJPG:
		return "image/jpeg"
	case FileTypeDOCX:
		return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	default:
		return "application/octet-stream"
	}
}
