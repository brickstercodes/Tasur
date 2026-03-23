/**
 * WHY: Database persistence layer for all artifacts produced by the .mm-first pipeline.
 *
 * After MastraLearningSession/ManualLearningSession completes, this module writes
 * every derived artifact to Supabase:
 *   - concepts + concept_relationships (from .mm Parser)
 *   - mindmaps (MindmapTreeOutput for frontend rendering)
 *   - flashcards (from Flashcard Generator agent)
 *   - understanding_state (initial confidence=0 for each concept)
 *   - student_graphs (serialized StudentGraph for session resume)
 *   - documents (file metadata + raw text + .mm XML)
 *
 * Key design decision: .mm CONCEPT_IDs (e.g. "dbms_normalization_3nf") are remapped
 * to UUIDs before DB storage. This prevents PK collisions when the same document is
 * uploaded in multiple sessions. The MindmapTreeOutput stored in DB uses these UUIDs
 * as node concept_ids so the chat page can look up concepts by DB PK.
 *
 * No imports from Mastra, Vercel AI SDK, or agent layer.
 */

import { createServerClient } from '@/lib/supabase';
import type { DerivedConcept } from '@/lib/mm-parser/types';
import type { MindmapNode, MindmapTreeOutput } from '@/lib/schemas/mindmap-tree-output';
import type { FlashcardOutput } from '@/lib/schemas/flashcard-output';
import type { StudentGraphState } from '@/types/graph';
import type { ConceptEdge } from '@/types/concepts';
import type { LearningMode } from '@/types/sessions';
import type { FileType } from '@/lib/parsing';

// ── Constants ─────────────────────────────────────────────────────────────────

const MASTERY_THRESHOLD = 0.6;

// ── Public types ──────────────────────────────────────────────────────────────

export interface PipelinePersistenceInput {
  sessionId: string;
  userId: string;
  derivedConcepts: DerivedConcept[];
  graphEdges: ConceptEdge[];
  mindmapTree: MindmapTreeOutput;
  flashcardOutput: FlashcardOutput;
  graphState: StudentGraphState;
  mmXml: string;
  rawText: string;
  filename: string;
  fileType: FileType;
  fileBuffer?: Buffer;   // Original file bytes for Supabase Storage upload
  mimeType?: string;     // MIME type for storage
}

export interface SessionListItem {
  id: string;
  title: string;
  domain: string | null;
  mode: string;
  status: string;
  createdAt: string;
  lastActiveAt: string;
  totalConcepts: number;
  masteredConcepts: number;
  averageConfidence: number;
}

// ── Session creation ──────────────────────────────────────────────────────────

/**
 * Creates a new study_sessions row and returns the generated UUID.
 */
