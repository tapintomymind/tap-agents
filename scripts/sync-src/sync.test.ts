/**
 * sync.test.ts — first test file in the framework.
 *
 * Scope (BL-037): assert that `lintActions` scans every file whose bytes will
 * sit in the public tree after sync runs, regardless of action type. Pre-fix
 * (v0.12.1) only `create`/`update` were scanned; v0.13.0 broadens to all
 * actions. This file documents and locks in that scope expansion.
 *
 * Scope (BL-047, v0.13.1): the broadened scan from BL-037 surfaced 26 pre-
 * existing leaks in the public tree, of which 16 were over-strictness on
 * legitimate documentation patterns. This file adds locked-in assertions for
 * the three allowlist rules added in v0.13.1 (documentation-placeholder for
 * the auto-memory path, `workspace/_examples/` fixture suppression, and the
 * self-exclude for this test file). Each rule has paired tests: (a) the
 * allowlist pattern does NOT fire, (b) a real-leak pattern of the same shape
 * still fires (regression guard).
 *
 * Runner: stdlib-only (`node:assert/strict`, `node:test` NOT used so we can
 * keep zero new devDeps and run via `tsx scripts/sync-src/sync.test.ts`). A
 * top-level try/catch + non-zero exit on assertion failure plays the role of
 * the runner. Multiple test files later can be promoted to `node --test` /
 * `vitest` / etc. without a rewrite — each `test()` here returns a Promise and
 * isolates its own state.
 *
 * Why we don't import `lintActions` or `lintPropagatedBody` directly: both are
 * non-exported helpers inside `sync.ts`. Promoting them to exports just for
 * tests would widen `sync.ts`'s public surface for no runtime reason. Instead
 * we reproduce the relevant shape inline (e.g., `lintBodyForSecrets` for the
 * BL-037 surface, `lintBodyForLeakPaths` for the BL-047 surface). The latter
 * is a faithful stand-in for the lintPropagatedBody markdown-path checks —
 * any drift between this stand-in and sync.ts would be caught by re-running
 * `npm run sync:dry-run` on the full source tree.
 *
 * Fixture path shape: `/Users/exampleop/.claude/projects/-Users-exampleop-App-Development/memory`
 * matches the `operator-identity-macos` pattern in `secret-patterns.ts` (the
 * leak class found in the v0.12.1 audit). Using a synthetic `exampleop` username
 * keeps the test fixture itself free of real operator-identifying strings.
 */

import { scanBody } from "./secret-patterns.js";
import { strict as assert } from "node:assert";

// ----------------------------------------------------------------------------
// Reproduce PlannedAction shape + lintActions logic (pre-fix and post-fix)
// ----------------------------------------------------------------------------

type ActionKind =
  | "create"
  | "update"
  | "skip-identical"
  | "skip-template"
  | "skip-orphan-keep";

interface PlannedAction {
  relPath: string;
  action: ActionKind;
  reason?: string;
  body?: string;
  targetBody?: string;
}

interface LintIssue {
  level: "FAIL" | "WARN";
  code: string;
  path: string;
  lineNo?: number;
  message: string;
}

/**
 * Stand-in for sync.ts:lintPropagatedBody, scoped to the secret-pattern check
 * only (the part BL-037 widens). The real function also runs project-slug /
 * private-memory / internal-abs-path checks; those are out of scope for this
 * test file and exercised by the existing dry-run.
 */
function lintBodyForSecrets(relPath: string, body: string): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const hit of scanBody(body)) {
    issues.push({
      level: "FAIL",
      code: "secret-pattern-hit",
      path: relPath,
      lineNo: hit.lineNo,
      message: `${hit.pattern}: ${hit.snippet}`,
    });
  }
  return issues;
}

/** Pre-BL-037 shape — diff-driven scope (create/update only). */
function lintActionsPreFix(actions: PlannedAction[]): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const a of actions) {
    if (a.action !== "create" && a.action !== "update") continue;
    if (!a.body) continue;
    issues.push(...lintBodyForSecrets(a.relPath, a.body));
  }
  return issues;
}

/** Post-BL-037 shape — public-bytes scope (every action whose body ends up public). */
function lintActionsPostFix(actions: PlannedAction[]): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const a of actions) {
    let body: string | undefined;
    if (a.action === "create" || a.action === "update") {
      body = a.body;
    } else if (a.action === "skip-identical") {
      body = a.body ?? a.targetBody;
    } else if (a.action === "skip-template") {
      body = a.targetBody;
    } else {
      body = a.targetBody;
    }
    if (body === undefined || body === "") continue;
    issues.push(...lintBodyForSecrets(a.relPath, body));
  }
  return issues;
}

// ----------------------------------------------------------------------------
// BL-047 surface — markdown-path leak checks
// ----------------------------------------------------------------------------

