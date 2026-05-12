# Handoff Package — Tools CLI (example)

**From:** Tier 1 HQ (`App Development/.claude/`)
**To:** Tier 2 (`/Users/example/Desktop/tools-cli/.claude/`)
**Generated:** 2025-09-15T12:50:00Z
**Architect:** architect agent
**Project slug:** example-tools-cli
**Approved at planned → scaffold checkpoint:** 2025-09-15T12:35:00Z, "ship it"

---

## 1. Source Artifacts

### 1.1 PRD
*See `workspace/_examples/example-project/prd.md` (in real handoffs, full PRD contents are embedded here)*

### 1.2 Scope
*See `workspace/_examples/example-project/scope.md`*

### 1.3 Tech Strategy
*See `workspace/_examples/example-project/tech-strategy.md`*

### 1.4 Brief Excerpts
- **Constraints:** 2 weeks hard, solo, macOS first, no compliance
- **Technical Assumptions:** PDF parsing is riskiest bet; no API/cloud needed
- **Open Questions:** None at brief time

---

## 2. Decision Context

### 2.1 Riskiest technical bets
- **Bun single-binary build cross-platform:** validate macOS first; ship macOS-only if cross-compile fails
- **PDF parsing reliability:** test corpus of 20 real PDFs; explicit graceful-fallback on image-heavy
- **Homebrew formula approval:** submit early; direct-download fallback ready

### 2.2 MVP cuts (do NOT re-add without Tier 1 approval)
- Bulk operations
- Presets / configuration
- History tracking
- GUI
- Auth / cloud sync
- Telemetry / auto-update
- Additional formats beyond the 4 in scope

### 2.3 Open questions deferred to Tier 2
- PDF library: pdf-parse vs pdfjs (Tier 2 evaluates in Milestone 3)
- Test corpus source
- Landing page: HTML/CSS only or Astro

### 2.4 Critic flags addressed and deferred
- "Milestone 4 polish phase is loose" — accepted as warning, user override logged

### 2.5 Dissent log notes
- User accepted Milestone 4 looseness; will revisit at shipped phase

---

## 3. Tier 2 Reportback Contract

Tier 2 MUST report:
- MVP shipped (with live URL)
- Major scope deviation
- Blocked >24h
- Risk realized
- Decision needed from Tier 1
- Promotion request

Format: see `protocols/reportback-protocol.md` (embedded in the real handoff package).

---

## 4. Tier 2 Agent Specifications

Generated for stack `bun-cli` (first project on this stack — baseline set, template needs codification):

- `tier2-conductor.md` — project state machine
- `bun-cli-architect.md` — implementation-level architecture
- `parser-agent.md` — per-format parser implementations
- `deployment-agent.md` — Homebrew formula + distribution

*Note in `memory/agent-changelog-private.md`: First `bun-cli` project — needs template codification by Org Designer.*

---

## 5. Memory Pointers

Tier 2 has READ-ONLY access to:
`/Users/example/App Development/.claude/memory/`

Useful files:
- `memory/stack-preferences.md` — Architect cited CLI tool defaults
- `memory/lessons-learned.md` — none relevant yet (first example project)
- `memory/patterns.md` — none relevant yet

---

## 6. Initial Tier 2 State

```json
{
  "tier1_project_slug": "example-tools-cli",
  "tier1_workspace_path": "/Users/example/.../workspace/example-tools-cli/",
  "tier1_handoff_package_path": "/Users/example/.../workspace/example-tools-cli/handoff-package.md",
  "current_phase": "tier2-initialization",
  "handoff_received_at": "2025-09-15T12:50:00Z",
  "stack": "bun-cli",
  "milestones": [
    "Single-binary build pipeline + JSON/CSV (3d)",
    "DOCX → MD (3d)",
    "PDF → MD + Distribution (4d)",
    "Polish + Launch Prep (4d)"
  ],
  "current_milestone": null,
  "blocked_on": null,
  "reportback_path": "/Users/example/Desktop/tools-cli/.claude/reportback.md"
}
```

---

## 7. Verification Checklist

- [x] Target `.claude/` directory exists and is non-empty
- [x] handoff-package.md exists at both Tier 1 workspace AND Tier 2 location
- [x] reportback.md exists at registered path
- [x] All Tier 2 agent files non-empty
- [x] Test write to reportback.md succeeds

---

## Sign-off

- Architect generated package: yes
- Cross-checked vs PRD/scope/tech-strategy: yes
- User approved at scaffold checkpoint: yes, 2025-09-15T12:35:00Z, "ship it"
- Verification checklist passed: yes
