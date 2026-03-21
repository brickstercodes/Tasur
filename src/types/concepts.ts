/**
 * WHY: Core domain types for concepts and the knowledge graph.
 *
 * ConceptNode is the atomic unit of everything in Tasur — it carries the raw
 * content from the document parser, the student's current understanding state,
 * and metadata used by the orchestrator to make routing decisions. Keeping it
 * framework-agnostic means it can be used in-memory, serialized to Supabase,
 * and passed directly to LLM prompts without any transformation layer.
 */

export type ConceptComplexity = 'foundational' | 'intermediate' | 'advanced';

export type RelationshipType =
  | 'prerequisite'
  | 'sequential'    // sibling ordering derived from .mm tree position
  | 'related'
  | 'contrasts_with'
  | 'part_of'
  | 'example_of';

/**
 * Full concept node — the canonical representation used in the knowledge graph,
 * serialized to Supabase, and passed to the orchestrator.
 *
 * Embeds student_state so the orchestrator has everything in one object
 * without additional lookups. Matches the MindGraph-inspired graph design
 * from the architecture doc.
 */
export interface ConceptNode {
  id: string; // e.g. "normalization_3NF"
  name: string; // e.g. "Third Normal Form"
  domain: string; // e.g. "dbms"
  content: {
    raw: string; // extracted source text
    explained?: string; // post-explanation text (filled after Phase 2)
    analogies?: string[]; // analogies surfaced by the Concept Explainer
  };
  complexity: ConceptComplexity;
  keywords: string[];
  studentState: {
    // state
    confidence: number; // 0.0 – 1.0
    exposureCount: number;
    effectiveModalities: string[]; // modalities that raised confidence
    modePerformance: {
      fast: number; // average score in fast-paced mode
      steady: number; // average score in steady mode
    };
    // timestamp
    lastAssessed: string | null; // ISO timestamp
  };
  metadata: {
    examPriority?: number; // 0.0 – 1.0, set by Document Parser in fast mode
    visualType?: string; // e.g. "table", "flow_diagram", "er_diagram"
  };
}

/**
 * Directed edge between two concept nodes in the knowledge graph.
 */
export interface ConceptEdge {
  from: string; // source concept id
  to: string; // target concept id
  type: RelationshipType;
  weight: number; // 0.0 – 1.0, strength of relationship
  bidirectional?: boolean; // default false
}
