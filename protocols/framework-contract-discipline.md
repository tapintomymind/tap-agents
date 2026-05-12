# Framework Contract Discipline Protocol

**Owner:** Org Designer (codification + maintenance). All agents follow.
**Status:** Active 2026-05-06.
**Authority:** Org Designer leakage audit 2026-05-06 — `workspace/_global/org-designer-proposals/20260506-project-leakage-audit.md`.

The framework agent team (TapAgents) is intended to generalize across project types and industries (per user memory `project_team_industry_portability.md`). When framework-level contracts (agents, protocols, templates) embed project-attributable detail — specific stack names, table names, backlog IDs, verbatim user dispatches, project file paths — portability degrades and downstream audiences (a TapAgents reader, a marketing campaign system project, a documentary curation tool) anchor imagination on one stack.

This protocol codifies the discipline that prevents project-leakage from re-accumulating in framework contracts. It complements:

- `protocols/changelog-protocol.md` — scope split between framework and project changelogs
- `protocols/autonomous-ops-permissions.md §6.1` — audit-entry routing by scope
- `protocols/incident-protocol.md` — incident provenance shape

This protocol uniquely owns: **content discipline inside framework agent contracts and templates** (as distinct from changelog scope routing).

---

## §1. Activation Context discipline (A3)

**Rule.** When a planned agent activates (`_planned/<agent>.md` → `agents/<agent>.md`), the active contract's `## Activation Context` section records activation rationale at the **category level**, not at the project-attributable level.

**Category-level information (belongs in the contract):**

- Which stub trigger fired (e.g., "sensitive-data threshold crossed", "user-explicit-request override")
- Pattern this completes (e.g., "three-axis review tier")
- Slash command and template requirements
- One-paragraph rationale linking the activation to the role's mandate

**Project-attributable information (does NOT belong in the contract):**

- Specific table names, schema fields, env-var names from the activating project
- Backlog item IDs (BL-XXX) from the activating project
- Repo paths, file paths, commit SHAs from the activating project
- Verbatim user dispatch text containing the activating project's name

**Where the project-attributable detail lives:**

1. The originating org-designer proposal at `workspace/_global/org-designer-proposals/<date>-<role>.md` — full activation-decision context, gitignored, project-public.
2. `memory/agent-changelog-private.md` — narrative companion entry. Sanitized framework-public version goes to `memory/agent-changelog.md`; full project narrative goes here.

**The contract's Activation Context cites both pointers.** Form: *"Project-attributable evidence: see `agent-changelog-private.md` — \<YYYY-MM-DD\> entry on \<role\> activation. Originating proposal: `workspace/_global/org-designer-proposals/\<file\>`."*

**Footnote pattern (when one-line implementation specifics aid the reader):**

When dropping all implementation specifics would make the activation context too abstract to ground the reader, use a single italicized footnote-style block. Form:

> *Implementation pattern as deployed for the activating Tier 2 project: \<one-paragraph summary of project-attributable evidence\>. Future activations on other projects may surface different specific evidence — the category-level triggers are stable; the implementation evidence is project-attributable.*

The footnote signals to a future reader: "the categorical triggers above are stable; what follows is one project's evidence, not the canonical shape." This pattern was first deployed in the QE contract's `TEST_AUTH_BYPASS` block (`agents/quality-engineer.md`); generalized here as the standard form.

**Anti-pattern:** an Activation Context section that names a specific project's tables, BL-IDs, and verbatim user dispatches as if those facts were properties of the role itself. Example caught by leakage audit 2026-05-06 — see audit findings F5 (UI/UX Reviewer) and F12 (Ops/Security).

---

## §2. Provenance-citation discipline for incident references (A4)

**Rule.** When an agent contract cites a `memory/incidents.md` entry as provenance for a checklist item, pattern flag, or audit-checkpoint requirement, the citation reads as a **date-pointer**, not as a descriptive title that names a specific stack.

**Wrong shape (anchors imagination on one stack):**

> "Provenance: `memory/incidents.md` 2026-05-05 — Scaffold path fails on Vercel serverless"

**Right shape (date-pointer; descriptive title lives in the incident entry itself):**

> "Provenance: `memory/incidents.md` 2026-05-05 entry"

The descriptive title remains in the incident entry's own header (so a reader following the pointer sees the full context). The contract carries only the date — which is the anchor that doesn't drift if the incident entry is later renamed.

**Why this matters.** A contributor reading an agent contract on a non-Vercel stack who sees "Vercel serverless" in mandate-shaping language parses the contract as Vercel-specific even when the underlying lesson generalizes. The date-pointer treats the incident as a citation, not as defining language.

**Applies to:** Architect (`agents/architect.md`), Critic (`agents/critic.md`), QE (`agents/quality-engineer.md`), Ops/Security (`agents/ops-security.md`), and any future agent that codifies cross-project-incident-derived rules.

**Acceptable provenance-with-stack-name:** when the incident IS the stack-coupling (e.g., a Vercel-specific bug whose mitigation only applies on Vercel deployments), the contract may cite the descriptive title — but should additionally annotate "for current-stack deployments; other stacks need equivalent diagnosis."

