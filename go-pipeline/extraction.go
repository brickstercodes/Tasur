package main

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/xml"
	"fmt"
	"io"
	"strings"
	"unicode/utf8"
)

// ── Text extraction ───────────────────────────────────────────────────────────

// ExtractionResult is returned by extractText for all file types.
type ExtractionResult struct {
	RawText    string
	NeedsVision bool // true for images and non-text-extractable PDFs
}

// extractText extracts text from the file bytes based on file type.
// For PDFs, it uses a pure-Go heuristic extraction. For images, it signals
// that the caller should use Gemini vision instead of text.
func extractText(data []byte, fileType FileType) (ExtractionResult, error) {
	switch fileType {
	case FileTypeTXT:
		text := string(data)
		if !utf8.ValidString(text) {
			// Try to coerce to valid UTF-8 by replacement
			text = strings.ToValidUTF8(text, "")
		}
		return ExtractionResult{RawText: strings.TrimSpace(text)}, nil

	case FileTypeDOCX:
		text, err := extractDocxText(data)
		if err != nil {
			return ExtractionResult{}, fmt.Errorf("DOCX extraction: %w", err)
		}
		return ExtractionResult{RawText: text}, nil

	case FileTypePDF:
		// Always use Gemini's native PDF vision rather than the heuristic text
		// extractor. The heuristic frequently returns garbled bytes (> 100 chars
		// but meaningless) for slide-based or encoded PDFs, which then gets sent
		// as "source material" and causes the model to hallucinate. Gemini 2.5 Pro
		// reads PDFs natively and is far more reliable.
		return ExtractionResult{RawText: "", NeedsVision: true}, nil

	case FileTypePNG, FileTypeJPG:
		// Images have no extractable text — always use Gemini vision.
		return ExtractionResult{RawText: "", NeedsVision: true}, nil

	default:
		return ExtractionResult{RawText: ""}, nil
	}
}

// ── Vision-based text extraction ─────────────────────────────────────────────

// extractTextViaVision calls Gemini (Flash) to extract readable text from a PDF
// or image file. This replaces the broken heuristic PDF text extractor with a
// reliable multimodal approach. The extracted text is stored as raw_text in the
// documents table for use by the chat tutor.
func extractTextViaVision(ctx context.Context, vc *vertexClient, fileBytes []byte, fileType FileType) (string, error) {
	if len(fileBytes) == 0 {
		return "", nil
	}

	mimeType := mimeTypeForFileType(fileType)
	model := specialistModelID() // use Flash for cost efficiency

	req := vertexRequest{
		Contents: []vertexContent{
			{
				Role: "user",
				Parts: []vertexPart{
					{Text: "Extract ALL text content from this document exactly as it appears. " +
						"Preserve the original structure: headings, paragraphs, bullet points, numbered lists, and table layouts. " +
						"Do NOT summarize, paraphrase, or add any commentary. " +
						"Output ONLY the extracted text, nothing else."},
					{InlineData: &vertexInlineData{
						MIMEType: mimeType,
						Data:     base64.StdEncoding.EncodeToString(fileBytes),
					}},
				},
			},
		},
		GenerationConfig: vertexGenerationConfig{
			Temperature: 0.0,
		},
	}

	text, _, _, err := vc.generateContent(ctx, model, req)
	if err != nil {
		return "", fmt.Errorf("vision text extraction: %w", err)
	}

	return strings.TrimSpace(text), nil
}

// ── DOCX text extraction ──────────────────────────────────────────────────────

// docxWordBody represents the XML structure inside word/document.xml.
type docxBody struct {
	XMLName xml.Name       `xml:"body"`
	Paras   []docxParagraph `xml:"p"`
}

type docxParagraph struct {
	Runs []docxRun `xml:"r"`
}

type docxRun struct {
	Text []docxText `xml:"t"`
}

type docxText struct {
	Text string `xml:",chardata"`
}

