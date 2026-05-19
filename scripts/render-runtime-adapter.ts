import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

type JsonObject = Record<string, unknown>;

interface PackageJson {
  name: string;
  version: string;
}

interface FrontmatterFile {
  data: Record<string, string>;
  body: string;
  raw: string;
}

interface AdapterTemplate {
  path: string;
  targetPath: string;
  kind: string;
  purpose?: string;
}

interface RuntimeAdapter {
  id: string;
  runtime: string;
  status: string;
  contractVersion: string;
  defaultMode: string;
  capabilities: {
    generatesFiles: boolean;
    pluginBeta: boolean;
    requiresNetwork: boolean;
    providerSdk: boolean;
  };
  templates: AdapterTemplate[];
}

interface RenderedFile {
  path: string;
  body: string;
}

interface TomlDocument {
  [key: string]: string | number | boolean | TomlDocument;
}

const SAMPLE_PROJECT = {
  name: "TapAgents Codex Sample",
  root: ".",
  agentId: "architect",
  skillId: "status",
};

const EXPECTED_PATHS = [
  "AGENTS.md",
  ".tapagents/manifest.json",
  ".codex/config.toml",
  ".codex/agents/tapagents-architect.toml",
  ".agents/skills/tapagents-status/SKILL.md",
  "workspace/.gitkeep",
];

const FORBIDDEN_OUTPUT_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Anthropic SDK import", pattern: /@anthropic-ai\/sdk/i },
  { label: "OpenAI SDK import", pattern: /from\s+["']openai["']|require\(["']openai["']\)/i },
  { label: "Google provider SDK import", pattern: /@google\/generative-ai|google-generative-ai/i },
  { label: "provider REST endpoint", pattern: /api\.(anthropic|openai)\.com/i },
  { label: "credential-like api key field", pattern: /\bapi[_-]?key\b/i },
  { label: "credential-like access token field", pattern: /\baccess[_-]?token\b/i },
  { label: "credential-like client secret field", pattern: /\bclient[_-]?secret\b/i },
  { label: "credential-like private key field", pattern: /\bprivate[_-]?key\b/i },
  { label: "inline bearer token", pattern: /\bbearer\s+[a-z0-9._-]+/i },
  { label: "raw provider env var", pattern: /\b(ANTHROPIC|OPENAI|GOOGLE|GEMINI|AZURE_OPENAI)_[A-Z0-9_]*\b/ },
  { label: "plugin beta enabled by default", pattern: /plugin[_-]?beta[_-]?enabled\s*[:=]\s*true/i },
];

let errorCount = 0;

function fail(message: string): void {
  console.error(`[codex-renderer] ERROR: ${message}`);
  errorCount += 1;
}

function assert(condition: unknown, message: string): void {
  if (!condition) fail(message);
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

function parseFrontmatter(raw: string): FrontmatterFile {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) return { data: {}, body: raw, raw };

  const data: Record<string, string> = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf(":");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) data[key] = value;
  }

  return { data, body: match[2] ?? "", raw };
}

function tomlString(value: string): string {
  return JSON.stringify(value.replace(/\s+/g, " ").trim());
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  const rendered = template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => {
    if (!(key in vars)) {
      throw new Error(`Missing template variable '${key}'.`);
    }
    return vars[key];
  });

  const unresolved = rendered.match(/\{\{[^}]+\}\}/g);
  if (unresolved) {
    throw new Error(`Unresolved template placeholder(s): ${unresolved.join(", ")}`);
  }

  return rendered;
}

function targetPath(template: AdapterTemplate): string {
  return template.targetPath
    .replace("{{agentId}}", SAMPLE_PROJECT.agentId)
    .replace("{{skillId}}", SAMPLE_PROJECT.skillId);
}

function normalizeMarkdownExcerpt(body: string, maxLength = 600): string {
  return body.replace(/\s+/g, " ").trim().slice(0, maxLength).trim();
}

