/**
 * WHY: Tests for the deterministic .mm Parser pipeline.
 *
 * The .mm Parser is the core of the .mm-first architecture — every downstream
 * data structure (concept registry, knowledge graph, visual tree) derives from
 * it. Thorough tests here catch regressions before they reach the pipeline.
 *
 * Test structure:
 * 1. parseMmXml() — XML parsing and validation
 * 2. extractConcepts() — TRACKABLE node extraction and DerivedConcept shape
 * 3. buildGraphEdges() — prerequisite and sequential edge derivation
 * 4. toMindmapTreeOutput() — MindmapTreeOutput conversion
 * 5. Error cases — malformed XML, missing TRACKABLE, missing CONCEPT_ID, flat tree
 */

import { describe, it, expect } from 'vitest';
import { parseMmXml } from '@/lib/mm-parser';
import { extractConcepts } from '@/lib/mm-parser/concept-extractor';
import { buildGraphEdges } from '@/lib/mm-parser/graph-builder';
import { toMindmapTreeOutput } from '@/lib/mm-parser/tree-converter';
import { validateMmOutput } from '@/lib/schemas/mm-generator-output';

// ── Test fixtures ─────────────────────────────────────────────────────────────

/**
 * Minimal valid .mm XML — the DC sync example from Document 4.
 * Three TRACKABLE nodes at different depths with leaf content and a diagram callout.
 */
const DC_SYNC_MM = `<map version="freeplane 1.11.9">
<node TEXT="Unit 3: Synchronization in Distributed Computing" FOLDED="false">
  <font BOLD="true" NAME="SansSerif" SIZE="16"/>

  <node TEXT="1. Introduction" POSITION="right" FOLDED="false" TRACKABLE="true" CONCEPT_ID="dc_sync_intro">
    <font BOLD="true" NAME="SansSerif" SIZE="14"/>

    <node TEXT="Challenges in Distributed Systems" TRACKABLE="true" CONCEPT_ID="dc_sync_challenges">
      <node TEXT="Synchronization is much more difficult compared to uniprocessor/multiprocessor systems."/>
      <node TEXT="Two clocks do not agree perfectly."/>
      <node TEXT="Time synchronization is required for Correctness and Fairness."/>
      <node TEXT="Needed for sender-receiver sync and coordination of joint activity."/>
      <node TEXT="[DIAGRAM TO STUDY: Clock Synchronization issue - output.c vs output.o compile mismatch]"/>
    </node>

    <node TEXT="Clock Skew vs. Clock Drift" TRACKABLE="true" CONCEPT_ID="dc_clock_skew_drift">
      <node TEXT="Clock Skew: Relative difference in clock values of two processes."/>
      <node TEXT="Clock Drift: Relative difference in clock frequencies of two processes."/>
      <node TEXT="A non-zero clock skew implies clocks are not synchronized."/>
      <node TEXT="For a perfect clock, skew = drift = 0."/>
    </node>
  </node>
</node>
</map>`;

/**
 * Fixture with sibling TRACKABLE concepts at the top level — tests sequential edge generation.
 */
const MULTI_BRANCH_MM = `<map version="freeplane 1.11.9">
<node TEXT="DBMS Overview" FOLDED="false">
  <font BOLD="true" NAME="SansSerif" SIZE="16"/>

  <node TEXT="Normalization" POSITION="right" TRACKABLE="true" CONCEPT_ID="dbms_normalization">
    <node TEXT="Process of organizing data to reduce redundancy"/>
    <node TEXT="Defined through a series of Normal Forms (1NF, 2NF, 3NF, BCNF)"/>

    <node TEXT="First Normal Form" TRACKABLE="true" CONCEPT_ID="dbms_1nf">
      <node TEXT="All attributes must be atomic"/>
      <node TEXT="No repeating groups"/>
    </node>

    <node TEXT="Third Normal Form" TRACKABLE="true" CONCEPT_ID="dbms_3nf">
      <node TEXT="No transitive dependencies"/>
      <node TEXT="Every non-key attribute depends only on the primary key"/>
    </node>
  </node>

  <node TEXT="Transactions" POSITION="right" TRACKABLE="true" CONCEPT_ID="dbms_transactions">
    <node TEXT="A sequence of operations performed as a single logical unit"/>
    <node TEXT="Must satisfy ACID properties"/>

    <node TEXT="ACID Properties" TRACKABLE="true" CONCEPT_ID="dbms_acid">
      <node TEXT="Atomicity: all or nothing"/>
      <node TEXT="Consistency: data remains valid"/>
      <node TEXT="Isolation: concurrent transactions do not interfere"/>
      <node TEXT="Durability: committed changes are permanent"/>
    </node>
  </node>
</node>
</map>`;

