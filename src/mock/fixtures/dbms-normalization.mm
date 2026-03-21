<map version="freeplane 1.11.9">
<node TEXT="DBMS Normalization" FOLDED="false">
  <font BOLD="true" NAME="SansSerif" SIZE="16"/>

  <node TEXT="1. Functional Dependencies" POSITION="right" FOLDED="false" TRACKABLE="true" CONCEPT_ID="dbms_functional_dependency">
    <font BOLD="true" NAME="SansSerif" SIZE="14"/>

    <node TEXT="A functional dependency X → Y means: for any two tuples that agree on X, they must also agree on Y"/>
    <node TEXT="X is called the determinant; Y is the dependent attribute"/>
    <node TEXT="Armstrong's Axioms: Reflexivity (Y ⊆ X → X → Y), Augmentation (X → Y → XZ → YZ), Transitivity (X → Y, Y → Z → X → Z)"/>
    <node TEXT="[DIAGRAM TO STUDY: FD diagram showing attribute X with arrow pointing to Y]"/>

    <node TEXT="Trivial vs Non-Trivial FDs" TRACKABLE="true" CONCEPT_ID="dbms_trivial_fd">
      <node TEXT="Trivial FD: X → Y where Y ⊆ X (Y is a subset of X)"/>
      <node TEXT="Non-trivial FD: X → Y where Y ⊄ X — Y contains at least one attribute not in X"/>
      <node TEXT="All normalization analysis focuses on non-trivial FDs"/>
      <node TEXT="Example trivial: {StudentID, CourseID} → {StudentID} (trivial — StudentID is in the left side)"/>
    </node>

    <node TEXT="Closure of Attributes" TRACKABLE="true" CONCEPT_ID="dbms_attribute_closure">
      <node TEXT="Closure of X (written X+) is the set of ALL attributes that X functionally determines"/>
      <node TEXT="X is a superkey if X+ = set of all attributes in the relation"/>
      <node TEXT="X is a candidate key if X+ = all attributes AND no proper subset of X also determines all attributes"/>
      <node TEXT="Closure Algorithm: start with X+ = X, repeatedly apply FDs to expand X+ until no change"/>
      <node TEXT="[DIAGRAM TO STUDY: Closure algorithm step-by-step on example relation]"/>
    </node>
  </node>

  <node TEXT="2. Normal Forms" POSITION="right" FOLDED="false" TRACKABLE="true" CONCEPT_ID="dbms_normal_forms">
    <font BOLD="true" NAME="SansSerif" SIZE="14"/>

    <node TEXT="First Normal Form (1NF)" TRACKABLE="true" CONCEPT_ID="dbms_1nf">
      <node TEXT="All attributes must be atomic — no composite or multi-valued attributes"/>
      <node TEXT="Each row must be uniquely identifiable (a primary key must exist)"/>
      <node TEXT="No repeating groups — a column cannot store a list of values"/>
      <node TEXT="Violation example: Phone column storing '555-1111, 555-2222' is not atomic"/>
      <node TEXT="Fix: create a separate Phone table with one phone number per row"/>
    </node>

    <node TEXT="Second Normal Form (2NF)" TRACKABLE="true" CONCEPT_ID="dbms_2nf">
      <node TEXT="Must be in 1NF"/>
      <node TEXT="No partial dependency: every non-prime attribute must depend on the FULL primary key"/>
      <node TEXT="Partial dependency: a non-key attribute depends on only part of a composite key"/>
      <node TEXT="Only relevant when the primary key is composite (two or more attributes)"/>
      <node TEXT="Violation example: Order(OrderID, ProductID, ProductName, Quantity) — ProductName depends only on ProductID, not the full key (OrderID, ProductID)"/>
      <node TEXT="Fix: decompose into Order(OrderID, ProductID, Quantity) and Product(ProductID, ProductName)"/>
    </node>

    <node TEXT="Third Normal Form (3NF)" TRACKABLE="true" CONCEPT_ID="dbms_3nf">
      <node TEXT="Must be in 2NF"/>
      <node TEXT="No transitive dependency: non-key attributes must not depend on other non-key attributes"/>
      <node TEXT="For every non-trivial FD X → Y: either X is a superkey, OR Y is a prime attribute (part of some candidate key)"/>
      <node TEXT="Transitive dependency: A → B → C where A is the primary key and B is not"/>
      <node TEXT="Violation example: Employee(EmpID, DeptID, DeptName) — DeptName depends on DeptID (not the key EmpID)"/>
      <node TEXT="Fix: decompose into Employee(EmpID, DeptID) and Department(DeptID, DeptName)"/>
      <node TEXT="Common mistake: confusing partial dependency (2NF violation) with transitive dependency (3NF violation)"/>
    </node>

    <node TEXT="Boyce-Codd Normal Form (BCNF)" TRACKABLE="true" CONCEPT_ID="dbms_bcnf">
      <node TEXT="Stricter version of 3NF: for every non-trivial FD X → Y, X must be a superkey"/>
      <node TEXT="BCNF does NOT allow the '3NF exception' where Y is a prime attribute"/>
      <node TEXT="Every BCNF relation is automatically in 3NF (BCNF ⊂ 3NF)"/>
      <node TEXT="A relation can be in 3NF but NOT in BCNF when a prime attribute is determined by a non-superkey"/>
      <node TEXT="BCNF decomposition may not always preserve all functional dependencies"/>
      <node TEXT="3NF synthesis algorithm guarantees dependency preservation; BCNF decomposition does not"/>
      <node TEXT="[DIAGRAM TO STUDY: 3NF vs BCNF comparison: relation R(A,B,C) where AB→C and C→B]"/>
    </node>
  </node>

  <node TEXT="3. Decomposition Properties" POSITION="left" FOLDED="false" TRACKABLE="true" CONCEPT_ID="dbms_decomposition">
    <font BOLD="true" NAME="SansSerif" SIZE="14"/>

    <node TEXT="Lossless Decomposition" TRACKABLE="true" CONCEPT_ID="dbms_lossless_decomposition">
      <node TEXT="A decomposition R → {R1, R2} is lossless if R = R1 ⋈ R2 (the natural join reconstructs the original)"/>
      <node TEXT="Lossless test: R1 ∩ R2 → R1 OR R1 ∩ R2 → R2 (common attribute is a key in one piece)"/>
      <node TEXT="Lossy decomposition produces spurious tuples — rows that did not exist in the original relation"/>
      <node TEXT="Losslessness is non-negotiable: a lossy decomposition corrupts data"/>
      <node TEXT="[DIAGRAM TO STUDY: Lossy vs lossless join example showing spurious tuples]"/>
    </node>

    <node TEXT="Dependency Preservation" TRACKABLE="true" CONCEPT_ID="dbms_dependency_preservation">
      <node TEXT="A decomposition preserves dependencies if every FD in the original schema can be checked within one decomposed relation (without joining)"/>
      <node TEXT="Without preservation, enforcing a constraint requires an expensive join on every update"/>
      <node TEXT="BCNF decomposition: always lossless, but may lose dependencies"/>
      <node TEXT="3NF synthesis: always lossless AND always dependency-preserving"/>
      <node TEXT="Trade-off: choose BCNF for strictest redundancy elimination, 3NF for guaranteed dependency preservation"/>
    </node>
  </node>
</node>
</map>
