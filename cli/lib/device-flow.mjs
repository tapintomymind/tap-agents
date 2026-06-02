// device-flow.mjs — OAuth 2.0 Device Authorization Grant CLIENT (RFC 8628).
//
// Implements the CLIENT side of E1 + E3 from the FROZEN contract
// `_global/tapagents-login-device-auth-contract-2026-06-02.md` §1.2 / §1.4 / §1.5.
// The SERVER side (E1/E2/E3 endpoints + the /device approve page) is U1 in
// the consumer app (`<project>`) and is NOT in this package — U2 builds against
// the frozen wire contract and a mock server (scripts/test-tapagents-cli.mjs).
//
// Flow:
//   1. POST {ingestBase}/api/auth/device/code  → device_code + user_code + URIs
//   2. Print "Open <verification_uri> and enter code: <user_code>"
//   3. Poll POST {ingestBase}/api/auth/device/token every `interval` seconds:
//        - 200                      → terminal success; return the token bundle
//        - 400 authorization_pending→ keep polling at current interval
//        - 400 slow_down (or 429)   → interval += 5s, keep polling          (§1.5)
//        - 400 expired_token        → stop; "Code expired, run `tapagents login` again."
//        - 400 access_denied        → stop; "Request denied."
//        - 400 invalid_grant        → stop; "invalid or already-used code."
//        - 429 rate_limited         → honor retry_after_seconds, keep polling
//   4. Stop on any terminal state OR when local wall-clock exceeds expires_in
//      + a small grace (defensive client-side ceiling, §1.5).
//
// Pure Node stdlib (Pool A). Dependencies (http, clock, sleep, out) are injected
// so the whole flow is driveable against a mock server with a fake clock in tests.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { postJson } from "./http.mjs";

// RFC-8628 §3.5 vocabulary + the contract's IP-abuse trip.
const ERR_PENDING = "authorization_pending";
const ERR_SLOW_DOWN = "slow_down";
const ERR_EXPIRED = "expired_token";
const ERR_DENIED = "access_denied";
const ERR_INVALID_GRANT = "invalid_grant";
const ERR_RATE_LIMITED = "rate_limited";

// Contract §1.5 defaults — used only if the server omits them from the E1 body.
const DEFAULT_INTERVAL_SECONDS = 5;
const DEFAULT_EXPIRES_IN_SECONDS = 600;
const SLOW_DOWN_BACKOFF_SECONDS = 5; // §1.5: "increase the local interval by 5s"
const TIMEOUT_GRACE_SECONDS = 15; // §1.5: "expires_in + a small grace (e.g. 615s)"
// Read at runtime from the package's own package.json (cli/lib/ → two dirs up)
// so the `client` label never lags the published version. Fail-soft: never throws.
const CLIENT_VERSION = (() => {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
    const v = JSON.parse(readFileSync(pkgPath, "utf8")).version;
    return typeof v === "string" && v.length > 0 ? v : "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

/** Error subclass carrying the RFC-8628 error code for terminal failures. */
export class DeviceFlowError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DeviceFlowError";
    this.code = code;
  }
}

function deviceCodeUrl(base) {
  return `${base.replace(/\/+$/, "")}/api/auth/device/code`;
}
function deviceTokenUrl(base) {
  return `${base.replace(/\/+$/, "")}/api/auth/device/token`;
}

/**
 * Derive the auth base origin from the ingest URL.
 *
 * The credential file's `ingest_url` is a full path
 * (`https://host/api/account/tapagents-live/ingest`); the device endpoints live
 * at the same ORIGIN under `/api/auth/device/*`. So we strip to origin.
 */
export function authBaseFromIngestUrl(ingestUrl) {
  const u = new URL(ingestUrl);
  return u.origin;
}

/**
 * Run the device-authorization flow to completion.
 *
 * @param {object} args
 * @param {string} args.authBase    Origin to hit, e.g. "https://tapagents.ai".
 * @param {object} [deps]
 * @param {(url:string, body:object, opts?:object)=>Promise<{status:number,json:any,raw:string}>} [deps.http]
 *        JSON-POST transport (default: real stdlib `postJson`).
 * @param {()=>number} [deps.now]   Monotonic-ish ms clock (default: Date.now).
 * @param {(ms:number)=>Promise<void>} [deps.sleep] Async sleep (default: real timer).
 * @param {(line:string)=>void} [deps.out] Line printer (default: process.stdout).
 * @returns {Promise<{token:string, ingest_url?:string, account?:string, token_id?:string}>}
 *          The E3 success bundle.
 * @throws {DeviceFlowError} on any terminal non-success state or client timeout.
 */