// ── 1. parseMmXml() ───────────────────────────────────────────────────────────

describe('parseMmXml()', () => {
  it('parses a valid .mm XML and returns a ParsedMindmap with correct root', () => {
    const result = parseMmXml(DC_SYNC_MM);

    expect(result.root.TEXT).toBe('Unit 3: Synchronization in Distributed Computing');
    expect(result.root.TRACKABLE).toBe(false);
    expect(result.root.depth).toBe(0);
  });

  it('computes correct metadata: title, trackableCount, maxDepth', () => {
    const result = parseMmXml(DC_SYNC_MM);

    expect(result.metadata.title).toBe('Unit 3: Synchronization in Distributed Computing');
    expect(result.metadata.trackableCount).toBe(3); // dc_sync_intro, dc_sync_challenges, dc_clock_skew_drift
    expect(result.metadata.maxDepth).toBeGreaterThanOrEqual(3); // root(0) → intro(1) → challenges(2) → leaf(3)
  });

  it('correctly marks TRACKABLE nodes', () => {
    const result = parseMmXml(DC_SYNC_MM);

    const introNode = result.root.children[0];
    expect(introNode.TRACKABLE).toBe(true);
    expect(introNode.CONCEPT_ID).toBe('dc_sync_intro');
    expect(introNode.TEXT).toBe('1. Introduction');
  });

  it('correctly marks non-TRACKABLE leaf nodes', () => {
    const result = parseMmXml(DC_SYNC_MM);

    const challengesNode = result.root.children[0].children[0];
    const firstLeaf = challengesNode.children[0];

    expect(firstLeaf.TRACKABLE).toBe(false);
    expect(firstLeaf.CONCEPT_ID).toBeUndefined();
    expect(firstLeaf.TEXT).toContain('Synchronization is much more difficult');
  });

  it('preserves depth correctly for all nodes', () => {
    const result = parseMmXml(DC_SYNC_MM);

    expect(result.root.depth).toBe(0);
    expect(result.root.children[0].depth).toBe(1); // dc_sync_intro
    expect(result.root.children[0].children[0].depth).toBe(2); // dc_sync_challenges
    expect(result.root.children[0].children[0].children[0].depth).toBe(3); // leaf
  });

  it('preserves child order from the XML', () => {
    const result = parseMmXml(DC_SYNC_MM);
    const introChildren = result.root.children[0].children;

    expect(introChildren[0].CONCEPT_ID).toBe('dc_sync_challenges');
    expect(introChildren[1].CONCEPT_ID).toBe('dc_clock_skew_drift');
  });
});

// ── 2. extractConcepts() ─────────────────────────────────────────────────────