// extractDocxText unzips the DOCX and extracts plain text from word/document.xml.
func extractDocxText(data []byte) (string, error) {
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", fmt.Errorf("open docx zip: %w", err)
	}

	for _, f := range r.File {
		if f.Name != "word/document.xml" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return "", fmt.Errorf("open document.xml: %w", err)
		}
		defer rc.Close()

		xmlBytes, err := io.ReadAll(rc)
		if err != nil {
			return "", fmt.Errorf("read document.xml: %w", err)
		}

		return parseDocxXML(xmlBytes)
	}

	return "", fmt.Errorf("word/document.xml not found in DOCX archive")
}

// parseDocxXML extracts text from the raw word/document.xml bytes.
// We parse the XML manually to capture all <w:t> text elements regardless of namespace.
func parseDocxXML(data []byte) (string, error) {
	// Strip namespace prefixes so stdlib xml can parse without namespace registration.
	// Replace "w:t", "w:p", "w:r" etc. with plain names.
	xmlStr := string(data)
	// Remove namespace declarations to simplify parsing.
	xmlStr = stripXMLNamespaces(xmlStr)

	dec := xml.NewDecoder(strings.NewReader(xmlStr))
	var sb strings.Builder
	inText := false
	prevWasPara := false

	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			// On parse error, return whatever we have
			break
		}
		switch t := tok.(type) {
		case xml.StartElement:
			localName := t.Name.Local
			if localName == "p" {
				if prevWasPara {
					sb.WriteString("\n")
				}
				prevWasPara = true
			}
			if localName == "t" {
				inText = true
			}
		case xml.EndElement:
			if t.Name.Local == "t" {
				inText = false
			}
		case xml.CharData:
			if inText {
				sb.Write(t)
			}
		}
	}

	return strings.TrimSpace(sb.String()), nil
}

// stripXMLNamespaces removes namespace prefixes from element names so stdlib
// xml can parse DOCX files without namespace resolution.
func stripXMLNamespaces(xmlStr string) string {
	// Remove xmlns declarations
	var result strings.Builder
	i := 0
	for i < len(xmlStr) {
		if xmlStr[i] == '<' && i+1 < len(xmlStr) && xmlStr[i+1] != '/' && xmlStr[i+1] != '?' && xmlStr[i+1] != '!' {
			// Opening tag — find the end
			end := strings.IndexByte(xmlStr[i:], '>')
			if end < 0 {
				result.WriteString(xmlStr[i:])
				break
			}
			tag := xmlStr[i : i+end+1]
			// Strip namespace prefix from tag name (e.g. "w:t" → "t")
			tag = stripNSFromTag(tag)
			result.WriteString(tag)
			i += end + 1
		} else if xmlStr[i] == '<' && i+1 < len(xmlStr) && xmlStr[i+1] == '/' {
			// Closing tag
			end := strings.IndexByte(xmlStr[i:], '>')
			if end < 0 {
				result.WriteString(xmlStr[i:])
				break
			}
			tag := xmlStr[i : i+end+1]
			tag = stripNSFromTag(tag)
			result.WriteString(tag)
			i += end + 1
		} else {
			result.WriteByte(xmlStr[i])
			i++
		}
	}
	return result.String()
}

func stripNSFromTag(tag string) string {
	// Remove namespace prefixes from tag name: "<w:t " → "<t "
	// and from attribute names
	if len(tag) < 2 {
		return tag
	}
	// Find the tag name start (after '<' or '</')
	start := 1
	if tag[1] == '/' {
		start = 2
	}
	// Find colon in the tag name
	nameEnd := strings.IndexAny(tag[start:], " \t\n\r>")
	if nameEnd < 0 {
		nameEnd = len(tag) - start
	}
	name := tag[start : start+nameEnd]
	if idx := strings.IndexByte(name, ':'); idx >= 0 {
		newName := name[idx+1:]
		prefix := tag[:start]
		suffix := tag[start+nameEnd:]
		return prefix + newName + suffix
	}
	return tag
}