export async function createStudySession(
  userId: string,
  title: string,
  domain: string,
  mode: LearningMode,
): Promise<string> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('study_sessions')
    .insert({ user_id: userId, title, subject_domain: domain, learning_mode: mode, status: 'active' })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create session: ${error?.message ?? 'no data returned'}`);
  }

  return data.id;
}

// ── Full pipeline persistence ─────────────────────────────────────────────────

/**
 * Writes all pipeline results to Supabase in dependency order.
 *
 * Concepts are inserted first (FK target). Dependent tables (concept_relationships,
 * flashcards, understanding_state) are inserted in parallel after concepts succeed.
 * Mindmap, student_graph, and document rows are independent of each other and
 * are inserted in a final parallel batch.
 */
export async function persistPipelineResults(input: PipelinePersistenceInput): Promise<void> {
  const supabase = createServerClient();
  const conceptIdMap = buildConceptIdMap(input.derivedConcepts);

  // Upload original file to Supabase Storage (non-fatal if it fails)
  let storagePath: string | undefined;
  if (input.fileBuffer) {
    // Fallback MIME type from extension in case file.type was empty (browser/OS dependent)
    const ext = input.filename.split('.').pop()?.toLowerCase() ?? '';
    const mimeFromExt: Record<string, string> = {
      pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    };
    const effectiveMime = input.mimeType || mimeFromExt[ext] || 'application/octet-stream';
    try {
      const storageClient = supabase.storage.from('tasur-documents');
      // Create bucket if missing (idempotent — ignore "already exists" errors)
      await supabase.storage.createBucket('tasur-documents', { public: false }).catch(() => {});
      const path = `${input.sessionId}/${input.filename}`;
      const { data: uploadData, error: uploadError } = await storageClient.upload(path, input.fileBuffer, {
        contentType: effectiveMime,
        upsert: true,
      });
      if (uploadError) {
        console.error('[storage] upload failed:', uploadError.message);
      } else {
        storagePath = uploadData?.path;
        console.log('[storage] upload succeeded, path:', storagePath);
      }
    } catch (err) {
      console.error('[storage] upload threw:', err);
    }
  }

  // Step 1: Concepts must exist before any FK reference
  await insertConcepts(supabase, input.sessionId, input.derivedConcepts, conceptIdMap);

  // Step 2: FK-dependent tables (parallel — all reference concepts)
  await Promise.all([
    insertConceptRelationships(supabase, input.sessionId, input.graphEdges, conceptIdMap),
    insertFlashcards(supabase, input.sessionId, input.flashcardOutput, conceptIdMap),
    insertUnderstandingState(supabase, input.sessionId, input.userId, input.derivedConcepts, conceptIdMap),
  ]);

  // Step 3: Independent records (parallel)
  const remappedMindmap = remapMindmapConceptIds(input.mindmapTree, conceptIdMap);
  const remappedGraph = remapGraphStateIds(input.graphState, conceptIdMap);

  await Promise.all([
    insertMindmap(supabase, input.sessionId, remappedMindmap),
    insertStudentGraph(supabase, input.sessionId, remappedGraph),
    insertDocument(supabase, input.sessionId, input.filename, input.fileType, input.rawText, input.mmXml, storagePath),
  ]);
}

// ── Session list with progress ────────────────────────────────────────────────

/**
 * Returns all sessions for a user, with per-session progress stats derived
 * from understanding_state confidence scores.
 */
export async function getSessionsForUser(userId: string): Promise<SessionListItem[]> {
  const supabase = createServerClient();

  const { data: sessions, error } = await supabase
    .from('study_sessions')
    .select('id, title, subject_domain, learning_mode, status, created_at, last_active_at')
    .eq('user_id', userId)
    .order('last_active_at', { ascending: false });

  if (error) throw new Error(`Failed to load sessions: ${error.message}`);
  if (!sessions?.length) return [];

  const sessionIds = sessions.map((s) => s.id);
  const { data: understandingRows } = await supabase
    .from('understanding_state')
    .select('session_id, confidence_score')
    .in('session_id', sessionIds);

  const progressBySession = computeProgressBySession(understandingRows ?? []);

  return sessions.map((session) => {
    const progress = progressBySession[session.id] ?? { total: 0, mastered: 0, avgConfidence: 0 };
    return {
      id: session.id,
      title: session.title,
      domain: session.subject_domain,
      mode: session.learning_mode,
      status: session.status,
      createdAt: session.created_at,
      lastActiveAt: session.last_active_at,
      totalConcepts: progress.total,
      masteredConcepts: progress.mastered,
      averageConfidence: progress.avgConfidence,
    };
  });
}

// ── Multi-document merge ──────────────────────────────────────────────────────

/**
 * Appends new concepts from a second document into an existing session.
 *
 * Inserts new concepts/relationships/flashcards/understanding_state rows.
 * Creates a new mindmap version (version N+1) that merges the original
 * tree with the new document's branches.
 * Updates the student_graph snapshot with the new nodes.
 */
export async function appendDocumentToSession(
  sessionId: string,
  userId: string,
  newConcepts: DerivedConcept[],
  newEdges: ConceptEdge[],
  newMindmapBranches: MindmapTreeOutput,
  newFlashcards: FlashcardOutput,
  existingGraphState: StudentGraphState,
  rawText: string,
  filename: string,
  fileType: FileType,
  mmXml: string,
  fileBuffer?: Buffer,
  mimeType?: string,
): Promise<void> {
  const supabase = createServerClient();
  const conceptIdMap = buildConceptIdMap(newConcepts);

  // Upload original file to Supabase Storage (non-fatal if it fails)
  let storagePath: string | undefined;
  if (fileBuffer && mimeType) {
    try {
      const storageClient = supabase.storage.from('tasur-documents');
      // Create bucket if missing (idempotent — ignore "already exists" errors)
      await supabase.storage.createBucket('tasur-documents', { public: false }).catch(() => {});
      const path = `${sessionId}/${filename}`;
      const { data: uploadData } = await storageClient.upload(path, fileBuffer, {
        contentType: mimeType,
        upsert: true,
      });
      storagePath = uploadData?.path;
    } catch {
      // Storage upload failure is non-fatal — FocusZone falls back to raw text
    }
  }

  await insertConcepts(supabase, sessionId, newConcepts, conceptIdMap);

  await Promise.all([
    insertConceptRelationships(supabase, sessionId, newEdges, conceptIdMap),
    insertFlashcards(supabase, sessionId, newFlashcards, conceptIdMap),
    insertUnderstandingState(supabase, sessionId, userId, newConcepts, conceptIdMap),
  ]);

  const remappedBranches = remapMindmapConceptIds(newMindmapBranches, conceptIdMap);
  const mergedMindmap = await mergeIntoPreviousMindmap(supabase, sessionId, remappedBranches);
  const mergedGraph = mergeGraphStates(existingGraphState, buildNewGraphState(sessionId, newConcepts, newEdges, conceptIdMap));

  await Promise.all([
    insertMindmap(supabase, sessionId, mergedMindmap),
    insertStudentGraph(supabase, sessionId, mergedGraph),
    insertDocument(supabase, sessionId, filename, fileType, rawText, mmXml, storagePath),
  ]);
}

// ── Internal: concept ID mapping ──────────────────────────────────────────────

type ConceptIdMap = Record<string, string>; // .mm CONCEPT_ID → UUID

function buildConceptIdMap(concepts: DerivedConcept[]): ConceptIdMap {
  const map: ConceptIdMap = {};
  for (const concept of concepts) {
    map[concept.id] = crypto.randomUUID();
  }
  return map;
}

// ── Internal: individual table writers ────────────────────────────────────────

async function insertConcepts(
  supabase: ReturnType<typeof createServerClient>,
  sessionId: string,
  concepts: DerivedConcept[],
  idMap: ConceptIdMap,
): Promise<void> {
  const rows = concepts.map((concept) => ({
    id: idMap[concept.id],
    session_id: sessionId,
    name: concept.name,
    content: concept.leafContent.join('\n') || null,
    complexity: depthToComplexity(concept.depth),
    keywords: [] as string[],
    metadata: {
      mmConceptId: concept.id,
      examPriority: depthToExamPriority(concept.depth),
      depth: concept.depth,
      hasDiagram: concept.hasDiagram,
    },
  }));

  const { error } = await supabase.from('concepts').insert(rows);
  if (error) throw new Error(`Failed to insert concepts: ${error.message}`);
}

async function insertConceptRelationships(
  supabase: ReturnType<typeof createServerClient>,
  sessionId: string,
  edges: ConceptEdge[],
  idMap: ConceptIdMap,
): Promise<void> {
  const rows = edges
    .filter((edge) => idMap[edge.from] && idMap[edge.to])
    .map((edge) => ({
      session_id: sessionId,
      from_concept_id: idMap[edge.from],
      to_concept_id: idMap[edge.to],
      relationship_type: edge.type,
    }));

  if (rows.length === 0) return;

  const { error } = await supabase.from('concept_relationships').insert(rows);
  if (error) throw new Error(`Failed to insert concept_relationships: ${error.message}`);
}

type DbCardType = 'recall' | 'application' | 'explain' | 'compare';
type DbDifficulty = 'easy' | 'intermediate' | 'hard';

function mapCardType(agentType: string): DbCardType {
  if (agentType === 'explain_simply') return 'explain';
  if (agentType === 'compare_contrast') return 'compare';
  return agentType as DbCardType;
}

function mapDifficulty(difficulty: string): DbDifficulty {
  if (difficulty === 'easy' || difficulty === 'intermediate' || difficulty === 'hard') {
    return difficulty;
  }
  return 'intermediate';
}

async function insertFlashcards(
  supabase: ReturnType<typeof createServerClient>,
  sessionId: string,
  flashcardOutput: FlashcardOutput,
  idMap: ConceptIdMap,
): Promise<void> {
  const rows = flashcardOutput.cards
    .filter((card) => idMap[card.concept_id])
    .map((card) => ({
      session_id: sessionId,
      concept_id: idMap[card.concept_id],
      card_type: mapCardType(card.type),
      front: card.front,
      back: card.back,
      difficulty: mapDifficulty(card.difficulty),
      hints: card.hints,
      sr_state: null,
    }));

  if (rows.length === 0) return;

  const { error } = await supabase.from('flashcards').insert(rows);
  if (error) throw new Error(`Failed to insert flashcards: ${error.message}`);
}

async function insertUnderstandingState(
  supabase: ReturnType<typeof createServerClient>,
  sessionId: string,
  userId: string,
  concepts: DerivedConcept[],
  idMap: ConceptIdMap,
): Promise<void> {
  const rows = concepts.map((concept) => ({
    session_id: sessionId,
    user_id: userId,
    concept_id: idMap[concept.id],
    confidence_score: 0,
    exposure_count: 0,
    effective_modalities: [] as string[],
  }));

  const { error } = await supabase.from('understanding_state').insert(rows);
  if (error) throw new Error(`Failed to insert understanding_state: ${error.message}`);
}

async function insertMindmap(
  supabase: ReturnType<typeof createServerClient>,
  sessionId: string,
  mindmapTree: MindmapTreeOutput,
): Promise<void> {
  // Get the next version number for this session
  const { data: existing } = await supabase
    .from('mindmaps')
    .select('version')
    .eq('session_id', sessionId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (existing?.version ?? 0) + 1;

  const { error } = await supabase.from('mindmaps').insert({
    session_id: sessionId,
    mindmap_data: mindmapTree as unknown as import('@/types/database').Json,
    version: nextVersion,
  });
  if (error) throw new Error(`Failed to insert mindmap: ${error.message}`);
}

async function insertStudentGraph(
  supabase: ReturnType<typeof createServerClient>,
  sessionId: string,
  graphState: StudentGraphState,
): Promise<void> {
  // student_graphs is not in the generated DB types — cast to bypass
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('student_graphs').upsert(
    { session_id: sessionId, graph_state: graphState, updated_at: new Date().toISOString() },
    { onConflict: 'session_id' },
  );
  if (error) throw new Error(`Failed to upsert student_graph: ${error.message}`);
}

function mapFileTypeToEnum(fileType: FileType): 'pdf' | 'docx' | 'txt' | 'image' {
  if (fileType === 'png' || fileType === 'jpg') return 'image';
  if (fileType === 'pdf' || fileType === 'docx' || fileType === 'txt') return fileType;
  return 'txt';
}

async function insertDocument(
  supabase: ReturnType<typeof createServerClient>,
  sessionId: string,
  filename: string,
  fileType: FileType,
  rawText: string,
  mmXml: string,
  storagePath?: string,
): Promise<void> {
  const { error } = await supabase.from('documents').insert({
    session_id: sessionId,
    file_path: storagePath ?? filename,  // Use storage path when available
    file_type: mapFileTypeToEnum(fileType),
    raw_text: rawText,
    parsed_structure: mmXml,
  });
  if (error) throw new Error(`Failed to insert document: ${error.message}`);
}

// ── Internal: concept ID remapping ────────────────────────────────────────────

/**
 * Recursively remaps concept_id and id fields in the MindmapNode tree.
 * The frontend navigates to chat using node.concept_id, so these must match DB PKs.
 */
function remapMindmapConceptIds(
  tree: MindmapTreeOutput,
  idMap: ConceptIdMap,
): MindmapTreeOutput {
  return {
    ...tree,
    children: tree.children.map((node) => remapMindmapNode(node, idMap)),
    metadata: {
      ...tree.metadata,
      concept_ids_covered: tree.metadata.concept_ids_covered.map((id) => idMap[id] ?? id),
    },
  };
}

function remapMindmapNode(node: MindmapNode, idMap: ConceptIdMap): MindmapNode {
  return {
    ...node,
    id: node.id ? (idMap[node.id] ?? node.id) : undefined,
    concept_id: node.concept_id ? (idMap[node.concept_id] ?? node.concept_id) : undefined,
    children: node.children?.map((child) => remapMindmapNode(child, idMap)),
  };
}

/**
 * Remaps node.id and edge from/to in StudentGraphState from .mm CONCEPT_IDs to UUIDs.
 */
function remapGraphStateIds(
  graphState: StudentGraphState,
  idMap: ConceptIdMap,
): StudentGraphState {
  return {
    ...graphState,
    nodes: graphState.nodes.map((node) => ({ ...node, id: idMap[node.id] ?? node.id })),
    edges: graphState.edges.map((edge) => ({
      ...edge,
      from: idMap[edge.from] ?? edge.from,
      to: idMap[edge.to] ?? edge.to,
    })),
  };
}

// ── Internal: multi-doc merge helpers ─────────────────────────────────────────

async function mergeIntoPreviousMindmap(
  supabase: ReturnType<typeof createServerClient>,
  sessionId: string,
  newBranches: MindmapTreeOutput,
): Promise<MindmapTreeOutput> {
  const { data: existing } = await supabase
    .from('mindmaps')
    .select('mindmap_data')
    .eq('session_id', sessionId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existing?.mindmap_data) return newBranches;

  const prev = existing.mindmap_data as unknown as MindmapTreeOutput;
  return {
    ...prev,
    children: [...prev.children, ...newBranches.children],
    metadata: {
      total_nodes: prev.metadata.total_nodes + newBranches.metadata.total_nodes,
      max_depth: Math.max(prev.metadata.max_depth, newBranches.metadata.max_depth),
      concept_ids_covered: [
        ...prev.metadata.concept_ids_covered,
        ...newBranches.metadata.concept_ids_covered,
      ],
    },
  };
}

function buildNewGraphState(
  sessionId: string,
  concepts: DerivedConcept[],
  edges: ConceptEdge[],
  idMap: ConceptIdMap,
): StudentGraphState {
  return {
    sessionId,
    nodes: concepts.map((concept) => ({
      id: idMap[concept.id],
      name: concept.name,
      domain: '',
      content: { raw: concept.leafContent.join('\n') },
      complexity: depthToComplexity(concept.depth),
      keywords: [],
      studentState: {
        confidence: 0,
        exposureCount: 0,
        effectiveModalities: [],
        modePerformance: { fast: 0, steady: 0 },
        lastAssessed: null,
      },
      metadata: { examPriority: depthToExamPriority(concept.depth) },
    })),
    edges: edges
      .filter((e) => idMap[e.from] && idMap[e.to])
      .map((e) => ({ ...e, from: idMap[e.from], to: idMap[e.to] })),
    lastSyncedAt: new Date().toISOString(),
  };
}

function mergeGraphStates(
  existing: StudentGraphState,
  newGraph: StudentGraphState,
): StudentGraphState {
  return {
    ...existing,
    nodes: [...existing.nodes, ...newGraph.nodes],
    edges: [...existing.edges, ...newGraph.edges],
    lastSyncedAt: new Date().toISOString(),
  };
}

// ── Internal: progress aggregation ────────────────────────────────────────────

interface ProgressSummary { total: number; mastered: number; avgConfidence: number; }

function computeProgressBySession(
  rows: Array<{ session_id: string; confidence_score: number }>,
): Record<string, ProgressSummary> {
  const bySession: Record<string, number[]> = {};
  for (const row of rows) {
    if (!bySession[row.session_id]) bySession[row.session_id] = [];
    bySession[row.session_id].push(row.confidence_score);
  }

  const result: Record<string, ProgressSummary> = {};
  for (const [sessionId, scores] of Object.entries(bySession)) {
    const total = scores.length;
    const mastered = scores.filter((s) => s >= MASTERY_THRESHOLD).length;
    const avgConfidence = scores.reduce((a, b) => a + b, 0) / total;
    result[sessionId] = { total, mastered, avgConfidence };
  }
  return result;
}

// ── Internal: depth utilities ─────────────────────────────────────────────────

function depthToComplexity(depth: number): 'foundational' | 'intermediate' | 'advanced' {
  if (depth <= 2) return 'foundational';
  if (depth === 3) return 'intermediate';
  return 'advanced';
}

function depthToExamPriority(depth: number): number {
  if (depth <= 2) return 3;
  if (depth === 3) return 2;
  return 1;
}
