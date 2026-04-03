package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ── Supabase REST client ──────────────────────────────────────────────────────

// supabaseClient holds the URL and service role key for PostgREST + Storage API calls.
type supabaseClient struct {
	baseURL        string
	serviceRoleKey string
	httpClient     *http.Client
}

// newSupabaseClient initialises a Supabase client from environment variables.
func newSupabaseClient() (*supabaseClient, error) {
	baseURL := os.Getenv("SUPABASE_URL")
	key := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
	if baseURL == "" || key == "" {
		return nil, fmt.Errorf("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
	}
	return &supabaseClient{
		baseURL:        strings.TrimRight(baseURL, "/"),
		serviceRoleKey: key,
		httpClient:     &http.Client{Timeout: 30 * time.Second},
	}, nil
}

// do executes a Supabase REST API request and returns the response body.
func (s *supabaseClient) do(method, path string, body interface{}, headers map[string]string) ([]byte, int, error) {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, 0, fmt.Errorf("marshal body: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, s.baseURL+path, bodyReader)
	if err != nil {
		return nil, 0, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("apikey", s.serviceRoleKey)
	req.Header.Set("Authorization", "Bearer "+s.serviceRoleKey)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("read response: %w", err)
	}

	return respBytes, resp.StatusCode, nil
}

// ── Session operations ────────────────────────────────────────────────────────

// getSessionCount returns the number of sessions owned by the given user.
func (s *supabaseClient) getSessionCount(userID string) (int, error) {
	path := "/rest/v1/study_sessions?select=id&user_id=eq." + url.QueryEscape(userID)
	respBytes, status, err := s.do("GET", path, nil, map[string]string{
		"Prefer": "count=exact",
	})
	if err != nil {
		return 0, err
	}
	if status >= 400 {
		return 0, fmt.Errorf("supabase getSessionCount HTTP %d: %s", status, string(respBytes))
	}

	var rows []map[string]interface{}
	if err := json.Unmarshal(respBytes, &rows); err != nil {
		return 0, fmt.Errorf("parse session count: %w", err)
	}
	return len(rows), nil
}

// createStudySession inserts a new study_sessions row and returns the generated UUID.
func (s *supabaseClient) createStudySession(userID, title, domain, mode string) (string, error) {
	payload := map[string]interface{}{
		"user_id":        userID,
		"title":          title,
		"subject_domain": domain,
		"learning_mode":  mode,
		"status":         "processing",
	}

	respBytes, status, err := s.do("POST", "/rest/v1/study_sessions", payload, map[string]string{
		"Prefer": "return=representation",
	})
	if err != nil {
		return "", err
	}
	if status >= 400 {
		return "", fmt.Errorf("createStudySession HTTP %d: %s", status, string(respBytes))
	}

	var rows []map[string]interface{}
	if err := json.Unmarshal(respBytes, &rows); err != nil || len(rows) == 0 {
		return "", fmt.Errorf("parse createStudySession response")
	}

	id, _ := rows[0]["id"].(string)
	if id == "" {
		return "", fmt.Errorf("createStudySession: no id in response")
	}
	return id, nil
}

// deleteSession removes a session row (CASCADE deletes children).
// Used to clean up pre-created sessions when the pipeline fails before persisting data.
func (s *supabaseClient) deleteSession(sessionID string) error {
	path := fmt.Sprintf("/rest/v1/study_sessions?id=eq.%s", url.QueryEscape(sessionID))
	respBytes, status, err := s.do("DELETE", path, nil, nil)
	if err != nil {
		return err
	}
	if status >= 400 {
		return fmt.Errorf("deleteSession HTTP %d: %s", status, string(respBytes))
	}
	return nil
}

// updateSessionStatus sets the status column for a session (e.g. "processing" → "active").
func (s *supabaseClient) updateSessionStatus(sessionID, status string) error {
	path := fmt.Sprintf("/rest/v1/study_sessions?id=eq.%s", url.QueryEscape(sessionID))
	payload := map[string]interface{}{"status": status}
	respBytes, httpStatus, err := s.do("PATCH", path, payload, nil)
	if err != nil {
		return err
	}
	if httpStatus >= 400 {
		return fmt.Errorf("updateSessionStatus HTTP %d: %s", httpStatus, string(respBytes))
	}
	return nil
}

// getSession fetches learning_mode and subject_domain for an existing session,
// verifying that it belongs to the given user.
func (s *supabaseClient) getSession(sessionID, userID string) (learningMode, subjectDomain string, err error) {
	path := fmt.Sprintf(
		"/rest/v1/study_sessions?select=learning_mode,subject_domain&id=eq.%s&user_id=eq.%s",
		url.QueryEscape(sessionID), url.QueryEscape(userID),
	)
	respBytes, status, reqErr := s.do("GET", path, nil, nil)
	if reqErr != nil {
		return "", "", reqErr
	}
	if status >= 400 {
		return "", "", fmt.Errorf("getSession HTTP %d: %s", status, string(respBytes))
	}

	var rows []map[string]interface{}
	if err := json.Unmarshal(respBytes, &rows); err != nil || len(rows) == 0 {
		return "", "", fmt.Errorf("session not found or access denied")
	}
	learningMode, _ = rows[0]["learning_mode"].(string)
	subjectDomain, _ = rows[0]["subject_domain"].(string)
	return learningMode, subjectDomain, nil
}

// touchSessionLastActive updates last_active_at on a session.
func (s *supabaseClient) touchSessionLastActive(sessionID string) {
	payload := map[string]string{"last_active_at": time.Now().UTC().Format(time.RFC3339)}
	path := "/rest/v1/study_sessions?id=eq." + url.QueryEscape(sessionID)
	_, _, _ = s.do("PATCH", path, payload, nil) // non-fatal
}

// incrementSessionTokenUsage adds to the token_usage JSONB column (read-modify-write).
func (s *supabaseClient) incrementSessionTokenUsage(sessionID string, inputTok, outputTok int) {
	if inputTok == 0 && outputTok == 0 {
		return
	}

	// Read existing
	path := "/rest/v1/study_sessions?select=token_usage&id=eq." + url.QueryEscape(sessionID)
	respBytes, _, err := s.do("GET", path, nil, nil)
	if err != nil {
		return // non-fatal
	}

	var rows []map[string]interface{}
	if err := json.Unmarshal(respBytes, &rows); err != nil || len(rows) == 0 {
		return
	}

	existing := map[string]interface{}{}
	if v, ok := rows[0]["token_usage"].(map[string]interface{}); ok {
		existing = v
	}

	prevIn, _ := existing["inputTokens"].(float64)
	prevOut, _ := existing["outputTokens"].(float64)

	payload := map[string]interface{}{
		"token_usage": map[string]interface{}{
			"inputTokens":  int(prevIn) + inputTok,
			"outputTokens": int(prevOut) + outputTok,
		},
	}
	updatePath := "/rest/v1/study_sessions?id=eq." + url.QueryEscape(sessionID)
	_, _, _ = s.do("PATCH", updatePath, payload, nil) // non-fatal
}

// ── Full pipeline persistence ─────────────────────────────────────────────────
// Mirrors src/lib/session-persistence.ts: persistPipelineResults()

// PersistInput holds everything needed to write a completed pipeline to the DB.
type PersistInput struct {
	SessionID    string
	UserID       string
	Concepts     []DerivedConcept
	Edges        []ConceptEdge
	MindmapTree  MindmapTreeOutput
	Flashcards   FlashcardOutput
	GraphState   StudentGraphState
	MmXml        string
	RawText      string
	Filename     string
	FileType     FileType
	FileBytes    []byte
	MimeType     string
}

// persistPipelineResults writes all artifacts to Supabase in the correct order.
func (s *supabaseClient) persistPipelineResults(input PersistInput) error {
	conceptIDMap := buildConceptIDMap(input.Concepts)

	// Upload file to Supabase Storage (non-fatal)
	storagePath := s.uploadFileToStorage(input.SessionID, input.Filename, input.FileBytes, input.MimeType)

	// Step 1: concepts (FK target for everything else)
	if err := s.insertConcepts(input.SessionID, input.Concepts, conceptIDMap); err != nil {
		return err
	}

	// Step 2: dependent tables (in parallel in TypeScript, sequentially here for simplicity)
	if err := s.insertConceptRelationships(input.SessionID, input.Edges, conceptIDMap); err != nil {
		return err
	}
	if err := s.insertFlashcards(input.SessionID, input.Flashcards, conceptIDMap); err != nil {
		return err
	}
	if err := s.insertUnderstandingState(input.SessionID, input.UserID, input.Concepts, conceptIDMap); err != nil {
		return err
	}

	// Step 3: independent records
	remappedMindmap := remapMindmapConceptIDs(input.MindmapTree, conceptIDMap)
	remappedGraph := remapGraphStateIDs(input.GraphState, conceptIDMap)

	if err := s.insertMindmap(input.SessionID, remappedMindmap); err != nil {
		return err
	}
	if err := s.insertStudentGraph(input.SessionID, remappedGraph); err != nil {
		return err
	}
	if err := s.insertDocument(input.SessionID, input.Filename, input.FileType, input.RawText, input.MmXml, storagePath); err != nil {
		return err
	}

	return nil
}

// ── Multi-document append ─────────────────────────────────────────────────────

// AppendInput holds everything needed to add a document to an existing session.
type AppendInput struct {
	SessionID     string
	UserID        string
	NewConcepts   []DerivedConcept
	NewEdges      []ConceptEdge
	NewBranches   MindmapTreeOutput
	NewFlashcards FlashcardOutput
	ExistingGraph StudentGraphState
	RawText       string
	Filename      string
	FileType      FileType
	MmXml         string
	FileBytes     []byte
	MimeType      string
}

// appendDocumentToSession adds a new document's data to an existing session.
// Mirrors src/lib/session-persistence.ts: appendDocumentToSession()
func (s *supabaseClient) appendDocumentToSession(input AppendInput) error {
	conceptIDMap := buildConceptIDMap(input.NewConcepts)

	storagePath := s.uploadFileToStorage(input.SessionID, input.Filename, input.FileBytes, input.MimeType)

	if err := s.insertConcepts(input.SessionID, input.NewConcepts, conceptIDMap); err != nil {
		return err
	}
	if err := s.insertConceptRelationships(input.SessionID, input.NewEdges, conceptIDMap); err != nil {
		return err
	}
	if err := s.insertFlashcards(input.SessionID, input.NewFlashcards, conceptIDMap); err != nil {
		return err
	}
	if err := s.insertUnderstandingState(input.SessionID, input.UserID, input.NewConcepts, conceptIDMap); err != nil {
		return err
	}

	remappedBranches := remapMindmapConceptIDs(input.NewBranches, conceptIDMap)
	mergedMindmap, err := s.mergeIntoPreviousMindmap(input.SessionID, remappedBranches)
	if err != nil {
		return err
	}

	newGraphState := buildNewGraphState(input.SessionID, input.NewConcepts, input.NewEdges, conceptIDMap)
	mergedGraph := mergeGraphStates(input.ExistingGraph, newGraphState)

	if err := s.insertMindmap(input.SessionID, mergedMindmap); err != nil {
		return err
	}
	if err := s.insertStudentGraph(input.SessionID, mergedGraph); err != nil {
		return err
	}
	if err := s.insertDocument(input.SessionID, input.Filename, input.FileType, input.RawText, input.MmXml, storagePath); err != nil {
		return err
	}

	return nil
}

// getExistingGraphState fetches the current student_graph for a session, or returns a blank one.
func (s *supabaseClient) getExistingGraphState(sessionID string) (StudentGraphState, error) {
	path := "/rest/v1/student_graphs?select=graph_state&session_id=eq." + url.QueryEscape(sessionID)
	respBytes, status, err := s.do("GET", path, nil, nil)
	if err != nil {
		return StudentGraphState{}, err
	}
	if status >= 400 {
		return StudentGraphState{}, fmt.Errorf("getExistingGraphState HTTP %d", status)
	}

	var rows []map[string]interface{}
	if err := json.Unmarshal(respBytes, &rows); err != nil || len(rows) == 0 {
		return StudentGraphState{
			SessionID:    sessionID,
			Nodes:        []ConceptNode{},
			Edges:        []ConceptEdge{},
			LastSyncedAt: time.Now().UTC().Format(time.RFC3339),
		}, nil
	}

	graphStateRaw, _ := json.Marshal(rows[0]["graph_state"])
	var state StudentGraphState
	if err := json.Unmarshal(graphStateRaw, &state); err != nil {
		return StudentGraphState{SessionID: sessionID, Nodes: []ConceptNode{}, Edges: []ConceptEdge{}}, nil
	}
	return state, nil
}

// ── Individual table writers ──────────────────────────────────────────────────

// buildConceptIDMap creates a mapping from .mm CONCEPT_ID to a new random UUID.
func buildConceptIDMap(concepts []DerivedConcept) map[string]string {
	m := make(map[string]string, len(concepts))
	for _, c := range concepts {
		m[c.ID] = uuid.New().String()
	}
	return m
}

func (s *supabaseClient) insertConcepts(sessionID string, concepts []DerivedConcept, idMap map[string]string) error {
	if len(concepts) == 0 {
		return nil
	}
	rows := make([]map[string]interface{}, 0, len(concepts))
	for _, c := range concepts {
		newID, ok := idMap[c.ID]
		if !ok {
			continue
		}
		rows = append(rows, map[string]interface{}{
			"id":         newID,
			"session_id": sessionID,
			"name":       c.Name,
			"content":    nilIfEmpty(strings.Join(c.LeafContent, "\n")),
			"complexity": depthToComplexity(c.Depth),
			"keywords":   []string{},
			"metadata": map[string]interface{}{
				"mmConceptId":  c.ID,
				"examPriority": depthToExamPriority(c.Depth),
				"depth":        c.Depth,
				"hasDiagram":   c.HasDiagram,
			},
		})
	}

	respBytes, status, err := s.do("POST", "/rest/v1/concepts", rows, map[string]string{
		"Prefer": "return=minimal",
	})
	if err != nil {
		return fmt.Errorf("insertConcepts: %w", err)
	}
	if status >= 400 {
		return fmt.Errorf("insertConcepts HTTP %d: %s", status, string(respBytes))
	}
	return nil
}

func (s *supabaseClient) insertConceptRelationships(sessionID string, edges []ConceptEdge, idMap map[string]string) error {
	var rows []map[string]interface{}
	for _, e := range edges {
		fromID, ok1 := idMap[e.From]
		toID, ok2 := idMap[e.To]
		if !ok1 || !ok2 {
			continue
		}
		rows = append(rows, map[string]interface{}{
			"session_id":        sessionID,
			"from_concept_id":   fromID,
			"to_concept_id":     toID,
			"relationship_type": e.Type,
		})
	}
	if len(rows) == 0 {
		return nil
	}

	respBytes, status, err := s.do("POST", "/rest/v1/concept_relationships", rows, map[string]string{
		"Prefer": "return=minimal",
	})
	if err != nil {
		return fmt.Errorf("insertConceptRelationships: %w", err)
	}
	if status >= 400 {
		return fmt.Errorf("insertConceptRelationships HTTP %d: %s", status, string(respBytes))
	}
	return nil
}

func (s *supabaseClient) insertFlashcards(sessionID string, flashcards FlashcardOutput, idMap map[string]string) error {
	var rows []map[string]interface{}
	for _, card := range flashcards.Cards {
		conceptUUID, ok := idMap[card.ConceptID]
		if !ok {
			continue
		}
		rows = append(rows, map[string]interface{}{
			"session_id":  sessionID,
			"concept_id":  conceptUUID,
			"card_type":   mapCardType(card.Type),
			"front":       card.Front,
			"back":        card.Back,
			"difficulty":  mapDifficulty(card.Difficulty),
			"hints":       card.Hints,
			"sr_state":    nil,
		})
	}
	if len(rows) == 0 {
		return nil
	}

	respBytes, status, err := s.do("POST", "/rest/v1/flashcards", rows, map[string]string{
		"Prefer": "return=minimal",
	})
	if err != nil {
		return fmt.Errorf("insertFlashcards: %w", err)
	}
	if status >= 400 {
		return fmt.Errorf("insertFlashcards HTTP %d: %s", status, string(respBytes))
	}
	return nil
}

func (s *supabaseClient) insertUnderstandingState(sessionID, userID string, concepts []DerivedConcept, idMap map[string]string) error {
	if len(concepts) == 0 {
		return nil
	}
	rows := make([]map[string]interface{}, 0, len(concepts))
	for _, c := range concepts {
		conceptUUID, ok := idMap[c.ID]
		if !ok {
			continue
		}
		rows = append(rows, map[string]interface{}{
			"session_id":          sessionID,
			"user_id":             userID,
			"concept_id":          conceptUUID,
			"confidence_score":    0,
			"exposure_count":      0,
			"effective_modalities": []string{},
		})
	}

	respBytes, status, err := s.do("POST", "/rest/v1/understanding_state", rows, map[string]string{
		"Prefer": "return=minimal",
	})
	if err != nil {
		return fmt.Errorf("insertUnderstandingState: %w", err)
	}
	if status >= 400 {
		return fmt.Errorf("insertUnderstandingState HTTP %d: %s", status, string(respBytes))
	}
	return nil
}

func (s *supabaseClient) insertMindmap(sessionID string, mindmapTree MindmapTreeOutput) error {
	// Get next version number
	path := "/rest/v1/mindmaps?select=version&session_id=eq." + url.QueryEscape(sessionID) +
		"&order=version.desc&limit=1"
	respBytes, _, _ := s.do("GET", path, nil, nil)
	var existing []map[string]interface{}
	_ = json.Unmarshal(respBytes, &existing)
	nextVersion := 1
	if len(existing) > 0 {
		if v, ok := existing[0]["version"].(float64); ok {
			nextVersion = int(v) + 1
		}
	}

	payload := map[string]interface{}{
		"session_id":    sessionID,
		"mindmap_data":  mindmapTree,
		"version":       nextVersion,
	}

	respBytes2, status, err := s.do("POST", "/rest/v1/mindmaps", payload, map[string]string{
		"Prefer": "return=minimal",
	})
	if err != nil {
		return fmt.Errorf("insertMindmap: %w", err)
	}
	if status >= 400 {
		return fmt.Errorf("insertMindmap HTTP %d: %s", status, string(respBytes2))
	}
	return nil
}

func (s *supabaseClient) insertStudentGraph(sessionID string, graphState StudentGraphState) error {
	payload := map[string]interface{}{
		"session_id":  sessionID,
		"graph_state": graphState,
		"updated_at":  time.Now().UTC().Format(time.RFC3339),
	}

	respBytes, status, err := s.do("POST", "/rest/v1/student_graphs", payload, map[string]string{
		"Prefer": "resolution=merge-duplicates,return=minimal",
	})
	if err != nil {
		return fmt.Errorf("insertStudentGraph: %w", err)
	}
	if status >= 400 {
		return fmt.Errorf("insertStudentGraph HTTP %d: %s", status, string(respBytes))
	}
	return nil
}

func (s *supabaseClient) insertDocument(sessionID, filename string, fileType FileType, rawText, mmXml, storagePath string) error {
	filePath := storagePath
	if filePath == "" {
		filePath = filename
	}
	payload := map[string]interface{}{
		"session_id":       sessionID,
		"file_path":        filePath,
		"file_type":        mapFileTypeToEnum(fileType),
		"raw_text":         rawText,
		"parsed_structure": mmXml,
	}

	respBytes, status, err := s.do("POST", "/rest/v1/documents", payload, map[string]string{
		"Prefer": "return=minimal",
	})
	if err != nil {
		return fmt.Errorf("insertDocument: %w", err)
	}
	if status >= 400 {
		return fmt.Errorf("insertDocument HTTP %d: %s", status, string(respBytes))
	}
	return nil
}

// ── Storage upload ────────────────────────────────────────────────────────────

// uploadFileToStorage uploads the file to Supabase Storage and returns the storage path.
// Returns empty string if upload fails (non-fatal).
func (s *supabaseClient) uploadFileToStorage(sessionID, filename string, fileBytes []byte, mimeType string) string {
	if len(fileBytes) == 0 {
		return ""
	}
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	// Ensure bucket exists (idempotent)
	_ = s.ensureBucket("tasur-documents")

	storagePath := sessionID + "/" + filename
	uploadURL := s.baseURL + "/storage/v1/object/tasur-documents/" + url.PathEscape(storagePath)

	req, err := http.NewRequest("POST", uploadURL, bytes.NewReader(fileBytes))
	if err != nil {
		return ""
	}
	req.Header.Set("apikey", s.serviceRoleKey)
	req.Header.Set("Authorization", "Bearer "+s.serviceRoleKey)
	req.Header.Set("Content-Type", mimeType)
	req.Header.Set("x-upsert", "true")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return storagePath
	}
	return ""
}

func (s *supabaseClient) ensureBucket(bucketName string) error {
	payload := map[string]interface{}{"id": bucketName, "public": false}
	respBytes, status, err := s.do("POST", "/storage/v1/bucket", payload, nil)
	if err != nil {
		return err
	}
	// 200 = created, 409 = already exists — both are fine
	if status >= 400 && status != 409 {
		return fmt.Errorf("ensureBucket HTTP %d: %s", status, string(respBytes))
	}
	return nil
}

// ── Mindmap merge (for multi-document sessions) ───────────────────────────────

func (s *supabaseClient) mergeIntoPreviousMindmap(sessionID string, newBranches MindmapTreeOutput) (MindmapTreeOutput, error) {
	path := "/rest/v1/mindmaps?select=mindmap_data&session_id=eq." + url.QueryEscape(sessionID) +
		"&order=version.desc&limit=1"
	respBytes, _, _ := s.do("GET", path, nil, nil)

	var rows []map[string]interface{}
	if err := json.Unmarshal(respBytes, &rows); err != nil || len(rows) == 0 {
		return newBranches, nil
	}

	prevRaw, _ := json.Marshal(rows[0]["mindmap_data"])
	var prev MindmapTreeOutput
	if err := json.Unmarshal(prevRaw, &prev); err != nil {
		return newBranches, nil
	}

	return MindmapTreeOutput{
		Title:    prev.Title,
		Subject:  prev.Subject,
		Children: append(prev.Children, newBranches.Children...),
		Metadata: MindmapMetadata{
			TotalNodes:        prev.Metadata.TotalNodes + newBranches.Metadata.TotalNodes,
			MaxDepth:          maxInt(prev.Metadata.MaxDepth, newBranches.Metadata.MaxDepth),
			ConceptIDsCovered: append(prev.Metadata.ConceptIDsCovered, newBranches.Metadata.ConceptIDsCovered...),
		},
	}, nil
}

// ── Graph state merge ─────────────────────────────────────────────────────────

func buildNewGraphState(sessionID string, concepts []DerivedConcept, edges []ConceptEdge, idMap map[string]string) StudentGraphState {
	nodes := make([]ConceptNode, 0, len(concepts))
	for _, c := range concepts {
		newID := idMap[c.ID]
		rawContent := strings.Join(c.LeafContent, "\n")
		nodes = append(nodes, ConceptNode{
			ID:         newID,
			Name:       c.Name,
			Domain:     "",
			Content:    map[string]string{"raw": rawContent},
			Complexity: depthToComplexity(c.Depth),
			Keywords:   []string{},
			StudentState: ConceptStudentState{
				Confidence:          0,
				ExposureCount:       0,
				EffectiveModalities: []string{},
				ModePerformance:     map[string]float64{"fast": 0, "steady": 0},
				LastAssessed:        nil,
			},
			Metadata: map[string]interface{}{
				"examPriority": depthToExamPriority(c.Depth),
			},
		})
	}

	newEdges := make([]ConceptEdge, 0, len(edges))
	for _, e := range edges {
		fromID, ok1 := idMap[e.From]
		toID, ok2 := idMap[e.To]
		if !ok1 || !ok2 {
			continue
		}
		newEdges = append(newEdges, ConceptEdge{
			From: fromID, To: toID, Type: e.Type, Weight: e.Weight, Bidirectional: e.Bidirectional,
		})
	}

	return StudentGraphState{
		SessionID:    sessionID,
		Nodes:        nodes,
		Edges:        newEdges,
		LastSyncedAt: time.Now().UTC().Format(time.RFC3339),
	}
}

func mergeGraphStates(existing, newGraph StudentGraphState) StudentGraphState {
	return StudentGraphState{
		SessionID:    existing.SessionID,
		Nodes:        append(existing.Nodes, newGraph.Nodes...),
		Edges:        append(existing.Edges, newGraph.Edges...),
		LastSyncedAt: time.Now().UTC().Format(time.RFC3339),
	}
}

// ── Concept ID remapping ──────────────────────────────────────────────────────

func remapMindmapConceptIDs(tree MindmapTreeOutput, idMap map[string]string) MindmapTreeOutput {
	remappedChildren := make([]*MindmapNode, len(tree.Children))
	for i, child := range tree.Children {
		remappedChildren[i] = remapMindmapNode(child, idMap)
	}

	remappedIDs := make([]string, 0, len(tree.Metadata.ConceptIDsCovered))
	for _, id := range tree.Metadata.ConceptIDsCovered {
		if newID, ok := idMap[id]; ok {
			remappedIDs = append(remappedIDs, newID)
		} else {
			remappedIDs = append(remappedIDs, id)
		}
	}

	return MindmapTreeOutput{
		Title:    tree.Title,
		Subject:  tree.Subject,
		Children: remappedChildren,
		Metadata: MindmapMetadata{
			TotalNodes:        tree.Metadata.TotalNodes,
			MaxDepth:          tree.Metadata.MaxDepth,
			ConceptIDsCovered: remappedIDs,
		},
	}
}

func remapMindmapNode(node *MindmapNode, idMap map[string]string) *MindmapNode {
	if node == nil {
		return nil
	}
	result := *node // copy

	if node.ID != nil {
		if newID, ok := idMap[*node.ID]; ok {
			result.ID = &newID
		}
	}
	if node.ConceptID != nil {
		if newID, ok := idMap[*node.ConceptID]; ok {
			result.ConceptID = &newID
		}
	}

	if node.Children != nil {
		result.Children = make([]*MindmapNode, len(node.Children))
		for i, child := range node.Children {
			result.Children[i] = remapMindmapNode(child, idMap)
		}
	}
	return &result
}

func remapGraphStateIDs(state StudentGraphState, idMap map[string]string) StudentGraphState {
	nodes := make([]ConceptNode, len(state.Nodes))
	for i, node := range state.Nodes {
		nodes[i] = node
		if newID, ok := idMap[node.ID]; ok {
			nodes[i].ID = newID
		}
	}

	edges := make([]ConceptEdge, len(state.Edges))
	for i, edge := range state.Edges {
		edges[i] = edge
		if newFrom, ok := idMap[edge.From]; ok {
			edges[i].From = newFrom
		}
		if newTo, ok := idMap[edge.To]; ok {
			edges[i].To = newTo
		}
	}

	return StudentGraphState{
		SessionID:    state.SessionID,
		Nodes:        nodes,
		Edges:        edges,
		LastSyncedAt: state.LastSyncedAt,
	}
}

// ── Enum mappers (mirror TypeScript session-persistence.ts) ──────────────────

func mapCardType(agentType string) string {
	switch agentType {
	case "explain_simply":
		return "explain"
	case "compare_contrast":
		return "compare"
	default:
		return agentType
	}
}

func mapDifficulty(difficulty string) string {
	switch difficulty {
	case "easy", "intermediate", "hard":
		return difficulty
	default:
		return "intermediate"
	}
}

func mapFileTypeToEnum(ft FileType) string {
	switch ft {
	case FileTypePNG, FileTypeJPG:
		return "image"
	case FileTypePDF, FileTypeDOCX, FileTypeTXT:
		return string(ft)
	default:
		return "txt"
	}
}

// ── Utility helpers ───────────────────────────────────────────────────────────

func nilIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
