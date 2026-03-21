# Prompt Iteration Log

Track every prompt change, what it affected, and why. This is your institutional knowledge about what works for EdTech content.

---

## How to Use This Log

1. Before changing a prompt, run your 3 test fixtures and record the "before" metrics.
2. Make ONE change at a time. Multiple simultaneous changes make it impossible to isolate what helped.
3. Run the same 3 test fixtures and record the "after" metrics.
4. If the change regresses ANY fixture, investigate before shipping.

### Test Fixtures
- `test-normalization.txt` — Dense theory, lots of prerequisites, normalization chain
- `test-transactions.pdf` — Mixed theory + examples, ACID properties
- `test-er-modeling.docx` — Diagram-heavy, entity-relationship content

---

## Metrics to Track

| Metric | What It Measures | Target Range |
|--------|-----------------|--------------|
| **Concept count** | How many concepts the parser extracts | 12–20 per 5-10 page doc |
| **Concept quality** | Are concept names standard? Are raw_content fields rich enough for downstream agents? | Manual review: 1-5 scale |
| **Relationship accuracy** | Are prerequisite chains correct? Are contrasts_with pairs valid? | Manual review: % correct |
| **Gap detection** | Does the parser catch what's missing? | Manual review: # of real gaps caught vs. missed |
| **Mindmap coverage** | % of parsed concepts that appear in the mindmap | >= 80% |
| **Mindmap depth** | Does the tree match the mode's target depth? | Fast: 2-3, Steady: 3-5 |
| **Flashcard variety** | % breakdown by card type | Must match mode targets |
| **Flashcard answerability** | Can every card be answered from the provided concept data alone? | 100% |
| **Explainer Bloom's level** | Are micro-assessments at the right cognitive level for the mode? | Manual review |

---

## Iteration History

### v1 — 2026-03-20 — Baseline prompts (Module 7 originals)

| Agent | Status | Notes |
|-------|--------|-------|
| Document Parser | Functional | Extracted concepts but no granularity guidance. Manual path got 15 concepts, Mastra got 6 from same input — prompt composition difference. |
| Orchestrator | Functional | Basic routing worked. No chain-of-thought, reasoning was often vague. |
| Concept Explainer | Functional | Mode-aware but no Bloom's taxonomy framing. Assessments were mostly recall-level. |
| Mindmap Generator | Functional | Produced trees but depth was inconsistent. No explicit decomposition strategy. |
| Flashcard Generator | Functional | Cards were 80%+ recall. No negative constraints on quality. |

### v2 — 2026-03-20 — Rewrite with advanced prompting techniques

| Agent | Change | Expected Impact |
|-------|--------|----------------|
| Document Parser | Added "enumerate then extract" 2-step process. Added granularity rules (what IS/IS NOT a concept). Added negative constraints. Added confidence threshold. Added richer worked example with 6 concepts from short input. | Concept count should increase from ~6-8 to 12-18. Concept quality should improve (richer raw_content). |
| Orchestrator | Added explicit "think through this sequence" chain-of-thought. Added detailed mode decision trees. Added negative constraints. Added 4th example (session init). | Routing decisions should be more consistent. Reasoning field should be specific, not vague. |
| Concept Explainer | Added Bloom's Taxonomy framing for assessments. Added mode-specific first-turn behavior. Added negative constraints on assessment design. Added steady-mode Socratic opener example. | Assessment quality should improve. Steady mode should feel genuinely different from fast mode. |
| Mindmap Generator | Added "top-down decomposition" explicit strategy. Added exact depth targets per mode. Added balance constraints (3-6 branches, no single-child branches). Added negative constraints on study_cue quality. | Trees should be more balanced and consistently hit depth targets. Coverage should stay >= 80%. |
| Flashcard Generator | Added Bloom's Taxonomy card design. Added explicit card type definitions with examples. Added negative constraints (no duplicate knowledge, no answer in hints). Added richer worked example with 4 different card types. | Card variety should match mode targets. Application cards should have specific scenarios, not generic prompts. |
| DBMS Domain | Created Layer 2 template with: concept taxonomy, 7 common misconceptions, analogy bank, visual vocabulary, flashcard patterns, complexity calibration. | All DBMS-related agent outputs should be domain-aware. Explanations should anticipate confusion points. |

**TODO — Run fixtures and fill in actual metrics:**

