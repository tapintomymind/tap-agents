/**
 * verify.ts — post-build sanity check.
 *
 * Runs as part of `prepublishOnly` (npm publish guard). Hard-fails if any invariant
 * the npm consumer or marketplace consumer would care about is broken:
 *
 *  1. dist/index.mjs exists and is loadable
 *  2. dist/index.d.ts exists
 *  3. dist/manifest.json `version` === package.json `version`
 *  4. .claude-plugin/plugin.json `version` === package.json `version`
 *  5. .claude-plugin/marketplace.json plugin entries all match package.json `version`
 *  6. Every agent / command file in source is reflected in the dist manifest
 *  7. (mirror-only) the `tapagents` CLI bin's reported version === package.json `version`
 *
 * Run via:
 *   npm run verify
 */

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const DIST = join(ROOT, "dist");

interface Manifest {
  name: string;
  version: string;
  agents: Array<{ name: string }>;
  commands: Array<{ name: string }>;
  protocols: Array<{ name: string }>;
  templates: Array<{ path: string }>;
}

interface PluginJson {
  version: string;
}

interface MarketplaceJson {
  plugins: Array<{ name: string; version?: string }>;
}

let errorCount = 0;
function fail(msg: string): void {
  console.error(`[verify] ERROR: ${msg}`);
  errorCount += 1;
}

async function checkDistExists(): Promise<Manifest | null> {
  if (!existsSync(join(DIST, "index.mjs"))) {
    fail("dist/index.mjs does not exist. Run `npm run build` first.");
    return null;
  }
  if (!existsSync(join(DIST, "index.d.ts"))) {
    fail("dist/index.d.ts does not exist. Run `npm run build` first.");
  }
  if (!existsSync(join(DIST, "manifest.json"))) {
    fail("dist/manifest.json does not exist. Run `npm run build` first.");
    return null;
  }
  try {
    const raw = await readFile(join(DIST, "manifest.json"), "utf8");
    return JSON.parse(raw) as Manifest;
  } catch (err) {
    fail(`dist/manifest.json is not valid JSON: ${(err as Error).message}`);
    return null;
  }
}

async function checkVersionsAligned(packageVersion: string, manifest: Manifest): Promise<void> {
  if (manifest.version !== packageVersion) {
    fail(
      `dist/manifest.json version (${manifest.version}) does not match package.json version (${packageVersion}). Rebuild.`,
    );
  }

  const pluginPath = join(ROOT, ".claude-plugin", "plugin.json");
  if (existsSync(pluginPath)) {
    try {
      const plugin = JSON.parse(await readFile(pluginPath, "utf8")) as PluginJson;
      if (plugin.version !== packageVersion) {
        fail(
          `.claude-plugin/plugin.json version (${plugin.version}) does not match package.json version (${packageVersion}). Per protocols/versioning-protocol.md §6, these must be locked.`,
        );
      }
    } catch (err) {
      fail(`.claude-plugin/plugin.json is not valid JSON: ${(err as Error).message}`);
    }
  } else {
    console.warn("[verify] note: .claude-plugin/plugin.json missing — marketplace channel not yet wired.");
  }

  const marketplacePath = join(ROOT, ".claude-plugin", "marketplace.json");
  if (existsSync(marketplacePath)) {
    try {
      const market = JSON.parse(await readFile(marketplacePath, "utf8")) as MarketplaceJson;
      for (const p of market.plugins ?? []) {
        if (p.version && p.version !== packageVersion) {
          fail(
            `.claude-plugin/marketplace.json plugin '${p.name}' version (${p.version}) does not match package.json version (${packageVersion}). Per protocols/versioning-protocol.md §6, these must be locked.`,
          );
        }
      }
    } catch (err) {
      fail(`.claude-plugin/marketplace.json is not valid JSON: ${(err as Error).message}`);
    }
  }
}

