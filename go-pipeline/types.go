package main

// ── Freeplane XML parsing types ───────────────────────────────────────────────

// xmlMap is the top-level <map> element parsed by encoding/xml.
type xmlMap struct {
	Node []xmlNode `xml:"node"`
}

// xmlFont is the <font> child element of a <node>.
type xmlFont struct {
	Bold string `xml:"BOLD,attr"`
	Name string `xml:"NAME,attr"`
	Size string `xml:"SIZE,attr"`
}

// xmlNode is a single <node> element with recursive children.
type xmlNode struct {
	Text      string    `xml:"TEXT,attr"`
	Trackable string    `xml:"TRACKABLE,attr"`
	ConceptID string    `xml:"CONCEPT_ID,attr"`
	Folded    string    `xml:"FOLDED,attr"`
	Position  string    `xml:"POSITION,attr"`
	Font      []xmlFont `xml:"font"`
	Children  []xmlNode `xml:"node"`
}

// ── Normalised in-memory tree ─────────────────────────────────────────────────

// MmNode is the normalised, depth-annotated representation of a Freeplane node.
type MmNode struct {
	Text      string
	Trackable bool
	ConceptID string
	Position  string
	Children  []*MmNode
	Depth     int
}

// ParsedMindmap is the result of parseMmXml.
type ParsedMindmap struct {
	Root           *MmNode
	Title          string
	MaxDepth       int
	TrackableCount int
}

// ── Derived concepts (from TRACKABLE nodes) ───────────────────────────────────

// DerivedConcept mirrors the TypeScript DerivedConcept from mm-parser/types.ts.
type DerivedConcept struct {
	ID              string
	Name            string
	Depth           int
	ParentID        *string // nil for top-level concepts
	ChildConceptIDs []string
	LeafContent     []string
	HasDiagram      bool
	Position        int
}

// ── Graph types ───────────────────────────────────────────────────────────────

// ConceptEdge is a directed edge in the knowledge graph.
type ConceptEdge struct {
	From          string  `json:"from"`
	To            string  `json:"to"`
	Type          string  `json:"type"` // "prerequisite" | "sequential"
	Weight        float64 `json:"weight"`
	Bidirectional bool    `json:"bidirectional"`
}

// ── Mindmap tree output (for frontend) ───────────────────────────────────────

// MindmapNode is a single node in the visual mindmap tree sent to the frontend.
type MindmapNode struct {
	ID        *string        `json:"id,omitempty"`
	Label     string         `json:"label"`
	ConceptID *string        `json:"concept_id,omitempty"`
	Content   *string        `json:"content,omitempty"`
	StudyCue  *string        `json:"study_cue,omitempty"`
	Children  []*MindmapNode `json:"children,omitempty"`
}

// MindmapTreeOutput is the full tree structure stored in the DB and sent to the frontend.
type MindmapTreeOutput struct {
	Title    string          `json:"title"`
	Subject  string          `json:"subject"`
	Children []*MindmapNode  `json:"children"`
	Metadata MindmapMetadata `json:"metadata"`
}

// MindmapMetadata holds counts used by the orchestrator's validation gate.
type MindmapMetadata struct {
	TotalNodes        int      `json:"total_nodes"`
	MaxDepth          int      `json:"max_depth"`
	ConceptIDsCovered []string `json:"concept_ids_covered"`
}

// ── Flashcard types ───────────────────────────────────────────────────────────

// Flashcard is a single generated flashcard.
type Flashcard struct {
	ID         string   `json:"id"`
	ConceptID  string   `json:"concept_id"`
	Type       string   `json:"type"`
	Front      string   `json:"front"`
	Back       string   `json:"back"`
	Difficulty string   `json:"difficulty"`
	Tags       []string `json:"tags"`
	Hints      []string `json:"hints"`
}

// FlashcardOutput is the structured response from the flashcard generator.
type FlashcardOutput struct {
	Cards []Flashcard `json:"cards"`
}

// ── Student graph types ───────────────────────────────────────────────────────

