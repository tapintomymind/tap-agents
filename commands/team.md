---
name: team
description: Start new work with the team. Pass an idea/seed in any form — Intake takes it from there and engages the team via Conductor.
---

# /team

Start new work with the Claude Team. Pass any seed — a sentence, a paragraph, a half-baked idea.

## Usage

```
/team <your idea or seed>
/team <path/to/spec.md>             # spec-file mode
/team <path/to/openapi.yaml>        # spec-file mode
/team <path/to/brief.txt>           # spec-file mode
```

**Spec-file mode:** If you pass a file path (`.md`, `.json`, `.yaml`, `.txt`, `.openapi`), Intake reads the file as the seed. Intake cross-references against the 8 dimensions and only asks about gaps — much faster than re-extracting what's already on paper.

**Conversational mode (default):** If you pass text, Intake interviews you from scratch.

## What Happens

1. **Intake** captures your seed verbatim to `workspace/<slug>/seed.md`
2. **Intake** asks hard-hitting questions to fill the 8-dimension brief
3. **Intake** writes `intake-brief.md` and asks you to confirm
4. **You approve** → Conductor advances to `briefed`
5. **Strategist + Critic** work in parallel on the PRD
6. **You approve PRD** → Conductor advances to `prd-ok`
7. **Architect + Critic** work in parallel on scope + tech-strategy
8. **You approve plan** → Conductor advances to `planned`
9. **You confirm "go"** → Architect scaffolds Tier 2 in target repo
10. **Tier 2 takes over** to actually build
11. **EA reports back** when MVP ships

You only see hard checkpoints (5 in pipeline) and any blockers/contradictions. Everything else runs automatically.

## Examples

```
/team I want to build a music discovery site that creates Spotify playlists for emerging trends
/team rebuild <project>'s onboarding to be SaaS-flavored with multi-tenant
/team make a CLI for managing my morning routine
/team ./specs/draft-prd.md
/team ./api-spec.yaml
```

## See Also

- `/intake` — direct invocation of Intake without preamble
- `/status` — what's happening across all projects
- `/queue` — decisions waiting on you
