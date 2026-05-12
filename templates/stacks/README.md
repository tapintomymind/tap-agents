# Stack Templates

This directory holds Tier 2 agent templates organized by tech stack. When Architect picks a stack for a project, it generates the project's Tier 2 agents from the matching template here.

## Structure

```
templates/stacks/
├── README.md (this file)
├── nextjs/
│   ├── tier2-conductor.md
│   ├── nextjs-architect.md
│   ├── react-component-agent.md
│   ├── drizzle-postgres-agent.md
│   └── deployment-agent.md
├── swift-ios/
│   ├── tier2-conductor.md
│   ├── swift-architect.md
│   ├── swiftui-agent.md
│   └── deployment-agent.md
├── rails/
│   └── ...
└── python-fastapi/
    └── ...
```

## How Templates Get Created

Templates are not pre-populated. They're written **on demand** the first time Architect picks a stack with no existing template:

1. Architect picks stack X for a project
2. Architect checks `templates/stacks/X/` — empty
3. Architect generates a baseline Tier 2 set (conductor + generic implementer) for the project
4. Architect logs to `memory/agent-changelog-private.md`: "first project on stack X — needs template"
5. Org Designer reviews next time it runs and proposes promoting baseline → reusable template

## Template File Conventions

Each `templates/stacks/<stack>/` directory should include at minimum:
- `tier2-conductor.md` — project-scoped state machine
- `<stack>-architect.md` — implementation-level architecture decisions
- `deployment-agent.md` — release / deploy

Optional based on stack needs:
- Component / UI agent
- Database agent
- API agent
- Background-job agent

## Naming

Use lowercase, hyphenated stack names matching what Architect specifies in `tech-strategy.md`:
- `nextjs` (not `next-js`, `Next.js`)
- `swift-ios` (not `iOS`, `swift`)
- `python-fastapi` (not `python`, `fastapi`)

## Reserved for First Real Stack Need

This directory is intentionally minimal at v1. The first project that picks a stack will trigger the first template's creation, organically.
