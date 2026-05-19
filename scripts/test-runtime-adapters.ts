import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const RUNTIME_ROOT = join(ROOT, "runtime-adapters");

const REQUIRED_SHARED = [
  "adapter-contract.json",
  "manifest-v2.schema.json",
  "telemetry-fields.json",
];

const FORBIDDEN_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Anthropic SDK import", pattern: /@anthropic-ai\/sdk/i },
  { label: "OpenAI SDK import", pattern: /from\s+["']openai["']|require\(["']openai["']\)/i },
  { label: "Google provider SDK import", pattern: /@google\/generative-ai|google-generative-ai/i },
  { label: "provider REST endpoint", pattern: /api\.(anthropic|openai)\.com/i },
  { label: "credential-like api key field", pattern: /\bapi[_-]?key\b/i },
  { label: "credential-like access token field", pattern: /\baccess[_-]?token\b/i },
  { label: "credential-like client secret field", pattern: /\bclient[_-]?secret\b/i },
  { label: "credential-like private key field", pattern: /\bprivate[_-]?key\b/i },
  { label: "inline bearer token", pattern: /\bbearer\s+[a-z0-9._-]+/i },
];

let errorCount = 0;

function fail(message: string): void {
  console.error(`[runtime-adapters] ERROR: ${message}`);
  errorCount += 1;
}

async function listFiles(dir: string, base = dir): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFiles(full, base)));
    } else if (entry.isFile()) {
      out.push(relative(base, full));
    }
  }
  return out.sort();
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch (err) {
    fail(`${relative(ROOT, path)} is not valid JSON: ${(err as Error).message}`);
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function resolveSchemaNode(schema: Record<string, unknown>, node: unknown): Record<string, unknown> | null {
  if (!isObject(node)) return null;
  if (typeof node.$ref !== "string") return node;
  const prefix = "#/$defs/";
  if (!node.$ref.startsWith(prefix)) return null;
  const defs = isObject(schema.$defs) ? schema.$defs : {};
  const resolved = defs[node.$ref.slice(prefix.length)];
  return isObject(resolved) ? resolved : null;
}

function enumFromSchema(schema: Record<string, unknown>, node: unknown): string[] {
  const resolved = resolveSchemaNode(schema, node);
  return resolved ? asStringArray(resolved.enum) : [];
}

function constFromSchema(schema: Record<string, unknown>, node: unknown): unknown {
  const resolved = resolveSchemaNode(schema, node);
  return resolved?.const;
}

function requiredFromSchema(node: unknown): string[] {
  return isObject(node) ? asStringArray(node.required) : [];
}

function startsWithPath(path: string, prefix: string): boolean {
  return path === prefix.slice(0, -1) || path.startsWith(prefix);
}

function isCodexSkillTarget(path: string): boolean {
  return /^\.agents\/skills\/tapagents-[^/]+\/SKILL\.md$/.test(path);
}

function checkTemplateTargetNamespace(adapterId: string, templatePath: string, targetPath: string): void {
  if (adapterId === "codex") {
    if (startsWithPath(targetPath, ".claude/") || startsWithPath(targetPath, ".claude-plugin/") || targetPath === "CLAUDE.md") {
      fail(`Codex template '${templatePath}' must not target Claude namespace '${targetPath}'.`);
    }

    const allowed =
      targetPath === "AGENTS.md" ||
      startsWithPath(targetPath, ".codex/") ||
      isCodexSkillTarget(targetPath);
    if (!allowed) {
      fail(`Codex template '${templatePath}' target '${targetPath}' must be AGENTS.md, .codex/**, or .agents/skills/tapagents-*/SKILL.md.`);
    }

    if (targetPath.endsWith(".md") && targetPath !== "AGENTS.md" && !isCodexSkillTarget(targetPath)) {
      fail(`Codex markdown target '${targetPath}' must be root AGENTS.md or .agents/skills/tapagents-*/SKILL.md.`);
    }
    return;
  }

  if (adapterId === "claude") {
    if (startsWithPath(targetPath, ".codex/") || startsWithPath(targetPath, ".agents/skills/") || targetPath === "AGENTS.md") {
      fail(`Claude template '${templatePath}' must not target Codex namespace '${targetPath}'.`);
    }

    const allowed =
      targetPath === "CLAUDE.md" ||
      startsWithPath(targetPath, ".claude/") ||
      startsWithPath(targetPath, ".claude-plugin/");
    if (!allowed) {
      fail(`Claude template '${templatePath}' target '${targetPath}' must be .claude/**, .claude-plugin/**, or CLAUDE.md.`);
    }
  }
}

async function checkSharedFiles(): Promise<void> {
  for (const file of REQUIRED_SHARED) {
    const full = join(RUNTIME_ROOT, "shared", file);
    if (!existsSync(full)) {
      fail(`runtime-adapters/shared/${file} is missing.`);
      continue;
    }
    await readJson(full);
  }
}

async function checkAdapters(): Promise<void> {
  const entries = await readdir(RUNTIME_ROOT, { withFileTypes: true });
  const adapterIds: string[] = [];
  const contract = await readJson(join(RUNTIME_ROOT, "shared", "adapter-contract.json"));
  if (!contract) return;

  const contractProperties = isObject(contract.properties) ? contract.properties : {};
  const requiredAdapterFields = requiredFromSchema(contract);
  const allowedAdapterIds = enumFromSchema(contract, contractProperties.id);
  const allowedRuntimes = enumFromSchema(contract, contractProperties.runtime);
  const allowedStatuses = enumFromSchema(contract, contractProperties.status);
  const allowedModes = enumFromSchema(contract, contractProperties.defaultMode);
  const contractVersion = constFromSchema(contract, contractProperties.contractVersion);
  const capabilitiesSchema = resolveSchemaNode(contract, contractProperties.capabilities);
  const requiredCapabilities = requiredFromSchema(capabilitiesSchema);
  const templatesSchema = resolveSchemaNode(contract, contractProperties.templates);
  const templateItemSchema = resolveSchemaNode(contract, isObject(templatesSchema) ? templatesSchema.items : undefined);
  const requiredTemplateFields = requiredFromSchema(templateItemSchema);
  const templateProperties = isObject(templateItemSchema?.properties) ? templateItemSchema.properties : {};
  const allowedTemplateKinds = enumFromSchema(contract, templateProperties.kind);

  if (!requiredAdapterFields.includes("capabilities") || !requiredAdapterFields.includes("templates")) {
    fail("adapter-contract.json must require capabilities and templates.");
  }
  if (!allowedAdapterIds.includes("claude") || !allowedAdapterIds.includes("codex")) {
    fail("adapter-contract.json must enumerate current M2 adapter ids.");
  }
  if (!allowedModes.includes("generated-files") || !allowedModes.includes("legacy-manifest") || !allowedModes.includes("plugin-beta")) {
    fail("adapter-contract.json must enumerate generated-files, legacy-manifest, and plugin-beta modes.");
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "shared" || entry.name.startsWith("_") || entry.name.startsWith(".")) {
      continue;
    }

    const adapterDir = join(RUNTIME_ROOT, entry.name);
    const adapter = await readJson(join(adapterDir, "adapter.json"));
    if (!adapter) continue;

    for (const field of requiredAdapterFields) {
      if (!(field in adapter)) {
        fail(`runtime-adapters/${entry.name}/adapter.json missing required field '${field}'.`);
      }
    }

    const id = typeof adapter.id === "string" ? adapter.id : entry.name;
    adapterIds.push(id);

    if (!allowedAdapterIds.includes(id)) {
      fail(`runtime-adapters/${entry.name}/adapter.json id '${id}' is not allowed by adapter-contract.json.`);
    }

    if (typeof adapter.runtime !== "string" || !allowedRuntimes.includes(adapter.runtime)) {
      fail(`runtime-adapters/${entry.name}/adapter.json runtime '${String(adapter.runtime)}' is not allowed by adapter-contract.json.`);
    }

    if (typeof adapter.status !== "string" || !allowedStatuses.includes(adapter.status)) {
      fail(`runtime-adapters/${entry.name}/adapter.json status '${String(adapter.status)}' is not allowed by adapter-contract.json.`);
    }

    if (adapter.contractVersion !== contractVersion) {
      fail(`runtime-adapters/${entry.name}/adapter.json contractVersion must be '${String(contractVersion)}'.`);
    }

    if (typeof adapter.defaultMode !== "string" || !allowedModes.includes(adapter.defaultMode)) {
      fail(`runtime-adapters/${entry.name}/adapter.json defaultMode '${String(adapter.defaultMode)}' is not allowed by adapter-contract.json.`);
    }

    if (!Array.isArray(adapter.modes)) {
      fail(`runtime-adapters/${entry.name}/adapter.json modes must be an array.`);
    } else {
      const modeIds = new Set<string>();
      let defaultCount = 0;
      for (const mode of adapter.modes) {
        if (!isObject(mode)) {
          fail(`runtime-adapters/${entry.name}/adapter.json has a non-object mode.`);
          continue;
        }
        if (typeof mode.id !== "string" || !allowedModes.includes(mode.id)) {
          fail(`runtime-adapters/${entry.name}/adapter.json mode id '${String(mode.id)}' is not allowed by adapter-contract.json.`);
        } else {
          modeIds.add(mode.id);
        }
        if (typeof mode.kind !== "string" || !allowedModes.includes(mode.kind)) {
          fail(`runtime-adapters/${entry.name}/adapter.json mode kind '${String(mode.kind)}' is not allowed by adapter-contract.json.`);
        }
        if (mode.id !== mode.kind) {
          fail(`runtime-adapters/${entry.name}/adapter.json mode '${String(mode.id)}' must use the same id and kind.`);
        }
        if (typeof mode.default !== "boolean") {
          fail(`runtime-adapters/${entry.name}/adapter.json mode '${String(mode.id)}' must declare boolean default.`);
        }
        if (mode.default === true) defaultCount += 1;
        if (mode.id === "plugin-beta" && mode.default !== false) {
          fail(`runtime-adapters/${entry.name}/adapter.json plugin-beta mode must not be default.`);
        }
      }
      if (typeof adapter.defaultMode === "string" && !modeIds.has(adapter.defaultMode)) {
        fail(`runtime-adapters/${entry.name}/adapter.json defaultMode must match a declared mode id.`);
      }
      if (defaultCount !== 1) {
        fail(`runtime-adapters/${entry.name}/adapter.json must declare exactly one default mode.`);
      }
    }

    if (!isObject(adapter.capabilities)) {
      fail(`runtime-adapters/${entry.name}/adapter.json capabilities must be an object.`);
    } else {
      for (const field of requiredCapabilities) {
        if (typeof adapter.capabilities[field] !== "boolean") {
          fail(`runtime-adapters/${entry.name}/adapter.json capabilities.${field} must be boolean.`);
        }
      }
    }

    if (!Array.isArray(adapter.templates)) {
      fail(`runtime-adapters/${entry.name}/adapter.json templates must be an array.`);
      continue;
    }

    for (const template of adapter.templates) {
      if (!isObject(template) || typeof template.path !== "string") {
        fail(`runtime-adapters/${entry.name}/adapter.json has a template without a string path.`);
        continue;
      }
      for (const field of requiredTemplateFields) {
        if (!(field in template)) {
          fail(`runtime-adapters/${entry.name}/adapter.json template '${template.path}' missing required field '${field}'.`);
        }
      }
      if (typeof template.targetPath !== "string" || template.targetPath.length === 0) {
        fail(`runtime-adapters/${entry.name}/adapter.json template '${template.path}' must declare targetPath.`);
      } else {
        checkTemplateTargetNamespace(id, template.path, template.targetPath);
      }
      if (typeof template.kind !== "string" || !allowedTemplateKinds.includes(template.kind)) {
        fail(`runtime-adapters/${entry.name}/adapter.json template '${template.path}' kind '${String(template.kind)}' is not allowed by adapter-contract.json.`);
      }
      const templatePath = join(adapterDir, template.path);
      if (!existsSync(templatePath)) {
        fail(`runtime-adapters/${entry.name}/adapter.json references missing template ${template.path}.`);
      }
    }
  }

  const allowed = new Set(["claude", "codex"]);
  for (const id of adapterIds) {
    if (!allowed.has(id)) {
      fail(`Unexpected runtime adapter '${id}'. This slice should only introduce claude and codex metadata.`);
    }
  }
}