function buildManifest(pkg: PackageJson, adapter: RuntimeAdapter, generatedFiles: RenderedFile[]): JsonObject {
  return {
    schema: "tapagents.manifest",
    manifestVersion: "2.0",
    package: {
      name: pkg.name,
      version: pkg.version,
    },
    runtime: {
      adapterId: adapter.id,
      mode: adapter.defaultMode,
      pluginBetaEnabled: false,
      adapterContractVersion: adapter.contractVersion,
      adapterStatus: adapter.status,
      compatibility: {
        codexParity: "generated-files-first",
        pluginMode: "beta-opt-in",
        providerPlaceholder: false,
        stableEligible: false,
      },
    },
    generatedFiles: generatedFiles.map((file) => ({
      sourceTemplate:
        file.path === ".tapagents/manifest.json"
          ? "runtime-adapters/shared/manifest-v2.schema.json"
          : file.path === "workspace/.gitkeep"
            ? "package-local workspace placeholder"
            : `runtime-adapters/codex/templates/${sourceTemplateFor(file.path, adapter)}`,
      targetPath: file.path,
      kind: "generated-files",
      notes: "Deterministic local renderer proof; not a live Codex parity claim.",
    })),
    telemetry: {
      "runtime.adapter_id": adapter.id,
      "runtime.mode": adapter.defaultMode,
      "runtime.plugin_beta_enabled": false,
      "runtime.generated_file_count": generatedFiles.length,
      "runtime.adapter_contract_version": adapter.contractVersion,
    },
  };
}

function sourceTemplateFor(path: string, adapter: RuntimeAdapter): string {
  const found = adapter.templates.find((template) => targetPath(template) === path);
  return found?.path ?? "generated";
}

export async function renderCodexSampleProject(): Promise<RenderedFile[]> {
  const [pkg, adapter, agentRaw, commandRaw] = await Promise.all([
    readJson<PackageJson>(join(ROOT, "package.json")),
    readJson<RuntimeAdapter>(join(ROOT, "runtime-adapters", "codex", "adapter.json")),
    readFile(join(ROOT, "agents", "architect.md"), "utf8"),
    readFile(join(ROOT, "commands", "status.md"), "utf8"),
  ]);

  const agent = parseFrontmatter(agentRaw);
  const command = parseFrontmatter(commandRaw);
  const rendered: RenderedFile[] = [];

  const baseVars: Record<string, string> = {
    projectName: SAMPLE_PROJECT.name,
    projectRoot: SAMPLE_PROJECT.root,
    contractVersion: adapter.contractVersion,
    agentRoster: `- architect: ${agent.data.description ?? "TapAgents Architect"}`,
    commandRoster: `- /status: ${command.data.description ?? "Executive status briefing"}`,
    operatingNotes:
      "This generated-files sample is deterministic and local. It does not enable Codex plugin beta mode or claim live runtime parity.",
    agentId: SAMPLE_PROJECT.agentId,
    agentName: agent.data.name ?? SAMPLE_PROJECT.agentId,
    agentRole: "VP Engineering",
    agentDescription: agent.data.description ?? "TapAgents Architect",
    sourcePath: "agents/architect.md",
    developerInstructions: tomlString(
      `Use the TapAgents Architect role from agents/architect.md. ${agent.data.description ?? ""} This renderer proof is file generation only.`,
    ).slice(1, -1),
    skillName: `tapagents-${SAMPLE_PROJECT.skillId}`,
    skillDescription: command.data.description ?? "TapAgents status command.",
    skillTitle: "/status",
    skillBody: [
      `Source path: commands/status.md`,
      "",
      normalizeMarkdownExcerpt(command.body),
    ].join("\n"),
    commandName: "/status",
  };

  for (const templateMeta of adapter.templates) {
    if (templateMeta.kind !== "generated-files") continue;
    const template = await readFile(join(ROOT, "runtime-adapters", "codex", templateMeta.path), "utf8");
    rendered.push({
      path: targetPath(templateMeta),
      body: renderTemplate(template, baseVars),
    });
  }

  rendered.push({ path: "workspace/.gitkeep", body: "" });

  const manifest = buildManifest(pkg, adapter, [
    ...rendered,
    { path: ".tapagents/manifest.json", body: "" },
  ]);
  rendered.push({
    path: ".tapagents/manifest.json",
    body: `${JSON.stringify(manifest, null, 2)}\n`,
  });

  return rendered.sort((a, b) => a.path.localeCompare(b.path));
}

