# Scope — Tools CLI (example)

**Date:** 2025-09-15T12:15:00Z
**Author:** Architect
**Source PRD:** `workspace/example-tools-cli/prd.md`
**Status:** approved
**Approved at:** 2025-09-15T12:35:00Z, "ship it"

---

## 1. MVP Cut

### Features IN MVP (from PRD §4)

1. PDF → MD — ~3 days effort
2. DOCX → MD — ~2 days
3. CSV → JSON — ~0.5 day
4. JSON → CSV — ~0.5 day

### Features CUT from MVP (with reason)

1. **Image-heavy PDFs** — defer; reliability requires OCR which is out of scope `[prd §11 risks]`
2. **Complex DOCX (tables, embedded objects)** — defer; v1 handles text + headings + basic formatting
3. **Bulk operations** — already deferred per PRD `[prd §4.2]`

## 2. Milestones

### Milestone 1: Single-binary build pipeline + JSON/CSV (3 days)
**Goal:** Confirm Bun single-binary build works end-to-end with a trivial conversion (CSV/JSON).
**Includes:**
- Bun project setup
- Single-binary build verified on macOS
- CSV → JSON converter
- JSON → CSV converter
- Error handling pattern established
**Excludes:** PDF, DOCX, distribution
**Validates:** PRD acceptance: tool installs and works

### Milestone 2: DOCX → MD (3 days)
**Goal:** Easier of the two markdown conversions; validates the markdown-output pattern.
**Includes:**
- DOCX parsing (mammoth library)
- Markdown serialization
- Basic formatting preservation (headings, bold/italic, lists)
**Excludes:** Tables, embedded objects (deferred)
**Validates:** PRD acceptance: DOCX → MD reliable

### Milestone 3: PDF → MD + Distribution (4 days)
**Goal:** Riskiest milestone — PDF parsing + Homebrew distribution.
**Includes:**
- PDF parsing (pdf-parse or pdfjs evaluated; pick one)
- Markdown output with heading structure
- Graceful fallback on image-heavy PDFs (warn, output text only)
- Homebrew formula
- Test corpus of 20 real-world files
**Excludes:** Image OCR
**Validates:** PRD acceptance: PDF → MD reliable + tool installs via brew

### Milestone 4 (MVP launch-ready): Polish + Launch Prep (4 days)
**Goal:** Ship to first 10 users.
**Includes:**
- Error message polish
- Loom demo video
- Landing page (single static HTML, no backend)
- Twitter launch post drafted
- Show HN draft
**Excludes:** ProductHunt prep (week 2 of launch sequence)
**Validates:** All PRD acceptance criteria

## 3. Sequencing Rationale

Riskiest-first variant: started with build pipeline (Milestone 1) because if Bun single-binary doesn't work, the project's brand promise breaks. Then easier conversion (DOCX) to validate the pattern, then PDF (the riskiest converter), then polish.

`[prd §6 acceptance criteria]` `[inference]`

## 4. Riskiest Technical Bets (cross-ref tech-strategy.md)

| Bet | First exercised | Mitigation |
|---|---|---|
| Bun single-binary build cross-platform | Milestone 1 | Test macOS first; if cross-compile fails, ship macOS-only v1 |
| PDF parsing reliability | Milestone 3 | Test corpus of 20 real PDFs; clear fallback on image-heavy |
| Homebrew formula approval | Milestone 3 | Submit early; have direct-download fallback in landing page |

## 5. Open Questions for Tier 2

- Specific PDF library: pdf-parse vs pdfjs vs custom? — Tier 2 evaluates in Milestone 3
- Test corpus source: where to get 20 real-world test files cleanly?
- Landing page: HTML/CSS only, or use Astro for slightly nicer DX?

## 6. Out of Scope for THIS Document

- Library specifics (Tier 2)
- Test framework choice (Tier 2)
- Repo layout (Tier 2)
- CI/CD specifics (Tier 2)

## Sign-off

- Architect self-check: yes
- Critic review pass: yes (1 warning — "Milestone 4 polish phase is loose; consider tightening" — accepted as warning)
- Citations verified: yes
- Cross-checked vs PRD §4: yes (no scope creep)
- User approved: yes, 2025-09-15T12:35:00Z, "ship it"
