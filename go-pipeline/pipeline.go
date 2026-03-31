package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ── SSE helpers ───────────────────────────────────────────────────────────────

// sseEmitter writes SSE events to the response writer and flushes immediately.
type sseEmitter struct {
	w       http.ResponseWriter
	flusher http.Flusher
	mu      sync.Mutex
}

func newSSEEmitter(w http.ResponseWriter) (*sseEmitter, bool) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return nil, false
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // Disable Nginx buffering if present
	return &sseEmitter{w: w, flusher: flusher}, true
}

func (e *sseEmitter) emit(v interface{}) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	fmt.Fprintf(e.w, "data: %s\n\n", data)
	e.flusher.Flush()
}

// startHeartbeat emits lightweight keepalive events so intermediate proxies
// don't terminate long-running uploads during quiet phases (e.g. model calls).
func (e *sseEmitter) startHeartbeat(ctx context.Context, interval time.Duration) func() {
	stop := make(chan struct{})
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-stop:
				return
			case t := <-ticker.C:
				e.emit(map[string]interface{}{"type": "heartbeat", "ts": t.Unix()})
			}
		}
	}()
	return func() { close(stop) }
}

func (e *sseEmitter) progress(step, label string, percent int) {
	e.emit(ProgressEvent{Type: "progress", Step: step, Label: label, Percent: percent})
}

func (e *sseEmitter) done(sessionID, label string) {
	e.emit(DoneEvent{Type: "done", SessionID: sessionID, Label: label})
}

func (e *sseEmitter) error(message string) {
	e.emit(ErrorEvent{Type: "error", Message: message})
}

func (e *sseEmitter) queued(position int) {
	label := "You're in the queue — Tasur is in beta and processes one mindmap at a time."
	if position > 1 {
		label = fmt.Sprintf("You're in the queue (position %d) — Tasur is in beta and processes requests in order.", position)
	}
	e.emit(QueuedEvent{Type: "queued", Position: position, Label: label})
}

// ── CORS helpers ──────────────────────────────────────────────────────────────

// setCORSHeaders adds the CORS headers required for direct browser uploads.
// ALLOWED_ORIGIN must match the frontend origin (e.g. https://tasur.app).
func setCORSHeaders(w http.ResponseWriter, r *http.Request) {
	origin := os.Getenv("ALLOWED_ORIGIN")
	if origin == "" {
		// Reflect the request origin in dev (no ALLOWED_ORIGIN set).
		origin = r.Header.Get("Origin")
	}
	if origin != "" {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Upload-Token, X-User-Id, X-Max-Sessions")
	w.Header().Set("Access-Control-Max-Age", "86400")
}

// ── Upload auth ────────────────────────────────────────────────────────────────

// resolveUserID extracts and validates the user ID from the request.
//
// If UPLOAD_TOKEN_SECRET is configured the request must carry a valid
// X-Upload-Token (HMAC-SHA256 signed by Next.js). This is the path taken
// when the browser uploads directly to Go, bypassing the Vercel proxy.
//
// If the secret is not configured the service falls back to trusting the
// X-User-Id header set by the Next.js proxy (internal Railway traffic only).
func resolveUserID(r *http.Request) (string, error) {
	secret := os.Getenv("UPLOAD_TOKEN_SECRET")
	if secret != "" {
		return validateUploadToken(
			r.Header.Get("X-Upload-Token"),
			r.Header.Get("X-User-Id"),
			secret,
		)
	}
	// Proxy mode — trust X-User-Id added by the Next.js server.
	userID := r.Header.Get("X-User-Id")
	if userID == "" {
		return "", fmt.Errorf("missing X-User-Id header")
	}
	return userID, nil
}

// validateUploadToken verifies the short-lived HMAC token minted by Next.js.
// Token format: "userId:expiryUnix.hmac_sha256_hex"
func validateUploadToken(token, claimedUserID, secret string) (string, error) {
	if token == "" || claimedUserID == "" {
		return "", fmt.Errorf("missing upload token or user ID")
	}
	dot := strings.LastIndex(token, ".")
	if dot < 0 {
		return "", fmt.Errorf("malformed upload token")
	}
	payload, sig := token[:dot], token[dot+1:]

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(sig)) {
		return "", fmt.Errorf("invalid upload token signature")
	}

	colon := strings.LastIndex(payload, ":")
	if colon < 0 {
		return "", fmt.Errorf("malformed token payload")
	}
	userID, expStr := payload[:colon], payload[colon+1:]

	expiry, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil || time.Now().Unix() > expiry {
		return "", fmt.Errorf("upload token expired")
	}
	if userID != claimedUserID {
		return "", fmt.Errorf("token user ID mismatch")
	}
	return userID, nil
}

