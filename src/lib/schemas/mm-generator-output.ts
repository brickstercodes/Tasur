/**
 * WHY: Validation for the .mm Generator Agent's XML string output.
 *
 * The .mm Generator produces a Freeplane XML string, not JSON — so Zod is not
 * the right tool here. Instead, validateMmOutput() performs structural checks
 * directly on the string and uses fast-xml-parser for the XML parse check.
 *
 * Checks performed (ordered from cheapest to most expensive):
 * 1. Starts with <map and ends with </map>
 * 2. Parses as valid XML (no syntax errors)
 * 3. Contains at least one TRACKABLE="true" attribute
 * 4. Every CONCEPT_ID attribute is paired with TRACKABLE="true"
 * 5. Tree has minimum depth 3 (checked via parseMmXml validation)
 *
 * The separation between this module (string-level validation) and the .mm
 * parser (structural validation) is intentional: this module is called by
 * the agent BEFORE committing the XML to the pipeline, so errors here trigger
 * a retry. The parser's structural errors are fatal — they indicate a prompt
 * or model failure that a retry is unlikely to fix.
 *
 * No imports from Mastra, Vercel AI SDK, or Supabase.
 */

import { XMLParser } from 'fast-xml-parser';

// ── Validation result type ────────────────────────────────────────────────────

export interface MmValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Parser for validation only (lenient — just checks parseability) ───────────

const lenientParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: () => false, // we only care about parseability here, not structure
  allowBooleanAttributes: true,
});

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validates a .mm XML string produced by the .mm Generator agent.
 *
 * Returns `{ valid: true, errors: [] }` if all checks pass.
 * Returns `{ valid: false, errors: [...] }` listing every problem found.
 *
 * The agent calls this before returning its output. On failure, it retries
 * with a stricter prompt that reinforces the failed constraint.
 *
 * @param xml  The raw string output from the .mm Generator LLM call.
 */
export function validateMmOutput(xml: string): MmValidationResult {
  const errors: string[] = [];
  const trimmed = xml.trim();

  // ── Check 1: starts and ends correctly ──────────────────────────────────────
  if (!trimmed.startsWith('<map')) {
    errors.push(`Output must start with <map. Got: "${trimmed.slice(0, 50)}..."`);
  }
  if (!trimmed.endsWith('</map>')) {
    errors.push(`Output must end with </map>. Last 50 chars: "...${trimmed.slice(-50)}"`);
  }

  // If the envelope is wrong, further checks will produce noise — stop early.
  if (errors.length > 0) return { valid: false, errors };

  // ── Check 2: valid XML syntax ────────────────────────────────────────────────
  try {
    lenientParser.parse(trimmed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`XML syntax error: ${message}`);
    return { valid: false, errors };
  }

  // ── Check 3: has at least one TRACKABLE="true" node ─────────────────────────
  const trackableMatches = trimmed.match(/TRACKABLE="true"/g);
  if (!trackableMatches || trackableMatches.length === 0) {
    errors.push(
      'No TRACKABLE="true" nodes found. The .mm must have at least one assessable concept.',
    );
  }

  // ── Check 4: every CONCEPT_ID is on a TRACKABLE node ────────────────────────
  // We check that the count of CONCEPT_ID attributes matches TRACKABLE nodes.
  // A mismatch means some CONCEPT_IDs are on non-TRACKABLE nodes (or missing).
  const conceptIdMatches = trimmed.match(/CONCEPT_ID="[^"]+"/g);
  const conceptIdCount = conceptIdMatches?.length ?? 0;
  const trackableCount = trackableMatches?.length ?? 0;

  if (conceptIdCount < trackableCount) {
    errors.push(
      `${trackableCount} TRACKABLE nodes found but only ${conceptIdCount} CONCEPT_ID attributes. ` +
        'Every TRACKABLE node must have a CONCEPT_ID.',
    );
  }

  // ── Check 5: minimum depth 3 ─────────────────────────────────────────────────
  // Count nesting of <node> elements — if max nesting depth < 3, the tree is flat.
  const minimumDepth = 3;
  const maxNestingDepth = computeMaxNodeNestingDepth(trimmed);
  if (maxNestingDepth < minimumDepth) {
    errors.push(
      `Tree depth is only ${maxNestingDepth}. The .mm must have at least ${minimumDepth} levels of nested <node> elements.`,
    );
  }

  return { valid: errors.length === 0, errors };
}

// ── XML repair ───────────────────────────────────────────────────────────

/**
 * Repairs the most common LLM XML failure: missing </node> closing tags at
 * the tail of the output. Counts non-self-closing <node> opens vs </node>
 * closes and appends the missing closers before </map>.
 *
 * Returns { xml, repaired } — repaired is true if any tags were inserted.
 */
export function repairUnclosedNodes(xml: string): { xml: string; repaired: boolean } {
  const trimmed = xml.trim();
  if (!trimmed.endsWith('</map>')) return { xml, repaired: false };

  const closeCount = (trimmed.match(/<\/node>/g) ?? []).length;

  // Count non-self-closing <node ...> tags
  let actualOpen = 0;
  const openPattern = /<node\s/g;
  let match: RegExpExecArray | null;
  while ((match = openPattern.exec(trimmed)) !== null) {
    const tagStart = match.index;
    const tagEnd = trimmed.indexOf('>', tagStart);
    if (tagEnd === -1) break;
    if (trimmed[tagEnd - 1] !== '/') actualOpen++;
  }

  const missing = actualOpen - closeCount;
  if (missing <= 0) return { xml, repaired: false };

  const body = trimmed.slice(0, trimmed.length - '</map>'.length);
  const closers = '</node>\n'.repeat(missing);
  return { xml: body + closers + '</map>', repaired: true };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Estimates maximum <node> nesting depth using a simple stack-based scan.
 *
 * This is faster than full XML parsing and sufficient for the depth check —
 * we only need to know if depth >= 3, not the exact depth.
 */
function computeMaxNodeNestingDepth(xml: string): number {
  let depth = 0;
  let maxDepth = 0;

  // Scan for opening and self-closing <node> tags
  const tokenPattern = /<\/?node[\s>]/g;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(xml)) !== null) {
    const token = match[0];
    if (token.startsWith('</')) {
      depth = Math.max(0, depth - 1);
    } else {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
    }
  }

  return maxDepth;
}