function parseTomlShape(body: string): TomlDocument {
  const root: TomlDocument = {};
  let current = root;

  for (const [index, rawLine] of body.split("\n").entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const table = /^\[([A-Za-z0-9_.-]+)\]$/.exec(line);
    if (table) {
      current = root;
      for (const part of table[1].split(".")) {
        const existing = current[part];
        if (!isObject(existing)) current[part] = {};
        current = current[part] as TomlDocument;
      }
      continue;
    }

    const assignment = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!assignment) {
      throw new Error(`Unsupported TOML line ${index + 1}: ${rawLine}`);
    }

    current[assignment[1]] = parseTomlValue(assignment[2], index + 1);
  }

  return root;
}

function parseTomlValue(value: string, lineNumber: number): string | number | boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('"') && value.endsWith('"')) {
    return JSON.parse(value) as string;
  }
  throw new Error(`Unsupported TOML value on line ${lineNumber}: ${value}`);
}

function getObject(value: unknown): JsonObject | null {
  return isObject(value) ? value : null;
}

function fileMap(files: RenderedFile[]): Map<string, string> {
  return new Map(files.map((file) => [file.path, file.body]));
}

function checkExpectedPaths(files: Map<string, string>): void {
  for (const path of EXPECTED_PATHS) {
    assert(files.has(path), `Expected rendered path '${path}' to exist.`);
  }
  assert(files.size === EXPECTED_PATHS.length, `Expected exactly ${EXPECTED_PATHS.length} rendered files; got ${files.size}.`);
}

function checkAgentsMd(body: string | undefined): void {
  assert(Boolean(body), "AGENTS.md was not rendered.");
  if (!body) return;
  assert(body.includes("TapAgents"), "AGENTS.md must mention TapAgents.");
  assert(body.includes("Codex"), "AGENTS.md must mention Codex.");
  assert(body.includes("generated-files"), "AGENTS.md must mention generated-files mode.");
  assert(!/stable\s+parity|live\s+plugin\s+parity|fully\s+supported/i.test(body), "AGENTS.md must not overclaim stable/live Codex parity.");
}

function checkManifest(body: string | undefined, pkg: PackageJson): void {
  assert(Boolean(body), ".tapagents/manifest.json was not rendered.");
  if (!body) return;

  const manifest = JSON.parse(body) as JsonObject;
  assert(manifest.schema === "tapagents.manifest", "manifest schema must be tapagents.manifest.");
  assert(manifest.manifestVersion === "2.0", "manifestVersion must be 2.0.");

  const pkgInfo = getObject(manifest.package);
  assert(pkgInfo?.name === pkg.name, "manifest package.name must match package.json.");
  assert(pkgInfo?.version === pkg.version, "manifest package.version must match package.json.");

  const runtime = getObject(manifest.runtime);
  assert(runtime?.adapterId === "codex", "manifest runtime.adapterId must be codex.");
  assert(runtime?.mode === "generated-files", "manifest runtime.mode must be generated-files.");
  assert(runtime?.pluginBetaEnabled === false, "manifest runtime.pluginBetaEnabled must be false.");
  assert(runtime?.adapterContractVersion === "m2-runtime-adapters.v1", "manifest adapter contract version must match M2.");
  assert(runtime?.adapterStatus === "planning-placeholder", "manifest adapter status must stay planning-placeholder.");

  const compatibility = getObject(runtime?.compatibility);
  assert(compatibility?.codexParity === "generated-files-first", "manifest codexParity must avoid live parity claims.");
  assert(compatibility?.pluginMode === "beta-opt-in", "manifest pluginMode must keep plugin beta opt-in.");
  assert(compatibility?.providerPlaceholder === false, "manifest providerPlaceholder must be false for this generated-files sample.");
  assert(compatibility?.stableEligible === false, "manifest stableEligible must be false while Codex is planning-placeholder.");

  const generatedFiles = Array.isArray(manifest.generatedFiles) ? manifest.generatedFiles : [];
  assert(generatedFiles.length === EXPECTED_PATHS.length, "manifest generatedFiles must include every rendered file.");
  const generatedTargets = new Set(
    generatedFiles
      .filter(isObject)
      .map((entry) => entry.targetPath)
      .filter((path): path is string => typeof path === "string"),
  );
  for (const path of EXPECTED_PATHS) {
    assert(generatedTargets.has(path), `manifest generatedFiles missing '${path}'.`);
  }
}