// maxSessionsLimit returns the configured session cap, independent of any
// client-supplied header so it cannot be bypassed by a direct upload.
func maxSessionsLimit() int {
	if v := os.Getenv("MAX_SESSIONS_PER_USER"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return 10
}

// ── Handler: POST /pipeline/upload ───────────────────────────────────────────

func makeUploadHandler(sem chan struct{}, vc *vertexClient, sb *supabaseClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		setCORSHeaders(w, r)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		sse, ok := newSSEEmitter(w)
		if !ok {
			http.Error(w, "SSE not supported", http.StatusInternalServerError)
			return
		}

		stopHeartbeat := sse.startHeartbeat(r.Context(), 12*time.Second)
		defer stopHeartbeat()

		userID := r.Header.Get("X-User-Id")
		if userID == "" {
			sse.error("Unauthorized")
			return
		}

		maxSessions := maxSessionsLimit()

		// ── Parse multipart form (50 MB limit) ──────────────────────────────
		if err := r.ParseMultipartForm(50 << 20); err != nil {
			sse.error("Invalid form data: " + err.Error())
			return
		}

		file, fileHeader, err := r.FormFile("file")
		if err != nil {
			sse.error("No file provided")
			return
		}
		defer file.Close()

		fileBytes, err := io.ReadAll(file)
		if err != nil {
			sse.error("Failed to read file")
			return
		}

		domain := sanitizeDomain(defaultStr(r.FormValue("domain"), "general"))
		rawMode := r.FormValue("mode")
		mode := "steady"
		if rawMode == "fast" {
			mode = "fast"
		}
		rawTitle := strings.TrimSpace(r.FormValue("title"))
		if rawTitle == "" {
			rawTitle = strings.TrimSuffix(fileHeader.Filename, "."+fileExtension(fileHeader.Filename))
			rawTitle = strings.ReplaceAll(rawTitle, "-", " ")
			rawTitle = strings.ReplaceAll(rawTitle, "_", " ")
		}
		generateFlashcards := r.FormValue("generateFlashcards") != "false"
		customInstructions := r.FormValue("customInstructions")
		if err := validateCustomInstructions(customInstructions); err != nil {
			sse.error(err.Error())
			return
		}

		filename := fileHeader.Filename
		mimeType := fileHeader.Header.Get("Content-Type")
		fileType := resolveFileType(mimeType, filename)

		// ── Acquire semaphore slot (blocks until slot available) ─────────────
		select {
		case sem <- struct{}{}:
			defer func() { <-sem }()
		case <-r.Context().Done():
			return
		}

		// ── Run pipeline ─────────────────────────────────────────────────────
		ctx := r.Context()

		// Check session quota
		count, err := sb.getSessionCount(userID)
		if err != nil {
			sse.error("Failed to check session quota")
			return
		}
		if count >= maxSessions {
			sse.error(fmt.Sprintf("Session limit reached (%d sessions per user during beta)", maxSessions))
			return
		}

		runUploadPipeline(ctx, sse, vc, sb, PipelineInput{
			FileBytes:          fileBytes,
			Filename:           filename,
			MimeType:           mimeType,
			FileType:           fileType,
			Domain:             domain,
			Mode:               mode,
			Title:              rawTitle,
			GenerateFlashcards: generateFlashcards,
			CustomInstructions: customInstructions,
			UserID:             userID,
		})
	}
}

// ── Handler: POST /pipeline/document/{sessionId} ──────────────────────────────

