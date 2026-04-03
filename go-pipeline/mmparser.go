package main

import (
	"encoding/xml"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// ── Freeplane XML parser ──────────────────────────────────────────────────────
// Ports the TypeScript mm-parser pipeline to Go:
//   parseMmXml → extractConcepts → buildGraphEdges → toMindmapTreeOutput

const diagramCalloutPrefix = "[DIAGRAM TO STUDY:"
const minimumDepth = 2

// ── Parse ─────────────────────────────────────────────────────────────────────

// parseMmXml parses a Freeplane .mm XML string into a normalised ParsedMindmap.
// Mirrors src/lib/mm-parser/index.ts: parseMmXml().
func parseMmXml(xmlString string) (*ParsedMindmap, error) {
	trimmed := strings.TrimSpace(xmlString)

	// Pre-parse validation
	if !strings.HasPrefix(trimmed, "<map") {
		return nil, fmt.Errorf(".mm validation error: XML must start with <map ...>. Got: %q", safePrefix(trimmed, 40))
	}
	if !strings.HasSuffix(trimmed, "</map>") {
		return nil, fmt.Errorf(".mm validation error: XML must end with </map>. Last 40 chars: %q", safeSuffix(trimmed, 40))
	}

	var raw struct {
		XMLName xml.Name  `xml:"map"`
		Nodes   []xmlNode `xml:"node"`
	}
	if err := xml.Unmarshal([]byte(trimmed), &raw); err != nil {
		return nil, fmt.Errorf(".mm parse error: %w", err)
	}
	if len(raw.Nodes) == 0 {
		return nil, fmt.Errorf(".mm parse error: <map> has no <node> children")
	}

	root := normaliseMmNode(raw.Nodes[0], 0)

	// Post-normalisation validation
	if err := validateNormalisedTree(root); err != nil {
		return nil, err
	}

	maxDepth := computeMaxDepth(root)
	trackableCount := countTrackableNodes(root)

	return &ParsedMindmap{
		Root:           root,
		Title:          root.Text,
		MaxDepth:       maxDepth,
		TrackableCount: trackableCount,
	}, nil
}

// normaliseMmNode recursively converts a raw xmlNode to a normalised MmNode.
func normaliseMmNode(raw xmlNode, depth int) *MmNode {
	children := make([]*MmNode, 0, len(raw.Children))
	for _, child := range raw.Children {
		children = append(children, normaliseMmNode(child, depth+1))
	}

	return &MmNode{
		Text:      strings.TrimSpace(raw.Text),
		Trackable: raw.Trackable == "true",
		ConceptID: strings.TrimSpace(raw.ConceptID),
		Position:  raw.Position,
		Children:  children,
		Depth:     depth,
	}
}

// validateNormalisedTree checks structural invariants after normalisation.
func validateNormalisedTree(root *MmNode) error {
	trackable := collectTrackableNodes(root)
	if len(trackable) == 0 {
		return fmt.Errorf(".mm validation error: no TRACKABLE=\"true\" nodes found")
	}
	for _, node := range trackable {
		if strings.TrimSpace(node.ConceptID) == "" {
			return fmt.Errorf(".mm validation error: TRACKABLE node %q (depth %d) is missing CONCEPT_ID", node.Text, node.Depth)
		}
	}
	if computeMaxDepth(root) < minimumDepth {
		return fmt.Errorf(".mm validation error: tree is too shallow (max depth %d, minimum %d)", computeMaxDepth(root), minimumDepth)
	}
	return nil
}

// collectTrackableNodes returns all TRACKABLE nodes in depth-first order.
func collectTrackableNodes(node *MmNode) []*MmNode {
	var result []*MmNode
	if node.Trackable {
		result = append(result, node)
	}
	for _, child := range node.Children {
		result = append(result, collectTrackableNodes(child)...)
	}
	return result
}

// computeMaxDepth returns the maximum depth of any node in the subtree.
func computeMaxDepth(node *MmNode) int {
	max := node.Depth
	for _, child := range node.Children {
		if d := computeMaxDepth(child); d > max {
			max = d
		}
	}
	return max
}

// countTrackableNodes counts TRACKABLE nodes in the subtree.
func countTrackableNodes(node *MmNode) int {
	n := 0
	if node.Trackable {
		n++
	}
	for _, child := range node.Children {
		n += countTrackableNodes(child)
	}
	return n
}

// ── Concept extraction ────────────────────────────────────────────────────────
// Mirrors src/lib/mm-parser/concept-extractor.ts: extractConcepts()

// extractConcepts walks the parsed mindmap and returns all TRACKABLE nodes as DerivedConcepts.
func extractConcepts(tree *ParsedMindmap) []DerivedConcept {
	var concepts []DerivedConcept
	walkNode(tree.Root, nil, &concepts)
	return resolvePositions(concepts)
}

func walkNode(node *MmNode, nearestTrackableAncestorID *string, accumulator *[]DerivedConcept) {
	if node.Trackable && node.ConceptID != "" {
		concept := buildDerivedConcept(node, nearestTrackableAncestorID)
		*accumulator = append(*accumulator, concept)
		for _, child := range node.Children {
			id := node.ConceptID
			walkNode(child, &id, accumulator)
		}
	} else {
		for _, child := range node.Children {
			walkNode(child, nearestTrackableAncestorID, accumulator)
		}
	}
}

func buildDerivedConcept(node *MmNode, parentConceptID *string) DerivedConcept {
	leafContent := collectDirectLeafContent(node)
	childConceptIDs := collectDirectChildConceptIDs(node)
	hasDiagram := false
	for _, text := range leafContent {
		if strings.HasPrefix(text, diagramCalloutPrefix) {
			hasDiagram = true
			break
		}
	}

	return DerivedConcept{
		ID:              node.ConceptID,
		Name:            node.Text,
		Depth:           node.Depth,
		ParentID:        parentConceptID,
		ChildConceptIDs: childConceptIDs,
		LeafContent:     leafContent,
		HasDiagram:      hasDiagram,
		Position:        0, // resolved in resolvePositions
	}
}

// collectDirectLeafContent collects TEXT from non-TRACKABLE descendants, stopping at TRACKABLE boundaries.
func collectDirectLeafContent(node *MmNode) []string {
	var texts []string
	for _, child := range node.Children {
		if child.Trackable {
			continue
		}
		if strings.TrimSpace(child.Text) != "" {
			texts = append(texts, child.Text)
		}
		texts = append(texts, collectDirectLeafContent(child)...)
	}
	return texts
}

// collectDirectChildConceptIDs returns CONCEPT_IDs of direct TRACKABLE children.
func collectDirectChildConceptIDs(node *MmNode) []string {
	var ids []string
	for _, child := range node.Children {
		if child.Trackable && child.ConceptID != "" {
			ids = append(ids, child.ConceptID)
		}
	}
	return ids
}

// resolvePositions assigns 0-based position among same-parent siblings.
func resolvePositions(concepts []DerivedConcept) []DerivedConcept {
	counters := make(map[string]int) // parentID → counter
	for i, c := range concepts {
		key := ""
		if c.ParentID != nil {
			key = *c.ParentID
		}
		concepts[i].Position = counters[key]
		counters[key]++
	}
	return concepts
}

// ── Graph edge builder ────────────────────────────────────────────────────────
// Mirrors src/lib/mm-parser/graph-builder.ts: buildGraphEdges()

const prerequisiteWeight = 1.0
const sequentialWeight = 0.5

// buildGraphEdges derives ConceptEdge[] from DerivedConcept[] using tree structure.
func buildGraphEdges(concepts []DerivedConcept) []ConceptEdge {
	var edges []ConceptEdge
	edges = append(edges, buildPrerequisiteEdges(concepts)...)
	edges = append(edges, buildSequentialEdges(concepts)...)
	return edges
}

func buildPrerequisiteEdges(concepts []DerivedConcept) []ConceptEdge {
	conceptIDs := make(map[string]bool)
	for _, c := range concepts {
		conceptIDs[c.ID] = true
	}

	var edges []ConceptEdge
	for _, c := range concepts {
		if c.ParentID != nil && conceptIDs[*c.ParentID] {
			edges = append(edges, ConceptEdge{
				From:          *c.ParentID,
				To:            c.ID,
				Type:          "prerequisite",
				Weight:        prerequisiteWeight,
				Bidirectional: false,
			})
		}
	}
	return edges
}

func buildSequentialEdges(concepts []DerivedConcept) []ConceptEdge {
	// Group by parentID
	siblingGroups := make(map[string][]DerivedConcept)
	for _, c := range concepts {
		key := ""
		if c.ParentID != nil {
			key = *c.ParentID
		}
		siblingGroups[key] = append(siblingGroups[key], c)
	}

	var edges []ConceptEdge
	for _, siblings := range siblingGroups {
		// Sort by position (already assigned by resolvePositions)
		sorted := make([]DerivedConcept, len(siblings))
		copy(sorted, siblings)
		sortByPosition(sorted)

		for i := 0; i < len(sorted)-1; i++ {
			edges = append(edges, ConceptEdge{
				From:          sorted[i].ID,
				To:            sorted[i+1].ID,
				Type:          "sequential",
				Weight:        sequentialWeight,
				Bidirectional: false,
			})
		}
	}
	return edges
}

func sortByPosition(concepts []DerivedConcept) {
	n := len(concepts)
	for i := 0; i < n; i++ {
		for j := i + 1; j < n; j++ {
			if concepts[j].Position < concepts[i].Position {
				concepts[i], concepts[j] = concepts[j], concepts[i]
			}
		}
	}
}

// ── Tree converter ────────────────────────────────────────────────────────────
// Mirrors src/lib/mm-parser/tree-converter.ts: toMindmapTreeOutput()

// toMindmapTreeOutput converts a ParsedMindmap into MindmapTreeOutput for frontend rendering.
func toMindmapTreeOutput(tree *ParsedMindmap, subject string) MindmapTreeOutput {
	if subject == "" {
		subject = tree.Title
	}

	topLevelBranches := make([]*MindmapNode, 0, len(tree.Root.Children))
	for _, child := range tree.Root.Children {
		topLevelBranches = append(topLevelBranches, convertMmNode(child))
	}

	allNodes := collectAllMindmapNodes(topLevelBranches)
	var conceptIDs []string
	for _, node := range allNodes {
		if node.ConceptID != nil {
			conceptIDs = append(conceptIDs, *node.ConceptID)
		}
	}

	return MindmapTreeOutput{
		Title:    tree.Title,
		Subject:  subject,
		Children: topLevelBranches,
		Metadata: MindmapMetadata{
			TotalNodes:        len(allNodes),
			MaxDepth:          computeMaxMindmapDepth(topLevelBranches, 0),
			ConceptIDsCovered: conceptIDs,
		},
	}
}

func convertMmNode(node *MmNode) *MindmapNode {
	children := make([]*MindmapNode, 0, len(node.Children))
	for _, child := range node.Children {
		children = append(children, convertMmNode(child))
	}

	result := &MindmapNode{
		Label: node.Text,
	}
	if len(children) > 0 {
		result.Children = children
	}
	if node.Trackable && node.ConceptID != "" {
		id := node.ConceptID
		cid := node.ConceptID
		result.ID = &id
		result.ConceptID = &cid
	}
	return result
}

func collectAllMindmapNodes(nodes []*MindmapNode) []*MindmapNode {
	var result []*MindmapNode
	for _, node := range nodes {
		result = append(result, node)
		if node.Children != nil {
			result = append(result, collectAllMindmapNodes(node.Children)...)
		}
	}
	return result
}

func computeMaxMindmapDepth(nodes []*MindmapNode, currentDepth int) int {
	if len(nodes) == 0 {
		return currentDepth
	}
	max := currentDepth + 1
	for _, node := range nodes {
		if node.Children != nil {
			if d := computeMaxMindmapDepth(node.Children, currentDepth+1); d > max {
				max = d
			}
		}
	}
	return max
}

// ── Graph state builder ───────────────────────────────────────────────────────
// Mirrors src/lib/orchestration/session-utils.ts: buildInitialGraphStateFromMm()

// buildInitialGraphStateFromMm creates a StudentGraphState from derived concepts.
func buildInitialGraphStateFromMm(sessionID string, concepts []DerivedConcept, edges []ConceptEdge, domain string) StudentGraphState {
	nodes := make([]ConceptNode, 0, len(concepts))
	for _, c := range concepts {
		rawContent := strings.Join(c.LeafContent, "\n")
		nodes = append(nodes, ConceptNode{
			ID:         c.ID,
			Name:       c.Name,
			Domain:     domain,
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
	return StudentGraphState{
		SessionID:    sessionID,
		Nodes:        nodes,
		Edges:        edges,
		LastSyncedAt: time.Now().UTC().Format(time.RFC3339),
	}
}

// ── DocumentParserOutput adapter (for flashcard generator) ───────────────────
// Mirrors buildParserOutputFromDerivedConcepts in session-utils.ts.

// DocumentParserOutput is the shape expected by the flashcard generator agent.
type DocumentParserOutput struct {
	Title            string                     `json:"title"`
	SubjectDetection SubjectDetection           `json:"subject_detection"`
	Concepts         []ParsedConcept            `json:"concepts"`
	ConceptRels      []ParsedConceptRelationship `json:"concept_relationships"`
	GapsDetected     []string                   `json:"gaps_detected"`
}

type SubjectDetection struct {
	Primary        string  `json:"primary"`
	Confidence     float64 `json:"confidence"`
	DomainTemplate string  `json:"domain_template"`
}

type ParsedConcept struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	RawContent   string   `json:"raw_content"`
	Prerequisites []string `json:"prerequisites"`
	Complexity   string   `json:"complexity"`
	Keywords     []string `json:"keywords"`
}

type ParsedConceptRelationship struct {
	From string `json:"from"`
	To   string `json:"to"`
	Type string `json:"type"`
}

// buildParserOutput converts DerivedConcept[] to DocumentParserOutput for the flashcard generator.
func buildParserOutput(concepts []DerivedConcept, edges []ConceptEdge, domain, title string) DocumentParserOutput {
	parsedConcepts := make([]ParsedConcept, 0, len(concepts))
	for _, c := range concepts {
		raw := strings.Join(c.LeafContent, "\n")
		if raw == "" {
			raw = c.Name
		}
		prereqs := []string{}
		if c.ParentID != nil {
			prereqs = []string{*c.ParentID}
		}
		parsedConcepts = append(parsedConcepts, ParsedConcept{
			ID:           c.ID,
			Name:         c.Name,
			RawContent:   raw,
			Prerequisites: prereqs,
			Complexity:   depthToComplexity(c.Depth),
			Keywords:     []string{},
		})
	}

	rels := make([]ParsedConceptRelationship, 0, len(edges))
	for _, e := range edges {
		relType := e.Type
		if relType == "sequential" {
			relType = "related"
		}
		rels = append(rels, ParsedConceptRelationship{
			From: e.From,
			To:   e.To,
			Type: relType,
		})
	}

	return DocumentParserOutput{
		Title: title,
		SubjectDetection: SubjectDetection{
			Primary:        domain,
			Confidence:     1.0,
			DomainTemplate: domain + "_v1",
		},
		Concepts:     parsedConcepts,
		ConceptRels:  rels,
		GapsDetected: []string{},
	}
}

// ── Depth utilities ───────────────────────────────────────────────────────────

func depthToComplexity(depth int) string {
	if depth <= 2 {
		return "foundational"
	}
	if depth == 3 {
		return "intermediate"
	}
	return "advanced"
}

func depthToExamPriority(depth int) int {
	if depth <= 2 {
		return 3
	}
	if depth == 3 {
		return 2
	}
	return 1
}

// ── XML repair ───────────────────────────────────────────────────────────────
// Three-pass repair pipeline for LLM-generated Freeplane XML:
//   1. sanitizeXmlAttributes — escape bare <, >, & inside quoted attribute values
//   2. balanceXmlTags        — stack-based tag balancer that fixes mismatched/missing closers
//   3. ensureMapEnvelope     — guarantee the document starts with <map and ends with </map>

// attrValueRe matches attribute values: key="value" or key='value'.
// We only need to fix characters inside the quotes.
var attrValueRe = regexp.MustCompile(`([-\w]+)="([^"]*)"`)

// sanitizeXmlAttributes escapes bare XML-special characters inside attribute values.
// LLMs commonly produce TEXT="x < y" or TEXT="A & B" which breaks xml.Unmarshal.
func sanitizeXmlAttributes(xmlStr string) (string, int) {
	fixes := 0
	result := attrValueRe.ReplaceAllStringFunc(xmlStr, func(match string) string {
		eqIdx := strings.Index(match, "=\"")
		if eqIdx == -1 {
			return match
		}
		key := match[:eqIdx]
		// Inner value without surrounding quotes
		inner := match[eqIdx+2 : len(match)-1]

		// Skip if already clean
		if !strings.ContainsAny(inner, "<>&") {
			return match
		}

		// Escape & first (so we don't double-escape), but skip existing entities
		var buf strings.Builder
		buf.Grow(len(inner))
		i := 0
		for i < len(inner) {
			ch := inner[i]
			switch ch {
			case '&':
				// Check if this is already a valid entity like &amp; &lt; &gt; &quot; &apos; or &#...;
				if isEntityAt(inner, i) {
					// Copy through the semicolon
					semi := strings.IndexByte(inner[i:], ';')
					buf.WriteString(inner[i : i+semi+1])
					i += semi + 1
				} else {
					buf.WriteString("&amp;")
					fixes++
					i++
				}
			case '<':
				buf.WriteString("&lt;")
				fixes++
				i++
			case '>':
				buf.WriteString("&gt;")
				fixes++
				i++
			default:
				buf.WriteByte(ch)
				i++
			}
		}
		return key + "=\"" + buf.String() + "\""
	})
	return result, fixes
}

// isEntityAt checks if position i in s starts a valid XML entity reference.
func isEntityAt(s string, i int) bool {
	if i >= len(s) || s[i] != '&' {
		return false
	}
	rest := s[i:]
	semi := strings.IndexByte(rest, ';')
	if semi < 2 || semi > 10 {
		return false
	}
	entity := rest[1:semi]
	// Named entities
	switch entity {
	case "amp", "lt", "gt", "quot", "apos":
		return true
	}
	// Numeric: &#123; or &#x1F;
	if len(entity) >= 2 && entity[0] == '#' {
		return true
	}
	return false
}

// balanceXmlTags walks the XML string token-by-token, tracking a stack of open
// element names. It fixes:
//   - Missing closing tags (appends them at the right position)
//   - Extra closing tags (removes them)
//   - Swapped closers like </node> closing a <map> (corrects the tag name)
func balanceXmlTags(xmlStr string) (string, int) {
	fixes := 0
	var out strings.Builder
	out.Grow(len(xmlStr) + 256)
	var stack []string // open element names

	i := 0
	for i < len(xmlStr) {
		// Find next '<'
		lt := strings.IndexByte(xmlStr[i:], '<')
		if lt == -1 {
			out.WriteString(xmlStr[i:])
			break
		}
		// Write text before the tag
		out.WriteString(xmlStr[i : i+lt])
		i += lt

		// Determine tag type
		rest := xmlStr[i:]
		if strings.HasPrefix(rest, "<!--") {
			// Comment — pass through
			end := strings.Index(rest, "-->")
			if end == -1 {
				out.WriteString(rest)
				break
			}
			out.WriteString(rest[:end+3])
			i += end + 3
			continue
		}
		if strings.HasPrefix(rest, "<?") {
			// Processing instruction — pass through
			end := strings.Index(rest, "?>")
			if end == -1 {
				out.WriteString(rest)
				break
			}
			out.WriteString(rest[:end+2])
			i += end + 2
			continue
		}

		gt := strings.IndexByte(rest, '>')
		if gt == -1 {
			out.WriteString(rest)
			break
		}
		tag := rest[:gt+1]
		i += gt + 1

		if strings.HasPrefix(tag, "</") {
			// Closing tag
			name := strings.TrimSpace(tag[2 : len(tag)-1])
			if len(stack) == 0 {
				// Extra closer with no opener — skip it
				fixes++
				continue
			}
			top := stack[len(stack)-1]
			if name == top {
				// Correct close
				out.WriteString(tag)
				stack = stack[:len(stack)-1]
			} else {
				// Mismatched closer — check if it matches something deeper in the stack
				found := -1
				for j := len(stack) - 1; j >= 0; j-- {
					if stack[j] == name {
						found = j
						break
					}
				}
				if found >= 0 {
					// Close everything above the match
					for k := len(stack) - 1; k > found; k-- {
						out.WriteString("</" + stack[k] + ">\n")
						fixes++
					}
					out.WriteString(tag)
					stack = stack[:found]
				} else {
					// Closer doesn't match anything — rewrite it to close the top
					out.WriteString("</" + top + ">")
					stack = stack[:len(stack)-1]
					fixes++
				}
			}
		} else if strings.HasSuffix(tag, "/>") {
			// Self-closing — pass through
			out.WriteString(tag)
		} else {
			// Opening tag — extract element name
			inner := tag[1 : len(tag)-1] // strip < >
			spaceIdx := strings.IndexAny(inner, " \t\n\r")
			var name string
			if spaceIdx > 0 {
				name = inner[:spaceIdx]
			} else {
				name = inner
			}
			out.WriteString(tag)
			stack = append(stack, name)
		}
	}

	// Close any remaining open tags in reverse order
	for j := len(stack) - 1; j >= 0; j-- {
		out.WriteString("</" + stack[j] + ">\n")
		fixes++
	}

	return out.String(), fixes
}

// ensureMapEnvelope ensures the XML starts with <map and ends with </map>.
// If </map> is missing, it appends one. If the XML doesn't start with <map,
// it returns the input unchanged (can't safely repair that).
func ensureMapEnvelope(xmlStr string) (string, int) {
	trimmed := strings.TrimSpace(xmlStr)
	fixes := 0
	if !strings.HasPrefix(trimmed, "<map") {
		return xmlStr, 0
	}
	if !strings.HasSuffix(trimmed, "</map>") {
		trimmed += "\n</map>"
		fixes++
	}
	return trimmed, fixes
}

// repairXml runs the full three-pass repair pipeline on LLM-generated XML.
// Returns the repaired XML, total number of fixes applied, and a log of what was fixed.
func repairXml(xmlStr string) (string, int, []string) {
	totalFixes := 0
	var repairs []string

	// Pass 1: Sanitize attribute values
	result, n := sanitizeXmlAttributes(xmlStr)
	if n > 0 {
		totalFixes += n
		repairs = append(repairs, fmt.Sprintf("escaped %d unescaped character(s) in attribute values", n))
	}

	// Pass 2: Ensure </map> envelope exists before balancing
	result, n = ensureMapEnvelope(result)
	if n > 0 {
		totalFixes += n
		repairs = append(repairs, "appended missing </map> closing tag")
	}

	// Pass 3: Balance open/close tags
	result, n = balanceXmlTags(result)
	if n > 0 {
		totalFixes += n
		repairs = append(repairs, fmt.Sprintf("fixed %d mismatched/missing tag(s)", n))
	}

	return strings.TrimSpace(result), totalFixes, repairs
}

// repairUnclosedNodes is kept as an alias for backward compatibility within the codebase.
// It delegates to the full repairXml pipeline.
func repairUnclosedNodes(xmlStr string) (string, bool) {
	repaired, fixes, _ := repairXml(xmlStr)
	return repaired, fixes > 0
}

// ── XML response extraction ───────────────────────────────────────────────────

var (
	fenceRe = regexp.MustCompile("(?s)^```(?:xml)?\\s*([\\s\\S]*?)\\s*```$")
	mapRe   = regexp.MustCompile("(?s)(<map[\\s\\S]*</map>)")
)

// extractXMLFromResponse strips markdown fences and extracts the raw XML.
// Mirrors extractXmlFromResponse() in the TypeScript mm-generator.
func extractXMLFromResponse(text string) string {
	text = strings.TrimSpace(text)
	if m := fenceRe.FindStringSubmatch(text); m != nil {
		return strings.TrimSpace(m[1])
	}
	if m := mapRe.FindStringSubmatch(text); m != nil {
		return strings.TrimSpace(m[1])
	}
	return text
}

// ── Validation errors for retry ───────────────────────────────────────────────

// validateMmOutput returns validation error strings (empty slice = valid).
// Mirrors src/lib/schemas/mm-generator-output.ts: validateMmOutput().
func validateMmOutput(xmlString string) []string {
	_, err := parseMmXml(xmlString)
	if err != nil {
		return []string{err.Error()}
	}
	return nil
}

// ── String helpers ────────────────────────────────────────────────────────────

func safePrefix(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func safeSuffix(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return "..." + s[len(s)-n:]
}