function checkToml(files: Map<string, string>): void {
  const config = parseTomlShape(files.get(".codex/config.toml") ?? "");
  const tapAgents = getObject(config.tap_agents);
  assert(tapAgents?.adapter_id === "codex", ".codex/config.toml tap_agents.adapter_id must be codex.");
  assert(tapAgents?.mode === "generated-files", ".codex/config.toml tap_agents.mode must be generated-files.");
  assert(tapAgents?.plugin_beta_enabled === false, ".codex/config.toml plugin_beta_enabled must be false.");

  const agent = parseTomlShape(files.get(".codex/agents/tapagents-architect.toml") ?? "");
  assert(typeof agent.description === "string" && agent.description.length > 0, "agent TOML must include description.");
  const instructions = getObject(agent.instructions);
  assert(
    typeof instructions?.developer_instructions === "string" && instructions.developer_instructions.length > 0,
    "agent TOML must include [instructions].developer_instructions.",
  );
}

function checkSkill(body: string | undefined): void {
  assert(Boolean(body), "tapagents-status SKILL.md was not rendered.");
  if (!body) return;
  assert(body.includes("name: \"tapagents-status\""), "skill frontmatter must name tapagents-status.");
  assert(body.includes("TapAgents command: /status"), "skill must include command metadata.");
  assert(body.includes("Source path: commands/status.md"), "skill must include source metadata.");
}

function checkForbiddenOutput(files: RenderedFile[]): void {
  for (const file of files) {
    for (const { label, pattern } of FORBIDDEN_OUTPUT_PATTERNS) {
      if (pattern.test(file.body)) {
        fail(`${file.path} contains forbidden ${label}.`);
      }
    }
  }
}

async function main(): Promise<void> {
  const pkg = await readJson<PackageJson>(join(ROOT, "package.json"));
  const first = await renderCodexSampleProject();
  const second = await renderCodexSampleProject();
  const files = fileMap(first);

  assert(JSON.stringify(first) === JSON.stringify(second), "Renderer output must be deterministic across repeated runs.");
  checkExpectedPaths(files);
  checkAgentsMd(files.get("AGENTS.md"));
  checkManifest(files.get(".tapagents/manifest.json"), pkg);
  checkToml(files);
  checkSkill(files.get(".agents/skills/tapagents-status/SKILL.md"));
  checkForbiddenOutput(first);

  if (errorCount > 0) {
    console.error(`[codex-renderer] FAILED with ${errorCount} error(s).`);
    process.exit(1);
  }

  console.log(`[codex-renderer] OK - rendered ${first.length} deterministic Codex generated-file sample(s).`);
}

main().catch((err: unknown) => {
  console.error("[codex-renderer] FAILED:", err);
  process.exit(1);
});
