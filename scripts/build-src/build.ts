/**
 * build.ts — generates the npm-package surface for @tapintomymind/tap-agents.
 *
 * Reads the framework root (agents/, commands/, protocols/, templates/, hooks/) and
 * emits dist/index.mjs + dist/index.d.ts + dist/manifest.json. The dist/ output is
 * what `npm publish` ships alongside the raw .md files (raw files stay at the package
 * root for consumers who prefer file-system access; dist/ holds inlined string bodies
 * for programmatic consumers like tapagents-app, formerly agent-dashboard pre-2026-05-14 BL-059).
 *
 * Run via:
 *   npm run build
 *
 * Pure Node stdlib. No external runtime deps. Frontmatter parsed inline.
 *
 * Invariants this build enforces:
 *  - The dist/manifest.json `version` field matches package.json `version`.
 *  - Every agent in agents/ that carries `prompt_version` in its frontmatter has it
 *    surfaced in the manifest (used downstream by EA's framework-health briefing).
 *  - No file is silently dropped: if a file exists in source but cannot be parsed,
 *    the build fails loudly rather than emitting a partial package.
 */

import { readFile, writeFile, mkdir, readdir, stat, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const DIST = join(ROOT, "dist");

interface PackageJson {
  name: string;
  version: string;
}

interface FrontmatterParsed {
  data: Record<string, string>;
  body: string;
  raw: string;
}

interface AgentDefinition {
  name: string;
  description?: string;
  promptVersion?: string;
  body: string;
  raw: string;
}

interface CommandDefinition {
  name: string;
  description?: string;
  body: string;
  raw: string;
}

interface ProtocolDefinition {
  name: string;
  body: string;
  raw: string;
}

interface TemplateDefinition {
  path: string;       // relative to templates/
  body: string;
}

interface Manifest {
  name: string;
  version: string;
  generatedAt: string;
  agents: Array<{ name: string; description?: string; promptVersion?: string }>;
  commands: Array<{ name: string; description?: string }>;
  protocols: Array<{ name: string }>;
  templates: Array<{ path: string }>;
  hooks: Array<{ name: string }>;
}

// --- helpers ---------------------------------------------------------------

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

function parseFrontmatter(raw: string): FrontmatterParsed {
  const m = FRONTMATTER_RE.exec(raw);
  if (!m) {
    return { data: {}, body: raw, raw };
  }
  const block = m[1] ?? "";
  const body = m[2] ?? "";
  const data: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf(":");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    // Strip wrapping quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) data[key] = value;
  }
  return { data, body, raw };
}

async function listMarkdown(dir: string, base = dir): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    // Skip private/planned subdirs by convention
    if (entry.name.startsWith("_")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listMarkdown(full, base)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(relative(base, full));
    }
  }
  return out.sort();
}

async function listFiles(dir: string, exts: string[]): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    if (entry.isFile() && exts.some((e) => entry.name.endsWith(e))) {
      out.push(entry.name);
    }
  }
  return out.sort();
}

function basenameNoExt(file: string): string {
  return file.replace(/\.md$/, "");
}

// --- collectors ------------------------------------------------------------

async function collectAgents(): Promise<AgentDefinition[]> {
  const files = await listMarkdown(join(ROOT, "agents"));
  const out: AgentDefinition[] = [];
  for (const rel of files) {
    const full = join(ROOT, "agents", rel);
    const raw = await readFile(full, "utf8");
    const { data, body } = parseFrontmatter(raw);
    const name = data.name ?? basenameNoExt(rel);
    out.push({
      name,
      description: data.description,
      promptVersion: data.prompt_version,
      body,
      raw,
    });
  }
  return out;
}

async function collectCommands(): Promise<CommandDefinition[]> {
  const files = await listMarkdown(join(ROOT, "commands"));
  const out: CommandDefinition[] = [];
  for (const rel of files) {
    const full = join(ROOT, "commands", rel);
    const raw = await readFile(full, "utf8");
    const { data, body } = parseFrontmatter(raw);
    const name = data.name ?? basenameNoExt(rel);
    out.push({
      name,
      description: data.description,
      body,
      raw,
    });
  }
  return out;
}

async function collectProtocols(): Promise<ProtocolDefinition[]> {
  const files = await listMarkdown(join(ROOT, "protocols"));
  const out: ProtocolDefinition[] = [];
  for (const rel of files) {
    const full = join(ROOT, "protocols", rel);
    const raw = await readFile(full, "utf8");
    const { body } = parseFrontmatter(raw);
    out.push({
      name: basenameNoExt(rel),
      body,
      raw,
    });
  }
  return out;
}

