/**
 * bump-manifest-versions.ts
 *
 * Aligns the three version-bearing files of a TapAgents release so they NEVER
 * drift, eliminating the per-release hand-edit footgun on the `.claude-plugin/`
 * manifests:
 *
 *   1. `./package.json`                       — the canonical version (read here).
 *   2. `./.claude-plugin/plugin.json`         — top-level `"version"`.
 *   3. `./.claude-plugin/marketplace.json`    — `plugins[*].version` for every
 *                                               entry whose `name === 'tapagents'`.
 *
 * WHY THIS EXISTS. The `.claude-plugin/{plugin,marketplace}.json` files live ONLY
 * in the published mirror (`tap-agents/`), absent from the HQ source tree. The
 * whole-tree sync classifies them as target-orphans and never touches their
 * version. Per `protocols/versioning-protocol.md §6` the two manifests MUST match
 * `package.json#version`, and `hooks/version-gate.py` now hard-blocks a commit on
 * drift of EITHER manifest. Before this script the operator hand-edited both
 * manifests every release — error-prone, and the marketplace.json version is
 * NESTED (no top-level field) so it was the easiest to forget. This script makes
 * the alignment one mechanical, idempotent, single-line-diff-per-file step.
 *
 * VERSION AUTHORITY — the never-downgrade trap. This script reads the version
 * from `./package.json` in its CURRENT WORKING DIRECTORY (the LOCAL/target tree),
 * NOT from any source copy. At release time it runs with `cwd=tap-agents/`, after
 * `npm version`/the package.json bump has already written the new version there.
 * Reading the LOCAL package.json is REQUIRED: under the §10 filesystem-only
 * topology the HQ source `package.json` is frozen (releases are cut in the
 * mirror), and `sync.ts`'s package.json merge takes the HIGHER semver of
 * {source, target} (sync.ts:821-835) precisely so a stale HQ never downgrades the
 * mirror. If this script read a source copy it could re-introduce exactly that
 * stale-HQ downgrade. The local `package.json` the release just bumped is the only
 * correct source of truth. An explicit `NEW_VERSION` arg (or env) overrides for
 * tests / out-of-band alignment.
 *
 * SURGICAL WRITES. Every write changes ONLY the version field(s) — it preserves
 * indentation, key order, and the trailing newline byte-for-byte, so each file's
 * diff is a single line. The marketplace.json rewrite is scoped to the matching
 * plugin entries' `version` fields ONLY; it NEVER touches `name`/`source`/
 * `description`, so it cannot trip the MAJOR-classification pass (`/release`
 * Pass A) that reads marketplace.json for plugin name/id changes.
 *
 * IDEMPOTENT. Compares before writing. A second run on already-aligned files is a
 * pure no-op (no write, exit 0). Any anomaly (missing file, unparseable JSON, zero
 * matching plugin entries) is a hard non-zero exit with an actionable message.
 *
 * CWD CONTRACT. Operates on `./package.json` + `./.claude-plugin/*` relative to
 * the process working directory. The `/release` flow invokes it with
 * `cwd=tap-agents/` AFTER the package.json bump AND AFTER the Pattern-B
 * HEAD-restore, and BEFORE `git add` — see `commands/release.md` Step 6.
 *
 * Runner: stdlib-only (`node:fs`), run via `tsx scripts/bump-manifest-versions.ts`.
 * No new devDeps.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PLUGIN_NAME = "tapagents";

class BumpError extends Error {}

/** Read `version` from the LOCAL ./package.json (the never-downgrade authority). */
function readPackageVersion(cwd: string): string {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) {
    throw new BumpError(
      `package.json not found at ${pkgPath}. This script must run with cwd at the ` +
        `release tree root (cwd=tap-agents/ at release time), AFTER the package.json bump.`,
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch (err) {
    throw new BumpError(`package.json at ${pkgPath} is not parseable JSON: ${String(err)}`);
  }
  const version = (data as { version?: unknown }).version;
  if (typeof version !== "string" || version.length === 0) {
    throw new BumpError(`package.json at ${pkgPath} has no usable string 'version' field.`);
  }
  return version;
}

/** True if `v` looks like a SemVer core (with optional pre-release/build). */
function isSemverShaped(v: string): boolean {
  return /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(v);
}

interface FileBump {
  path: string;
  /** True if the file's bytes changed (a write happened). */
  changed: boolean;
}

/**
 * Surgically set the TOP-LEVEL `"version"` field in a JSON file to `version`,
 * preserving every other byte. Idempotent. Returns whether a write happened.
 *
 * Implementation: a targeted regex replace on the first top-level `"version"`
 * key. We deliberately avoid JSON.parse→JSON.stringify (which would reflow
 * indentation / key order / trailing-newline) so the diff is a single line.
 * The structure is validated by an independent JSON.parse before the replace so
 * we fail loudly on a malformed file rather than corrupting it.
 */
function bumpTopLevelVersion(filePath: string, version: string, label: string): FileBump {
  if (!existsSync(filePath)) {
    throw new BumpError(`${label} not found at ${filePath}.`);
  }
  const original = readFileSync(filePath, "utf8");

  // Validate the file is well-formed JSON and actually carries a version field
  // before we touch it.
  let parsed: unknown;
  try {
    parsed = JSON.parse(original);
  } catch (err) {
    throw new BumpError(`${label} at ${filePath} is not parseable JSON: ${String(err)}`);
  }
  if (typeof (parsed as { version?: unknown }).version !== "string") {
    throw new BumpError(`${label} at ${filePath} has no top-level string 'version' field to align.`);
  }

  // Match the FIRST `"version": "..."` at the top level. plugin.json's only
  // version field is the top-level one, so a global-first match is correct and
  // surgical. The capture groups preserve the exact surrounding whitespace.
  const re = /("version"\s*:\s*")([^"]*)(")/;
  const m = re.exec(original);
  if (!m) {
    throw new BumpError(`${label} at ${filePath}: could not locate a '"version": "..."' field to replace.`);
  }
  if (m[2] === version) {
    return { path: filePath, changed: false }; // already aligned — no-op
  }
  const updated = original.replace(re, `$1${version}$3`);
  writeFileSync(filePath, updated);
  return { path: filePath, changed: true };
}

/**
 * Surgically set `plugins[*].version` for every entry whose `name === PLUGIN_NAME`
 * in marketplace.json, preserving every other byte. Asserts at least one match.
 *
 * Implementation: parse for VALIDATION + match-counting only (locate which
 * plugin entries match by name and what their current versions are). The actual
 * write is a scoped text replace per matching entry's `version` field — we never
 * re-serialize the whole document, so name/source/description and all formatting
 * are byte-preserved and the diff is one line per drifted entry.
 */
function bumpMarketplaceVersions(filePath: string, version: string, label: string): FileBump {
  if (!existsSync(filePath)) {
    throw new BumpError(`${label} not found at ${filePath}.`);
  }
  const original = readFileSync(filePath, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(original);
  } catch (err) {
    throw new BumpError(`${label} at ${filePath} is not parseable JSON: ${String(err)}`);
  }
  const plugins = (parsed as { plugins?: unknown }).plugins;
  if (!Array.isArray(plugins)) {
    throw new BumpError(`${label} at ${filePath} has no 'plugins[]' array.`);
  }

  // Identify matching entries + their current versions (for the no-op check and
  // the assert-at-least-one guard).
  const matching = plugins.filter(
    (p): p is { name: string; version?: unknown } =>
      typeof p === "object" && p !== null && (p as { name?: unknown }).name === PLUGIN_NAME,
  );
  if (matching.length === 0) {
    throw new BumpError(
      `${label} at ${filePath}: no plugins[] entry with name === '${PLUGIN_NAME}'. ` +
        `Refusing to write — the marketplace manifest does not carry the tapagents plugin.`,
    );
  }

  // Locate the TEXT SPAN of the top-level `"plugins"` array so the per-entry
  // version replace stays scoped to plugin entries ONLY. The marketplace's own
  // top-level `"name": "tapagents"` lives OUTSIDE this span; restricting the
  // anchor to the array span prevents the top-level name from over-anchoring onto
  // a plugin entry's version field. We walk brackets to find the matching `]`.
  const arrayKey = original.search(/"plugins"\s*:\s*\[/);
  if (arrayKey === -1) {
    throw new BumpError(`${label} at ${filePath}: could not locate the '"plugins": [' array opener in text.`);
  }
  const openBracket = original.indexOf("[", arrayKey);
  let depth = 0;
  let closeBracket = -1;
  for (let i = openBracket; i < original.length; i++) {
    const ch = original[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        closeBracket = i;
        break;
      }
    }
  }
  if (closeBracket === -1) {
    throw new BumpError(`${label} at ${filePath}: malformed '"plugins"' array — no matching ']'.`);
  }

  const before = original.slice(0, openBracket);
  const arraySpan = original.slice(openBracket, closeBracket + 1);
  const after = original.slice(closeBracket + 1);

  // Surgical per-entry replace WITHIN the plugins[] span. Because each plugin
  // object contains exactly one `"version"` field, replacing the FIRST
  // `"version"` after each matching `"name": "tapagents"` anchor targets the
  // right field without re-serializing. We operate on the raw text to preserve
  // formatting (indentation, key order, trailing newline).
  let changed = false;
  let anchorsSeen = 0;
  const nameAnchor = new RegExp(
    `("name"\\s*:\\s*"${PLUGIN_NAME}")([\\s\\S]*?"version"\\s*:\\s*")([^"]*)(")`,
    "g",
  );
  const updatedSpan = arraySpan.replace(nameAnchor, (whole, namePart, between, currentVersion, closeQuote) => {
    anchorsSeen++;
    if (currentVersion === version) {
      return whole; // already aligned for this entry — preserve bytes
    }
    changed = true;
    return `${namePart}${between}${version}${closeQuote}`;
  });

  // Defensive: the number of name anchors the regex matched WITHIN the array span
  // must equal the structural parse count. If they diverge (e.g., a plugin entry
  // with `version` keyed BEFORE `name`), fail loudly rather than partially align.
  if (anchorsSeen !== matching.length) {
    throw new BumpError(
      `${label} at ${filePath}: structural mismatch — JSON parse found ${matching.length} ` +
        `'${PLUGIN_NAME}' plugin entries but the in-array text anchor matched ${anchorsSeen}. ` +
        `Refusing to write to avoid partial alignment.`,
    );
  }

  if (changed) {
    writeFileSync(filePath, before + updatedSpan + after);
  }
  return { path: filePath, changed };
}

function main(): void {
  const cwd = process.cwd();

  // Authority: explicit arg/env overrides; otherwise read LOCAL ./package.json.
  const argVersion = process.argv[2];
  const envVersion = process.env.NEW_VERSION;
  const explicit = (argVersion && argVersion.trim()) || (envVersion && envVersion.trim()) || "";

  let version: string;
  if (explicit) {
    if (!isSemverShaped(explicit)) {
      console.error(`bump-manifest-versions: explicit version '${explicit}' is not SemVer-shaped.`);
      process.exit(1);
    }
    version = explicit;
  } else {
    version = readPackageVersion(cwd);
  }

  const pkgPath = join(cwd, "package.json");
  const pluginPath = join(cwd, ".claude-plugin", "plugin.json");
  const marketplacePath = join(cwd, ".claude-plugin", "marketplace.json");

  const results: FileBump[] = [];

  // 1. package.json — idempotent (already at `version` when read from itself; a
  //    write only happens under an explicit override that differs).
  results.push(bumpTopLevelVersion(pkgPath, version, "package.json"));

  // 2. plugin.json — top-level version.
  results.push(bumpTopLevelVersion(pluginPath, version, ".claude-plugin/plugin.json"));

  // 3. marketplace.json — nested plugins[*].version for name === 'tapagents'.
  results.push(bumpMarketplaceVersions(marketplacePath, version, ".claude-plugin/marketplace.json"));

  const anyChanged = results.some((r) => r.changed);
  console.log(`bump-manifest-versions: target version ${version}`);
  for (const r of results) {
    console.log(`  ${r.changed ? "WROTE " : "no-op "} ${r.path}`);
  }
  console.log(anyChanged ? "All three version files aligned." : "Already aligned — no changes.");
  process.exit(0);
}

try {
  main();
} catch (err) {
  if (err instanceof BumpError) {
    console.error(`bump-manifest-versions: ${err.message}`);
    process.exit(1);
  }
  console.error(`bump-manifest-versions: unexpected error: ${String(err)}`);
  process.exit(1);
}
