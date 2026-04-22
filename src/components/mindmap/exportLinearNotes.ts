import type { MindmapTreeOutput, MindmapNode } from '@/lib/schemas/mindmap-tree-output';
import { BRANCH_PALETTE } from './color-utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Recursive HTML section builder ───────────────────────────────────────────

function renderNode(
  node: MindmapNode,
  depth: number,
  branchColor: string,
  sectionId: string,
): string {
  const hasChildren = node.children && node.children.length > 0;
  const isLeaf = !hasChildren;

  if (depth === 1) {
    // Top-level branch → full card section
    const id = slugify(node.label);
    const accentRgb = hexToRgbStr(branchColor);
    let html = `
      <section class="branch" id="${id}" style="--branch-color:${branchColor};--branch-rgb:${accentRgb};">
        <div class="branch-header">
          <div class="branch-accent-bar"></div>
          <h2 class="branch-title">${escape(node.label)}</h2>
        </div>`;
    if (node.content) {
      html += `<p class="branch-content">${escape(node.content)}</p>`;
    }
    if (node.study_cue) {
      html += renderStudyCue(node.study_cue);
    }
    if (hasChildren) {
      html += `<div class="branch-children">`;
      for (const child of node.children!) {
        html += renderNode(child, depth + 1, branchColor, id);
      }
      html += `</div>`;
    }
    html += `</section>`;
    return html;
  }

  if (isLeaf) {
    // Leaf bullet
    let html = `<div class="leaf-item">
      <span class="leaf-dot" style="background:${branchColor}"></span>
      <span class="leaf-label">${escape(node.label)}</span>`;
    if (node.study_cue) {
      html += `<span class="leaf-cue">${escape(node.study_cue)}</span>`;
    }
    html += `</div>`;
    return html;
  }

  // Interior node (depth 2, 3, …)
  const tag = depth === 2 ? 'h3' : depth === 3 ? 'h4' : 'h5';
  let html = `<div class="interior depth-${depth}">
    <${tag} class="interior-heading">${escape(node.label)}</${tag}>`;
  if (node.content) {
    html += `<p class="interior-content">${escape(node.content)}</p>`;
  }
  if (node.study_cue) {
    html += renderStudyCue(node.study_cue);
  }
  if (hasChildren) {
    const allLeaves = node.children!.every(c => !c.children || c.children.length === 0);
    if (allLeaves) {
      html += `<div class="leaf-list">`;
      for (const child of node.children!) {
        html += renderNode(child, depth + 1, branchColor, sectionId);
      }
      html += `</div>`;
    } else {
      html += `<div class="interior-children">`;
      for (const child of node.children!) {
        html += renderNode(child, depth + 1, branchColor, sectionId);
      }
      html += `</div>`;
    }
  }
  html += `</div>`;
  return html;
}

function renderStudyCue(cue: string): string {
  return `
    <div class="study-cue">
      <span class="study-cue-icon">◈</span>
      <span class="study-cue-text">${escape(cue)}</span>
    </div>`;
}

function hexToRgbStr(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '128,128,128';
  return `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`;
}

// ── Table of contents ─────────────────────────────────────────────────────────