| Fixture | Agent | Metric | v1 Value | v2 Value | Delta |
|---------|-------|--------|----------|----------|-------|
| test-normalization.txt | Parser | concept_count | | | |
| test-normalization.txt | Parser | concept_quality (1-5) | | | |
| test-normalization.txt | Mindmap | coverage % | | | |
| test-normalization.txt | Mindmap | max_depth | | | |
| test-normalization.txt | Flashcard | recall % | | | |
| test-normalization.txt | Flashcard | non-recall % | | | |
| test-transactions.pdf | Parser | concept_count | | | |
| test-transactions.pdf | Flashcard | application card count | | | |
| test-er-modeling.docx | Parser | concept_count | | | |
| test-er-modeling.docx | Parser | gap_detection count | | | |

---

## Improvement Roadmap

### Immediate Next Steps (do these in order)

#### Step 1: Measure the baseline
Run the v2 prompts against all 3 test fixtures. Fill in the metrics table above. This gives you the numbers to beat.

```bash
# Example: run the demo orchestrator with each fixture
AGENT_PROVIDER=manual LLM_PROVIDER=gemini npx tsx scripts/demo-orchestrator.ts test-normalization.txt
```

#### Step 2: Diff Manual vs. Mastra resolved prompts
The Module 7 discrepancy (15 vs. 6 concepts) was almost certainly a prompt composition issue. Run both paths against the same fixture and diff the RESOLVED prompt strings (not template files — the actual strings sent to Gemini with all variables filled in). The diff will show which prompt elements are driving the quality gap.

#### Step 3: Tune the Document Parser first
This is the crown jewel. Everything downstream depends on it. Iterate on it until you consistently get 12-18 concepts from each test fixture with:
- Correct prerequisite chains
- Meaningful raw_content (2-4 sentences, not 1 vague sentence)
- Accurate complexity classification
- Real gaps detected (not false positives)

#### Step 4: Validate downstream cascade
After parser improvements stabilize, re-run mindmap and flashcard generation WITHOUT changing those prompts. Measure whether better parser output automatically improves downstream quality. (It should — better input = better output.)

#### Step 5: Tune specialists one at a time
After the parser is solid, improve one specialist at a time:
1. Mindmap Generator — focus on coverage % and depth consistency
2. Flashcard Generator — focus on card variety and answerability
3. Concept Explainer — focus on Bloom's level accuracy by mode
4. Orchestrator — focus on routing correctness (does it follow the mode rules?)

### Medium-Term Improvements

#### Domain template expansion
Create Layer 2 templates for remaining Tier 1 subjects:
- [ ] Operating Systems (os.md)
- [ ] Software Quality Assurance (sqa.md)
- [ ] Computer Networks (cn.md)
- [ ] Software Engineering (se.md)
- [ ] Distributed Computing (dc.md)

Each template needs: concept taxonomy, common misconceptions (5-7), analogy bank (5-6), visual vocabulary, flashcard patterns, complexity calibration.

#### Few-shot example expansion
Current prompts have 1-2 examples each. For production quality, add:
- 3-5 examples per agent covering different subjects and edge cases
- At least 1 example showing what BAD output looks like and why it's wrong (negative examples)
- Examples for non-DBMS subjects once domain templates are ready

#### Temperature tuning
- Document Parser: temperature 0–0.1 (deterministic extraction)
- Concept Explainer: temperature 0.4–0.6 (creative but grounded)
- Mindmap Generator: temperature 0.1–0.2 (structural, slight variation in labels)
- Flashcard Generator: temperature 0.3–0.5 (creative questions, but correct answers)
- Orchestrator: temperature 0 (deterministic routing decisions)

### Long-Term Improvements

#### Automated eval pipeline
Build a script that:
1. Runs all 3 fixtures through all agents
2. Computes metrics automatically (concept count, coverage %, card type distribution)
3. Compares against the last recorded metrics
4. Flags regressions

This replaces manual testing and lets you iterate faster.

#### A/B testing framework
When you have real students, run two prompt variants simultaneously and measure:
- Flashcard recall rate (which prompt's cards are remembered better)
- Concept chat duration (which prompt's explanations are understood faster)
- Mindmap engagement (which structure gets more clicks)

#### Prompt versioning system
Move from this markdown log to a structured system:
- Each prompt gets a semver (parser-v2.1.0)
- Git tags mark prompt versions
- Eval results are stored alongside the prompt version
- Rollback = checkout the tag