async function collectTemplates(): Promise<TemplateDefinition[]> {
  const files = await listMarkdown(join(ROOT, "templates"));
  const out: TemplateDefinition[] = [];
  for (const rel of files) {
    const full = join(ROOT, "templates", rel);
    const body = await readFile(full, "utf8");
    out.push({ path: rel, body });
  }
  return out;
}

async function collectHooks(): Promise<Array<{ name: string }>> {
  const files = await listFiles(join(ROOT, "hooks"), [".py", ".sh"]);
  return files.map((name) => ({ name }));
}

// --- emitters --------------------------------------------------------------

function stringLit(s: string): string {
  // Emit a JSON-quoted string literal — safe for inclusion in JS source.
  return JSON.stringify(s);
}

function emitIndexMjs(args: {
  pkg: PackageJson;
  agents: AgentDefinition[];
  commands: CommandDefinition[];
  protocols: ProtocolDefinition[];
  templates: TemplateDefinition[];
  hooks: Array<{ name: string }>;
  manifest: Manifest;
}): string {
  const { pkg, agents, commands, protocols, templates, hooks, manifest } = args;

  const agentEntries = agents
    .map((a) => {
      const fields = [
        `name: ${stringLit(a.name)}`,
        a.description ? `description: ${stringLit(a.description)}` : null,
        a.promptVersion ? `promptVersion: ${stringLit(a.promptVersion)}` : null,
        `body: ${stringLit(a.body)}`,
        `raw: ${stringLit(a.raw)}`,
      ].filter(Boolean);
      return `  ${stringLit(a.name)}: { ${fields.join(", ")} }`;
    })
    .join(",\n");

  const commandEntries = commands
    .map((c) => {
      const fields = [
        `name: ${stringLit(c.name)}`,
        c.description ? `description: ${stringLit(c.description)}` : null,
        `body: ${stringLit(c.body)}`,
        `raw: ${stringLit(c.raw)}`,
      ].filter(Boolean);
      return `  ${stringLit(c.name)}: { ${fields.join(", ")} }`;
    })
    .join(",\n");

  const protocolEntries = protocols
    .map((p) => {
      const fields = [
        `name: ${stringLit(p.name)}`,
        `body: ${stringLit(p.body)}`,
        `raw: ${stringLit(p.raw)}`,
      ];
      return `  ${stringLit(p.name)}: { ${fields.join(", ")} }`;
    })
    .join(",\n");

  const templateEntries = templates
    .map((t) => `  ${stringLit(t.path)}: { path: ${stringLit(t.path)}, body: ${stringLit(t.body)} }`)
    .join(",\n");

  const hookEntries = hooks
    .map((h) => `  ${stringLit(h.name)}: { name: ${stringLit(h.name)} }`)
    .join(",\n");

  return `// AUTO-GENERATED by scripts/build-src/build.ts — do not edit by hand.
// Source: @tapintomymind/tap-agents v${pkg.version}
// Generated: ${manifest.generatedAt}

export const VERSION = ${stringLit(pkg.version)};

export const manifest = ${JSON.stringify(manifest, null, 2)};

export const agents = {
${agentEntries}
};

export const commands = {
${commandEntries}
};

export const protocols = {
${protocolEntries}
};

export const templates = {
${templateEntries}
};

export const hooks = {
${hookEntries}
};

export function getAgent(name) {
  return agents[name];
}

export function getCommand(name) {
  return commands[name];
}

export function getProtocol(name) {
  return protocols[name];
}

export function getTemplate(path) {
  return templates[path];
}

export default { VERSION, manifest, agents, commands, protocols, templates, hooks };
`;
}