function renderToc(tree: MindmapTreeOutput): string {
  const items = tree.children.map((branch, i) => {
    const color = BRANCH_PALETTE[i % BRANCH_PALETTE.length];
    const id = slugify(branch.label);
    const childCount = branch.children?.length ?? 0;
    return `
      <li class="toc-item">
        <a href="#${id}" class="toc-link" style="--branch-color:${color}">
          <span class="toc-dot" style="background:${color}"></span>
          <span class="toc-label">${escape(branch.label)}</span>
          ${childCount > 0 ? `<span class="toc-count">${childCount} topics</span>` : ''}
        </a>
      </li>`;
  });
  return `<nav class="toc"><ol class="toc-list">${items.join('')}</ol></nav>`;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:        #1a1714;
    --surface:   #201d1a;
    --surface2:  #272320;
    --border:    rgba(255,255,255,0.07);
    --text:      #e4ddd4;
    --text-muted:#9a9188;
    --text-dim:  #6b635b;
    --radius:    10px;
  }

  html { scroll-behavior: smooth; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 15px;
    line-height: 1.75;
    -webkit-font-smoothing: antialiased;
    padding: 0;
  }

  /* ── Page header ─────────────────────────────────────────────── */
  .page-header {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 56px 48px 48px;
    max-width: 860px;
    margin: 0 auto;
  }

  .subject-badge {
    display: inline-block;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-dim);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 8px;
    margin-bottom: 20px;
  }

  .doc-title {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: clamp(28px, 5vw, 44px);
    font-weight: 700;
    line-height: 1.2;
    color: var(--text);
    letter-spacing: -0.02em;
    margin-bottom: 14px;
  }

  .doc-meta {
    font-size: 12px;
    color: var(--text-dim);
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.04em;
  }

  /* ── Table of contents ───────────────────────────────────────── */
  .toc {
    background: var(--surface2);
    border-bottom: 1px solid var(--border);
    padding: 32px 48px;
    max-width: 860px;
    margin: 0 auto;
  }

  .toc-heading {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    font-weight: 500;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin-bottom: 16px;
  }

  .toc-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .toc-link {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 6px;
    text-decoration: none;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 500;
    transition: background 0.12s, color 0.12s;
  }

  .toc-link:hover {
    background: rgba(var(--branch-rgb, 128,128,128), 0.08);
    color: var(--text);
  }

  .toc-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .toc-label { flex: 1; }

  .toc-count {
    font-size: 10px;
    font-family: 'JetBrains Mono', monospace;
    color: var(--text-dim);
    letter-spacing: 0.04em;
  }

  /* ── Content wrapper ────────────────────────────────────────── */
  .content {
    max-width: 860px;
    margin: 0 auto;
    padding: 0 48px 80px;
  }

  /* ── Top-level branch sections ──────────────────────────────── */
  .branch {
    padding: 48px 0 32px;
    border-bottom: 1px solid var(--border);
  }

  .branch:last-child { border-bottom: none; }

  .branch-header {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 16px;
  }

  .branch-accent-bar {
    width: 3px;
    min-height: 36px;
    border-radius: 2px;
    background: var(--branch-color);
    flex-shrink: 0;
    margin-top: 4px;
    opacity: 0.85;
  }

  .branch-title {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 26px;
    font-weight: 600;
    color: var(--text);
    line-height: 1.3;
    letter-spacing: -0.01em;
  }

  .branch-content {
    font-size: 14.5px;
    color: var(--text-muted);
    line-height: 1.8;
    margin-left: 19px;
    margin-bottom: 20px;
    max-width: 640px;
  }

  .branch-children {
    margin-left: 19px;
    margin-top: 24px;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  /* ── Interior nodes ─────────────────────────────────────────── */
  .interior {
    padding: 20px 0 8px;
    border-top: 1px solid var(--border);
  }

  .interior:first-child { border-top: none; }

  .interior-heading {
    font-family: 'Inter', system-ui, sans-serif;
    font-weight: 600;
    color: var(--text);
    letter-spacing: -0.01em;
    margin-bottom: 6px;
  }

  .depth-2 .interior-heading { font-size: 16px; }
  .depth-3 .interior-heading { font-size: 14px; }
  .depth-4 .interior-heading, .depth-5 .interior-heading { font-size: 13px; font-weight: 500; }

  .interior-content {
    font-size: 13.5px;
    color: var(--text-muted);
    line-height: 1.75;
    margin-bottom: 10px;
    max-width: 620px;
  }

  .interior-children {
    margin-left: 16px;
    margin-top: 8px;
    border-left: 1px solid var(--border);
    padding-left: 18px;
    display: flex;
    flex-direction: column;
  }

  /* ── Leaf items ─────────────────────────────────────────────── */
  .leaf-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 8px;
  }

  .leaf-item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 3px 0;
  }

  .leaf-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
    opacity: 0.7;
    margin-top: 2px;
  }

  .leaf-label {
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.6;
  }

  .leaf-cue {
    font-size: 11px;
    color: var(--text-dim);
    font-style: italic;
    margin-left: 4px;
  }

  /* ── Study cue callout ──────────────────────────────────────── */
  .study-cue {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: rgba(var(--branch-rgb, 128,128,128), 0.06);
    border: 1px solid rgba(var(--branch-rgb, 128,128,128), 0.15);
    border-radius: 7px;
    padding: 10px 14px;
    margin-top: 10px;
    margin-bottom: 6px;
    max-width: 600px;
  }

  .study-cue-icon {
    color: var(--branch-color, var(--text-dim));
    font-size: 12px;
    flex-shrink: 0;
    opacity: 0.8;
    line-height: 1.7;
  }

  .study-cue-text {
    font-size: 12.5px;
    color: var(--text-muted);
    font-style: italic;
    line-height: 1.65;
  }

  /* ── Footer ──────────────────────────────────────────────────── */
  .page-footer {
    max-width: 860px;
    margin: 0 auto;
    padding: 24px 48px 40px;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .footer-logo {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.08em;
    color: var(--text-dim);
    text-decoration: none;
  }

  .footer-note {
    font-size: 11px;
    color: var(--text-dim);
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.03em;
  }

  /* ── Print styles ────────────────────────────────────────────── */
  @media print {
    body { background: #fff; color: #1a1714; }
    .page-header { background: #fff; border-bottom: 1px solid #e0dbd5; }
    .toc { background: #f7f4f1; border-bottom: 1px solid #e0dbd5; }
    .content { color: #1a1714; }
    .doc-title, .branch-title, .interior-heading { color: #1a1714; }
    .branch-content, .interior-content, .leaf-label, .toc-link { color: #4a4540; }
    .study-cue { background: #f5f0eb; border-color: #d5ccc4; }
    .study-cue-text, .leaf-cue, .footer-note { color: #6b635b; }
    .page-footer { border-top: 1px solid #e0dbd5; }
  }
`;

// ── PDF-specific light theme CSS ──────────────────────────────────────────────
// Used only for PDF rendering — warm paper tones, easier on printers.
// The SVG background encodes a tiled diagonal "TASUR" watermark without any
// extra DOM nodes, so html2canvas captures it automatically.

const WATERMARK_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><text x='130' y='130' font-family='monospace' font-size='22' font-weight='900' letter-spacing='6' fill='rgba(0,0,0,0.045)' text-anchor='middle' dominant-baseline='middle' transform='rotate(-45 130 130)'>TASUR</text></svg>`;
const WATERMARK_URL = `url("data:image/svg+xml,${encodeURIComponent(WATERMARK_SVG)}")`;

const CSS_PDF = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Instrument+Serif&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:        #faf8f4;
    --surface:   #f2ede6;
    --surface2:  #ece6dd;
    --border:    rgba(0,0,0,0.09);
    --text:      #1c1917;
    --text-muted:#5a4f48;
    --text-dim:  #9a8f88;
    --radius:    10px;
  }

  html { scroll-behavior: smooth; }

  body {
    background: var(--bg);
    background-image: ${WATERMARK_URL};
    background-repeat: repeat;
    color: var(--text);
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 15px;
    line-height: 1.75;
    -webkit-font-smoothing: antialiased;
    padding: 0;
    width: 820px;
  }

  .page-header {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 56px 48px 48px;
  }

  .subject-badge {
    display: inline-block;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-dim);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 8px;
    margin-bottom: 20px;
  }

  .doc-title {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 40px;
    font-weight: 700;
    line-height: 1.2;
    color: var(--text);
    letter-spacing: -0.02em;
    margin-bottom: 14px;
  }

  .doc-meta {
    font-size: 12px;
    color: var(--text-dim);
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.04em;
  }

  .toc {
    background: var(--surface2);
    border-bottom: 1px solid var(--border);
    padding: 32px 48px;
  }

  .toc-heading {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    font-weight: 500;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin-bottom: 16px;
  }

  .toc-list { list-style: none; display: flex; flex-direction: column; gap: 4px; }

  .toc-link {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 6px;
    text-decoration: none;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 500;
  }

  .toc-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .toc-label { flex: 1; }

  .toc-count {
    font-size: 10px;
    font-family: 'JetBrains Mono', monospace;
    color: var(--text-dim);
    letter-spacing: 0.04em;
  }

  .content { padding: 0 48px 80px; }

  .branch { padding: 48px 0 32px; border-bottom: 1px solid var(--border); }
  .branch:last-child { border-bottom: none; }

  .branch-header { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 16px; }

  .branch-accent-bar {
    width: 3px;
    min-height: 36px;
    border-radius: 2px;
    background: var(--branch-color);
    flex-shrink: 0;
    margin-top: 4px;
    opacity: 0.85;
  }

  .branch-title {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 26px;
    font-weight: 600;
    color: var(--text);
    line-height: 1.3;
    letter-spacing: -0.01em;
  }

  .branch-content {
    font-size: 14.5px;
    color: var(--text-muted);
    line-height: 1.8;
    margin-left: 19px;
    margin-bottom: 20px;
    max-width: 640px;
  }

  .branch-children { margin-left: 19px; margin-top: 24px; display: flex; flex-direction: column; }

  .interior { padding: 20px 0 8px; border-top: 1px solid var(--border); }
  .interior:first-child { border-top: none; }

  .interior-heading {
    font-family: 'Inter', system-ui, sans-serif;
    font-weight: 600;
    color: var(--text);
    letter-spacing: -0.01em;
    margin-bottom: 6px;
  }

  .depth-2 .interior-heading { font-size: 16px; }
  .depth-3 .interior-heading { font-size: 14px; }
  .depth-4 .interior-heading, .depth-5 .interior-heading { font-size: 13px; font-weight: 500; }

  .interior-content {
    font-size: 13.5px;
    color: var(--text-muted);
    line-height: 1.75;
    margin-bottom: 10px;
    max-width: 620px;
  }

  .interior-children {
    margin-left: 16px;
    margin-top: 8px;
    border-left: 2px solid var(--border);
    padding-left: 18px;
    display: flex;
    flex-direction: column;
  }

  .leaf-list { display: flex; flex-direction: column; gap: 3px; margin-top: 8px; }

  .leaf-item { display: flex; align-items: baseline; gap: 8px; padding: 3px 0; }

  .leaf-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; opacity: 0.7; margin-top: 2px; }

  .leaf-label { font-size: 13px; color: var(--text-muted); line-height: 1.6; }

  .leaf-cue { font-size: 11px; color: var(--text-dim); font-style: italic; margin-left: 4px; }

  .study-cue {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: rgba(var(--branch-rgb, 100,80,60), 0.07);
    border: 1px solid rgba(var(--branch-rgb, 100,80,60), 0.18);
    border-radius: 7px;
    padding: 10px 14px;
    margin-top: 10px;
    margin-bottom: 6px;
    max-width: 600px;
  }

  .study-cue-icon { color: var(--branch-color, var(--text-dim)); font-size: 12px; flex-shrink: 0; opacity: 0.8; line-height: 1.7; }

  .study-cue-text { font-size: 12.5px; color: var(--text-muted); font-style: italic; line-height: 1.65; }

  .page-footer {
    padding: 24px 48px 40px;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .footer-logo {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.08em;
    color: var(--text-dim);
  }

  .footer-note { font-size: 11px; color: var(--text-dim); font-family: 'JetBrains Mono', monospace; letter-spacing: 0.03em; }

  /* ── Brand header ───────────────────────────────────────────── */
  .doc-brand {
    padding: 16px 48px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  /* Use a block flex container so every child (spans + img) is a flex item —
     html2canvas renders block-flex reliably, unlike inline-flex + vertical-align. */
  .doc-brand-wordmark {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0;
    width: fit-content;
  }

  .doc-brand-letter {
    font-family: 'Instrument Serif', Georgia, serif;
    font-size: 22px;
    font-weight: 400;
    color: #1c1917;
    letter-spacing: -0.01em;
    line-height: 22px;
    display: block;
  }

  .doc-brand-logo {
    display: block;
  }
`;

// ── Shared document body builder ──────────────────────────────────────────────

function buildDocumentBody(tree: MindmapTreeOutput, dateStr: string): string {
  const sectionsHtml = tree.children
    .map((branch, i) => {
      const color = BRANCH_PALETTE[i % BRANCH_PALETTE.length];
      return renderNode(branch, 1, color, 'root');
    })
    .join('\n');

  return `
  <div class="page-header">
    <div class="subject-badge">${escape(tree.subject)}</div>
    <h1 class="doc-title">${escape(tree.title)}</h1>
    <div class="doc-meta">Generated ${dateStr} · ${tree.metadata.total_nodes} concepts · ${tree.children.length} sections</div>
  </div>

  <div class="toc">
    <div class="toc-heading">Contents</div>
    ${renderToc(tree)}
  </div>

  <main class="content">
    ${sectionsHtml}
  </main>

  <footer class="page-footer">
    <span class="footer-logo">TASUR</span>
    <span class="footer-note">${escape(tree.title)} · ${escape(tree.subject)}</span>
  </footer>`;
}

// ── HTML export ───────────────────────────────────────────────────────────────

export function exportAsHtml(tree: MindmapTreeOutput): void {
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escape(tree.title)} — Tasur Notes</title>
  <style>${CSS}</style>
</head>
<body>
  ${buildDocumentBody(tree, dateStr)}
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${tree.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-notes.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Keep old name as alias so any other callers don't break.
export const exportLinearNotes = exportAsHtml;

// ── PDF export — per-section canvas packing ───────────────────────────────────
// Each logical chunk (cover + one branch per section + footer) is rendered as
// its own html2canvas snapshot. Chunks are then packed onto A4 pages in jsPDF:
// a chunk either fits on the current page or triggers a new one. This means
// a page boundary NEVER falls inside a section — no slicing, no cutting.
export async function exportAsPdf(tree: MindmapTreeOutput): Promise<void> {
  const [{ jsPDF }, html2canvas] = await Promise.all([
    import('jspdf'),
    import('html2canvas').then(m => m.default),
  ]);

  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const logoUrl = `${window.location.origin}/logo.svg`;
  const logoH = 23;
  const logoW = Math.round(logoH * 0.72);

  // Renders any HTML string at exactly 820px wide, with the light theme CSS
  // and watermark background applied to the wrapper element itself.
  async function renderChunk(innerHtml: string): Promise<HTMLCanvasElement> {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-9999px';
    wrapper.style.top = '0';
    wrapper.style.width = '820px';
    wrapper.style.backgroundColor = '#faf8f4';
    wrapper.style.backgroundImage = WATERMARK_URL;
    wrapper.style.backgroundRepeat = 'repeat';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.zIndex = '-1';
    wrapper.innerHTML = `<style>${CSS_PDF}</style>${innerHtml}`;
    document.body.appendChild(wrapper);
    await document.fonts.ready;
    // Two rAF ticks so fonts + images settle before capture
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    try {
      return await html2canvas(wrapper, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#faf8f4',
        width: 820,
        windowWidth: 820,
        logging: false,
      });
    } finally {
      document.body.removeChild(wrapper);
    }
  }

  // ── Build HTML chunks ────────────────────────────────────────────────────────

  // Chunk 1: brand header + document title + table of contents
  const coverChunk = `
    <header class="doc-brand">
      <span style="display:inline-flex;align-items:center;font-family:'Instrument Serif',Georgia,serif;font-size:22px;font-weight:400;color:#1c1917;letter-spacing:-0.01em;line-height:1;gap:1px;">
        Tas<img src="${escape(logoUrl)}" width="${logoW}" height="${logoH}" alt="" crossorigin="anonymous" style="display:inline-block;vertical-align:middle;position:relative;top:-1px;"><span style="font-family:inherit;font-size:inherit;color:inherit;">r</span>
      </span>
    </header>
    <div class="page-header">
      <div class="subject-badge">${escape(tree.subject)}</div>
      <h1 class="doc-title">${escape(tree.title)}</h1>
      <div class="doc-meta">Generated ${dateStr} · ${tree.metadata.total_nodes} concepts · ${tree.children.length} sections</div>
    </div>
    <div class="toc">
      <div class="toc-heading">Contents</div>
      ${renderToc(tree)}
    </div>`;

  // Chunks 2…N: one per top-level branch (each rendered as an isolated atomic unit)
  const sectionChunks = tree.children.map((branch, i) => {
    const color = BRANCH_PALETTE[i % BRANCH_PALETTE.length];
    return `<div class="content" style="padding-bottom:0;">${renderNode(branch, 1, color, 'root')}</div>`;
  });

  // Final chunk: footer
  const footerChunk = `
    <footer class="page-footer">
      <span class="footer-logo">TASUR</span>
      <span class="footer-note">${escape(tree.title)} · ${escape(tree.subject)}</span>
    </footer>`;

  // ── Render all chunks sequentially ───────────────────────────────────────────
  const chunks = [coverChunk, ...sectionChunks, footerChunk];
  const canvases: HTMLCanvasElement[] = [];
  for (const chunk of chunks) {
    canvases.push(await renderChunk(chunk));
  }

  // ── Pack canvases onto A4 pages ───────────────────────────────────────────────
  const A4_W_MM = 210;
  const A4_H_MM = 297;
  const CANVAS_W = 820 * 2;                              // scale=2
  const PAGE_H_PX = (A4_H_MM / A4_W_MM) * CANVAS_W;    // A4 height in canvas pixels

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let pageYPx = 0;   // cursor: how many canvas-px have been placed on the current page

  for (const canvas of canvases) {
    const chunkHPx = canvas.height;
    const chunkHMm = (chunkHPx / CANVAS_W) * A4_W_MM;

    // If this chunk doesn't fit on the remaining page space, start a fresh page
    if (pageYPx > 0 && pageYPx + chunkHPx > PAGE_H_PX) {
      // White-fill the leftover space so no ghost bleed from the previous chunk
      const usedMm = (pageYPx / CANVAS_W) * A4_W_MM;
      pdf.setFillColor(250, 248, 244);
      pdf.rect(0, usedMm, A4_W_MM, A4_H_MM - usedMm, 'F');
      pdf.addPage();
      pageYPx = 0;
    }

    const yMm = (pageYPx / CANVAS_W) * A4_W_MM;
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, yMm, A4_W_MM, chunkHMm);
    pageYPx += chunkHPx;

    // If a single chunk is taller than a full page (very long section),
    // it overflows onto the next page naturally — start fresh for the next chunk.
    if (pageYPx >= PAGE_H_PX) {
      pdf.addPage();
      pageYPx = 0;
    }
  }

  const slug = tree.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  pdf.save(`${slug}-notes.pdf`);
}
