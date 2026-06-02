// credentials.mjs — read/write/delete the tapagents CLI credential file.
//
// The CLI writes, on successful `tapagents login`, the credential file that the
// ALREADY-LIVE telemetry read-path (`hooks/_telemetry.py:_resolve_credentials()`,
// v0.27.0) consumes fresh on every flush. The two sides are joined by the FROZEN
// contract `_global/tapagents-login-device-auth-contract-2026-06-02.md` §3.
//
// Path  (contract §3.1, byte-for-byte matching the Python read-path):
//   ${XDG_CONFIG_HOME:-~/.config}/tapagents/credentials.json
//
// Shape (contract §3.1):
//   {
//     "token":      "tap_local_…",          // REQUIRED — the only load-bearing key for the reader
//     "ingest_url": "https://…/ingest",      // co-located so a self-host/preview client needs zero env
//     "account":    "<github_login>",         // human-auditable provenance
//     "issued_at":  "2026-06-02T12:34:56Z",   // human-auditable provenance
//     "machine":    "cli-<host>-<YYYY-MM-DD>" // human-auditable provenance
//   }
//
// The Python reader (verified) pulls ONLY `token` + `ingest_url` (each
// `isinstance(..., str)`-guarded) and ignores the provenance keys — so the extra
// keys never conflict with the read contract.
//
// Security posture (contract §3.1, §2.8):
//   - directory created mode 0700 (owner rwx only) if absent
//   - file written mode 0600 (owner rw only)
//   - written to a same-dir temp file with 0600 from creation, then atomic rename,
//     so a concurrent reader NEVER sees a partial or world-readable file.
//
// Pure Node stdlib (Pool A). No third-party deps, no Anthropic SDK, no `claude`.

import { mkdirSync, writeFileSync, renameSync, readFileSync, rmSync, existsSync, openSync, closeSync, statSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

/** Default ingest URL — kept byte-identical to the Python read-path's
 *  `_DEFAULT_INGEST_URL` so a login with no `--url` writes the same default the
 *  emitter would otherwise fall back to. */
export const DEFAULT_INGEST_URL = "https://tapagents.ai/api/account/tapagents-live/ingest";

/** Resolve the config directory: `${XDG_CONFIG_HOME:-~/.config}/tapagents`.
 *  Mirrors `_telemetry.py:_resolve_credentials()` exactly. */
export function configDir(env = process.env) {
  const base = env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.length > 0
    ? env.XDG_CONFIG_HOME
    : join(homedir(), ".config");
  return join(base, "tapagents");
}

/** Absolute path to the credential file the CLI writes and the hook reads. */
export function credentialsPath(env = process.env) {
  return join(configDir(env), "credentials.json");
}

/**
 * Write the credential file atomically with 0700 dir / 0600 file.
 *
 * @param {object} args
 * @param {string} args.token       REQUIRED — the tap_local_* bearer.
 * @param {string} args.ingestUrl   Co-located ingest URL.
 * @param {string} [args.account]   GitHub login (provenance).
 * @param {string} [args.issuedAt]  ISO-8601 Z timestamp (provenance). Defaults to now.
 * @param {string} [args.machine]   Token name `cli-<host>-<date>` (provenance).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string} the absolute path written.
 */
export function writeCredentials({ token, ingestUrl, account, issuedAt, machine }, env = process.env) {
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("writeCredentials: `token` is required and must be a non-empty string");
  }
  const dir = configDir(env);
  const finalPath = credentialsPath(env);

  // Create the dir 0700 if absent. If it already exists with looser perms we
  // tighten it (best-effort) so we never leave a world-readable creds dir behind.
  mkdirSync(dir, { recursive: true, mode: DIR_MODE });
  try {
    const st = statSync(dir);
    if ((st.mode & 0o077) !== 0) chmodSync(dir, DIR_MODE);
  } catch {
    // best-effort; the file write below is the real protection.
  }

  const body = {
    token,
    ingest_url: ingestUrl || DEFAULT_INGEST_URL,
    account: account ?? null,
    issued_at: issuedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    machine: machine ?? null,
  };
  const json = JSON.stringify(body, null, 2) + "\n";

  // Atomic write: a same-dir temp file created 0600-from-birth, then rename.
  // rename(2) is atomic within a filesystem, so a reader sees either the old
  // file or the fully-written new one — never a truncated/partial credential.
  const tmpPath = join(dir, `.credentials.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  // wx + explicit mode → created with 0600, fails if the temp name collides.
  const fd = openSync(tmpPath, "wx", FILE_MODE);
  try {
    writeFileSync(fd, json, { encoding: "utf8" });
  } finally {
    closeSync(fd);
  }
  // Defensive: ensure 0600 regardless of umask interaction on the open mode.
  chmodSync(tmpPath, FILE_MODE);
  try {
    renameSync(tmpPath, finalPath);
  } catch (err) {
    // Clean up the temp file on a failed rename so we don't litter the dir.
    try { rmSync(tmpPath, { force: true }); } catch { /* ignore */ }
    throw err;
  }
  return finalPath;
}

/**
 * Read + parse the credential file. Returns null if absent or malformed
 * (fail-soft for `whoami`). Does NOT throw on a missing file.
 * @returns {null | {token?: string, ingest_url?: string, account?: string|null, issued_at?: string|null, machine?: string|null}}
 */
export function readCredentials(env = process.env) {
  const p = credentialsPath(env);
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, "utf8"));
    if (data && typeof data === "object" && !Array.isArray(data)) return data;
    return null;
  } catch {
    return null;
  }
}

/**
 * Delete the credential file. Idempotent — returns true if a file was removed,
 * false if there was nothing to remove.
 * @returns {boolean}
 */
export function deleteCredentials(env = process.env) {
  const p = credentialsPath(env);
  if (!existsSync(p)) return false;
  rmSync(p, { force: true });
  return true;
}
