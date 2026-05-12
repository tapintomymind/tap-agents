# Tech Strategy — Tools CLI (example)

**Date:** 2025-09-15T12:15:00Z
**Author:** Architect
**Source PRD:** `workspace/example-tools-cli/prd.md`
**Source scope:** `workspace/example-tools-cli/scope.md`
**Status:** approved
**Approved at:** 2025-09-15T12:35:00Z, "ship it"

---

## 1. Stack Pick

| Layer | Technology | Reasoning |
|---|---|---|
| Runtime | Bun (latest stable) | Single-binary build is the brand promise; Bun is the cleanest path in 2025 `[memory/stack-preferences.md: CLI tool default]` `[research https://bun.sh/docs/bundler/executables]` |
| Language | TypeScript | Standard for Bun; type safety helps with file-format edge cases `[inference]` |
| PDF lib | pdf-parse | Mature, single-purpose, good text extraction `[research https://www.npmjs.com/package/pdf-parse]` |
| DOCX lib | mammoth | De facto standard for DOCX → semantic output `[research https://www.npmjs.com/package/mammoth]` |
| CSV lib | papaparse | Industry standard, well-documented `[research https://www.papaparse.com/]` |
| JSON | native | No library needed |
| Distribution | Homebrew (macOS) + direct download | Standard for indie CLI tools; ProductHunt audience expects brew install `[memory/patterns.md: indie devs install via brew]` |
| Hosting | None — local CLI | No backend |
| Telemetry | None | Brand promise: no telemetry `[brief: Decision Rights non-negotiables]` |
| Payments | Lemonsqueezy | For v1.5 monetization; not in v1 scope `[brief: Constraints]` |

`[prd §9 constraints]` `[brief: Technical Assumptions]`

## 2. Architecture Style

**Monolith CLI binary.** Single entry point, dispatch table for format combos, per-format parser modules.

**Why:** Solo build, single executable, no service boundaries needed. Anything more (microservices, plugin architecture) violates YAGNI.

**Anti-pattern to avoid:** Plugin architecture for "future formats." Defer until 5+ formats prove plugin pattern is justified. Hard-coded dispatch is fine for 4.

## 3. Riskiest Technical Bets

### Risk 1: Bun single-binary build reliability across formats
- **Severity:** high
- **First exercised at:** Milestone 1
- **What breaks if it doesn't work:** Brand promise broken; would need to ship as Node binary which doubles install friction
- **Mitigation:** Validate on Day 1 with the trivial CSV/JSON converter
- **Detection:** `bun build --compile` on macOS — if it produces a working binary, we're good

### Risk 2: PDF parsing reliability on real-world inputs
- **Severity:** high
- **First exercised at:** Milestone 3
- **What breaks if it doesn't work:** PDF → MD is a flagship conversion; if it's unreliable, demo video is hard to make
- **Mitigation:** Build test corpus of 20 real PDFs early; explicit graceful-fallback on image-heavy PDFs
- **Detection:** Run test corpus on Day 8; if >50% fail, switch library or scope down

### Risk 3: Homebrew formula approval timeline
- **Severity:** medium
- **First exercised at:** Milestone 3
- **What breaks if it doesn't work:** Have to use direct download (still works, less polish)
- **Mitigation:** Submit early; have direct-download fallback ready
- **Detection:** Homebrew PR turnaround typically 1-3 days

## 4. Data Model (high level)

No persistent data. Pure transformation:
```
Input file (bytes) → Parser → Intermediate AST → Serializer → Output file (bytes)
```

## 5. External Dependencies

| Dependency | Version | Access required | Cost (est.) | License compatibility |
|---|---|---|---|---|
| Bun | ^1.x | None (npm-style install) | Free | MIT — compatible |
| pdf-parse | ^1.x | None | Free | MIT — compatible |
| mammoth | ^1.x | None | Free | BSD-2 — compatible |
| papaparse | ^5.x | None | Free | MIT — compatible |

`[research https://github.com/oven-sh/bun/blob/main/LICENSE]` etc.

## 6. Defaults Tier 2 May Adjust

Tier 2 has authority to swap:
- Specific test framework
- Code style / linting setup
- File structure within `src/`

Tier 2 must escalate before changing:
- Top-level stack (Bun → Node, etc.)
- Architecture style (monolith → plugin)
- Adding/removing external dependencies
- Distribution mechanism

## 7. Tier 2 Agent Set (to be generated)

Generated from `templates/stacks/bun-cli/` (will need to create — first time using this stack):

- `tier2-conductor.md` — project state machine
- `bun-cli-architect.md` — implementation-level architecture
- `parser-agent.md` — per-format parser implementations
- `deployment-agent.md` — Homebrew formula + distribution

Note: First project on `bun-cli` stack — needs template. Architect generated baseline; logged in `memory/agent-changelog-private.md` as needing codification.

## 8. Open Questions

- PDF library final choice (pdf-parse vs pdfjs) — Tier 2 evaluates in Milestone 3
- Cross-compilation for Linux/Windows — try after macOS works; not blocking

## 9. Out of Scope for THIS Document

- Implementation patterns within Bun (Tier 2)
- File structure (Tier 2)
- Specific test cases (Tier 2)

## Sign-off

- Architect self-check: yes
- Critic review pass: yes (no blocking concerns)
- Citations verified: yes
- Stack pick justified vs `memory/stack-preferences.md`: yes
- User approved: yes, 2025-09-15T12:35:00Z, "ship it"
