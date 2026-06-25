/**
 * bump-manifest-versions.test.ts
 *
 * Locks in the behavior of `scripts/bump-manifest-versions.ts` — the release-time
 * aligner for the three version-bearing files (package.json + the two
 * `.claude-plugin/` manifests). The bug class it guards against (the
 * `.claude-plugin/` manifests drifting from package.json#version because sync
 * treats them as target-orphans) is a release-pipeline footgun; these tests are
 * the regression net.
 *
 * Cases:
 *   1. aligns plugin.json + marketplace.json plugins[] to package.json#version
 *      (when invoked with no arg, reading the local package.json as authority).
 *   2. idempotent re-run is a pure no-op (second run writes nothing).
 *   3. asserts/fails (non-zero exit) when NO plugins[] entry matches name.
 *   4. does NOT mutate name/source/description in marketplace.json.
 *   5. produces a SINGLE-LINE diff per file (formatting preserved byte-for-byte
 *      except the one version line) — incl. trailing-newline preservation.
 *   6. fails loudly (non-zero exit) on a missing manifest file.
 *
 * Fixtures are written to a throwaway tmp dir (NEVER the real tap-agents/ tree).
 * The script is exercised as a subprocess (it has a process.exit-based CLI
 * contract), with `cwd` set to the fixture dir so its `./package.json` +
 * `./.claude-plugin/*` resolution is the thing under test.
 *
 * Runner: stdlib-only (`node:assert/strict`, `node:test` NOT used — zero new
 * devDeps, run via `tsx scripts/bump-manifest-versions.test.ts`). A top-level
 * try/catch + non-zero process exit on assertion failure plays the runner role,
 * mirroring scripts/test-changelog-format.ts.
 */

import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPT = join(__dirname, "bump-manifest-versions.ts");

// Canonical fixture bodies — deliberately mirror the real manifests' SHAPE
// (2-space indent, key order, a top-level marketplace `"name": "tapagents"` that
// is NOT a plugin entry, trailing newline) so the formatting-preservation +
// over-anchor guards are exercised on a realistic document.
const PKG_BODY = `{
  "name": "tapagents",
  "version": "0.34.0",
  "description": "fixture package"
}
`;

const PLUGIN_BODY = `{
  "name": "tapagents",
  "version": "0.34.0",
  "description": "fixture plugin"
}
`;

const MARKETPLACE_BODY = `{
  "name": "tapagents",
  "description": "fixture marketplace",
  "owner": {
    "name": "tapintomymind",
    "url": "https://github.com/tapintomymind"
  },
  "plugins": [
    {
      "name": "tapagents",
      "source": ".",
      "version": "0.34.0",
      "description": "the plugin entry"
    }
  ]
}
`;

interface Fixture {
  dir: string;
  pkgPath: string;
  pluginPath: string;
  marketplacePath: string;
}

function makeFixture(opts?: {
  pkg?: string;
  plugin?: string | null;
  marketplace?: string;
}): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "bump-test-"));
  mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
  const pkgPath = join(dir, "package.json");
  const pluginPath = join(dir, ".claude-plugin", "plugin.json");
  const marketplacePath = join(dir, ".claude-plugin", "marketplace.json");

  writeFileSync(pkgPath, opts?.pkg ?? PKG_BODY);
  if (opts?.plugin !== null) writeFileSync(pluginPath, opts?.plugin ?? PLUGIN_BODY);
  writeFileSync(marketplacePath, opts?.marketplace ?? MARKETPLACE_BODY);

  return { dir, pkgPath, pluginPath, marketplacePath };
}