func makeDocumentHandler(sem chan struct{}, vc *vertexClient, sb *supabaseClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		setCORSHeaders(w, r)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		sse, ok := newSSEEmitter(w)
		if !ok {
			http.Error(w, "SSE not supported", http.StatusInternalServerError)
			return
		}

		stopHeartbeat := sse.startHeartbeat(r.Context(), 12*time.Second)
		defer stopHeartbeat()

		userID := r.Header.Get("X-User-Id")
		if userID == "" {
			sse.error("Unauthorized")
			return
		}

		sessionID := r.PathValue("sessionId")
		if sessionID == "" {
			sse.error("Missing sessionId")
			return
		}

		if err := r.ParseMultipartForm(50 << 20); err != nil {
			sse.error("Invalid form data: " + err.Error())
			return
		}

		file, fileHeader, err := r.FormFile("file")
		if err != nil {
			sse.error("No file provided")
			return
		}
		defer file.Close()

		fileBytes, err := io.ReadAll(file)
		if err != nil {
			sse.error("Failed to read file")
			return
		}

		customInstructions := r.FormValue("customInstructions")
		if err := validateCustomInstructions(customInstructions); err != nil {
			sse.error(err.Error())
			return
		}

		filename := fileHeader.Filename
		mimeType := fileHeader.Header.Get("Content-Type")
		fileType := resolveFileType(mimeType, filename)

		// ── Acquire semaphore ────────────────────────────────────────────────
		select {
		case sem <- struct{}{}:
			defer func() { <-sem }()
		case <-r.Context().Done():
			return
		}

		ctx := r.Context()

		// Verify session ownership and get metadata
		learningMode, subjectDomain, err := sb.getSession(sessionID, userID)
		if err != nil {
			sse.error("Session not found")
			return
		}

		domain := strings.TrimSpace(defaultStr(r.FormValue("domain"), subjectDomain))
		if domain == "" {
			domain = "general"
		}

		runDocumentPipeline(ctx, sse, vc, sb, PipelineInput{
			FileBytes:          fileBytes,
			Filename:           filename,
			MimeType:           mimeType,
			FileType:           fileType,
			Domain:             domain,
			Mode:               learningMode,
			CustomInstructions: customInstructions,
			UserID:             userID,
			SessionID:          sessionID,
		})
	}
}

// ── Upload pipeline ───────────────────────────────────────────────────────────

func runUploadPipeline(ctx context.Context, sse *sseEmitter, vc *vertexClient, sb *supabaseClient, input PipelineInput) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("pipeline panic: %v", r)
			sse.error("Internal error — please try again")
		}
	}()

	// Phase 1a: Text extraction
	sse.progress("extracting", "Extracting text…", 8)
	extraction, err := extractText(input.FileBytes, input.FileType)
	if err != nil {
		log.Printf("extraction error (non-fatal for PDF): %v", err)
		if input.FileType != FileTypePDF {
			sse.error("Text extraction failed: " + err.Error())
			return
		}
		extraction = ExtractionResult{RawText: "", NeedsVision: true}
	}

	// Phase 1b: mm-generator (rate-limited)
	if pos, err := mmRateLimit.Wait(ctx); err != nil {
		return // client disconnected while waiting in queue
	} else if pos > 1 || mmRateLimit.QueueDepth() > 0 {
		sse.queued(pos)
	}
	sse.progress("generating_mm", "Generating study mindmap… (beta: this may take a moment)", 25)
	mmResult, err := generateMm(
		ctx, vc,
		extraction.RawText,
		input.FileType,
		input.FileBytes,
		extraction.NeedsVision,
		input.Domain,
		input.CustomInstructions,
	)
	if err != nil {
		sse.error("Mindmap generation failed: " + err.Error())
		return
	}

	// Phase 2: Deterministic mm-parser
	sse.progress("analyzing", "Analysing structure…", 48)
	parsedTree, err := parseMmXml(mmResult.MmXml)
	if err != nil {
		sse.error("Mindmap parsing failed: " + err.Error())
		return
	}
	concepts := extractConcepts(parsedTree)
	edges := buildGraphEdges(concepts)
	mindmapTree := toMindmapTreeOutput(parsedTree, input.Domain)
	richParsedContent := buildParserOutput(concepts, edges, input.Domain, parsedTree.Title)
	graphState := buildInitialGraphStateFromMm("pending", concepts, edges, input.Domain)

	// Phase 3: Web search (skipped — gaps_detected is always empty)
	// gaps_detected is always [] in buildParserOutput, so no web search needed.

	// Phase 4: Flashcard generation
	var flashcardResult FlashcardGeneratorResult
	if input.GenerateFlashcards && len(concepts) > 0 {
		sse.progress("flashcards", "Creating flashcards…", 72)
		flashcardResult, err = generateFlashcards(ctx, vc, richParsedContent, input.Domain, input.Mode)
		if err != nil {
			log.Printf("flashcard generation failed (non-fatal): %v", err)
			flashcardResult = FlashcardGeneratorResult{Output: FlashcardOutput{Cards: []Flashcard{}}}
		}
	} else {
		flashcardResult = FlashcardGeneratorResult{Output: FlashcardOutput{Cards: []Flashcard{}}}
	}

	// Phase 5: DB persistence
	sse.progress("saving", "Saving your study session…", 88)
	sessionID, err := sb.createStudySession(input.UserID, input.Title, input.Domain, input.Mode)
	if err != nil {
		sse.error("Failed to create session: " + err.Error())
		return
	}

	// Update graphState with real sessionId now that we have it
	graphState.SessionID = sessionID

	if err := sb.persistPipelineResults(PersistInput{
		SessionID:   sessionID,
		UserID:      input.UserID,
		Concepts:    concepts,
		Edges:       edges,
		MindmapTree: mindmapTree,
		Flashcards:  flashcardResult.Output,
		GraphState:  graphState,
		MmXml:       mmResult.MmXml,
		RawText:     extraction.RawText,
		Filename:    input.Filename,
		FileType:    input.FileType,
		FileBytes:   input.FileBytes,
		MimeType:    input.MimeType,
	}); err != nil {
		sse.error("Failed to save session: " + err.Error())
		return
	}

	// Track token usage (non-fatal)
	totalIn := mmResult.InputTokens + flashcardResult.InputTokens
	totalOut := mmResult.OutputTokens + flashcardResult.OutputTokens
	sb.incrementSessionTokenUsage(sessionID, totalIn, totalOut)

	sse.done(sessionID, "Ready! Let's study.")
}

