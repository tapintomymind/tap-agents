# Reader-Inventory Discipline (Caller-Enumeration for Data-Shape Changes)

When a workstream changes the SHAPE of persisted data, the set of readers
that must be re-validated is not the set of leaf reader functions — it is the
set of CALL SITES of every shared helper those readers sit behind. This
protocol codifies the enumeration method. It is cited by `agents/architect.md`
(scope phase, inventory-before-allowlist) and `agents/critic.md` (standing
data-shape-change review check).

Provenance: <project> WS31/M-A18 (2026-06-11) — a persisted-field strip nearly
shipped a green-test regression TWICE because the reader hunt enumerated leaf
functions, not callers of a shared aggregation helper (7 call sites; 2
analyzed). See `memory/lessons-learned.md` 2026-06-11. Joins the 2026-05-16
"inventory-completeness" lesson (allowlist is only as good as the inventory
feeding it).

## 1. When this fires (trigger scope)

A "data-shape change" is any change that alters what a PERSISTED record
contains or how it is shaped:
- stripping / nulling / dropping a field on a persisted row or stored blob,
- renaming or retyping a persisted field,
- changing a serialization / projection applied at write time,
- changing which sub-records a stored aggregate contains.

It is NOT: a pure read-path refactor that leaves the persisted shape
unchanged, a UI-only change, or a new additive nullable column with no
readers yet. Gate the heavy pass to true shape changes — over-triggering
trains the team to wave it through.

## 2. The Caller-Enumeration Rule

For the changed field, do NOT stop at the leaf reader functions. For EVERY
leaf reader, and for EVERY shared helper a leaf reader sits behind:

1. Enumerate ALL call sites: `rg "<helperFn>\b" <src-root> --type <lang>`.
   Read EVERY call site. Do not stop at the first N.
2. Classify each call site on two axes:
   - **Data source** — IN-MEMORY-FRESH (the caller feeds the helper data that
     never round-tripped through the changed persisted shape → SAFE) vs
     PERSISTED-RELOAD (the caller feeds reloaded/persisted rows → HAZARD class).
   - **Downstream liveness** — LIVE (output reaches a UI / leaderboard / award /
     re-persist / export surface) vs DEAD (computed but never consumed).
3. Record the disposition per call site in the inventory.

Two invariants:
- A leaf reader SAFE through caller A can be a HAZARD through caller B feeding
  it persisted data. Per-caller classification is mandatory; per-leaf is not
  sufficient.
- A PERSISTED-RELOAD caller can still be SAFE if its output is DEAD — but
  "dead" is a fact to PROVE per-caller (trace the consumer to a terminal that
  reads nothing), NEVER an assumption. A dead-by-luck reader is a LATENT TRAP:
  record it, and bind any future consumer of that output to re-derive from the
  durable source, not the changed persisted shape.

## 3. Inventory output shape

The inventory (in the scope doc / impl brief) is a table: one row per call
site of every leaf reader + shared helper, columns =
`File:line | leaf-or-helper | data-source (in-mem/persisted) | liveness
(live/dead) | disposition (in-scope / safe / latent-trap)`. The
constrained-mode allowlist is drawn FROM this table — every PERSISTED-RELOAD +
LIVE row must be a reachable (allowed) path, or the fix is unreachable.

## 4. Two-round re-review requirement

Data-shape-change workstreams use a two-round review shape:
- **Round 0** — Critic reviews the inventory + allowlist; BLOCK on any missing
  PERSISTED-RELOAD + LIVE reader.
- **Round 1** — after the producer revises and claims exhaustiveness, Critic
  re-runs the hunt FROM SCRATCH under an explicit charge: "assume there is
  another reader the revision still misses." The producer's own "now it's
  complete" claim is the worst-positioned assertion to trust — author/judge
  separation applies. Round 1 independently re-enumerates the helper call sites;
  it does not merely confirm round 0's fixes.

The round-1 "assume another" charge is what caught the second missed reader in
the founding incident. It is mandatory for data-shape changes, not optional.

## 5. Cross-references
- `memory/lessons-learned.md` 2026-06-11 (founding incident) + 2026-05-16
  (inventory-completeness / constrained-mode allowlist).
- `protocols/dispatch-efficiency.md §7` (constrained-mode allowlist — the
  allowlist this inventory feeds).
- `agents/architect.md` (producer of the inventory).
- `agents/critic.md` (independent re-enumeration + two-round charge).
