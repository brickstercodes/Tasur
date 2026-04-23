package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// conversionTimeout caps how long a single LibreOffice run can take.
// Real-world decks convert in 2–8s; 60s gives headroom for cold font caches.
const conversionTimeout = 60 * time.Second

// convertPptxToPdf runs LibreOffice headless to convert PowerPoint bytes into a PDF.
//
// Each call uses its own temp directory and its own LibreOffice user profile via
// -env:UserInstallation — required because `soffice` holds a global profile lock
// that would otherwise serialize (and occasionally deadlock) concurrent calls.
func convertPptxToPdf(ctx context.Context, data []byte) ([]byte, error) {
	if len(data) == 0 {
		return nil, errors.New("empty presentation")
	}

	workDir, err := os.MkdirTemp("", "pptx-convert-*")
	if err != nil {
		return nil, fmt.Errorf("create temp dir: %w", err)
	}
	defer os.RemoveAll(workDir)

	inputPath := filepath.Join(workDir, "input.pptx")
	if err := os.WriteFile(inputPath, data, 0o600); err != nil {
		return nil, fmt.Errorf("write input file: %w", err)
	}

	userProfile := filepath.Join(workDir, "lo-profile")

	runCtx, cancel := context.WithTimeout(ctx, conversionTimeout)
	defer cancel()

	cmd := exec.CommandContext(runCtx,
		"soffice",
		"--headless",
		"--norestore",
		"--nolockcheck",
		"-env:UserInstallation=file://"+userProfile,
		"--convert-to", "pdf",
		"--outdir", workDir,
		inputPath,
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		if errors.Is(runCtx.Err(), context.DeadlineExceeded) {
			return nil, errors.New("presentation conversion timed out — try a smaller file")
		}
		return nil, mapSofficeError(err, stderr.String())
	}

	pdfPath := filepath.Join(workDir, "input.pdf")
	pdfBytes, err := os.ReadFile(pdfPath)
	if err != nil {
		// soffice returned 0 but no PDF appeared — usually a silent format error.
		return nil, fmt.Errorf("converted PDF not produced: %w", err)
	}
	if len(pdfBytes) == 0 {
		return nil, errors.New("converted PDF was empty")
	}

	return pdfBytes, nil
}

// mapSofficeError turns LibreOffice exit errors and stderr noise into a
// user-facing message that matches the style of other pipeline errors.
func mapSofficeError(runErr error, stderr string) error {
	lower := strings.ToLower(stderr)

	switch {
	case strings.Contains(lower, "encrypted"), strings.Contains(lower, "password"):
		return errors.New("presentation is password-protected — please remove the password and try again")
	case strings.Contains(lower, "source file could not be loaded"),
		strings.Contains(lower, "no such file"),
		strings.Contains(lower, "not a valid"):
		return errors.New("this file is corrupted or not a valid PowerPoint file")
	}

	firstLine := strings.TrimSpace(strings.SplitN(stderr, "\n", 2)[0])
	if firstLine == "" {
		return fmt.Errorf("libreoffice conversion failed: %w", runErr)
	}
	return fmt.Errorf("libreoffice conversion failed: %s", firstLine)
}
