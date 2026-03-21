# DBMS Domain Template (Layer 2)

This template is injected into every specialist agent's prompt when the detected subject is DBMS. It provides domain-specific context that improves extraction quality, explanation depth, and card relevance.

---

## Subject Context

Database Management Systems (DBMS) is a core CS/IT course covering how data is stored, organized, queried, and maintained in relational systems. Students struggle most with normalization (confusing normal forms), transaction management (ACID edge cases), and query optimization (understanding execution plans).

---

## Concept Taxonomy — Expected Granularity

When parsing DBMS material, expect concepts at these levels:

### Core Topic Areas
- **Relational Model**: Relations, tuples, attributes, keys (candidate, primary, foreign, super), relational algebra
- **Normalization**: FDs, 1NF through BCNF, 4NF/5NF (advanced), decomposition, dependency preservation, lossless join
- **SQL**: DDL, DML, joins, subqueries, views, constraints, triggers
- **Transaction Management**: ACID, serializability, concurrency control (2PL, timestamp ordering), recovery (WAL, checkpoints)
- **Indexing & Storage**: B+ trees, hashing, clustered/non-clustered indexes, file organization
- **Query Processing**: Query optimization, execution plans, cost estimation, join algorithms
- **ER Modeling**: Entities, relationships, cardinality, weak entities, ER-to-relational mapping

### Granularity Examples
- GOOD concept: "Two-Phase Locking Protocol" — specific, testable, has clear rules
- TOO BROAD: "Concurrency Control" — this is a topic area, not a single concept
- TOO NARROW: "the specific syntax for CREATE TABLE in MySQL" — implementation detail, not a concept

---

## Common Student Misconceptions (for Concept Explainer)

Use these to anticipate where students will be confused:

1. **3NF vs. BCNF**: Students conflate these. Key distinction: 3NF allows prime attributes as determinants; BCNF does not.
2. **Partial vs. Transitive dependency**: Students mix these up. Partial = non-prime depends on part of composite key. Transitive = non-prime depends on another non-prime.
3. **Candidate key vs. Primary key**: Students think primary key is the only candidate key. Clarify: there can be multiple candidate keys; primary key is the one chosen.
4. **Serializability vs. Serial schedule**: Serial = one transaction at a time. Serializable = equivalent result to some serial schedule, but allows interleaving.
5. **Lossless join vs. Dependency preservation**: Students assume one implies the other. They are independent properties. BCNF guarantees lossless join but may sacrifice dependency preservation.
6. **B+ tree vs. B tree**: Students confuse these. B+ trees store all data in leaf nodes with linked-list pointers; B trees store data in internal nodes too.
7. **ACID Isolation levels**: Students memorize the names but can't identify which anomaly each level prevents (dirty read, non-repeatable read, phantom read).

---

## Analogy Bank (for Concept Explainer)

When explaining DBMS concepts, prefer these proven analogies:

- **Normalization** → Organizing a messy filing cabinet. Each drawer (table) should contain one type of document. If employee info and department info are in the same drawer, updating the department means opening every employee folder.
- **ACID** → ATM transaction. Atomicity = the whole withdrawal happens or none of it. Consistency = your balance can't go negative. Isolation = two people withdrawing at the same time don't see each other's partial state. Durability = once the receipt prints, the bank remembers even if the power goes out.
- **B+ Tree** → Library card catalog. Internal nodes are like floor/section signs (routing), leaf nodes are the actual catalog cards (data), and they're linked in order so you can scan sequentially.
- **Deadlock** → Two people in a narrow hallway, each holding a box, each waiting for the other to move first. Neither can proceed without the other backing up.
- **Foreign Key** → A cross-reference in a textbook. "See Chapter 5" only works if Chapter 5 exists. A foreign key ensures the reference is always valid.
- **View** → A saved search in your email. The emails aren't copied — you just see a filtered window into the same inbox. Update the inbox and the view updates automatically.

---

## Visual Vocabulary (for Mindmap Generator)

When building mindmaps for DBMS, use these structural patterns:
- **Normalization chain**: Linear progression (1NF → 2NF → 3NF → BCNF) — each as a sibling under a "Normal Forms" parent
- **ACID**: Four parallel branches under a single parent, one per property
- **ER Modeling**: Tree with entity types as branches, relationships as connectors noted in content
- **Indexing**: Compare-contrast structure — B+ Tree vs. Hash Index as siblings

---

## Flashcard Patterns (for Flashcard Generator)

DBMS-specific card patterns that work well:

### Recall
- "What are the four ACID properties? Name and define each."
- "What condition must hold for a relation to be in [normal form]?"

### Application
- Given a table schema with FDs, ask: "Is this in 3NF? If not, decompose it."
- Given a transaction schedule, ask: "Is this schedule serializable? Show the precedence graph."
- Given an ER diagram description, ask: "How many tables result from mapping this to relational schema?"

### Explain Simply
- "Explain deadlock to someone who has never used a computer."
- "Why can't we just lock the entire database for every transaction?"

### Compare-Contrast
- "3NF vs. BCNF — when does the distinction matter?"
- "Clustered vs. non-clustered index — which would you choose for a column that's frequently used in range queries?"
- "Pessimistic vs. optimistic concurrency control — trade-offs?"

---

## Complexity Calibration

For DBMS specifically:
- **Foundational**: Relational model basics, key types, ER notation, basic SQL (SELECT, INSERT)
- **Intermediate**: Normal forms (1NF-3NF), basic transactions (ACID definition), B+ tree structure, join types
- **Advanced**: BCNF decomposition trade-offs, concurrency control protocols (2PL, MVCC), query optimization cost models, recovery algorithms (ARIES)
