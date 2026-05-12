# PRD — Tools CLI (example)

**Date:** 2025-09-15T11:10:00Z
**Author:** Strategist (invoked by Conductor on `briefed` advance)
**Source brief:** `workspace/example-tools-cli/intake-brief.md`
**Status:** approved
**Approved at:** 2025-09-15T11:25:00Z, "approve"

---

## 1. Problem Statement

Indie developers and writers regularly need to convert files between formats (PDF→MD, DOCX→MD, CSV→JSON) and the existing options are bad: Pandoc has a steep learning curve and esoteric flags `[brief: Problem Clarity]`, online converters are slow and have privacy concerns `[brief: Problem Clarity]`, and copy-paste-then-fix is the lowest-friction current option but produces poor output `[inference]`. The friction is small per occurrence (~5 min) but recurring (~3x/week per person) `[brief: Problem Clarity]`.

## 2. Target User

### Primary persona
**Mark, 32, Brooklyn.** Solo indie dev / writer hybrid. Ships small SaaS tools and writes a Substack newsletter. Spends ~3 hrs/day in his terminal. Currently uses Pandoc but has to look up the right flags every time. Has installed at least 5 single-binary CLI tools in the last year and has paid for 2 of them. `[brief: Users and Distribution]` `[inference]`

### First 10 users
User's Twitter network of ~3000 dev followers; specifically `@<friend1>`, `@<friend2>`, `@<friend3>` confirmed as guaranteed early users. `[brief: Users and Distribution]` `[user @ conversation-log L42]`

## 3. Solution Overview

A single-binary CLI tool. No setup, no flags. `convert input output` — the binary detects format from extensions and routes to the right converter. Initial v1 supports four conversions covering ~80% of common cases. `[brief: Scope Discipline]` `[seed]`

The product's brand promise is: **single binary, no setup, no telemetry, no cloud.** Privacy and simplicity are features. `[brief: Decision Rights non-negotiables]`

## 4. MVP Scope

### What's IN v1

1. **PDF → Markdown** — extract text, preserve heading structure, fall back gracefully on tables/images.
2. **DOCX → Markdown** — preserve headings, lists, basic formatting (bold/italic).
3. **CSV → JSON** — array of objects with header row as keys.
4. **JSON → CSV** — flat array of objects → CSV with inferred header.

### What's explicitly OUT of v1 (deferred)

1. **Bulk operations** — defer to v2 (single-file is the MVP unit) `[brief: Scope Discipline]`
2. **Presets / configuration** — defer; opinionated defaults are a feature
3. **History tracking** — defer; out of brand
4. **GUI** — defer indefinitely; it's a CLI tool
5. **Auth / cloud sync** — defer indefinitely; brand promise is "no cloud"
6. **Telemetry / auto-update** — defer indefinitely; brand promise is "no telemetry"
7. **Additional formats (HTML, EPUB, XLSX, etc.)** — defer to v1.5+ based on user requests

`[brief: Scope Discipline]`

## 5. User Stories

1. As **Mark**, I want to run `convert document.pdf document.md` so that I get a clean Markdown version of the PDF in <5 seconds.
2. As **Mark**, I want to run `convert data.csv data.json` so that I can pipe the JSON into another tool.
3. As **Mark**, I want the tool to fail gracefully with a clear error when input is malformed, so that I can fix and retry.
4. As **Mark**, I want to install the tool with one command (`brew install <tool>`), so that there's no friction.

## 6. Acceptance Criteria

The MVP is complete when:

- [ ] All 4 conversions work reliably on a test corpus of 20 real-world files (5 per format)
- [ ] Conversion completes in <5 seconds for files <10MB
- [ ] Errors produce clear messages (not stack traces) for the user
- [ ] Tool installs via Homebrew (macOS) with a single command
- [ ] Single binary <20MB
- [ ] All user stories above demonstrably work

## 7. Success Metrics

### Definition of "win"
50 paying users at $5/month within 60 days of launch. `[brief: Success Definition]`

### Leading indicators
- Day-7 retention >40% (≥2 uses in week 1) — target
- HN Show HN reaches >50 points — target

### Lagging indicators
- Try-once → paying conversion >5% — target

### Continue vs kill threshold
- <20 paying at 60 days = pivot or kill `[brief: Success Definition]`
- ≥50 = double down on additional formats + bulk

## 8. Distribution Plan (high level)

Sequential launch:
1. **Day 1:** Twitter launch post + Loom demo video to user's ~3000-follower network `[brief: Users and Distribution]`
2. **Day 3:** Show HN with the demo video and a clean landing page
3. **Day 7:** ProductHunt launch
4. **Ongoing:** Indie Hackers community share, dev newsletter outreach

Distribution edge: user's existing dev audience + the brand promise (no cloud) appeals to a privacy-conscious subset.

## 9. Constraints

- **Time:** 2 weeks (hard) `[brief: Constraints]`
- **Budget:** <$50/month operating, ideally $0
- **Platform:** macOS first; Linux/Windows nice-to-have if Bun cross-compile is trivial
- **Compliance:** None — all local processing
- **Team:** Solo

## 10. Open Questions / Assumptions

- `[assumption]` PDF parsing reliability on diverse real-world PDFs is acceptable with pdf-parse — Architect should validate during week 1.
- `[assumption]` Bun's cross-compilation produces working Linux/Windows binaries — Architect to confirm; nice-to-have not blocking.

## 11. Risks Strategist Wants Architect to Address

- **PDF parsing edge cases.** PDFs are notoriously inconsistent. Mitigation: focus on text-heavy PDFs in MVP; explicitly defer image-heavy / complex-table PDFs.
- **Single-binary distribution.** Bun is new for single-binary builds. Architect should validate the build pipeline early.
- **Cross-platform.** macOS is the priority; Linux + Windows are bonuses if cheap.

## 12. Out of Scope for THIS Document

- Specific tech stack (Architect's `tech-strategy.md`)
- Architecture style
- Implementation milestones (Architect's `scope.md`)
- Marketing copy
- Pricing details (already specified at $5/month — payment provider is Architect's call)

## Sign-off

- Strategist self-check complete: yes
- Critic review pass complete: yes (3 concerns: 2 accepted at finalize, 1 deferred — see `critic-notes.md`)
- Citations verified: yes
- User approved: yes, 2025-09-15T11:25:00Z, "approve"