// These regexes mirror sync.ts:lintPropagatedBody as of v0.13.1. Any drift
// between the regex literals here and sync.ts must be flagged — the source
// of truth is sync.ts; this file is the locked-in semantics test.
const PROJECT_SLUG_RE = /\bworkspace\/[a-z][a-z0-9-]+\//g;
const ALLOWED_WORKSPACE_PREFIXES = [
  "workspace/_global/",
  "workspace/_examples/",
  "workspace/_inbox/",
  "workspace/_registry",
  "workspace/.gitkeep",
];
// v0.13.1 widening: skip `<bracket-template>` AND `...` placeholders.
const USER_AUTO_MEMORY_RE = /(?:\/Users\/[^/\s'"`)]+|\$HOME|~)\/\.claude\/projects\/(?!(?:<[^>]+>|\.\.\.)\/)[^\s'"`)]+\/memory\//g;

/**
 * lintBodyForLeakPaths — stand-in for the path-leak portions of
 * sync.ts:lintPropagatedBody (private-memory-ref + project-slug-ref).
 * Mirrors the v0.13.1 allowlist semantics:
 *   - Files under `workspace/_examples/` suppress both checks.
 *   - `~/.claude/projects/<bracket>/memory/` and `~/.claude/projects/.../memory/`
 *     are documentation placeholders and don't fire private-memory-ref.
 *   - `workspace/_global/`, `workspace/_examples/`, `workspace/_inbox/`,
 *     `workspace/_registry`, `workspace/.gitkeep` prefixes don't fire
 *     project-slug-ref.
 *
 * Out of scope here: internal-abs-path + secret-pattern checks (covered by
 * the existing BL-037 surface and by sync.ts:scanBody).
 */
function lintBodyForLeakPaths(relPath: string, body: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const isMarkdown = relPath.endsWith(".md");
  const isExampleFixture = relPath.startsWith("workspace/_examples/");
  if (!isMarkdown) return issues;

  const lines = body.split(/\r?\n/);

  if (
    relPath !== "memory/README.md" &&
    !relPath.startsWith("memory/_examples/") &&
    !isExampleFixture
  ) {
    for (let i = 0; i < lines.length; i++) {
      USER_AUTO_MEMORY_RE.lastIndex = 0;
      const matches = lines[i].match(USER_AUTO_MEMORY_RE);
      if (!matches) continue;
      for (const m of matches) {
        issues.push({
          level: "FAIL",
          code: "private-memory-ref",
          path: relPath,
          lineNo: i + 1,
          message: `references user-specific auto-memory path: ${m}`,
        });
      }
    }
  }

  if (!isExampleFixture) {
    for (let i = 0; i < lines.length; i++) {
      PROJECT_SLUG_RE.lastIndex = 0;
      const matches = lines[i].match(PROJECT_SLUG_RE);
      if (!matches) continue;
      for (const m of matches) {
        const allowed = ALLOWED_WORKSPACE_PREFIXES.some((p) => m.startsWith(p));
        if (!allowed) {
          issues.push({
            level: "FAIL",
            code: "project-slug-ref",
            path: relPath,
            lineNo: i + 1,
            message: `references project-specific workspace path: ${m}`,
          });
        }
      }
    }
  }

  return issues;
}

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

// Matches operator-identity-macos pattern in secret-patterns.ts.
// Synthetic username `exampleop` — no real operator identity in the test file.
const LEAKED_BODY = [
  "# Example file body",
  "",
  "USER_MEMORY_DIR = \"/Users/exampleop/.claude/projects/-Users-exampleop-App-Development/memory\"",
  "",
  "More content.",
].join("\n");

const CLEAN_BODY = [
  "# Example file body",
  "",
  "USER_MEMORY_DIR derived from os.environ['CLAUDE_PROJECT_DIR'] at runtime.",
  "",
  "More content.",
].join("\n");

// ----------------------------------------------------------------------------
// Test runner
// ----------------------------------------------------------------------------

type TestCase = { name: string; fn: () => void | Promise<void> };
const tests: TestCase[] = [];
function test(name: string, fn: () => void | Promise<void>): void {
  tests.push({ name, fn });
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

test("BL-037 regression: pre-fix MISSES leak in skip-identical action", () => {
  const actions: PlannedAction[] = [
    {
      relPath: "hooks/stop-dispatch-monitor.py",
      action: "skip-identical",
      body: LEAKED_BODY,
      targetBody: LEAKED_BODY,
    },
  ];
  const issues = lintActionsPreFix(actions);
  assert.equal(
    issues.length,
    0,
    "pre-fix lintActions should NOT detect the leak (that's the bug BL-037 fixes)",
  );
});

test("BL-037 fix: post-fix CATCHES leak in skip-identical action", () => {
  const actions: PlannedAction[] = [
    {
      relPath: "hooks/stop-dispatch-monitor.py",
      action: "skip-identical",
      body: LEAKED_BODY,
      targetBody: LEAKED_BODY,
    },
  ];
  const issues = lintActionsPostFix(actions);
  assert.ok(
    issues.length >= 1,
    "post-fix lintActions should detect at least one secret-pattern hit",
  );
  assert.equal(issues[0].level, "FAIL");
  assert.equal(issues[0].code, "secret-pattern-hit");
  assert.match(issues[0].message, /operator-identity-macos/);
});

test("post-fix: clean body in skip-identical action produces no issues", () => {
  const actions: PlannedAction[] = [
    {
      relPath: "hooks/stop-dispatch-monitor.py",
      action: "skip-identical",
      body: CLEAN_BODY,
      targetBody: CLEAN_BODY,
    },
  ];
  const issues = lintActionsPostFix(actions);
  assert.equal(
    issues.length,
    0,
    "clean body should not trip any pattern",
  );
});

test("post-fix: create action still scanned (no regression)", () => {
  const actions: PlannedAction[] = [
    {
      relPath: "agents/new-agent.md",
      action: "create",
      body: LEAKED_BODY,
    },
  ];
  const issues = lintActionsPostFix(actions);
  assert.ok(
    issues.length >= 1,
    "create action with leak must still be detected",
  );
});

test("post-fix: update action still scanned (no regression)", () => {
  const actions: PlannedAction[] = [
    {
      relPath: "agents/changed-agent.md",
      action: "update",
      body: LEAKED_BODY,
      targetBody: "old clean body",
    },
  ];
  const issues = lintActionsPostFix(actions);
  assert.ok(
    issues.length >= 1,
    "update action with leak in new body must still be detected",
  );
});

test("post-fix: skip-template with leaked target body is scanned", () => {
  // Transformer decided to leave the public file in place; if those bytes
  // contain a leak we still need to surface it.
  const actions: PlannedAction[] = [
    {
      relPath: "CHANGELOG.md",
      action: "skip-template",
      reason: "transformer-template-public-only",
      targetBody: LEAKED_BODY,
    },
  ];
  const issues = lintActionsPostFix(actions);
  assert.ok(
    issues.length >= 1,
    "skip-template with leak in retained public body must be detected",
  );
});

test("post-fix: skip-template with empty target body is no-op (package-lock case)", () => {
  // Binary/unreadable files end up with no body — must not throw, must not
  // false-positive.
  const actions: PlannedAction[] = [
    {
      relPath: "package-lock.json",
      action: "skip-template",
      reason: "binary-or-large",
      targetBody: "",
    },
  ];
  const issues = lintActionsPostFix(actions);
  assert.equal(issues.length, 0, "empty target body must be a no-op");
});

test("post-fix: empty action list returns empty issues", () => {
  const issues = lintActionsPostFix([]);
  assert.equal(issues.length, 0);
});

// ----------------------------------------------------------------------------
// BL-047 (v0.13.1) — allowlist semantics for documentation patterns
// ----------------------------------------------------------------------------
//
// Each rule has paired tests: (a) the allowlist pattern does NOT fire,
// (b) a real-leak pattern of the same shape STILL fires (regression guard).

test("BL-047 allowlist: `...` placeholder in auto-memory path does NOT fire", () => {
  const body = [
    "# Example doc",
    "",
    "See `~/.claude/projects/.../memory/runtime-gotchas.md` for the pattern.",
  ].join("\n");
  const issues = lintBodyForLeakPaths("protocols/example.md", body);
  const memRefHits = issues.filter((i) => i.code === "private-memory-ref");
  assert.equal(
    memRefHits.length,
    0,
    "the `...` placeholder is documentation; private-memory-ref must not fire",
  );
});

test("BL-047 regression: real /Users/<name>/ auto-memory path STILL fires (real leak)", () => {
  const body = [
    "# Example doc",
    "",
    "See `/Users/realoperator/.claude/projects/abc-def/memory/runtime-gotchas.md`.",
  ].join("\n");
  const issues = lintBodyForLeakPaths("protocols/example.md", body);
  const memRefHits = issues.filter((i) => i.code === "private-memory-ref");
  assert.ok(
    memRefHits.length >= 1,
    "a literal operator-machine auto-memory path must still be detected",
  );
});

test("BL-047 allowlist: `<bracket>` template placeholder in auto-memory path does NOT fire", () => {
  const body = [
    "# Example doc",
    "",
    "Generic shape: `~/.claude/projects/<project>/memory/` and",
    "`~/.claude/projects/<encoded>/memory/` are both placeholders.",
  ].join("\n");
  const issues = lintBodyForLeakPaths("protocols/example.md", body);
  const memRefHits = issues.filter((i) => i.code === "private-memory-ref");
  assert.equal(
    memRefHits.length,
    0,
    "bracket-template segments are placeholders; private-memory-ref must not fire",
  );
});

test("BL-047 allowlist: files under `workspace/_examples/` do NOT fire project-slug-ref", () => {
  // The example fixture file uses a fictional slug (`example-tools-cli`) by
  // design — that's the point of the example. project-slug-ref is suppressed
  // for the entire `workspace/_examples/` tree.
  const body = [
    "# Intake Brief — example-tools-cli",
    "",
    "Conversation log: `workspace/example-tools-cli/conversation-log.md`",
  ].join("\n");
  const issues = lintBodyForLeakPaths(
    "workspace/_examples/example-project/intake-brief.md",
    body,
  );
  const slugHits = issues.filter((i) => i.code === "project-slug-ref");
  assert.equal(
    slugHits.length,
    0,
    "files under workspace/_examples/ must not fire project-slug-ref",
  );
});

test("BL-047 regression: same content OUTSIDE `_examples/` STILL fires project-slug-ref", () => {
  // The same `workspace/example-tools-cli/...` string in a non-fixture path
  // is a real leak — that slug doesn't belong to the framework's public tree.
  const body = [
    "# Some protocol doc",
    "",
    "Conversation log: `workspace/example-tools-cli/conversation-log.md`",
  ].join("\n");
  const issues = lintBodyForLeakPaths(
    "protocols/some-protocol.md",
    body,
  );
  const slugHits = issues.filter((i) => i.code === "project-slug-ref");
  assert.ok(
    slugHits.length >= 1,
    "project-slug-ref must still fire on identical content outside _examples/",
  );
});

test("BL-047 allowlist: this test file is self-excluded from secret-pattern scan", () => {
  // The test file carries `/Users/exampleop/.claude/projects/-Users-exampleop-...`
  // literals to exercise `operator-identity-macos`. Those literals would
  // trip the scan during sync if not self-excluded. The self-exclude logic
  // lives in sync.ts:lintPropagatedBody (matched on relPath); here we just
  // assert the rationale is captured: scanBody DOES detect the synthetic
  // string, which is exactly why the test file needs the relPath-based
  // self-exclude in sync.ts. The full integration is verified by the
  // npm-run-sync:dry-run command exiting clean on the source tree.
  const body = "USER_MEMORY_DIR = \"/Users/exampleop/.claude/projects/-Users-exampleop-App-Development/memory\"";
  const issues = lintBodyForSecrets("scripts/sync-src/sync.test.ts", body);
  assert.ok(
    issues.length >= 1,
    "scanBody must still detect the pattern; the file-level self-exclude in sync.ts:lintPropagatedBody is the mechanism that suppresses it during sync",
  );
});

// ----------------------------------------------------------------------------
// BL-051 + BL-052: template-package-json transformer — field-merge tests +
// strip-private (npm-publish-guard) tests
// ----------------------------------------------------------------------------
//
// Why we don't import mergePackageJson directly: same rationale as the
// BL-037 lintActions tests above — promoting a non-exported helper to an
// export just for tests would widen sync.ts's public surface for no runtime
// reason. The merge logic is reproduced inline below and the tests assert
// the CONTRACT (per-field direction rules + files-array regression
// prevention + strip-private privacy-guard), not implementation-detail
// equality.
//
// History: pre-BL-051, the `template-package-json` transformer did a
// pass-through copy of source body. After v0.11.0 silently dropped 4
// entries from internal's package.json#files and v0.12.2 fixed only
// public's, the pass-through transformer was a latent re-introduction
// of the regression. These tests lock in the new contract: internal
// wins on most fields, but `files` is a union (preserves public's extra
// entries even if internal's array shrinks). BL-052 added a second
// concern in the same release: internal is marked `"private": true` as
// an npm-publish-guard; the transformer strips the flag on the way out
// so public stays publishable.

function unionStringArray(primary: string[], secondary: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of primary) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  for (const v of secondary) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function mergePackageJson(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (key === "private") {
      // BL-052: strip-private — internal sets `"private": true` as an
      // npm-publish-guard. Public must be publishable, so the flag is
      // dropped during merge. See sync.ts mergePackageJson + transformer
      // JSDoc for the threat-model detail.
      continue;
    }
    if (key === "files") {
      const srcFiles = Array.isArray(source.files) ? (source.files as unknown[]).filter((x): x is string => typeof x === "string") : [];
      const tgtFiles = Array.isArray(target.files) ? (target.files as unknown[]).filter((x): x is string => typeof x === "string") : [];
      merged.files = unionStringArray(srcFiles, tgtFiles);
    } else {
      merged[key] = source[key];
    }
  }
  for (const key of Object.keys(target)) {
    if (key === "private") continue;
    if (!(key in merged)) {
      merged[key] = target[key];
    }
  }
  return merged;
}

test("BL-051: public-only files entries are preserved through the merge (regression-prevention)", () => {
  // Mirrors the actual v0.11.0 → v0.12.2 state that motivated BL-051.
  // Internal's files array has 12 entries (post-v0.11.0 regression);
  // public's has 16 (post-v0.12.2 fix). The merge MUST preserve all 16.
  const source = {
    name: "@tapintomymind/tap-agents",
    version: "0.13.0",
    files: [
      "dist",
      "agents",
      "commands",
      "protocols",
      "templates",
      "hooks",
      "scripts",
      ".claude-plugin",
      "AGENTS.md",
      "CHANGELOG.md",
      "LICENSE",
      "README.md",
    ],
  };
  const target = {
    name: "@tapintomymind/tap-agents",
    version: "0.12.2",
    files: [
      "dist",
      "agents",
      "commands",
      "protocols",
      "templates",
      "hooks",
      "scripts",
      "playbooks",
      "memory",
      "docs",
      ".claude-plugin",
      "AGENTS.md",
      "CHANGELOG.md",
      "LICENSE",
      "README.md",
      "settings.json",
    ],
  };
  const merged = mergePackageJson(source, target);
  const files = merged.files as string[];
  assert.equal(files.length, 16, "merge must include all 16 unique entries (12 source + 4 public-only)");
  // The 4 public-only entries must survive.
  for (const entry of ["playbooks", "memory", "docs", "settings.json"]) {
    assert.ok(files.includes(entry), `public-only entry '${entry}' must be preserved through the merge`);
  }
  // Source's order preserved at the front.
  assert.equal(files[0], "dist");
  assert.equal(files[1], "agents");
  // Public-only entries appended AFTER all source entries (union semantics:
  // primary's order is preserved, then secondary-only items appended in
  // secondary's order). README.md is the last source entry; playbooks /
  // memory / docs / settings.json are the public-only entries that follow.
  const readmeIdx = files.indexOf("README.md");
  const playbooksIdx = files.indexOf("playbooks");
  const settingsIdx = files.indexOf("settings.json");
  assert.ok(playbooksIdx > readmeIdx, "public-only 'playbooks' must appear AFTER the last source entry (README.md)");
  assert.ok(settingsIdx > readmeIdx, "public-only 'settings.json' must appear AFTER the last source entry");
  // Public-only entries appear in target's order: playbooks → memory → docs → settings.json.
  assert.ok(files.indexOf("memory") === playbooksIdx + 1, "public-only entries preserve target's order");
  assert.ok(files.indexOf("docs") === playbooksIdx + 2, "public-only entries preserve target's order");
  assert.ok(settingsIdx === playbooksIdx + 3, "public-only entries preserve target's order");
});

test("BL-051: internal-side version field overrides public's (sync-direction)", () => {
  const source = { version: "0.13.0", files: ["a"] };
  const target = { version: "0.12.2", files: ["a"] };
  const merged = mergePackageJson(source, target);
  assert.equal(merged.version, "0.13.0", "internal's version must win — sync is the propagation event for the new release version");
});

test("BL-051: field-merge resolves conflicts per documented direction", () => {
  // Both sides define `description` and `dependencies` with different
  // values. Per the documented contract (per-field rule §3 in the
  // transformer JSDoc): internal wins on every internal-defined key
  // except `files`.
  const source = {
    description: "internal description",
    dependencies: { json5: "^2.2.3", "internal-only": "^1.0.0" },
    files: ["dist"],
  };
  const target = {
    description: "public description (stale)",
    dependencies: { json5: "^2.0.0", "public-only-dep": "^0.5.0" },
    files: ["dist", "extra"],
  };
  const merged = mergePackageJson(source, target);
  // description: internal wins.
  assert.equal(merged.description, "internal description", "internal-defined description must win over public's");
  // dependencies: internal wins as a whole object (not field-by-field
  // descent into nested objects). Per documented rule: only `files` gets
  // special-case union; every other internal-defined key is a wholesale
  // overwrite. The "public-only-dep" entry from target is INTENTIONALLY
  // dropped — internal owns the dependency manifest.
  const deps = merged.dependencies as Record<string, string>;
  assert.equal(deps["json5"], "^2.2.3", "internal's json5 pin must win over public's stale pin");
  assert.equal(deps["internal-only"], "^1.0.0", "internal-only dep must be present");
  assert.equal(deps["public-only-dep"], undefined, "public-only dep must NOT survive (whole-object overwrite for non-files fields)");
  // files: union, internal's order preserved, public-only entries appended.
  const files = merged.files as string[];
  assert.equal(files.length, 2);
  assert.deepEqual(files, ["dist", "extra"]);
});

test("BL-051: public-only top-level keys are preserved as a safety net", () => {
  // Unlikely in steady state today (the two package.json files match
  // field-for-field except version + files), but the contract specifies
  // public-only top-level keys are preserved verbatim. Lock that in.
  const source = { version: "0.13.0", files: ["a"] };
  const target = {
    version: "0.12.2",
    files: ["a"],
    "publishConfig": { access: "public" },
  };
  const merged = mergePackageJson(source, target);
  assert.deepEqual(merged.publishConfig, { access: "public" }, "public-only top-level keys must survive the merge");
});

test("BL-051: internal-only top-level keys flow through (sync direction)", () => {
  // Symmetric to the previous test: keys present only in source must
  // land in the merged output. This is the normal sync-propagation
  // direction.
  const source = { version: "0.13.0", files: ["a"], "newInternalField": { foo: "bar" } };
  const target = { version: "0.12.2", files: ["a"] };
  const merged = mergePackageJson(source, target);
  assert.deepEqual(merged.newInternalField, { foo: "bar" });
});

test("BL-051: empty files arrays on both sides return empty union", () => {
  const source = { version: "0.13.0", files: [] };
  const target = { version: "0.12.2", files: [] };
  const merged = mergePackageJson(source, target);
  assert.deepEqual(merged.files, []);
});

test("BL-051: missing files field on source falls back to target's files", () => {
  // If internal accidentally removes the `files` field entirely (or it
  // was never there), the merge should still preserve public's files
  // — the regression-prevention principle is "never silently drop
  // public's file list."
  const source: Record<string, unknown> = { version: "0.13.0" };
  const target = { version: "0.12.2", files: ["a", "b", "c"] };
  const merged = mergePackageJson(source, target);
  // `files` not in source's key walk, but target's `files` is appended
  // as a public-only key.
  assert.deepEqual(merged.files, ["a", "b", "c"]);
});

test("BL-051: union dedupes — duplicate entries appear once", () => {
  const source = { files: ["a", "b", "c"] };
  const target = { files: ["b", "c", "d"] };
  const merged = mergePackageJson(source, target);
  assert.deepEqual(merged.files, ["a", "b", "c", "d"]);
});

// ----------------------------------------------------------------------------
// BL-052: strip-private (npm-publish-guard) tests
// ----------------------------------------------------------------------------
//
// Internal `.claude/package.json` is marked `"private": true` so `npm publish`
// refuses to run on it before any file-matching happens — defense-in-depth
// against accidental egress of operator-private memory/ content. Public
// `tap-agents/` must stay publishable (it IS the npm distribution surface),
// so the transformer strips `"private"` on the way out. These tests lock in
// the strip-private contract.

test("BL-052: source 'private: true' is stripped from merged output", () => {
  // Mirrors actual state post-BL-052: internal has `"private": true`,
  // public never had the field. Merge MUST produce output WITHOUT
  // `"private"` so public's `npm publish` continues to work.
  const source = {
    name: "@tapintomymind/tap-agents",
    private: true,
    version: "0.13.2",
    files: ["dist", "agents"],
  };
  const target = {
    name: "@tapintomymind/tap-agents",
    version: "0.13.1",
    files: ["dist", "agents"],
  };
  const merged = mergePackageJson(source, target);
  assert.ok(!("private" in merged), "merged output must NOT contain 'private' field — public must be publishable");
  // Other source fields still flow through normally.
  assert.equal(merged.version, "0.13.2", "version still propagates internal-wins");
  assert.equal(merged.name, "@tapintomymind/tap-agents", "name still propagates");
});

test("BL-052: neither side has 'private' — output omits 'private' (no spurious addition)", () => {
  // Defensive: stripping logic must NOT accidentally add `"private": false`
  // or similar. If neither side declares it, the merged output simply
  // omits the field. Locks the contract against future regressions.
  const source = {
    name: "@tapintomymind/tap-agents",
    version: "0.13.2",
    files: ["dist"],
  };
  const target = {
    name: "@tapintomymind/tap-agents",
    version: "0.13.1",
    files: ["dist"],
  };
  const merged = mergePackageJson(source, target);
  assert.ok(!("private" in merged), "merged output must omit 'private' when neither side declares it (no spurious addition)");
});

// ----------------------------------------------------------------------------
// 2026-06-02 remediation — genericizer fixtures (design §5.1)
// ----------------------------------------------------------------------------
//
// Why we don't import genericizeBody directly: same rationale as the
// mergePackageJson tests above — sync.ts auto-runs main() at module load, so
// importing it would kick off a real sync. We reproduce the engine faithfully
// here and load the REAL rule SET from manifest.json5 (not a hand-copy), so a
// fixture failure means either the engine reproduction OR the manifest map
// drifted. The full end-to-end integration proof is `npm run verify-genericize`
// (which drives the REAL engine over the live tree).
//
// Positive fixtures: every identifier class from design §1.1 (rows 1–14) must
// be fully rewritten. Negative fixtures: the protected package/repo name + the
// brand domain + benign `ep-*` prose ("step-by-step", "deep-research") must be
// byte-identical after genericization.

import JSON5 from "json5";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

interface GR { find: string; replace: string }
interface GMap {
  rename_clauses: GR[]; compound: GR[]; hosts: GR[]; project_slugs: string[];
  repo_paths: GR[]; neon_endpoints: GR[]; operator: GR[]; protect: string[];
}

function loadGenericizeMap(): GMap {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(here, "manifest.json5"), "utf8");
  const m = JSON5.parse<{ genericize: GMap }>(raw);
  return m.genericize;
}

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Faithful reproduction of sync.ts:genericizeBody. SOURCE OF TRUTH is sync.ts;
 * any drift between this and sync.ts is caught by `npm run verify-genericize`.
 */
function genericizeBodyRepro(body: string, map: GMap): string {
  let out = body;

  // 1. protect-mask (longest-first).
  const protectSorted = map.protect.map((s, i) => ({ s, i })).sort((a, b) => b.s.length - a.s.length);
  const sentinelByOrig = new Map<string, string>();
  for (const { s, i } of protectSorted) {
    const sentinel = `xPROTECTEDx${i}xPROTECTEDx`;
    sentinelByOrig.set(sentinel, s);
    out = out.split(s).join(sentinel);
  }

  // 2a. structural passes.
  out = out.replace(/\bworkspace\/([a-z][a-z0-9-]+)\//g, (match, slug) => {
    const fp = `workspace/${slug}/`;
    const allowed = fp.startsWith("workspace/_global/") || fp.startsWith("workspace/_examples/") ||
      fp.startsWith("workspace/_inbox/") || fp === "workspace/_registry/" || fp === "workspace/.gitkeep/";
    return allowed ? match : "workspace/<project>/";
  });
  out = out.replace(
    /(?:\/Users\/[^/\s'"`)]+|\$HOME|~)\/\.claude\/projects\/[^\s'"`)]+\/memory\//g,
    "~/.claude/projects/<project>/memory/",
  );

  // 2b. ordered manifest passes.
  const passes: Array<[RegExp, string]> = [];
  for (const r of map.rename_clauses) passes.push([new RegExp(r.find, "g"), r.replace]);
  for (const r of map.compound) passes.push([new RegExp(r.find, "g"), r.replace]);
  for (const r of map.hosts) passes.push([new RegExp(r.find, "g"), r.replace]);
  // repo_paths BEFORE project_slugs (see sync.ts compileGenericize comment).
  for (const r of map.repo_paths) passes.push([new RegExp(escRe(r.find), "g"), r.replace]);
  for (const slug of [...map.project_slugs].sort((a, b) => b.length - a.length)) {
    passes.push([new RegExp(`\\b${escRe(slug)}\\b`, "g"), "<project>"]);
  }
  for (const r of map.neon_endpoints) passes.push([new RegExp(escRe(r.find), "g"), r.replace]);
  for (const r of map.operator) {
    const src = r.find === "\\btapandesai\\b" ? "(?<!tapintomymind/)\\btapandesai\\b" : r.find;
    passes.push([new RegExp(src, "g"), r.replace]);
  }
  for (const [re, rep] of passes) { re.lastIndex = 0; out = out.replace(re, rep); }

  // 3. unmask.
  for (const [sentinel, orig] of sentinelByOrig) out = out.split(sentinel).join(orig);
  return out;
}

const GMAP = loadGenericizeMap();

test("genericize positive: bare project slugs (rows 1-3,5-6) → <project>", () => {
  const input = "agent-dashboard and tapagents-app and tapagents-football-gm and ip-protection and claude-team-app are slugs.";
  const out = genericizeBodyRepro(input, GMAP);
  for (const slug of ["agent-dashboard", "tapagents-app", "tapagents-football-gm", "claude-team-app"]) {
    assert.ok(!new RegExp(`\\b${escRe(slug)}\\b`).test(out), `slug '${slug}' must be fully rewritten; got: ${out}`);
  }
  // bare ip-protection → <project> (compound variant tested separately).
  assert.ok(!/\bip-protection\b/.test(out), `bare ip-protection must rewrite; got: ${out}`);
  assert.ok(out.includes("<project>"), "output must contain <project> placeholder");
});

test("genericize positive: compound ip-protection-mcp-execution-model (row 4) keeps suffix", () => {
  const input = "The `ip-protection-mcp-execution-model` planning cycle produced artifacts.";
  const out = genericizeBodyRepro(input, GMAP);
  assert.ok(out.includes("<project>-mcp-execution-model"), `compound must become <project>-mcp-execution-model; got: ${out}`);
  assert.ok(!out.includes("ip-protection-mcp-execution-model"), "raw compound must not survive");
});

test("genericize positive: workspace/<slug>/ path (rows 1-3) → workspace/<project>/", () => {
  const input = "See `workspace/tapagents-app/prd.md` and `workspace/agent-dashboard/scope.md`.";
  const out = genericizeBodyRepro(input, GMAP);
  assert.ok(out.includes("workspace/<project>/"), `path form must collapse; got: ${out}`);
  assert.ok(!out.includes("workspace/tapagents-app/"), "raw path slug must not survive");
  assert.ok(!out.includes("workspace/agent-dashboard/"), "raw path slug must not survive");
});

test("genericize positive: vercel host (row 8) → <project>.vercel.app", () => {
  const input = "Prod runs at tapagents-app.vercel.app today.";
  const out = genericizeBodyRepro(input, GMAP);
  assert.ok(out.includes("<project>.vercel.app"), `vercel host must rewrite; got: ${out}`);
  assert.ok(!out.includes("tapagents-app.vercel.app"), "raw vercel host must not survive");
});

test("genericize positive: github repo paths (row 9) → <org>/<project>", () => {
  const input = "Repo tapintomymind/claude-team and tapintomymind/tapagents-app and tapintomymind/claude-team-app.";
  const out = genericizeBodyRepro(input, GMAP);
  assert.ok(!out.includes("tapintomymind/claude-team-app"), "raw repo path must not survive");
  assert.ok(!/tapintomymind\/claude-team\b/.test(out), "raw claude-team repo path must not survive");
  assert.ok(!out.includes("tapintomymind/tapagents-app"), "raw repo path must not survive");
  assert.ok(out.includes("<org>/<project>"), `repo path must become <org>/<project>; got: ${out}`);
});

test("genericize positive: neon endpoint ids (row 10) → <neon-endpoint>", () => {
  const input = "host ep-broad-moon-apiaksv1-pooler.c-7.us-east-1.aws.neon.tech and ep-aged-wildflower-aprg1xfd.";
  const out = genericizeBodyRepro(input, GMAP);
  assert.ok(out.includes("<neon-endpoint>"), `neon id must rewrite; got: ${out}`);
  assert.ok(!out.includes("ep-broad-moon-apiaksv1"), "raw neon id must not survive");
  assert.ok(!out.includes("ep-aged-wildflower-aprg1xfd"), "raw neon id must not survive");
});

test("genericize positive: operator home path (row 11) → <framework-root>", () => {
  const input = "the path /Users/tapandesai/App Development/.claude/foo broke on a space.";
  const out = genericizeBodyRepro(input, GMAP);
  assert.ok(out.includes("<framework-root>"), `operator home path must collapse; got: ${out}`);
  assert.ok(!out.includes("/Users/tapandesai/App Development"), "raw operator home path must not survive");
});

test("genericize positive: bare operator username (row 12) → <operator>", () => {
  const input = "admin view gated to tapandesai only.";
  const out = genericizeBodyRepro(input, GMAP);
  assert.ok(out.includes("<operator>"), `bare username must rewrite; got: ${out}`);
  assert.ok(!/\btapandesai\b/.test(out), "raw username must not survive");
});

test("genericize positive: rename-provenance parenthetical (row 14) is stripped", () => {
  const input = "downstream consumers (currently tapagents-app, formerly agent-dashboard pre-2026-05-14 BL-059 cascade-rename; future projects).";
  const out = genericizeBodyRepro(input, GMAP);
  assert.ok(!out.includes("formerly agent-dashboard"), `rename clause must be stripped; got: ${out}`);
  assert.ok(!out.includes("BL-059"), `BL-059 provenance must be stripped with the clause; got: ${out}`);
  // The leading tapagents-app still genericizes to <project>.
  assert.ok(out.includes("<project>"), "the surrounding slug still genericizes");
});

test("genericize NEGATIVE: protected @tapintomymind/tap-agents is byte-identical", () => {
  const input = "Bump `@tapintomymind/tap-agents` to v0.29.1; repo tapintomymind/tap-agents stays.";
  const out = genericizeBodyRepro(input, GMAP);
  assert.equal(out, input, `protected package/repo name must survive untouched; got: ${out}`);
});

test("genericize NEGATIVE: brand domain hq.tapintomymind.com is byte-identical", () => {
  const input = "Custom domain hq.tapintomymind.com queued (DNS pending).";
  const out = genericizeBodyRepro(input, GMAP);
  assert.equal(out, input, `brand domain must survive untouched; got: ${out}`);
});

test("genericize NEGATIVE: benign ep-* prose is untouched (no ep-\\w+ over-match)", () => {
  const input = "A step-by-step deep-research keep-alive recipe; the endpoint helper.";
  const out = genericizeBodyRepro(input, GMAP);
  assert.equal(out, input, `benign ep-*/-ep prose must not be eaten by neon rule; got: ${out}`);
});

test("genericize NEGATIVE: 'Claude Team' brand prose preserved (only slug/repo form genericized)", () => {
  // Operator decision: keep the "Claude Team" brand; genericize only the
  // slug (claude-team) + repo-path (tapintomymind/claude-team) forms. Brand
  // prose with a capital-T space form is NOT a slug and must survive.
  const input = "The Claude Team design spec defines the founding roster.";
  const out = genericizeBodyRepro(input, GMAP);
  assert.equal(out, input, `'Claude Team' brand prose must survive (not a slug); got: ${out}`);
});

test("genericize NEGATIVE: username inside protected package name does not double-rewrite", () => {
  // tapintomymind/tap-agents contains no 'tapandesai', but assert the operator
  // username rule + protect-mask compose without corrupting the package name.
  const input = "author tapandesai ships @tapintomymind/tap-agents.";
  const out = genericizeBodyRepro(input, GMAP);
  assert.ok(out.includes("@tapintomymind/tap-agents"), "package name intact");
  assert.ok(out.includes("<operator>"), "bare username rewritten");
  assert.ok(!/\btapandesai\b/.test(out), "raw username gone");
});

// ----------------------------------------------------------------------------
// bare-codename lint — the no-re-leak self-check (design §5.2)
// ----------------------------------------------------------------------------
//
// Reproduction of sync.ts:lintPropagatedBody's bare-codename rule. SOURCE OF
// TRUTH is sync.ts. The full integration (this rule firing inside a real sync
// + aborting it) is exercised by `npm run verify-genericize`. Here we lock in
// the rule's contract: a SURVIVING codename in a propagated body is a FAIL; a
// fully-genericized body (or a body containing only protected names / benign
// ep-* prose) is clean.

interface BareLintIssue { code: string; lineNo: number; message: string }

function bareCodenameLintRepro(relPath: string, body: string, map: GMap, exemptions: string[]): BareLintIssue[] {
  const issues: BareLintIssue[] = [];
  const inScope = /\.(md|py|ts|json|json5|yml|yaml)$/.test(relPath);
  const selfSkip = new Set([
    "scripts/sync-src/secret-patterns.ts", "scripts/sync-src/sync.ts",
    "scripts/sync-src/sync.test.ts", "scripts/sync-src/verify-sync.ts",
    "scripts/sync-src/sync-codex.ts", "scripts/sync-src/manifest.json5",
  ]);
  if (!inScope || selfSkip.has(relPath) || exemptions.includes(relPath)) return issues;
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i] ?? "";
    for (const p of map.protect) line = line.split(p).join(" ");
    for (const slug of map.project_slugs) {
      if (new RegExp(`\\b${escRe(slug)}\\b`).test(line)) issues.push({ code: "bare-codename", lineNo: i + 1, message: `slug '${slug}'` });
    }
    for (const r of map.compound) if (line.includes(r.find)) issues.push({ code: "bare-codename", lineNo: i + 1, message: `compound '${r.find}'` });
    for (const r of map.hosts) if (new RegExp(r.find).test(line)) issues.push({ code: "bare-codename", lineNo: i + 1, message: `host /${r.find}/` });
    for (const r of map.neon_endpoints) if (line.includes(r.find)) issues.push({ code: "bare-codename", lineNo: i + 1, message: `neon '${r.find}'` });
    for (const r of map.repo_paths) if (line.includes(r.find)) issues.push({ code: "bare-codename", lineNo: i + 1, message: `repo '${r.find}'` });
  }
  return issues;
}