async function checkCodexDefaultMode(): Promise<void> {
  const codex = await readJson(join(RUNTIME_ROOT, "codex", "adapter.json"));
  if (!codex) return;

  if (codex.defaultMode === "plugin-beta") {
    fail("Codex plugin beta mode must not be the default mode.");
  }

  if (!Array.isArray(codex.modes)) {
    fail("Codex adapter modes must be an array.");
    return;
  }

  for (const mode of codex.modes) {
    if (!isObject(mode)) continue;
    if (mode.id === "plugin-beta" && mode.default !== false) {
      fail("Codex plugin-beta mode must explicitly set default: false.");
    }
  }
}

async function checkCodexSkillTargets(): Promise<void> {
  const codex = await readJson(join(RUNTIME_ROOT, "codex", "adapter.json"));
  if (!codex) return;

  if (!Array.isArray(codex.templates)) {
    fail("Codex adapter templates must be an array.");
    return;
  }

  for (const template of codex.templates) {
    if (!isObject(template) || typeof template.targetPath !== "string") continue;
    if (template.targetPath.endsWith("/SKILL.md") && !template.targetPath.startsWith(".agents/skills/")) {
      fail(`Codex skill target '${template.targetPath}' must be under .agents/skills/.`);
    }
    if (template.path === "templates/agent.toml.tpl" && !template.targetPath.startsWith(".codex/agents/tapagents-")) {
      fail(`Codex agent target '${template.targetPath}' must be namespaced under .codex/agents/tapagents-.`);
    }
  }
}