// ConceptStudentState mirrors TypeScript's ConceptStudentState.
type ConceptStudentState struct {
	Confidence          float64            `json:"confidence"`
	ExposureCount       int                `json:"exposureCount"`
	EffectiveModalities []string           `json:"effectiveModalities"`
	ModePerformance     map[string]float64 `json:"modePerformance"`
	LastAssessed        *string            `json:"lastAssessed"`
}

// ConceptNode mirrors TypeScript's ConceptNode in the StudentGraph.
type ConceptNode struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	Domain       string                 `json:"domain"`
	Content      map[string]string      `json:"content"`
	Complexity   string                 `json:"complexity"`
	Keywords     []string               `json:"keywords"`
	StudentState ConceptStudentState    `json:"studentState"`
	Metadata     map[string]interface{} `json:"metadata"`
}

// StudentGraphState mirrors the TypeScript StudentGraphState persisted in student_graphs.
type StudentGraphState struct {
	SessionID    string        `json:"sessionId"`
	Nodes        []ConceptNode `json:"nodes"`
	Edges        []ConceptEdge `json:"edges"`
	LastSyncedAt string        `json:"lastSyncedAt"`
}

// ── Pipeline request types ────────────────────────────────────────────────────

// FileType mirrors the TypeScript FileType enum.
type FileType string

const (
	FileTypePDF  FileType = "pdf"
	FileTypeDOCX FileType = "docx"
	FileTypeTXT  FileType = "txt"
	FileTypePNG  FileType = "png"
	FileTypeJPG  FileType = "jpg"
)

// PipelineInput holds the parsed form data received from the Next.js proxy.
type PipelineInput struct {
	FileBytes           []byte
	Filename            string
	MimeType            string
	FileType            FileType
	Domain              string
	Mode                string // "fast" | "steady"
	Title               string
	GenerateFlashcards  bool
	CustomInstructions  string
	UserID              string
	SessionID           string // only for document-add path
	MaxSessions         int    // only for upload path
}

// ── SSE event types ───────────────────────────────────────────────────────────

// ProgressEvent is emitted to the client during pipeline execution.
type ProgressEvent struct {
	Type    string `json:"type"`
	Step    string `json:"step,omitempty"`
	Label   string `json:"label,omitempty"`
	Percent int    `json:"percent,omitempty"`
}

// DoneEvent is emitted when the pipeline completes successfully.
type DoneEvent struct {
	Type      string `json:"type"`
	SessionID string `json:"sessionId"`
	Label     string `json:"label"`
}

// ErrorEvent is emitted when the pipeline fails.
type ErrorEvent struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

// ── Vertex AI REST types ──────────────────────────────────────────────────────

// vertexRequest is the JSON body sent to the Vertex AI generateContent endpoint.
type vertexRequest struct {
	SystemInstruction *vertexContent         `json:"systemInstruction,omitempty"`
	Contents          []vertexContent        `json:"contents"`
	GenerationConfig  vertexGenerationConfig `json:"generationConfig,omitempty"`
}

type vertexContent struct {
	Role  string        `json:"role"`
	Parts []vertexPart  `json:"parts"`
}

type vertexPart struct {
	Text       string            `json:"text,omitempty"`
	InlineData *vertexInlineData `json:"inlineData,omitempty"`
}

type vertexInlineData struct {
	MIMEType string `json:"mimeType"`
	Data     string `json:"data"` // base64 encoded
}

type vertexGenerationConfig struct {
	Temperature      float64                 `json:"temperature,omitempty"`
	ThinkingConfig   *vertexThinkingConfig   `json:"thinkingConfig,omitempty"`
	ResponseMIMEType string                  `json:"responseMimeType,omitempty"`
	ResponseSchema   map[string]interface{}  `json:"responseSchema,omitempty"`
}

type vertexThinkingConfig struct {
	ThinkingBudget int    `json:"thinkingBudget,omitempty"` // gemini-2.5 and earlier
	ThinkingLevel  string `json:"thinkingLevel,omitempty"`  // gemini-3.x and later
}

type vertexResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	UsageMetadata struct {
		PromptTokenCount     int `json:"promptTokenCount"`
		CandidatesTokenCount int `json:"candidatesTokenCount"`
	} `json:"usageMetadata"`
}
