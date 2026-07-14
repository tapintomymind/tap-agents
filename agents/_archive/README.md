# Archive — superseded stubs and retired agents

This directory holds agent files that are no longer live but are preserved for historical reference. Source of truth for activation history is `memory/agent-changelog.md`; this archive is the file-level companion.

## What lands here

- **Promoted stubs** — a `_planned/` stub whose live counterpart is now active in `agents/`. The stub is retained so that the original activation rationale and provisional-contract shape stay readable. (Example: `ops-security-promoted-2026-05-06.md`.)
- **Superseded stubs** — a `_planned/` stub whose role was reshaped, renamed, or absorbed into another agent before activation. (Example: `quality-engineer-superseded-2026-05-06.md`.)
- **Retired agents** — a live `agents/` file whose role was retired (consolidated, replaced, or scope-deprecated). The file is kept for historical reference; the changelog explains why.

## Naming convention — `rename-on-move`

Files are renamed when they move into this directory, not left in place as tombstones. The filename encodes the reason and the date:

```
<role>-<reason>-YYYY-MM-DD.md
```

Where `<reason>` is one of:

- `promoted` — stub moved to active; archive retains the original stub
- `superseded` — stub replaced by a reshaped role
- `retired` — live agent no longer fires

Examples:

- `ops-security-promoted-2026-05-06.md`
- `quality-engineer-superseded-2026-05-06.md`
- `designer-retired-YYYY-MM-DD.md` (hypothetical)

**Why rename-on-move, not in-place tombstone:** the source-of-truth filename should reflect the file's current status. A reader who finds `_planned/ops-security.md` and reads "PROMOTED 2026-05-06" header has to do extra work to find the live file; a reader who finds `_archive/ops-security-promoted-2026-05-06.md` knows immediately that this is an artifact, that promotion happened on that date, and that the live file is at the conventional `agents/<role>.md` path.

**The rename-on-move doctrine is now mechanically supported.** The SemVer severity floor (`protocols/versioning-protocol.md §4.2` invariant 3) is keyed on the **consumer-visible active-agent surface** — top-level `agents/*.md` — not the raw `agents/**` file tree. A move confined to the non-active sub-namespaces (`_planned/ → _archive/` promotion or supersession) therefore does not floor the release at MAJOR — on its own such a move carries a **PATCH** floor (it is non-breaking; the floor is a *floor*, so the author may still classify higher), so a stub can be archive-moved on its promotion release without burning a spurious major bump. Removing or **renaming a live top-level agent** (including demoting one into `_planned/`/`_archive/`) still crosses off the active surface and remains MAJOR-floored. This removes the earlier friction that forced the one-time "retain-in-place PROMOTED marker" deviation; promotions can now use the true `rename-on-move` to `_archive/`.

## What does NOT land here

- Proposals (live, landed, or rejected) — those live under `_planned/_proposals/` and `_planned/_proposals/_landed/` for stub-related proposals, or `workspace/_global/org-designer-proposals/` for cross-cutting proposals.
- Drafts in progress — those stay in `_planned/`.
- Memory entries — `memory/agent-changelog.md` is the cross-cut history; this directory is only the file-level mirror.

## Updating references on move

When a file moves into `_archive/`, scan for live references to the old path and update them in the same dispatch. Historical workspace artifacts (project-specific files under `workspace/<slug>/`) and historical changelog narratives may keep the old paths — they describe what was true at the time. Live agent contracts, README files, and templates must point at the current location.