export async function runDeviceFlow({ authBase }, deps = {}) {
  const http = deps.http || postJson;
  const now = deps.now || (() => Date.now());
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const out = deps.out || ((line) => process.stdout.write(line + "\n"));

  // --- E1: device authorization request -----------------------------------
  const codeResp = await http(
    deviceCodeUrl(authBase),
    { client: `tapagents-cli/${CLIENT_VERSION}` },
    { headers: { "User-Agent": `tapagents-cli/${CLIENT_VERSION}` } },
  );
  if (codeResp.status === 429) {
    const retry = codeResp.json?.retry_after_seconds;
    throw new DeviceFlowError(
      ERR_RATE_LIMITED,
      `Rate limited requesting a device code${retry ? ` (retry after ${retry}s)` : ""}. Try again shortly.`,
    );
  }
  if (codeResp.status !== 200 || !codeResp.json || typeof codeResp.json !== "object") {
    throw new DeviceFlowError(
      "unexpected_response",
      `Device-code request failed (HTTP ${codeResp.status}). Check the --url / network and try again.`,
    );
  }

  const {
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: verificationUri,
    verification_uri_complete: verificationUriComplete,
  } = codeResp.json;

  if (typeof deviceCode !== "string" || typeof userCode !== "string") {
    throw new DeviceFlowError(
      "unexpected_response",
      "Device-code response missing device_code / user_code.",
    );
  }

  let interval = Number.isFinite(codeResp.json.interval) && codeResp.json.interval > 0
    ? codeResp.json.interval
    : DEFAULT_INTERVAL_SECONDS;
  const expiresIn = Number.isFinite(codeResp.json.expires_in) && codeResp.json.expires_in > 0
    ? codeResp.json.expires_in
    : DEFAULT_EXPIRES_IN_SECONDS;

  // --- Print the human instructions (contract §1.5) ------------------------
  const uri = typeof verificationUri === "string" ? verificationUri : "https://tapagents.ai/device";
  out("");
  out(`  Open ${uri} and enter code: ${userCode}`);
  if (typeof verificationUriComplete === "string" && verificationUriComplete.length > 0) {
    out(`  (or open the pre-filled link: ${verificationUriComplete})`);
  }
  out("");
  out("  Waiting for you to approve in the browser…");

  // --- Poll E3 until a terminal state or the client-side ceiling -----------
  const deadline = now() + (expiresIn + TIMEOUT_GRACE_SECONDS) * 1000;

  // First wait one interval before the first poll (the user needs time to act,
  // and the server enforces `interval` between polls — §1.5 / §2.7).
  await sleep(interval * 1000);

  for (;;) {
    if (now() >= deadline) {
      throw new DeviceFlowError(
        ERR_EXPIRED,
        "Code expired, run `tapagents login` again.",
      );
    }

    const tokenResp = await http(
      deviceTokenUrl(authBase),
      { device_code: deviceCode },
      { headers: { "User-Agent": `tapagents-cli/${CLIENT_VERSION}` } },
    );

    if (tokenResp.status === 200 && tokenResp.json && typeof tokenResp.json.token === "string") {
      return tokenResp.json; // terminal success — { token, ingest_url, account, token_id }
    }

    // Both 400 (RFC vocabulary) and 429 (hard abuse trip) carry an `error`.
    const code = tokenResp.json && typeof tokenResp.json.error === "string"
      ? tokenResp.json.error
      : null;

    switch (code) {
      case ERR_PENDING:
        // Keep polling at the current interval.
        break;
      case ERR_SLOW_DOWN:
        interval += SLOW_DOWN_BACKOFF_SECONDS; // §1.5
        break;
      case ERR_RATE_LIMITED: {
        // Honor the server's Retry-After hint, then keep polling.
        const retry = Number.isFinite(tokenResp.json?.retry_after_seconds)
          ? tokenResp.json.retry_after_seconds
          : interval + SLOW_DOWN_BACKOFF_SECONDS;
        await sleep(Math.max(0, retry) * 1000);
        continue; // skip the standard interval sleep below
      }
      case ERR_EXPIRED:
        throw new DeviceFlowError(ERR_EXPIRED, "Code expired, run `tapagents login` again.");
      case ERR_DENIED:
        throw new DeviceFlowError(ERR_DENIED, "Request denied.");
      case ERR_INVALID_GRANT:
        throw new DeviceFlowError(ERR_INVALID_GRANT, "Invalid or already-used code.");
      default:
        // Unknown error / unexpected status: treat as a transient hiccup and
        // keep polling until the client-side ceiling, rather than crashing on a
        // single odd response. (The deadline check above guarantees termination.)
        break;
    }

    await sleep(interval * 1000);
  }
}
