#!/usr/bin/env node
// tapagents.mjs — the `tapagents` CLI bin (package's FIRST bin entry).
//
// One install surface, subcommands (contract §3.3):
//   tapagents login  [--url <ingest>]   Run the device flow; write credentials.json (0600).
//   tapagents logout [--revoke]         Delete credentials.json (stops emission immediately).
//                                       --revoke also opens the dashboard tokens page to
//                                       revoke server-side (revoke is cookie-session only).
//   tapagents whoami                    Print account / machine / issued_at from the local file.
//   tapagents token list                Open the dashboard tokens page (revoke/list are cookie-auth).
//   tapagents token revoke <id>         Open the dashboard tokens page to revoke <id>.
//   tapagents --version | -v            Print the CLI version.
//   tapagents --help    | -h            Print usage.
//
// This is the CLIENT of the FROZEN device-auth contract
// (`_global/tapagents-login-device-auth-contract-2026-06-02.md`). On `login`
// success it writes the credential file that the ALREADY-LIVE telemetry
// read-path (`hooks/_telemetry.py:_resolve_credentials()`, v0.27.0) consumes —
// so after login telemetry mirrors to the cloud on the next flush with NO
// further command, ever.
//
// Pure Node stdlib (Pool A): no third-party deps, no Anthropic SDK, no `claude`,
// no `api.anthropic.com`. Every endpoint call is plain HTTPS to `tapagents.ai`.
//
// IO + side-effects (stdout/stderr, the device-flow clock/transport, the
// browser-open) are threaded through a `ctx` object so the whole CLI is
// driveable from a test harness without patching globals. `defaultCtx()`
// supplies the real implementations.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runDeviceFlow, authBaseFromIngestUrl, DeviceFlowError } from "./lib/device-flow.mjs";
import {
  writeCredentials,
  readCredentials,
  deleteCredentials,
  credentialsPath,
  DEFAULT_INGEST_URL,
} from "./lib/credentials.mjs";

/**
 * The CLI version, read at runtime from the package's own package.json so it can
 * never lag the published `version`. `package.json` sits one dir up from this
 * module (cli/ → package root); resolve it via import.meta.url so the read is
 * cwd-independent. Fail-soft: a literal fallback keeps `--version` working even
 * if the file is somehow unreadable — this resolver NEVER throws.
 */