async function checkCodexAgentTemplateReadiness(): Promise<void> {
  const templatePath = join(RUNTIME_ROOT, "codex", "templates", "agent.toml.tpl");
  const body = await readFile(templatePath, "utf8");
  if (!/^description\s*=/m.test(body)) {
    fail("Codex agent template must include a description placeholder.");
  }
  if (!/^developer_instructions\s*=/m.test(body)) {
    fail("Codex agent template must include a developer_instructions placeholder.");
  }
}

async function checkManifestV2Contract(): Promise<void> {
  const schema = await readJson(join(RUNTIME_ROOT, "shared", "manifest-v2.schema.json"));
  if (!schema) return;

  const required = Array.isArray(schema.required) ? schema.required : [];
  const properties = isObject(schema.properties) ? schema.properties : {};

  if (!required.includes("schema")) {
    fail("manifest-v2.schema.json must require canonical 'schema'.");
  }

  if (!required.includes("manifestVersion")) {
    fail("manifest-v2.schema.json must require 'manifestVersion'.");
  }

  if (required.includes("schemaVersion")) {
    fail("manifest-v2.schema.json must not require legacy 'schemaVersion'.");
  }

  if (!isObject(properties.schema)) {
    fail("manifest-v2.schema.json must define 'schema'.");
  } else if (properties.schema.const !== "tapagents.manifest") {
    fail("manifest-v2.schema.json 'schema' const must be tapagents.manifest.");
  }

  if (!isObject(properties.manifestVersion)) {
    fail("manifest-v2.schema.json must define 'manifestVersion'.");
  } else if (properties.manifestVersion.const !== "2.0") {
    fail("manifest-v2.schema.json 'manifestVersion' const must be 2.0.");
  }

  if ("schemaVersion" in properties) {
    fail("manifest-v2.schema.json must not define legacy 'schemaVersion'.");
  }

  const defs = isObject(schema.$defs) ? schema.$defs : {};
  const adapterIdEnum = isObject(defs.adapterId) ? asStringArray(defs.adapterId.enum) : [];
  const adapterModeEnum = isObject(defs.adapterMode) ? asStringArray(defs.adapterMode.enum) : [];
  const adapterStatusEnum = isObject(defs.adapterStatus) ? asStringArray(defs.adapterStatus.enum) : [];
  const runtimeSupportStateEnum = isObject(defs.runtimeSupportState) ? asStringArray(defs.runtimeSupportState.enum) : [];
  for (const id of ["claude", "codex"]) {
    if (!adapterIdEnum.includes(id)) {
      fail(`manifest-v2.schema.json adapterId enum must include '${id}'.`);
    }
  }
  for (const mode of ["generated-files", "legacy-manifest", "plugin-beta"]) {
    if (!adapterModeEnum.includes(mode)) {
      fail(`manifest-v2.schema.json adapterMode enum must include '${mode}'.`);
    }
  }
  for (const status of ["stable-existing", "planning-placeholder", "beta-placeholder"]) {
    if (!adapterStatusEnum.includes(status)) {
      fail(`manifest-v2.schema.json adapterStatus enum must include '${status}'.`);
    }
  }
  for (const state of ["supported", "candidate", "placeholder", "unsupported"]) {
    if (!runtimeSupportStateEnum.includes(state)) {
      fail(`manifest-v2.schema.json runtimeSupportState enum must include '${state}'.`);
    }
  }

  const runtime = isObject(properties.runtime) ? properties.runtime : {};
  const runtimeRequired = requiredFromSchema(runtime);
  const runtimeProperties = isObject(runtime.properties) ? runtime.properties : {};
  if (!runtimeRequired.includes("adapterContractVersion")) {
    fail("manifest-v2.schema.json runtime must require adapterContractVersion.");
  }
  if (!runtimeRequired.includes("compatibility")) {
    fail("manifest-v2.schema.json runtime must require compatibility metadata.");
  }
  if (!isObject(runtimeProperties.compatibility)) {
    fail("manifest-v2.schema.json runtime.compatibility must be defined.");
  }

  const generatedFiles = isObject(properties.generatedFiles) ? properties.generatedFiles : {};
  const generatedItem = isObject(generatedFiles.items) ? generatedFiles.items : {};
  const generatedProperties = isObject(generatedItem.properties) ? generatedItem.properties : {};
  const generatedKindEnum = enumFromSchema(schema, generatedProperties.kind);
  for (const mode of ["generated-files", "legacy-manifest", "plugin-beta"]) {
    if (!generatedKindEnum.includes(mode)) {
      fail(`manifest-v2.schema.json generatedFiles.kind enum must include '${mode}'.`);
    }
  }

  if (required.includes("agentCatalog")) {
    fail("manifest-v2.schema.json must not require optional 'agentCatalog'.");
  }
  if (required.includes("agentSelection")) {
    fail("manifest-v2.schema.json must not require optional 'agentSelection'.");
  }

  const agentCatalog = isObject(properties.agentCatalog) ? properties.agentCatalog : {};
  const agentCatalogRequired = requiredFromSchema(agentCatalog);
  const agentCatalogProperties = isObject(agentCatalog.properties) ? agentCatalog.properties : {};
  const agentsSchema = isObject(agentCatalogProperties.agents) ? agentCatalogProperties.agents : {};
  const agentItemSchema = isObject(agentsSchema.items) ? agentsSchema.items : {};
  const agentItemRequired = requiredFromSchema(agentItemSchema);
  const agentItemProperties = isObject(agentItemSchema.properties) ? agentItemSchema.properties : {};
  const runtimeSupport = isObject(agentItemProperties.runtimeSupport) ? agentItemProperties.runtimeSupport : {};
  const runtimeSupportProperties = isObject(runtimeSupport.properties) ? runtimeSupport.properties : {};
  const defaultRecommendationEnum = enumFromSchema(schema, agentItemProperties.defaultRecommendation);
  for (const field of ["catalogVersion", "sourcePackage", "agents"]) {
    if (!agentCatalogRequired.includes(field)) {
      fail(`manifest-v2.schema.json agentCatalog must require '${field}' when present.`);
    }
  }
  for (const field of ["agentId", "sourcePath", "status"]) {
    if (!agentItemRequired.includes(field)) {
      fail(`manifest-v2.schema.json agentCatalog.agents items must require '${field}'.`);
    }
  }
  for (const runtimeId of ["claude", "codex"]) {
    if (!isObject(runtimeSupportProperties[runtimeId])) {
      fail(`manifest-v2.schema.json agentCatalog runtimeSupport must expose '${runtimeId}'.`);
    } else if (enumFromSchema(schema, runtimeSupportProperties[runtimeId]).length === 0) {
      fail(`manifest-v2.schema.json agentCatalog runtimeSupport.${runtimeId} must use runtimeSupportState.`);
    }
  }
  for (const recommendation of ["required", "recommended", "optional", "excluded"]) {
    if (!defaultRecommendationEnum.includes(recommendation)) {
      fail(`manifest-v2.schema.json agentCatalog defaultRecommendation enum must include '${recommendation}'.`);
    }
  }

  const agentSelection = isObject(properties.agentSelection) ? properties.agentSelection : {};
  const agentSelectionRequired = requiredFromSchema(agentSelection);
  const agentSelectionProperties = isObject(agentSelection.properties) ? agentSelection.properties : {};
  for (const field of ["selectionVersion", "selectedAgentIds", "requiredAgentIds", "recommendedAgentIds", "excludedAgentIds", "unsupportedAgentIds"]) {
    if (!agentSelectionRequired.includes(field)) {
      fail(`manifest-v2.schema.json agentSelection must require '${field}' when present.`);
    }
  }
  for (const field of ["selectedAgentIds", "requiredAgentIds", "recommendedAgentIds", "excludedAgentIds", "unsupportedAgentIds"]) {
    if (!isObject(resolveSchemaNode(schema, agentSelectionProperties[field]))) {
      fail(`manifest-v2.schema.json agentSelection.${field} must use a reusable agent id array schema.`);
    }
  }
  if (!isObject(agentSelectionProperties.selectionVersion) || agentSelectionProperties.selectionVersion.type !== "integer") {
    fail("manifest-v2.schema.json agentSelection.selectionVersion must be an integer.");
  }
  if (!isObject(agentSelectionProperties.selectionDigest) || agentSelectionProperties.selectionDigest.pattern !== "^sha256:[a-f0-9]{64}$") {
    fail("manifest-v2.schema.json agentSelection.selectionDigest must match sha256 lowercase hex digests.");
  }
}