// ── PDF text extraction (heuristic) ──────────────────────────────────────────

// extractPDFTextHeuristic extracts text from PDF bytes using a simple stream
// parser. Not 100% reliable but handles most text-based PDFs without CGo deps.
// For image-only PDFs this returns an empty string and the caller uses vision.
func extractPDFTextHeuristic(data []byte) string {
	content := string(data)
	var sb strings.Builder

	// Look for BT...ET text blocks in PDF content streams
	i := 0
	for i < len(content) {
		btIdx := strings.Index(content[i:], "BT")
		if btIdx < 0 {
			break
		}
		start := i + btIdx
		etIdx := strings.Index(content[start:], "ET")
		if etIdx < 0 {
			break
		}
		block := content[start : start+etIdx+2]
		i = start + etIdx + 2

		// Extract text from Tj and TJ operators within this block
		sb.WriteString(extractTextFromPDFBlock(block))
	}

	// Also look for simple string literals in parentheses (alternative PDF text encoding)
	result := sb.String()
	if len(strings.TrimSpace(result)) < 50 {
		// Fallback: scan for all parenthesised strings
		result = extractPDFParenStrings(content)
	}

	// Clean up: collapse whitespace, remove non-printable chars
	return cleanPDFText(result)
}

func extractTextFromPDFBlock(block string) string {
	var sb strings.Builder
	i := 0
	for i < len(block) {
		if block[i] == '(' {
			// Find matching close paren (handling escapes)
			j := i + 1
			for j < len(block) {
				if block[j] == '\\' {
					j += 2
					continue
				}
				if block[j] == ')' {
					break
				}
				j++
			}
			if j < len(block) {
				text := block[i+1 : j]
				text = unescapePDFString(text)
				sb.WriteString(text)
				sb.WriteString(" ")
				i = j + 1
				continue
			}
		}
		i++
	}
	return sb.String()
}

func extractPDFParenStrings(content string) string {
	var sb strings.Builder
	i := 0
	count := 0
	for i < len(content) && count < 2000 {
		if content[i] == '(' {
			j := i + 1
			depth := 1
			for j < len(content) && depth > 0 {
				if content[j] == '\\' {
					j += 2
					continue
				}
				if content[j] == '(' {
					depth++
				} else if content[j] == ')' {
					depth--
				}
				j++
			}
			if depth == 0 && j-i > 2 {
				text := content[i+1 : j-1]
				cleaned := unescapePDFString(text)
				if isPrintableText(cleaned) {
					sb.WriteString(cleaned)
					sb.WriteString(" ")
					count++
				}
			}
			i = j
			continue
		}
		i++
	}
	return sb.String()
}

func unescapePDFString(s string) string {
	s = strings.ReplaceAll(s, "\\n", "\n")
	s = strings.ReplaceAll(s, "\\r", "\r")
	s = strings.ReplaceAll(s, "\\t", "\t")
	s = strings.ReplaceAll(s, "\\(", "(")
	s = strings.ReplaceAll(s, "\\)", ")")
	s = strings.ReplaceAll(s, "\\\\", "\\")
	return s
}

func isPrintableText(s string) bool {
	if len(s) < 2 {
		return false
	}
	printable := 0
	for _, r := range s {
		if r >= 32 && r < 127 {
			printable++
		}
	}
	return printable*2 >= len(s) // at least 50% printable ASCII
}

func cleanPDFText(s string) string {
	// Replace runs of whitespace with single spaces, remove null bytes
	s = strings.ReplaceAll(s, "\x00", "")
	var sb strings.Builder
	prevSpace := false
	for _, r := range s {
		if r == '\n' || r == '\r' || r == '\t' || r == ' ' {
			if !prevSpace {
				sb.WriteRune(' ')
			}
			prevSpace = true
		} else if r >= 32 {
			sb.WriteRune(r)
			prevSpace = false
		}
	}
	return strings.TrimSpace(sb.String())
}