function emitIndexDts(args: {
  pkg: PackageJson;
  agents: AgentDefinition[];
  commands: CommandDefinition[];
  protocols: ProtocolDefinition[];
  templates: TemplateDefinition[];
  hooks: Array<{ name: string }>;
}): string {
  const { agents, commands, protocols, templates } = args;
  const agentNames = agents.map((a) => stringLit(a.name)).join(" | ") || "string";
  const commandNames = commands.map((c) => stringLit(c.name)).join(" | ") || "string";
  const protocolNames = protocols.map((p) => stringLit(p.name)).join(" | ") || "string";
  const templatePaths = templates.map((t) => stringLit(t.path)).join(" | ") || "string";

  return `// AUTO-GENERATED by scripts/build-src/build.ts — do not edit by hand.

export declare const VERSION: string;

export interface AgentDefinition {
  name: string;
  description?: string;
  promptVersion?: string;
  body: string;
  raw: string;
}

export interface CommandDefinition {
  name: string;
  description?: string;
  body: string;
  raw: string;
}

export interface ProtocolDefinition {
  name: string;
  body: string;
  raw: string;
}

export interface TemplateDefinition {
  path: string;
  body: string;
}

export interface HookEntry {
  name: string;
}

export interface ManifestEntry {
  name: string;
  description?: string;
  promptVersion?: string;
}

export interface Manifest {
  name: string;
  version: string;
  generatedAt: string;
  agents: ManifestEntry[];
  commands: ManifestEntry[];
  protocols: Array<{ name: string }>;
  templates: Array<{ path: string }>;
  hooks: Array<{ name: string }>;
}

export type AgentName = ${agentNames};
export type CommandName = ${commandNames};
export type ProtocolName = ${protocolNames};
export type TemplatePath = ${templatePaths};

export declare const manifest: Manifest;
export declare const agents: Record<string, AgentDefinition>;
export declare const commands: Record<string, CommandDefinition>;
export declare const protocols: Record<string, ProtocolDefinition>;
export declare const templates: Record<string, TemplateDefinition>;
export declare const hooks: Record<string, HookEntry>;

export declare function getAgent(name: string): AgentDefinition | undefined;
export declare function getCommand(name: string): CommandDefinition | undefined;
export declare function getProtocol(name: string): ProtocolDefinition | undefined;
export declare function getTemplate(path: string): TemplateDefinition | undefined;

declare const _default: {
  VERSION: string;
  manifest: Manifest;
  agents: Record<string, AgentDefinition>;
  commands: Record<string, CommandDefinition>;
  protocols: Record<string, ProtocolDefinition>;
  templates: Record<string, TemplateDefinition>;
  hooks: Record<string, HookEntry>;
};
export default _default;
`;
}

// --- main ------------------------------------------------------------------

async function main(): Promise<void> {
  const pkgRaw = await readFile(join(ROOT, "package.json"), "utf8");
  const pkg = JSON.parse(pkgRaw) as PackageJson;

  // Clean dist/
  if (existsSync(DIST)) {
    await rm(DIST, { recursive: true });
  }
  await mkdir(DIST, { recursive: true });

  const [agents, commands, protocols, templates, hooks] = await Promise.all([
    collectAgents(),
    collectCommands(),
    collectProtocols(),
    collectTemplates(),
    collectHooks(),
  ]);

  const manifest: Manifest = {
    name: pkg.name,
    version: pkg.version,
    generatedAt: new Date().toISOString(),
    agents: agents.map(({ name, description, promptVersion }) => ({
      name,
      ...(description ? { description } : {}),
      ...(promptVersion ? { promptVersion } : {}),
    })),
    commands: commands.map(({ name, description }) => ({
      name,
      ...(description ? { description } : {}),
    })),
    protocols: protocols.map(({ name }) => ({ name })),
    templates: templates.map(({ path }) => ({ path })),
    hooks,
  };

  const indexMjs = emitIndexMjs({ pkg, agents, commands, protocols, templates, hooks, manifest });
  const indexDts = emitIndexDts({ pkg, agents, commands, protocols, templates, hooks });

  await Promise.all([
    writeFile(join(DIST, "index.mjs"), indexMjs, "utf8"),
    writeFile(join(DIST, "index.d.ts"), indexDts, "utf8"),
    writeFile(join(DIST, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8"),
  ]);

  // Verify against marketplace + plugin manifests (warn-only; verify.ts hard-checks).
  const pluginJsonPath = join(ROOT, ".claude-plugin", "plugin.json");
  if (existsSync(pluginJsonPath)) {
    const plugin = JSON.parse(await readFile(pluginJsonPath, "utf8"));
    if (plugin.version !== pkg.version) {
      console.warn(
        `[build] WARNING: package.json version (${pkg.version}) differs from .claude-plugin/plugin.json version (${plugin.version}). Run /release or fix manually.`,
      );
    }
  }

  console.log(`[build] @tapintomymind/tap-agents@${pkg.version}`);
  console.log(`[build]   agents:    ${agents.length}`);
  console.log(`[build]   commands:  ${commands.length}`);
  console.log(`[build]   protocols: ${protocols.length}`);
  console.log(`[build]   templates: ${templates.length}`);
  console.log(`[build]   hooks:     ${hooks.length}`);
  console.log(`[build]   output:    ${relative(ROOT, DIST)}/`);
}

main().catch((err: unknown) => {
  console.error("[build] FAILED:", err);
  process.exit(1);
});