async function checkTelemetryFields(): Promise<void> {
  const telemetry = await readJson(join(RUNTIME_ROOT, "shared", "telemetry-fields.json"));
  if (!telemetry) return;

  const fields = Array.isArray(telemetry.fields) ? telemetry.fields : [];
  const names = fields.map((field) => (isObject(field) ? field.name : undefined));
  if (names.includes("runtime.template_contract_version")) {
    fail("telemetry-fields.json must use runtime.adapter_contract_version, not runtime.template_contract_version.");
  }
  if (!names.includes("runtime.adapter_contract_version")) {
    fail("telemetry-fields.json must include runtime.adapter_contract_version.");
  }
}

async function checkNoProviderImportsOrCredentialMaterial(): Promise<void> {
  for (const rel of await listFiles(RUNTIME_ROOT)) {
    const full = join(RUNTIME_ROOT, rel);
    const text = await readFile(full, "utf8");
    for (const { label, pattern } of FORBIDDEN_PATTERNS) {
      if (pattern.test(text)) {
        fail(`runtime-adapters/${rel} contains forbidden ${label}.`);
      }
    }
  }
}

async function main(): Promise<void> {
  if (!existsSync(RUNTIME_ROOT)) {
    console.log("[runtime-adapters] OK - runtime-adapters/ not present.");
    return;
  }

  await checkSharedFiles();
  await checkAdapters();
  await checkCodexDefaultMode();
  await checkCodexSkillTargets();
  await checkCodexAgentTemplateReadiness();
  await checkManifestV2Contract();
  await checkTelemetryFields();
  await checkNoProviderImportsOrCredentialMaterial();

  if (errorCount > 0) {
    console.error(`[runtime-adapters] FAILED with ${errorCount} error(s).`);
    process.exit(1);
  }

  console.log("[runtime-adapters] OK - metadata is local, parseable, and generated-files defaults are preserved.");
}

main().catch((err: unknown) => {
  console.error("[runtime-adapters] FAILED:", err);
  process.exit(1);
});
