# Changelog Protocol

**Owner:** Org Designer (codification + maintenance). All agents follow.
**Status:** Active 2026-05-06.

The team operates two distinct changelogs at distinct scopes. They are **not** redundant — they answer different questions and have different audiences. This protocol fixes the scope split so updates don't drift into the wrong file or duplicate across both.

---

## 1. Framework changelog — `.claude/memory/agent-changelog.md`

**Location.** Framework root: `App Development/.claude/memory/agent-changelog.md`.

**Scope.** Team-shape changes that span projects.

**What lands here:**
- New agents activated (live or stub-promotion)
- Existing agents split, merged, or retired
- Agent prompt updates that materially change mandate, fire conditions, or authority
- Protocol updates (`.claude/protocols/*.md`)
- Framework-level template changes (`.claude/templates/*.md` and stack templates)
- Memory structure changes (new memory files, append-only protocol changes, taxonomy changes)
- Cross-project lessons codified into framework defaults

**Format.** Narrative entry per change, dated. Public-safe — no project-specific business detail, no user identity, no credentials. Each entry: trigger, what changed, why, cross-references. Append above prior entries (newest at top, after the header).

**Audience.** Anyone reading the framework — future contributors, audit, governance, the user when reviewing team evolution.

---

## 2. Project changelog — `<project>/.claude/memory/agent-changelog.md`

**Location.** Project root: e.g., `agent-dashboard/.claude/memory/agent-changelog.md`. One per project that has its own `.claude/` directory.

**Scope.** Project-scoped agent activity.

**What lands here:**
- Which agents fired in this project
- What artifacts they produced (smoke-report v2, design-review.md pass 3, security-audit final, etc.)
- Project-specific outcomes (e.g., "QE produced smoke-report v2 for agent-dashboard 2026-05-06 — 8 P1 backlog entries filed")
- Project-side consequences of framework changes (e.g., "v1.5 Phase 0 init landed in dashboard scaffold-source")
- Project-specific risk acknowledgments, deviation rationale, and lessons that apply only here

**Format.** Chronological log of project-internal events. Newest at top. Cross-reference framework changelog by anchor or section title where a framework change has project consequences.

**Audience.** Anyone working in this project — Tier 2 implementers, QE running regressions, the user when reviewing project history.

---

## 3. Both files updated when

A team-shape change has project-specific consequences. Examples:
- A new agent activates AND immediately produces an artifact for project X. Framework changelog records the activation; project changelog records the artifact production with cross-reference back to the framework entry.
- A framework template changes AND project X is the first to consume the new format. Framework records the template change; project records the consumption with the file path that adopted it.
- A protocol update lands AND project X had to reconcile prior artifacts with the new protocol. Framework records the protocol change; project records the reconciliation work.

In all such cases, the entries are atomic — same date, cross-referenced, both committed in the same logical unit per the user's `feedback_changelog_proactive.md` rule.

---

## 4. Private companion — `agent-changelog-private.md`

Both scopes have an optional private companion:
- Framework: `.claude/memory/agent-changelog-private.md`
- Project: `<project>/.claude/memory/agent-changelog-private.md` (create when first private entry is needed)

Same scope rules as their public siblings, but for content not safe to publicize: project-specific business detail, user-identifiable narrative, sensitive failure modes, internal disagreements that shouldn't be public-archived.

When in doubt, write the public entry first with sanitized detail; mirror to private with full detail. The private file is local-only and not synced to remotes that would publicize it.

---

## 5. Root `CHANGELOG.md` (`.claude/CHANGELOG.md`)

This is **not** a third changelog at the same scope. It's a versioned semver-style technical log following [Common Changelog](https://common-changelog.org/) format. Used for framework releases (v0.5.0, v0.5.1, etc.) — coarse-grained version bumps that bundle narrative agent-changelog entries into a release.

**Relationship.** `.claude/CHANGELOG.md` cites `.claude/memory/agent-changelog.md` entries as detail. Don't duplicate prose; cite the anchor.

---

## 6. Atomic-cadence rule

Per user memory `feedback_changelog_proactive.md`:

> Changelog updates are proactive — update CHANGELOG.md + memory/agent-changelog.md in the same atomic unit as the change, not as follow-up.

Operationalization for agents:
- When you land a structural change, update the appropriate changelog(s) in the **same** turn / commit / PR — not a deferred sweep.
- If your change spans both scopes (per §3), update both files in the same atomic unit. Do not split.
- If the change warrants a version bump in `.claude/CHANGELOG.md`, bump it in the same atomic unit.

Failure mode caught by this protocol: agents writing files but forgetting changelog updates, then later sweep-passes losing the why-context. Atomic-cadence is the mitigation.

---

## 7. Migration note

Pre-2026-05-06, scope between framework and project changelogs was implicit, leading to occasional drift (entries appearing in only one file when they belonged in both). This protocol codifies the split. New entries follow this protocol going forward.

### 7.1 Retroactive migration of pre-protocol BLEED-BLOCKING entries

Entries pre-dating this protocol that exhibit BLEED-BLOCKING scope violation per Org Designer audit are migrated retroactively. The audit log is `workspace/_global/org-designer-proposals/20260506-project-leakage-audit.md`. Migrations are atomic — entry moves from one file to another in the same commit; the original location notes the move via the breadcrumb format below.

### 7.2 Migration breadcrumb format

When a migrated entry's body moves to private (`agent-changelog-private.md`) or to a project changelog (`<project>/.claude/CHANGELOG.md`), the public residue includes a one-line pointer of the form:

> `Full project narrative: see <destination> — <YYYY-MM-DD> entry on <topic>.`

The pointer preserves the version slot (`## [0.x.y] — YYYY-MM-DD`) and date so neighbor cross-references continue to resolve. The framework-public residue in the original file is the section header + a brief framework-portable summary (the lessons that generalize) + the breadcrumb sentence. The full project-attributable narrative lives at the destination.

### 7.3 Cross-reference preservation policy

Cross-references from neighbor entries (e.g., `v0.5.1 → v0.4.7`; `v0.5.2 → v0.5.1`) are NOT rewritten as part of the migration. They remain valid pointers to the migrated entry's residual framework-public anchor (the breadcrumb sentence + the version stamp). This avoids cascading edits across the file and preserves the historical narrative shape.

A reader following a cross-reference into a migrated entry sees: the version slot intact, the framework-portable summary, the breadcrumb pointing at the full narrative's new home. They can follow the breadcrumb if they need the full narrative; otherwise the framework-public summary answers the cross-reference.