---

## §3. Stack-specific examples are illustrative, not binding (A5)

**Rule.** Agent contracts that name stack-specific examples (Next.js, Vercel, Playwright, Drizzle, Slack Bolt, AWS Lambda, etc.) frame them explicitly as "current-stack examples; other stacks derive equivalents." The framing is a single sentence per such block.

**Wrong shape (anchors mandate to one stack):**

> "**Known-bad patterns checklist** — OWASP Top 10 + framework-specific gotchas (Next.js Server Actions auth, Vercel env-var scoping, Drizzle SQL injection surface)"

**Right shape (illustrative-by-example with portability framing):**

> "**Known-bad patterns checklist** — OWASP Top 10 + framework-specific gotchas. Current-stack examples: Next.js Server Actions auth, Vercel env-var scoping, Drizzle SQL injection surface. For other stacks (Slack Bolt, AWS Lambda, Rails, etc.), derive equivalent gotcha lists; the checklist structure (OWASP + stack-specific gotchas) is generalizable."

**Applies to:**

- `agents/architect.md` (runtime-deps audit checklist)
- `agents/critic.md` (tech-strategy pattern flags citing seed incidents)
- `agents/quality-engineer.md` (`TEST_AUTH_BYPASS` pattern, smoke-test recipes)
- `agents/ui-ux-reviewer.md` (Playwright runner)
- `agents/ops-security.md` (known-bad patterns checklist; framework-specific gotchas)
- `templates/design-spec.md §7` (default-coverage routes)
- `templates/threat-model.md` (when created)
- Other framework templates with stack-coupled scaffolding

**Convention:** when a single block is genuinely Vercel/Next.js/Playwright-only and refactoring to portability would require a stack-equivalents block that doesn't yet have evidence (no second project on a different stack has used it), keep the current-stack example AND annotate: "current-stack-only; will generalize when a second-stack project surfaces equivalents." The annotation is the forcing function for future portability work.

---

## §4. Quarterly leakage audit cadence (A6 reconciliation)

**Rule (calibration-phase cadence).** Org Designer runs the project-leakage audit **monthly** while the workspace runs a single high-traffic project. Audit output goes to `workspace/_global/org-designer-proposals/<date>-project-leakage-audit.md`. Findings classified per the BLEED-BLOCKING / WARNING / FYI taxonomy from the founding audit.

**Cadence relax-trigger.** Cadence relaxes to **quarterly** when one of:

- (a) **Second-project trigger.** A second active project ships its first artifact (i.e., the workspace has cross-project surface area pulling the framework toward generalization).
- (b) **Two-clean-cycles trigger.** Two consecutive monthly audits return zero BLEED-BLOCKING and ≤2 BLEED-WARNING findings (i.e., the team has internalized the discipline; cadence can ease).

The relax-trigger is observable, not subjective. Either condition fires the cadence change; both are recorded in the audit log.

**EA surfaces audit findings in the next briefing under TEAM HEALTH.** User reviews; Org Designer dispatches surgery per the audit's recommendation.

**Why monthly during single-project phase.** The 2026-05-06 audit observed a velocity of 5 BLEED-BLOCKING entries accumulated in 3 days of high-traffic single-project work. Quarterly is too slow for that velocity — accumulated bleed crystallizes into framework contracts faster than quarterly review can catch. Monthly during single-project phase; quarterly when the second project's pull toward generalization makes monthly redundant.

---

## §5. Scope reminder (what this protocol is NOT)

This protocol governs **content discipline inside framework contracts**. It does not duplicate:

- `protocols/changelog-protocol.md` — that protocol owns CHANGELOG file scope routing.
- `protocols/autonomous-ops-permissions.md §6.1` — that protocol owns audit-entry destination routing.
- `protocols/incident-protocol.md` — that protocol owns incident-entry shape.
- `protocols/session-coordination-protocol.md` — that protocol owns inter-session coordination.

The contract-discipline rules in §1–§3 above apply when *writing or editing framework contracts*. The cadence rule in §4 applies to Org Designer's recurring audit. The pieces interlock; none replaces the others.

---

## §6. Cross-references

- Founding audit: `workspace/_global/org-designer-proposals/20260506-project-leakage-audit.md`
- Round 2 amendment + execution: same file §8 ("Round 2 Amendments")
- Atomic-cadence rule: `~/.claude/projects/.../memory/feedback_changelog_proactive.md`
- Industry portability: `~/.claude/projects/.../memory/project_team_industry_portability.md`
- Changelog scope split: `protocols/changelog-protocol.md`
- Audit-entry routing: `protocols/autonomous-ops-permissions.md §6.1.1`
- Org Designer cadence: `agents/org-designer.md` (Quarterly Review section)

---

*This protocol is binding for framework-level contract authoring and editing. Producer agents check their edits against §1–§3 before commit. Critic includes the rules as adversarial-review checks for framework-contract changes. Org Designer runs the recurring audit per §4 cadence and proposes contract-discipline updates to this protocol when new patterns surface.*