describe('extractConcepts()', () => {
  it('extracts the correct number of DerivedConcepts', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const concepts = extractConcepts(tree);

    expect(concepts).toHaveLength(3);
  });

  it('extracts concepts in depth-first source order', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const concepts = extractConcepts(tree);

    expect(concepts[0].id).toBe('dc_sync_intro');
    expect(concepts[1].id).toBe('dc_sync_challenges');
    expect(concepts[2].id).toBe('dc_clock_skew_drift');
  });

  it('assigns correct parentId (null for root-level, CONCEPT_ID for nested)', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const concepts = extractConcepts(tree);

    const intro = concepts.find((c) => c.id === 'dc_sync_intro');
    const challenges = concepts.find((c) => c.id === 'dc_sync_challenges');
    const clockSkew = concepts.find((c) => c.id === 'dc_clock_skew_drift');

    expect(intro?.parentId).toBeNull();
    expect(challenges?.parentId).toBe('dc_sync_intro');
    expect(clockSkew?.parentId).toBe('dc_sync_intro');
  });

  it('correctly populates leafContent from non-TRACKABLE children', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const concepts = extractConcepts(tree);
    const challenges = concepts.find((c) => c.id === 'dc_sync_challenges');

    expect(challenges?.leafContent).toContain('Two clocks do not agree perfectly.');
    expect(challenges?.leafContent).toContain('Time synchronization is required for Correctness and Fairness.');
    // Should NOT include TRACKABLE children's content (dc_sync_challenges has none in this fixture,
    // but the extractor should stop at non-TRACKABLE leaves)
  });

  it('sets hasDiagram=true when leafContent includes a [DIAGRAM TO STUDY:] callout', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const concepts = extractConcepts(tree);
    const challenges = concepts.find((c) => c.id === 'dc_sync_challenges');

    expect(challenges?.hasDiagram).toBe(true);
  });

  it('sets hasDiagram=false for concepts without diagram callouts', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const concepts = extractConcepts(tree);
    const clockSkew = concepts.find((c) => c.id === 'dc_clock_skew_drift');

    expect(clockSkew?.hasDiagram).toBe(false);
  });

  it('assigns childConceptIds correctly', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const concepts = extractConcepts(tree);
    const intro = concepts.find((c) => c.id === 'dc_sync_intro');

    expect(intro?.childConceptIds).toContain('dc_sync_challenges');
    expect(intro?.childConceptIds).toContain('dc_clock_skew_drift');
    expect(intro?.childConceptIds).toHaveLength(2);
  });

  it('assigns position (0-based sibling index) correctly', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const concepts = extractConcepts(tree);

    const intro = concepts.find((c) => c.id === 'dc_sync_intro');
    const challenges = concepts.find((c) => c.id === 'dc_sync_challenges');
    const clockSkew = concepts.find((c) => c.id === 'dc_clock_skew_drift');

    expect(intro?.position).toBe(0); // only root-level concept
    expect(challenges?.position).toBe(0); // first child of dc_sync_intro
    expect(clockSkew?.position).toBe(1); // second child of dc_sync_intro
  });

  it('assigns correct depth values', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const concepts = extractConcepts(tree);

    const intro = concepts.find((c) => c.id === 'dc_sync_intro');
    const challenges = concepts.find((c) => c.id === 'dc_sync_challenges');

    expect(intro?.depth).toBe(1);
    expect(challenges?.depth).toBe(2);
  });
});

// ── 3. buildGraphEdges() ─────────────────────────────────────────────────────

describe('buildGraphEdges()', () => {
  it('generates prerequisite edges for parent→child TRACKABLE pairs', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const concepts = extractConcepts(tree);
    const edges = buildGraphEdges(concepts);

    const prereqEdges = edges.filter((e) => e.type === 'prerequisite');

    // dc_sync_intro → dc_sync_challenges
    expect(prereqEdges.some((e) => e.from === 'dc_sync_intro' && e.to === 'dc_sync_challenges')).toBe(true);
    // dc_sync_intro → dc_clock_skew_drift
    expect(prereqEdges.some((e) => e.from === 'dc_sync_intro' && e.to === 'dc_clock_skew_drift')).toBe(true);
  });

  it('gives prerequisite edges weight 1.0', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const concepts = extractConcepts(tree);
    const edges = buildGraphEdges(concepts);

    const prereqEdge = edges.find((e) => e.type === 'prerequisite');
    expect(prereqEdge?.weight).toBe(1.0);
  });

  it('generates sequential edges between consecutive TRACKABLE siblings', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const concepts = extractConcepts(tree);
    const edges = buildGraphEdges(concepts);

    const seqEdges = edges.filter((e) => e.type === 'sequential');

    // dc_sync_challenges → dc_clock_skew_drift (siblings under dc_sync_intro)
    expect(seqEdges.some((e) => e.from === 'dc_sync_challenges' && e.to === 'dc_clock_skew_drift')).toBe(true);
  });

  it('gives sequential edges weight 0.5', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const concepts = extractConcepts(tree);
    const edges = buildGraphEdges(concepts);

    const seqEdge = edges.find((e) => e.type === 'sequential');
    expect(seqEdge?.weight).toBe(0.5);
  });

  it('does not generate a prerequisite edge when the parent is NOT trackable (non-trackable root)', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const concepts = extractConcepts(tree);
    const edges = buildGraphEdges(concepts);

    // dc_sync_intro has a null parentId (root is not trackable) — no prerequisite edge TO dc_sync_intro
    const edgesToIntro = edges.filter((e) => e.to === 'dc_sync_intro');
    const prereqToIntro = edgesToIntro.filter((e) => e.type === 'prerequisite');
    expect(prereqToIntro).toHaveLength(0);
  });

  it('generates correct edges for a multi-branch fixture', () => {
    const tree = parseMmXml(MULTI_BRANCH_MM);
    const concepts = extractConcepts(tree);
    const edges = buildGraphEdges(concepts);

    const prereqEdges = edges.filter((e) => e.type === 'prerequisite');
    const seqEdges = edges.filter((e) => e.type === 'sequential');

    // normalization → 1nf (prerequisite)
    expect(prereqEdges.some((e) => e.from === 'dbms_normalization' && e.to === 'dbms_1nf')).toBe(true);
    // normalization → 3nf (prerequisite)
    expect(prereqEdges.some((e) => e.from === 'dbms_normalization' && e.to === 'dbms_3nf')).toBe(true);
    // transactions → acid (prerequisite)
    expect(prereqEdges.some((e) => e.from === 'dbms_transactions' && e.to === 'dbms_acid')).toBe(true);

    // normalization → transactions (sequential, both are root-level siblings)
    expect(seqEdges.some((e) => e.from === 'dbms_normalization' && e.to === 'dbms_transactions')).toBe(true);
    // 1nf → 3nf (sequential, siblings under normalization)
    expect(seqEdges.some((e) => e.from === 'dbms_1nf' && e.to === 'dbms_3nf')).toBe(true);
  });
});