function runScript(cwd: string, arg?: string): { code: number; stdout: string; stderr: string } {
  const args = [SCRIPT];
  if (arg !== undefined) args.push(arg);
  const res = spawnSync("npx", ["tsx", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env },
  });
  return { code: res.status ?? -1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

/** Count changed lines between two strings via a minimal line diff. */
function changedLineCount(a: string, b: string): number {
  const al = a.split("\n");
  const bl = b.split("\n");
  let changed = 0;
  const max = Math.max(al.length, bl.length);
  for (let i = 0; i < max; i++) {
    if (al[i] !== bl[i]) changed++;
  }
  return changed;
}

let passCount = 0;
function ok(label: string): void {
  passCount++;
  console.log(`  [PASS] ${label}`);
}

function test1_alignsAllThree(): void {
  // package.json is the authority; bump its version, then run with NO arg so the
  // script reads the local package.json (the never-downgrade authority path) and
  // aligns the two manifests to it.
  const f = makeFixture({ pkg: PKG_BODY.replace("0.34.0", "0.35.0") });
  const r = runScript(f.dir); // no arg → read local package.json (0.35.0)
  assert.equal(r.code, 0, `expected exit 0, got ${r.code}\nstderr: ${r.stderr}`);

  const plugin = JSON.parse(readFileSync(f.pluginPath, "utf8"));
  const marketplace = JSON.parse(readFileSync(f.marketplacePath, "utf8"));
  assert.equal(plugin.version, "0.35.0", "plugin.json version not aligned");
  assert.equal(marketplace.plugins[0].version, "0.35.0", "marketplace plugins[0].version not aligned");

  rmSync(f.dir, { recursive: true, force: true });
  ok("aligns plugin.json + marketplace.json plugins[] to package.json#version (local authority)");
}

function test2_idempotentNoOp(): void {
  // Run twice with an explicit version; the SECOND run must change nothing.
  const f = makeFixture();
  const r1 = runScript(f.dir, "0.35.0");
  assert.equal(r1.code, 0, `first run failed: ${r1.stderr}`);

  const afterFirst = {
    pkg: readFileSync(f.pkgPath, "utf8"),
    plugin: readFileSync(f.pluginPath, "utf8"),
    marketplace: readFileSync(f.marketplacePath, "utf8"),
  };

  const r2 = runScript(f.dir, "0.35.0");
  assert.equal(r2.code, 0, `second run failed: ${r2.stderr}`);
  assert.match(r2.stdout, /Already aligned — no changes\./, "second run did not report no-op");

  assert.equal(readFileSync(f.pkgPath, "utf8"), afterFirst.pkg, "package.json mutated on idempotent re-run");
  assert.equal(readFileSync(f.pluginPath, "utf8"), afterFirst.plugin, "plugin.json mutated on idempotent re-run");
  assert.equal(
    readFileSync(f.marketplacePath, "utf8"),
    afterFirst.marketplace,
    "marketplace.json mutated on idempotent re-run",
  );

  rmSync(f.dir, { recursive: true, force: true });
  ok("idempotent re-run is a pure no-op");
}

function test3_failsWhenNoPluginMatches(): void {
  const noMatch = MARKETPLACE_BODY.replace('"name": "tapagents",\n      "source"', '"name": "other",\n      "source"');
  const f = makeFixture({ marketplace: noMatch });
  const r = runScript(f.dir, "0.35.0");
  assert.notEqual(r.code, 0, "expected non-zero exit when no plugin entry matches");
  assert.match(r.stderr, /no plugins\[\] entry with name === 'tapagents'/, "missing the no-match error message");

  // And it must NOT have partially written the other files... actually package.json
  // + plugin.json are bumped BEFORE marketplace runs; the failure is hard-exit on
  // marketplace. The contract is "fail loudly on zero match" — the loud failure is
  // what we assert, not transactional rollback.
  rmSync(f.dir, { recursive: true, force: true });
  ok("asserts/fails (non-zero exit) when no plugins[] entry matches name");
}

function test4_doesNotMutateNameSourceDescription(): void {
  const f = makeFixture();
  const r = runScript(f.dir, "0.35.0");
  assert.equal(r.code, 0, `run failed: ${r.stderr}`);

  const marketplace = JSON.parse(readFileSync(f.marketplacePath, "utf8"));
  // Top-level marketplace fields preserved.
  assert.equal(marketplace.name, "tapagents", "top-level marketplace name mutated");
  assert.equal(marketplace.description, "fixture marketplace", "marketplace description mutated");
  // Plugin entry non-version fields preserved.
  assert.equal(marketplace.plugins[0].name, "tapagents", "plugin name mutated");
  assert.equal(marketplace.plugins[0].source, ".", "plugin source mutated");
  assert.equal(marketplace.plugins[0].description, "the plugin entry", "plugin description mutated");

  rmSync(f.dir, { recursive: true, force: true });
  ok("does NOT mutate name/source/description (only plugins[].version)");
}

function test5_singleLineDiffPerFile(): void {
  const f = makeFixture();
  const before = {
    pkg: readFileSync(f.pkgPath, "utf8"),
    plugin: readFileSync(f.pluginPath, "utf8"),
    marketplace: readFileSync(f.marketplacePath, "utf8"),
  };

  const r = runScript(f.dir, "0.35.0");
  assert.equal(r.code, 0, `run failed: ${r.stderr}`);

  const after = {
    pkg: readFileSync(f.pkgPath, "utf8"),
    plugin: readFileSync(f.pluginPath, "utf8"),
    marketplace: readFileSync(f.marketplacePath, "utf8"),
  };

  assert.equal(changedLineCount(before.pkg, after.pkg), 1, "package.json diff is not a single line");
  assert.equal(changedLineCount(before.plugin, after.plugin), 1, "plugin.json diff is not a single line");
  assert.equal(
    changedLineCount(before.marketplace, after.marketplace),
    1,
    "marketplace.json diff is not a single line",
  );

  // Trailing newline preserved (last char remains "\n").
  assert.ok(after.pkg.endsWith("\n"), "package.json lost trailing newline");
  assert.ok(after.plugin.endsWith("\n"), "plugin.json lost trailing newline");
  assert.ok(after.marketplace.endsWith("\n"), "marketplace.json lost trailing newline");

  rmSync(f.dir, { recursive: true, force: true });
  ok("produces a single-line diff per file (formatting + trailing newline preserved)");
}

function test6_failsOnMissingManifest(): void {
  const f = makeFixture({ plugin: null }); // plugin.json absent
  const r = runScript(f.dir, "0.35.0");
  assert.notEqual(r.code, 0, "expected non-zero exit on missing plugin.json");
  assert.match(r.stderr, /plugin\.json not found/, "missing the not-found error message");

  rmSync(f.dir, { recursive: true, force: true });
  ok("fails loudly (non-zero exit) on a missing manifest file");
}

console.log("bump-manifest-versions.test.ts");
console.log(`  Script: ${SCRIPT}`);
console.log("");

try {
  test1_alignsAllThree();
  test2_idempotentNoOp();
  test3_failsWhenNoPluginMatches();
  test4_doesNotMutateNameSourceDescription();
  test5_singleLineDiffPerFile();
  test6_failsOnMissingManifest();
  console.log("");
  console.log(`All ${passCount} bump-manifest-versions tests passed.`);
  process.exit(0);
} catch (err) {
  console.error("");
  console.error("bump-manifest-versions test FAILED:");
  console.error(err instanceof Error && err.message ? err.message : String(err));
  process.exit(1);
}