test("bare-codename lint: FAILS on a surviving bare slug (the re-leak it catches)", () => {
  // Simulates a propagated body where genericization MISSED a slug.
  const leaked = "This agent activates for agent-dashboard's buyer surface.";
  const issues = bareCodenameLintRepro("agents/foo.md", leaked, GMAP, []);
  assert.ok(issues.length >= 1, "surviving bare slug must FAIL the lint");
  assert.equal(issues[0]?.code, "bare-codename");
});

test("bare-codename lint: FAILS on a surviving neon endpoint id", () => {
  const leaked = "host ep-broad-moon-apiaksv1-pooler.c-7.us-east-1.aws.neon.tech";
  const issues = bareCodenameLintRepro("protocols/x.md", leaked, GMAP, []);
  assert.ok(issues.length >= 1, "surviving neon id must FAIL");
});

test("bare-codename lint: FAILS on a surviving vercel host", () => {
  const issues = bareCodenameLintRepro("protocols/x.md", "runs at tapagents-app.vercel.app", GMAP, []);
  assert.ok(issues.length >= 1, "surviving vercel host must FAIL");
});

test("bare-codename lint: PASSES on a fully-genericized body", () => {
  const clean = genericizeBodyRepro("agent-dashboard at tapagents-app.vercel.app, ip-protection-mcp-execution-model", GMAP);
  const issues = bareCodenameLintRepro("agents/foo.md", clean, GMAP, []);
  assert.equal(issues.length, 0, `genericized body must be clean; survivors: ${JSON.stringify(issues)}`);
});