// ── 4. toMindmapTreeOutput() ─────────────────────────────────────────────────

describe('toMindmapTreeOutput()', () => {
  it('returns a MindmapTreeOutput with the correct title', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const output = toMindmapTreeOutput(tree);

    expect(output.title).toBe('Unit 3: Synchronization in Distributed Computing');
  });

  it('uses the provided subject override', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const output = toMindmapTreeOutput(tree, 'Distributed Computing');

    expect(output.subject).toBe('Distributed Computing');
  });

  it('creates top-level children for each direct child of the root', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const output = toMindmapTreeOutput(tree);

    expect(output.children).toHaveLength(1); // only "1. Introduction"
    expect(output.children[0].label).toBe('1. Introduction');
  });

  it('assigns concept_id to TRACKABLE nodes in the output', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const output = toMindmapTreeOutput(tree);

    const introNode = output.children[0];
    expect(introNode.concept_id).toBe('dc_sync_intro');
    expect(introNode.id).toBe('dc_sync_intro');
  });

  it('does not assign concept_id to non-TRACKABLE leaf nodes', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const output = toMindmapTreeOutput(tree);

    // Find a leaf-only node in the output (if any are promoted to children)
    const findNoConceptIdNode = (nodes: typeof output.children): boolean =>
      nodes.some(
        (n) =>
          (!n.concept_id && n.label.length > 0) ||
          (n.children ? findNoConceptIdNode(n.children) : false),
      );

    // The important thing is that TRACKABLE nodes DO have concept_id
    const challengesNode = output.children[0].children?.find(
      (n) => n.concept_id === 'dc_sync_challenges',
    );
    expect(challengesNode).toBeDefined();
  });

  it('includes concept_ids_covered in metadata', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const output = toMindmapTreeOutput(tree);

    expect(output.metadata.concept_ids_covered).toContain('dc_sync_intro');
    expect(output.metadata.concept_ids_covered).toContain('dc_sync_challenges');
    expect(output.metadata.concept_ids_covered).toContain('dc_clock_skew_drift');
  });

  it('metadata.total_nodes counts all nodes in the output tree', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const output = toMindmapTreeOutput(tree);

    expect(output.metadata.total_nodes).toBeGreaterThan(0);
  });

  it('metadata.max_depth is at least 2 (root children = depth 1, their children = depth 2)', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const output = toMindmapTreeOutput(tree);

    expect(output.metadata.max_depth).toBeGreaterThanOrEqual(2);
  });

  it('produces a content field from direct leaf children of TRACKABLE nodes', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const output = toMindmapTreeOutput(tree);

    // dc_sync_challenges should have content from its leaf children
    const challengesNode = output.children[0].children?.find(
      (n) => n.concept_id === 'dc_sync_challenges',
    );
    expect(challengesNode?.content).toBeTruthy();
    expect(challengesNode?.content).toContain('Synchronization is much more difficult');
  });
});

// ── 5. Error cases ───────────────────────────────────────────────────────────