async function checkSourceReflectedInManifest(manifest: Manifest): Promise<void> {
  // Every .md file in agents/ + commands/ + protocols/ should appear in the manifest.
  const checks: Array<{ dir: string; manifestKey: "agents" | "commands" | "protocols" }> = [
    { dir: "agents", manifestKey: "agents" },
    { dir: "commands", manifestKey: "commands" },
    { dir: "protocols", manifestKey: "protocols" },
  ];
  for (const { dir, manifestKey } of checks) {
    const dirPath = join(ROOT, dir);
    if (!existsSync(dirPath)) continue;
    const entries = await readdir(dirPath, { withFileTypes: true });
    const sourceNames = new Set<string>();
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith("_")) {
        sourceNames.add(entry.name.replace(/\.md$/, ""));
      }
    }
    const manifestNames = new Set<string>();
    const list = manifest[manifestKey] as Array<{ name: string }>;
    for (const item of list ?? []) {
      manifestNames.add(item.name);
    }
    // Source files may declare a different `name:` in frontmatter — so this check is
    // intentionally lenient on the name-mismatch case (build.ts uses frontmatter `name`
    // when present). The count must match, though.
    if (sourceNames.size !== manifestNames.size) {
      fail(
        `Source ${dir}/ has ${sourceNames.size} files but manifest lists ${manifestNames.size}. Rebuild may have dropped files.`,
      );
    }
  }
}

async function checkIndexLoadable(): Promise<void> {
  try {
    const url = pathToFileURL(join(DIST, "index.mjs")).href;
    const mod = await import(url);
    if (typeof mod.VERSION !== "string") {
      fail("dist/index.mjs does not export VERSION as a string.");
    }
    if (typeof mod.manifest !== "object" || mod.manifest === null) {
      fail("dist/index.mjs does not export manifest as an object.");
    }
    if (typeof mod.agents !== "object" || mod.agents === null) {
      fail("dist/index.mjs does not export agents as an object.");
    }
  } catch (err) {
    fail(`Failed to import dist/index.mjs: ${(err as Error).message}`);
  }
}

/**
 * Defensive, mirror-only: the `tapagents` CLI bin must report the same version as
 * package.json — closes the version-lag class where the bin hardcodes a stale
 * literal (the published v0.29.0 bin printed "0.28.0").
 *
 * Written DEFENSIVELY so this one verify.ts works at BOTH topology endpoints:
 *   - At framework HQ there is NO cli/ (the CLI is mirror-native, committed only
 *     into tap-agents/), so the existsSync guard makes this a clean no-op.
 *   - In the published mirror (tap-agents/, where publish.yml runs verify) cli/
 *     exists, so the check runs and gates the publish.
 *
 * The bin exports `VERSION` (the exact value `tapagents --version` prints) and
 * guards its own auto-run behind an isEntrypoint check, so importing it here is
 * side-effect-free.
 */
async function checkCliVersionMatchesPackage(packageVersion: string): Promise<void> {
  const cliPath = join(ROOT, "cli", "tapagents.mjs");
  if (!existsSync(cliPath)) {
    return; // No cli/ here (HQ topology) — nothing to check.
  }
  try {
    const mod = (await import(pathToFileURL(cliPath).href)) as { VERSION?: unknown };
    if (typeof mod.VERSION !== "string") {
      fail("cli/tapagents.mjs does not export VERSION as a string.");
      return;
    }
    if (mod.VERSION !== packageVersion) {
      fail(
        `cli/tapagents.mjs reported version (${mod.VERSION}) does not match package.json version (${packageVersion}). The bin must read its version from package.json at runtime — not a hardcoded literal.`,
      );
    }
  } catch (err) {
    fail(`Failed to import cli/tapagents.mjs to verify its version: ${(err as Error).message}`);
  }
}

async function main(): Promise<void> {
  const pkgRaw = await readFile(join(ROOT, "package.json"), "utf8");
  const pkg = JSON.parse(pkgRaw) as { version: string };

  const manifest = await checkDistExists();
  if (!manifest) {
    process.exit(1);
  }

  await checkVersionsAligned(pkg.version, manifest);
  await checkSourceReflectedInManifest(manifest);
  await checkIndexLoadable();
  await checkCliVersionMatchesPackage(pkg.version);

  if (errorCount > 0) {
    console.error(`[verify] FAILED with ${errorCount} error(s).`);
    process.exit(1);
  }
  console.log(`[verify] OK — @tapintomymind/tap-agents@${pkg.version} ready to publish.`);
}

main().catch((err: unknown) => {
  console.error("[verify] FAILED:", err);
  process.exit(1);
});