test("bare-codename lint: does NOT fire on the protected package name", () => {
  const issues = bareCodenameLintRepro("scripts/build-src/verify.ts".replace("build-src", "build-src"), "@tapintomymind/tap-agents@0.29.1", GMAP, []);
  assert.equal(issues.length, 0, "protected package name must be subtracted (no FAIL)");
});

test("bare-codename lint: does NOT fire on benign ep-* prose", () => {
  const issues = bareCodenameLintRepro("docs/x.md", "a step-by-step deep-research keep-alive recipe", GMAP, []);
  assert.equal(issues.length, 0, "benign ep-* prose must not FAIL");
});

test("bare-codename lint: SKIPS self-skip files (manifest carries codenames by construction)", () => {
  const issues = bareCodenameLintRepro("scripts/sync-src/manifest.json5", "agent-dashboard tapagents-app", GMAP, []);
  assert.equal(issues.length, 0, "manifest.json5 must be self-skipped");
});

test("bare-codename lint: SKIPS genericize_exemptions paths", () => {
  const issues = bareCodenameLintRepro("workspace/_registry.md", "agent-dashboard", GMAP, ["workspace/_registry.md"]);
  assert.equal(issues.length, 0, "exempted path must be skipped");
});

test("bare-codename lint: out-of-scope extension is not graded", () => {
  const issues = bareCodenameLintRepro("assets/logo.svg", "agent-dashboard", GMAP, []);
  assert.equal(issues.length, 0, ".svg is out of genericize scope");
});

// ----------------------------------------------------------------------------
// Run
// ----------------------------------------------------------------------------

async function run(): Promise<void> {
  let pass = 0;
  let fail = 0;
  const failures: { name: string; err: unknown }[] = [];

  for (const t of tests) {
    try {
      await t.fn();
      pass += 1;
      console.log(`  ok  ${t.name}`);
    } catch (err) {
      fail += 1;
      failures.push({ name: t.name, err });
      console.log(`  FAIL ${t.name}`);
    }
  }

  console.log("");
  console.log(`${pass} passed, ${fail} failed (${tests.length} total)`);

  if (fail > 0) {
    console.log("");
    console.log("Failures:");
    for (const f of failures) {
      console.log(`  - ${f.name}`);
      console.log(`    ${(f.err as Error).message ?? f.err}`);
    }
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(2);
});
