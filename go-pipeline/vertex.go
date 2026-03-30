package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

// ── Vertex AI client ──────────────────────────────────────────────────────────

// vertexClient holds config and a shared HTTP client for Vertex AI REST calls.
type vertexClient struct {
	project     string
	location    string
	tokenSource oauth2.TokenSource
	httpClient  *http.Client
}

// newVertexClient initialises a Vertex AI REST client from environment variables.
// Reads GOOGLE_APPLICATION_CREDENTIALS_JSON (raw service account JSON) or falls
// back to Application Default Credentials.
func newVertexClient(ctx context.Context) (*vertexClient, error) {
	project := os.Getenv("GOOGLE_CLOUD_PROJECT")
	location := os.Getenv("GOOGLE_CLOUD_LOCATION")
	if location == "" {
		location = "us-central1"
	}

	var ts oauth2.TokenSource
	credJSON := os.Getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")
	if credJSON != "" {
		creds, err := google.CredentialsFromJSON(ctx, []byte(credJSON),
			"https://www.googleapis.com/auth/cloud-platform")
		if err != nil {
			return nil, fmt.Errorf("parse GOOGLE_APPLICATION_CREDENTIALS_JSON: %w", err)
		}
		ts = creds.TokenSource
	} else {
		var err error
		ts, err = google.DefaultTokenSource(ctx, "https://www.googleapis.com/auth/cloud-platform")
		if err != nil {
			return nil, fmt.Errorf("application default credentials: %w", err)
		}
	}

	return &vertexClient{
		project:     project,
		location:    location,
		tokenSource: oauth2.ReuseTokenSource(nil, ts),
		httpClient:  &http.Client{Timeout: 10 * time.Minute},
	}, nil
}

// generateContent calls the Vertex AI generateContent REST endpoint synchronously.
// Returns the response text and token usage.
func (v *vertexClient) generateContent(
	ctx context.Context,
	modelID string,
	req vertexRequest,
) (string, int, int, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return "", 0, 0, fmt.Errorf("marshal request: %w", err)
	}

	// Gemini 3.x preview models are only available in the "global" location.
	// Mirrors the same logic in TypeScript model-provider.ts: getMmGeneratorModel().
	location := v.location
	if strings.HasPrefix(modelID, "gemini-3") {
		location = "global"
	}

	var url string
	if location == "global" {
		url = fmt.Sprintf(
			"https://aiplatform.googleapis.com/v1/projects/%s/locations/global/publishers/google/models/%s:generateContent",
			v.project, modelID,
		)
	} else {
		url = fmt.Sprintf(
			"https://%s-aiplatform.googleapis.com/v1/projects/%s/locations/%s/publishers/google/models/%s:generateContent",
			location, v.project, location, modelID,
		)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return "", 0, 0, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	token, err := v.tokenSource.Token()
	if err != nil {
		return "", 0, 0, fmt.Errorf("get access token: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+token.AccessToken)

	resp, err := v.httpClient.Do(httpReq)
	if err != nil {
		return "", 0, 0, fmt.Errorf("vertex AI request: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", 0, 0, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", 0, 0, fmt.Errorf("vertex AI HTTP %d: %s", resp.StatusCode, string(respBytes))
	}

	var vResp vertexResponse
	if err := json.Unmarshal(respBytes, &vResp); err != nil {
		return "", 0, 0, fmt.Errorf("parse response: %w", err)
	}

	if len(vResp.Candidates) == 0 || len(vResp.Candidates[0].Content.Parts) == 0 {
		return "", 0, 0, fmt.Errorf("vertex AI returned no content")
	}

	// Collect all text parts (the model may return thinking + text separately)
	var text string
	for _, part := range vResp.Candidates[0].Content.Parts {
		if part.Text != "" {
			text = part.Text // use the last non-empty text part (thinking comes first)
		}
	}

	inputTokens := vResp.UsageMetadata.PromptTokenCount
	outputTokens := vResp.UsageMetadata.CandidatesTokenCount

	return text, inputTokens, outputTokens, nil
}

// mmGeneratorModelID returns the model ID for .mm generation.
// Reads MM_GENERATOR_MODEL env, falls back to gemini-2.5-pro.
func mmGeneratorModelID() string {
	if m := os.Getenv("MM_GENERATOR_MODEL"); m != "" {
		return m
	}
	return "gemini-2.5-pro"
}

// specialistModelID returns the model ID for flashcard and web-search generation.
// Reads SPECIALIST_MODEL env, falls back to gemini-2.5-flash.
func specialistModelID() string {
	if m := os.Getenv("SPECIALIST_MODEL"); m != "" {
		return m
	}
	return "gemini-2.5-flash"
}