function resolveVersion() {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    const v = JSON.parse(readFileSync(pkgPath, "utf8")).version;
    return typeof v === "string" && v.length > 0 ? v : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const VERSION = resolveVersion();

const USAGE = `tapagents — connect this machine to Tap Agents Live telemetry.

Usage:
  tapagents login [--url <ingest-url>]   Sign in (device flow) and connect this machine.
  tapagents logout [--revoke]            Disconnect this machine (delete local credentials).
  tapagents whoami                       Show the connected account (reads the local file).
  tapagents token list                   Open the dashboard tokens page.
  tapagents token revoke <token-id>      Open the dashboard tokens page to revoke a token.
  tapagents --version                    Print the CLI version.
  tapagents --help                       Show this help.

After 'tapagents login', telemetry mirrors to the dashboard automatically on the
next event — no further command, no restart. 'tapagents logout' stops it.`;

/** Best-effort: open a URL in the user's default browser. Never throws. */
function openInBrowser(url) {
  try {
    const platform = process.platform;
    const cmd = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
    const args = platform === "win32" ? ["/c", "start", "", url] : [url];
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * The default runtime context: real stdout/stderr, the real device-flow (real
 * timers + stdlib HTTP), and the real browser-open. Tests pass an override.
 */
export function defaultCtx() {
  return {
    out: (line = "") => process.stdout.write(line + "\n"),
    err: (line = "") => process.stderr.write(line + "\n"),
    // runFlow lets the test inject a fake clock/http; the bin uses the real one.
    runFlow: (args) => runDeviceFlow(args, { out: (l) => process.stdout.write(l + "\n") }),
    openInBrowser,
    // Indirections so credential IO can be sandboxed in tests if desired (they
    // also honor XDG_CONFIG_HOME, so most tests just set that env var instead).
    writeCredentials,
    readCredentials,
    deleteCredentials,
  };
}

/** Token name recorded as provenance: `cli-<host>-<YYYY-MM-DD>` (contract §1.4/§3.1). */
function machineName() {
  const host = (hostname() || "host").split(".")[0];
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `cli-${host}-${date}`;
}

/** Minimal flag parse: pulls `--key value` and `--flag` out of argv. */
function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") {
      flags.url = argv[++i];
    } else if (a === "--revoke") {
      flags.revoke = true;
    } else if (a.startsWith("--")) {
      flags[a.slice(2)] = true;
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

/** Origin of a URL, falling back to the default host on parse failure. */
function safeOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "https://tapagents.ai";
  }
}

async function cmdLogin(flags, ctx) {
  const ingestUrl = typeof flags.url === "string" && flags.url.length > 0 ? flags.url : DEFAULT_INGEST_URL;
  let authBase;
  try {
    authBase = authBaseFromIngestUrl(ingestUrl);
  } catch {
    ctx.err(`Invalid --url: ${ingestUrl}`);
    return 1;
  }

  ctx.out("Connecting this machine to Tap Agents Live…");
  let bundle;
  try {
    bundle = await ctx.runFlow({ authBase });
  } catch (e) {
    if (e instanceof DeviceFlowError) {
      ctx.err("");
      ctx.err(e.message);
      return 1;
    }
    ctx.err("");
    ctx.err(`Login failed: ${e?.message || e}`);
    return 1;
  }

  // Prefer the server-returned ingest_url (so a preview/self-host server can
  // hand back its own ingest), else the --url / default the CLI was invoked with.
  const finalIngest = typeof bundle.ingest_url === "string" && bundle.ingest_url.length > 0
    ? bundle.ingest_url
    : ingestUrl;
  const account = typeof bundle.account === "string" ? bundle.account : null;
  const machine = machineName();

  let path;
  try {
    path = ctx.writeCredentials({ token: bundle.token, ingestUrl: finalIngest, account, machine });
  } catch (e) {
    ctx.err("");
    ctx.err(`Connected, but failed to write the credential file: ${e?.message || e}`);
    return 1;
  }

  ctx.out("");
  // §2.8 mitigation: ALWAYS display the bound account so a session-fixation-shaped
  // wrong-approval is visible to the user ("Connected as @unexpected" → they stop).
  ctx.out(account ? `  Connected as @${account}.` : "  Connected.");
  ctx.out(`  Credentials written to ${path}`);
  ctx.out("  Telemetry will mirror to the dashboard on the next event — no further command needed.");
  return 0;
}

function cmdLogout(flags, ctx) {
  // Read BEFORE delete so --revoke can still recover the ingest origin.
  const creds = ctx.readCredentials();
  const removed = ctx.deleteCredentials();
  if (removed) {
    ctx.out("Disconnected this machine — local credentials deleted. Telemetry mirroring has stopped.");
  } else {
    ctx.out("No local credentials found — nothing to disconnect.");
  }
  if (flags.revoke) {
    // Server-side revoke is cookie-session only (contract §3.3 note): there is
    // no bearer revoke path by design. Route the user to the browser.
    const base = creds && typeof creds.ingest_url === "string"
      ? safeOrigin(creds.ingest_url)
      : "https://tapagents.ai";
    const url = `${base}/account/tokens`;
    ctx.out("");
    ctx.out("To also revoke the token on the server, open your dashboard tokens page:");
    ctx.out(`  ${url}`);
    ctx.openInBrowser(url);
  }
  return 0;
}

function cmdWhoami(ctx) {
  const creds = ctx.readCredentials();
  if (!creds || typeof creds.token !== "string") {
    ctx.err("Not connected. Run `tapagents login` first.");
    return 1;
  }
  ctx.out(creds.account ? `account:   @${creds.account}` : "account:   (unknown)");
  ctx.out(`machine:   ${creds.machine || "(unknown)"}`);
  ctx.out(`issued_at: ${creds.issued_at || "(unknown)"}`);
  ctx.out(`ingest:    ${creds.ingest_url || DEFAULT_INGEST_URL}`);
  return 0;
}

function cmdToken(positionals, ctx) {
  // `token list` / `token revoke <id>` — both are cookie-session-only server
  // operations (contract §3.3 note: issuance/revocation are privileged
  // browser-session actions by design; a leaked bearer must not revoke siblings).
  // So the CLI opens the dashboard tokens page rather than calling with a bearer.
  const sub = positionals[0];
  const creds = ctx.readCredentials();
  const base = creds && typeof creds.ingest_url === "string"
    ? safeOrigin(creds.ingest_url)
    : "https://tapagents.ai";
  const url = `${base}/account/tokens`;

  if (sub === "list") {
    ctx.out("Token list + revoke are managed in the dashboard (browser session required).");
    ctx.out(`Open: ${url}`);
    ctx.openInBrowser(url);
    return 0;
  }
  if (sub === "revoke") {
    const id = positionals[1];
    if (!id) {
      ctx.err("Usage: tapagents token revoke <token-id>");
      return 1;
    }
    ctx.out(`Revoking a token requires a browser session. Open your tokens page and revoke ${id}:`);
    ctx.out(`  ${url}`);
    ctx.openInBrowser(url);
    return 0;
  }
  ctx.err("Usage: tapagents token list | tapagents token revoke <token-id>");
  return 1;
}

/**
 * Run the CLI. Returns the intended process exit code (does NOT call exit).
 * @param {string[]} argv  argv WITHOUT node + script (i.e. process.argv.slice(2)).
 * @param {object} [ctx]   IO + side-effect context. Defaults to defaultCtx().
 */
async function main(argv, ctx = defaultCtx()) {
  const { positionals, flags } = parseArgs(argv);
  const command = positionals[0];

  if (flags.version || flags.v || command === "version") {
    ctx.out(VERSION);
    return 0;
  }
  if (flags.help || flags.h || !command || command === "help") {
    ctx.out(USAGE);
    return command || flags.help || flags.h ? 0 : 1;
  }

  switch (command) {
    case "login":
      return cmdLogin(flags, ctx);
    case "logout":
      return cmdLogout(flags, ctx);
    case "whoami":
      return cmdWhoami(ctx);
    case "token":
      return cmdToken(positionals.slice(1), ctx);
    default:
      ctx.err(`Unknown command: ${command}`);
      ctx.err("");
      ctx.out(USAGE);
      return 1;
  }
}

// Exported for the test harness (scripts/test-tapagents-cli.mjs).
export { main, machineName, parseArgs, cmdLogin, cmdLogout, cmdWhoami, cmdToken, VERSION };

// Auto-run main() ONLY when invoked as the entry point (the bin), NOT when
// imported by the test harness. Node sets process.argv[1] to the resolved path
// of the invoked script; compare it to this module's own file path.
const isEntrypoint = (() => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isEntrypoint) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code ?? 0))
    .catch((e) => {
      process.stderr.write(`tapagents: unexpected error: ${e?.message || e}\n`);
      process.exit(1);
    });
}