// ── Document pipeline ─────────────────────────────────────────────────────────

func runDocumentPipeline(ctx context.Context, sse *sseEmitter, vc *vertexClient, sb *supabaseClient, input PipelineInput) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("document pipeline panic: %v", r)
			sse.error("Internal error — please try again")
		}
	}()

	// Load existing graph
	existingGraph, err := sb.getExistingGraphState(input.SessionID)
	if err != nil {
		log.Printf("failed to load existing graph (using blank): %v", err)
		existingGraph = StudentGraphState{
			SessionID:    input.SessionID,
			Nodes:        []ConceptNode{},
			Edges:        []ConceptEdge{},
			LastSyncedAt: time.Now().UTC().Format(time.RFC3339),
		}
	}

	// Phase 1a: Text extraction
	sse.progress("extracting", "Extracting text…", 8)
	extraction, err := extractText(input.FileBytes, input.FileType)
	if err != nil {
		log.Printf("extraction error (non-fatal for PDF): %v", err)
		if input.FileType != FileTypePDF {
			sse.error("Text extraction failed: " + err.Error())
			return
		}
		extraction = ExtractionResult{RawText: "", NeedsVision: true}
	}

	// Phase 1b: mm-generator (rate-limited)
	if pos, err := mmRateLimit.Wait(ctx); err != nil {
		return // client disconnected while waiting in queue
	} else if pos > 1 || mmRateLimit.QueueDepth() > 0 {
		sse.queued(pos)
	}
	sse.progress("generating_mm", "Generating study mindmap… (beta: this may take a moment)", 30)
	mmResult, err := generateMm(
		ctx, vc,
		extraction.RawText,
		input.FileType,
		input.FileBytes,
		extraction.NeedsVision,
		input.Domain,
		input.CustomInstructions,
	)
	if err != nil {
		sse.error("Mindmap generation failed: " + err.Error())
		return
	}

	// Phase 2: Parser
	sse.progress("analyzing", "Analysing structure…", 50)
	parsedTree, err := parseMmXml(mmResult.MmXml)
	if err != nil {
		sse.error("Mindmap parsing failed: " + err.Error())
		return
	}
	newConcepts := extractConcepts(parsedTree)
	newEdges := buildGraphEdges(newConcepts)
	newBranches := toMindmapTreeOutput(parsedTree, input.Domain)
	richParsedContent := buildParserOutput(newConcepts, newEdges, input.Domain, parsedTree.Title)

	// Phase 3: Web search (skipped — gaps always empty)

	// Phase 4: Flashcards (always generate for document additions)
	sse.progress("flashcards", "Creating flashcards…", 75)
	flashcardResult, err := generateFlashcards(ctx, vc, richParsedContent, input.Domain, input.Mode)
	if err != nil {
		log.Printf("flashcard generation failed (non-fatal): %v", err)
		flashcardResult = FlashcardGeneratorResult{Output: FlashcardOutput{Cards: []Flashcard{}}}
	}

	// Phase 5: Append to session
	sse.progress("saving", "Expanding your study graph…", 88)
	if err := sb.appendDocumentToSession(AppendInput{
		SessionID:     input.SessionID,
		UserID:        input.UserID,
		NewConcepts:   newConcepts,
		NewEdges:      newEdges,
		NewBranches:   newBranches,
		NewFlashcards: flashcardResult.Output,
		ExistingGraph: existingGraph,
		RawText:       extraction.RawText,
		Filename:      input.Filename,
		FileType:      input.FileType,
		MmXml:         mmResult.MmXml,
		FileBytes:     input.FileBytes,
		MimeType:      input.MimeType,
	}); err != nil {
		sse.error("Failed to save document: " + err.Error())
		return
	}

	sb.touchSessionLastActive(input.SessionID)

	sse.done(input.SessionID, "Graph expanded! Back to studying.")
}