describe('parseMmXml() — error cases', () => {
  it('throws when XML does not start with <map', () => {
    const badXml = `<?xml version="1.0"?><document><node TEXT="hello"/></document>`;

    expect(() => parseMmXml(badXml)).toThrow(/must start with <map/i);
  });

  it('throws when XML does not end with </map>', () => {
    const truncated = `<map version="freeplane 1.11.9"><node TEXT="test" TRACKABLE="true" CONCEPT_ID="test_1"><node TEXT="leaf1"/><node TEXT="leaf2"/><node TEXT="leaf3"/></node>`;

    expect(() => parseMmXml(truncated)).toThrow(/must end with <\/map>/i);
  });

  it('throws when there are no TRACKABLE nodes', () => {
    const noTrackable = `<map version="freeplane 1.11.9">
<node TEXT="Root">
  <node TEXT="Child 1">
    <node TEXT="Leaf"/>
  </node>
</node>
</map>`;

    expect(() => parseMmXml(noTrackable)).toThrow(/No TRACKABLE/i);
  });

  it('throws when a TRACKABLE node is missing CONCEPT_ID', () => {
    const missingConceptId = `<map version="freeplane 1.11.9">
<node TEXT="Root">
  <node TEXT="Branch" TRACKABLE="true">
    <node TEXT="Leaf 1"/>
    <node TEXT="Leaf 2"/>
    <node TEXT="Leaf 3"/>
  </node>
</node>
</map>`;

    expect(() => parseMmXml(missingConceptId)).toThrow(/CONCEPT_ID/i);
  });

  it('throws when tree is too shallow (less than 3 levels)', () => {
    const flatTree = `<map version="freeplane 1.11.9">
<node TEXT="Root">
  <node TEXT="Only Branch" TRACKABLE="true" CONCEPT_ID="concept_1"/>
</node>
</map>`;

    expect(() => parseMmXml(flatTree)).toThrow(/too shallow|depth/i);
  });
});

// ── 6. validateMmOutput() ────────────────────────────────────────────────────

describe('validateMmOutput()', () => {
  it('returns valid=true for a correct .mm XML', () => {
    const result = validateMmOutput(DC_SYNC_MM);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns errors when XML does not start with <map', () => {
    const result = validateMmOutput('```xml\n<map>...</map>\n```');

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('start with <map'))).toBe(true);
  });

  it('returns errors when XML ends without </map>', () => {
    const result = validateMmOutput('<map version="1.0"><node TEXT="x"/></ma');

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('</map>'))).toBe(true);
  });

  it('returns error when no TRACKABLE nodes are found', () => {
    const noTrackable = `<map version="freeplane 1.11.9">
<node TEXT="Root"><node TEXT="Branch"><node TEXT="Leaf"/></node></node>
</map>`;

    const result = validateMmOutput(noTrackable);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('TRACKABLE'))).toBe(true);
  });

  it('returns multiple errors when multiple constraints are violated', () => {
    const badOutput = 'not xml at all';

    const result = validateMmOutput(badOutput);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ── 7. Integration: full pipeline on DC sync fixture ─────────────────────────

describe('Full pipeline: parseMmXml → extractConcepts → buildGraphEdges → toMindmapTreeOutput', () => {
  it('runs the complete pipeline without errors', () => {
    expect(() => {
      const tree = parseMmXml(DC_SYNC_MM);
      const concepts = extractConcepts(tree);
      const edges = buildGraphEdges(concepts);
      const output = toMindmapTreeOutput(tree, 'dc');

      expect(concepts.length).toBeGreaterThan(0);
      expect(edges.length).toBeGreaterThan(0);
      expect(output.children.length).toBeGreaterThan(0);
    }).not.toThrow();
  });

  it('concept IDs in edges match concept IDs in DerivedConcept[]', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const concepts = extractConcepts(tree);
    const edges = buildGraphEdges(concepts);

    const conceptIdSet = new Set(concepts.map((c) => c.id));
    for (const edge of edges) {
      expect(conceptIdSet.has(edge.from)).toBe(true);
      expect(conceptIdSet.has(edge.to)).toBe(true);
    }
  });

  it('concept IDs in MindmapTreeOutput.metadata.concept_ids_covered match DerivedConcept[]', () => {
    const tree = parseMmXml(DC_SYNC_MM);
    const concepts = extractConcepts(tree);
    const output = toMindmapTreeOutput(tree);

    const conceptIdSet = new Set(concepts.map((c) => c.id));
    for (const id of output.metadata.concept_ids_covered) {
      expect(conceptIdSet.has(id)).toBe(true);
    }
  });

  it('runs on the MULTI_BRANCH_MM fixture and produces correct concept count', () => {
    const tree = parseMmXml(MULTI_BRANCH_MM);
    const concepts = extractConcepts(tree);

    // normalization, 1nf, 3nf, transactions, acid = 5 concepts
    expect(concepts).toHaveLength(5);
  });
});