// ── Input helpers ─────────────────────────────────────────────────────────────

// sanitizeDomain keeps only word chars, spaces, hyphens. Max 100 chars.
// Mirrors sanitizeDomain() in the TypeScript upload route.
func sanitizeDomain(s string) string {
	var sb strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') ||
			r == ' ' || r == '-' || r == '_' {
			sb.WriteRune(r)
		}
	}
	result := strings.TrimSpace(sb.String())
	if len(result) > 100 {
		result = result[:100]
	}
	if result == "" {
		return "general"
	}
	return result
}

// validateCustomInstructions returns an error if the custom instructions are invalid.
func validateCustomInstructions(s string) error {
	if len(s) > 500 {
		return fmt.Errorf("custom instructions must be 500 characters or fewer")
	}
	return nil
}

// resolveFileType mirrors resolveFileType() in both Next.js route handlers.
func resolveFileType(mimeType, filename string) FileType {
	ext := ""
	if idx := strings.LastIndex(filename, "."); idx >= 0 {
		ext = strings.ToLower(filename[idx+1:])
	}

	if ext == "pdf" || mimeType == "application/pdf" {
		return FileTypePDF
	}
	if ext == "docx" || strings.Contains(mimeType, "wordprocessingml") {
		return FileTypeDOCX
	}
	if ext == "txt" || mimeType == "text/plain" {
		return FileTypeTXT
	}
	if ext == "png" || mimeType == "image/png" {
		return FileTypePNG
	}
	if ext == "jpg" || ext == "jpeg" || strings.HasPrefix(mimeType, "image/jpeg") {
		return FileTypeJPG
	}
	return FileTypeTXT
}

func fileExtension(filename string) string {
	if idx := strings.LastIndex(filename, "."); idx >= 0 {
		return filename[idx+1:]
	}
	return ""
}

func defaultStr(s, fallback string) string {
	if strings.TrimSpace(s) == "" {
		return fallback
	}
	return s
}

// ── Health check handler ──────────────────────────────────────────────────────

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, `{"status":"ok"}`)
}

// ── Server setup ──────────────────────────────────────────────────────────────

// startServer initialises all dependencies and starts the HTTP server.
func startServer() error {
	ctx := context.Background()

	vc, err := newVertexClient(ctx)
	if err != nil {
		return fmt.Errorf("init vertex client: %w", err)
	}

	sb, err := newSupabaseClient()
	if err != nil {
		return fmt.Errorf("init supabase client: %w", err)
	}

	// Worker pool: max 5 concurrent pipeline runs
	sem := make(chan struct{}, 5)

	// Rate limiter: caps Vertex AI calls to MM_RATE_LIMIT_PER_MINUTE (default 8/min)
	mmRateLimit = newAPIRateLimiter(mmRatePerMinute())

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", healthHandler)
	mux.HandleFunc("POST /pipeline/upload", makeUploadHandler(sem, vc, sb))
	mux.HandleFunc("OPTIONS /pipeline/upload", makeUploadHandler(sem, vc, sb))
	mux.HandleFunc("POST /pipeline/document/{sessionId}", makeDocumentHandler(sem, vc, sb))
	mux.HandleFunc("OPTIONS /pipeline/document/{sessionId}", makeDocumentHandler(sem, vc, sb))

	log.Printf("Go pipeline service starting on :%s", port)
	return http.ListenAndServe(":"+port, mux)
}
