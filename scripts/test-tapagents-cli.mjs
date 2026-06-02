// test-tapagents-cli.mjs
// =======================
//
// Behavior tests for the `tapagents` CLI bin (cli/tapagents.mjs and its
// cli/lib/* modules). Runs against a MOCK HTTP server implementing the FROZEN
// device-auth contract (`_global/tapagents-login-device-auth-contract-2026-06-02.md`
// §1.2 E1 + §1.4 E3) — it does NOT touch any live endpoint.
//
// Stdlib-only (Node's built-in `node:test` + `node:http`) — zero new devDeps,
// consistent with the package's "no new devDeps" test discipline (the Python
// suites use stdlib unittest; the JS bin uses Node's stdlib test runner).
//
// Run from the package root:
//     node --test scripts/test-tapagents-cli.mjs
//   (or: npm run test:cli)
//
// Coverage:
//   - happy path: E1 → poll → 200 → credential file written (exact §3.1 shape)
//   - authorization_pending: polls until approval
//   - slow_down: interval backoff applied, then success
//   - expired_token / access_denied / invalid_grant: terminal, correct messages
//   - rate_limited (429) on E1 and E3
//   - credential file PERMS (0600 file / 0700 dir) + atomic-write shape
//   - the round-trip key contract: token + ingest_url match what _telemetry.py reads
//   - whoami / logout (incl. --revoke routing) / token list|revoke
//   - server-returned ingest_url precedence; --url override

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, statSync, readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from "node:fs";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";

import { runDeviceFlow, DeviceFlowError, authBaseFromIngestUrl } from "../cli/lib/device-flow.mjs";
import {
  writeCredentials,
  readCredentials,
  deleteCredentials,
  credentialsPath,
  configDir,
  DEFAULT_INGEST_URL,
} from "../cli/lib/credentials.mjs";
import { main, machineName } from "../cli/tapagents.mjs";
import {
  writeCredentials as realWriteCredentials,
  readCredentials as realReadCredentials,
  deleteCredentials as realDeleteCredentials,
} from "../cli/lib/credentials.mjs";

// ---------------------------------------------------------------------------
// Mock device-flow server (frozen contract §1.2 E1 + §1.4 E3)
// ---------------------------------------------------------------------------

/**
 * Build a mock server with scriptable E3 behavior.
 *
 * @param {object} opts
 * @param {(pollCount:number)=>{status:number, body:object}} opts.tokenResponder
 *        Given the 1-based poll count, return the {status, body} for THIS E3 poll.
 * @param {object} [opts.codeResponse] Override the E1 response {status, body}.
 * @returns {Promise<{base:string, close:()=>Promise<void>, pollCount:()=>number, codeRequests:()=>object[]}>}
 */
async function startMockServer({ tokenResponder, codeResponse, echoIngest = false }) {
  let polls = 0;
  const codeBodies = [];
  const tokenBodies = [];
  const ISSUED_DEVICE_CODE = "d".repeat(43);
  let baseUrl = ""; // set after listen; used by echoIngest.

  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { body = { __unparseable: true }; }

      const send = (status, obj) => {
        const json = JSON.stringify(obj);
        res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(json);
      };

      if (req.method === "POST" && req.url === "/api/auth/device/code") {
        codeBodies.push(body);
        if (codeResponse) return send(codeResponse.status, codeResponse.body);
        return send(200, {
          device_code: ISSUED_DEVICE_CODE,
          user_code: "WXYZ-1234",
          verification_uri: "https://tapagents.ai/device",
          verification_uri_complete: "https://tapagents.ai/device?user_code=WXYZ-1234",
          expires_in: 600,
          interval: 5,
        });
      }

      if (req.method === "POST" && req.url === "/api/auth/device/token") {
        polls += 1;
        tokenBodies.push(body);
        let resp = tokenResponder(polls, body);
        // echoIngest: a 200 success echoes the server's own origin as ingest_url
        // (simulates a preview/self-host server returning its own ingest endpoint).
        if (echoIngest && resp.status === 200 && resp.body && typeof resp.body === "object") {
          resp = { ...resp, body: { ...resp.body, ingest_url: `${baseUrl}/api/account/tapagents-live/ingest` } };
        }
        return send(resp.status, resp.body);
      }

      send(404, { error: "not_found" });
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
  return {
    base: baseUrl,
    close: () => new Promise((resolve) => server.close(resolve)),
    pollCount: () => polls,
    codeRequests: () => codeBodies,
    tokenRequests: () => tokenBodies,
    issuedDeviceCode: ISSUED_DEVICE_CODE,
  };
}

/** A fake clock + sleep that advances virtual time instantly (no real waiting).
 *  `sleep(ms)` resolves immediately but advances the clock by ms, so the
 *  expires_in deadline logic is exercised deterministically. */
function fakeClock(startMs = 0) {
  let t = startMs;
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
    advance: (ms) => {
      t += ms;
    },
  };
}

/** Collect printed lines from the flow's `out` injection. */
function lineSink() {
  const lines = [];
  return { out: (l) => lines.push(l), lines, text: () => lines.join("\n") };
}

/** Isolate XDG_CONFIG_HOME to a fresh tmp dir for credential tests so the
 *  operator's real ~/.config/tapagents is never touched. Returns the dir +
 *  a restore() that wipes it and restores the env var. */
function isolatedConfig() {
  const dir = mkdtempSync(join(tmpdir(), "tapagents-cli-test-"));
  const prev = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = dir;
  return {
    dir,
    restore: () => {
      if (prev === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = prev;
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

/**
 * Build a test `ctx` for `main()` that captures stdout/stderr lines and runs the
 * real device flow against a mock server with a FAKE clock (no real timers — so
 * the `login` test never waits the real 5s poll interval). `openInBrowser` is
 * stubbed to record the URL it would open. Credential IO uses the real
 * functions, sandboxed by the test's isolated XDG_CONFIG_HOME.
 */
function makeCtx() {
  const outLines = [];
  const errLines = [];
  const opened = [];
  return {
    outLines,
    errLines,
    opened,
    ctx: {
      out: (l = "") => outLines.push(l),
      err: (l = "") => errLines.push(l),
      runFlow: ({ authBase }) => {
        const clk = fakeClock();
        return runDeviceFlow({ authBase }, { now: clk.now, sleep: clk.sleep, out: (l) => outLines.push(l) });
      },
      openInBrowser: (url) => { opened.push(url); return true; },
      writeCredentials: realWriteCredentials,
      readCredentials: realReadCredentials,
      deleteCredentials: realDeleteCredentials,
    },
    out: () => outLines.join("\n"),
    errText: () => errLines.join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Device-flow client tests (against the mock server, fake clock)
// ---------------------------------------------------------------------------

test("happy path: E1 → poll → 200 returns the token bundle", async () => {
  const srv = await startMockServer({
    tokenResponder: (n) =>
      n < 2
        ? { status: 400, body: { error: "authorization_pending" } }
        : { status: 200, body: { token: "tap_local_happy", ingest_url: "https://tapagents.ai/api/account/tapagents-live/ingest", account: "octocat", token_id: "uuid-1" } },
  });
  try {
    const clk = fakeClock();
    const sink = lineSink();
    const bundle = await runDeviceFlow(
      { authBase: srv.base },
      { now: clk.now, sleep: clk.sleep, out: sink.out },
    );
    assert.equal(bundle.token, "tap_local_happy");
    assert.equal(bundle.account, "octocat");
    assert.equal(bundle.token_id, "uuid-1");
    // The user instructions were printed with the user_code + verification_uri.
    assert.match(sink.text(), /Open https:\/\/tapagents\.ai\/device and enter code: WXYZ-1234/);
    // E1 sent a client label for audit.
    assert.match(JSON.stringify(srv.codeRequests()[0]), /tapagents-cli\/0\.28\.0/);
    // Every E3 poll echoed back the EXACT device_code from E1 (not the user_code,
    // not a mangled value) — confirms the client polls with the right credential.
    for (const tb of srv.tokenRequests()) {
      assert.equal(tb.device_code, srv.issuedDeviceCode, "E3 must send the device_code from E1");
    }
  } finally {
    await srv.close();
  }
});

test("authorization_pending: client keeps polling until approval", async () => {
  const srv = await startMockServer({
    tokenResponder: (n) =>
      n < 4
        ? { status: 400, body: { error: "authorization_pending" } }
        : { status: 200, body: { token: "tap_local_after_pending", account: "octocat" } },
  });
  try {
    const clk = fakeClock();
    const bundle = await runDeviceFlow({ authBase: srv.base }, { now: clk.now, sleep: clk.sleep, out: () => {} });
    assert.equal(bundle.token, "tap_local_after_pending");
    assert.equal(srv.pollCount(), 4, "should have polled until the 4th (approved) response");
  } finally {
    await srv.close();
  }
});

test("slow_down: interval backs off by 5s and the flow still succeeds", async () => {
  const sleeps = [];
  const srv = await startMockServer({
    tokenResponder: (n) => {
      if (n === 1) return { status: 400, body: { error: "slow_down" } };
      if (n === 2) return { status: 400, body: { error: "authorization_pending" } };
      return { status: 200, body: { token: "tap_local_slowdown", account: "octocat" } };
    },
  });
  try {
    let t = 0;
    const now = () => t;
    const sleep = async (ms) => { sleeps.push(ms); t += ms; };
    const bundle = await runDeviceFlow({ authBase: srv.base }, { now, sleep, out: () => {} });
    assert.equal(bundle.token, "tap_local_slowdown");
    // sleeps: [first pre-poll 5000ms, after slow_down 10000ms, after pending 10000ms].
    // The key assertion: after the slow_down response the interval grew to 10s.
    assert.equal(sleeps[0], 5000, "first wait is one interval (5s)");
    assert.equal(sleeps[1], 10000, "after slow_down the interval backed off to 10s (+5s per §1.5)");
  } finally {
    await srv.close();
  }
});

test("expired_token: terminal, with the re-run hint message", async () => {
  const srv = await startMockServer({
    tokenResponder: () => ({ status: 400, body: { error: "expired_token" } }),
  });
  try {
    const clk = fakeClock();
    await assert.rejects(
      () => runDeviceFlow({ authBase: srv.base }, { now: clk.now, sleep: clk.sleep, out: () => {} }),
      (e) => {
        assert.ok(e instanceof DeviceFlowError);
        assert.equal(e.code, "expired_token");
        assert.match(e.message, /run `tapagents login` again/);
        return true;
      },
    );
  } finally {
    await srv.close();
  }
});

test("access_denied: terminal, 'Request denied.'", async () => {
  const srv = await startMockServer({
    tokenResponder: () => ({ status: 400, body: { error: "access_denied" } }),
  });
  try {
    const clk = fakeClock();
    await assert.rejects(
      () => runDeviceFlow({ authBase: srv.base }, { now: clk.now, sleep: clk.sleep, out: () => {} }),
      (e) => e instanceof DeviceFlowError && e.code === "access_denied" && /Request denied/.test(e.message),
    );
  } finally {
    await srv.close();
  }
});

test("invalid_grant: terminal, 'invalid or already-used code'", async () => {
  const srv = await startMockServer({
    tokenResponder: () => ({ status: 400, body: { error: "invalid_grant" } }),
  });
  try {
    const clk = fakeClock();
    await assert.rejects(
      () => runDeviceFlow({ authBase: srv.base }, { now: clk.now, sleep: clk.sleep, out: () => {} }),
      (e) => e instanceof DeviceFlowError && e.code === "invalid_grant" && /already-used/i.test(e.message),
    );
  } finally {
    await srv.close();
  }
});

test("client-side ceiling: stops when wall-clock exceeds expires_in + grace", async () => {
  // Server NEVER approves (always pending). The fake clock advances by the
  // interval each sleep, so after expires_in(600)+grace(15) seconds the client
  // must give up with expired_token rather than poll forever.
  const srv = await startMockServer({
    tokenResponder: () => ({ status: 400, body: { error: "authorization_pending" } }),
  });
  try {
    const clk = fakeClock();
    await assert.rejects(
      () => runDeviceFlow({ authBase: srv.base }, { now: clk.now, sleep: clk.sleep, out: () => {} }),
      (e) => e instanceof DeviceFlowError && e.code === "expired_token",
    );
    // 615s ceiling / 5s interval ≈ 123 polls before the deadline trips. Assert it
    // terminated in a bounded number of polls (not infinite), well above a few.
    assert.ok(srv.pollCount() > 100 && srv.pollCount() < 200, `bounded poll count, got ${srv.pollCount()}`);
  } finally {
    await srv.close();
  }
});

test("rate_limited on E1: surfaced as a DeviceFlowError, no infinite loop", async () => {
  const srv = await startMockServer({
    tokenResponder: () => ({ status: 200, body: { token: "unused" } }),
    codeResponse: { status: 429, body: { error: "rate_limited", retry_after_seconds: 30 } },
  });
  try {
    const clk = fakeClock();
    await assert.rejects(
      () => runDeviceFlow({ authBase: srv.base }, { now: clk.now, sleep: clk.sleep, out: () => {} }),
      (e) => e instanceof DeviceFlowError && e.code === "rate_limited",
    );
  } finally {
    await srv.close();
  }
});

test("rate_limited (429) on E3: honors retry, then succeeds", async () => {
  const sleeps = [];
  const srv = await startMockServer({
    tokenResponder: (n) =>
      n === 1
        ? { status: 429, body: { error: "rate_limited", retry_after_seconds: 30 } }
        : { status: 200, body: { token: "tap_local_after_429", account: "octocat" } },
  });
  try {
    let t = 0;
    const now = () => t;
    const sleep = async (ms) => { sleeps.push(ms); t += ms; };
    const bundle = await runDeviceFlow({ authBase: srv.base }, { now, sleep, out: () => {} });
    assert.equal(bundle.token, "tap_local_after_429");
    assert.ok(sleeps.includes(30000), "should have honored the 30s Retry-After hint");
  } finally {
    await srv.close();
  }
});

test("authBaseFromIngestUrl: derives origin from a full ingest URL", () => {
  assert.equal(
    authBaseFromIngestUrl("https://tapagents.ai/api/account/tapagents-live/ingest"),
    "https://tapagents.ai",
  );
  assert.equal(
    authBaseFromIngestUrl("http://127.0.0.1:8787/api/account/tapagents-live/ingest"),
    "http://127.0.0.1:8787",
  );
});

// ---------------------------------------------------------------------------
// Credential file: perms (0600/0700), atomic shape, round-trip key contract
// ---------------------------------------------------------------------------

test("writeCredentials: 0600 file + 0700 dir, exact §3.1 shape, round-trip keys", () => {
  const cfg = isolatedConfig();
  try {
    const path = writeCredentials({
      token: "tap_local_perm",
      ingestUrl: "https://tapagents.ai/api/account/tapagents-live/ingest",
      account: "octocat",
      machine: "cli-testhost-2026-06-02",
    });
    assert.equal(path, credentialsPath());

    // Directory mode 0700 (owner-only).
    const dStat = statSync(configDir());
    assert.equal(dStat.mode & 0o777, 0o700, `config dir must be 0700, got ${(dStat.mode & 0o777).toString(8)}`);

    // File mode 0600 (owner rw only).
    const fStat = statSync(path);
    assert.equal(fStat.mode & 0o777, 0o600, `credential file must be 0600, got ${(fStat.mode & 0o777).toString(8)}`);

    // Exact shape: token + ingest_url (the keys _telemetry.py reads), plus provenance.
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(parsed.token, "tap_local_perm");
    assert.equal(parsed.ingest_url, "https://tapagents.ai/api/account/tapagents-live/ingest");
    assert.equal(parsed.account, "octocat");
    assert.equal(parsed.machine, "cli-testhost-2026-06-02");
    assert.match(parsed.issued_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, "issued_at is ISO-8601 with trailing Z");

    // Round-trip: the two load-bearing keys the Python reader pulls are present
    // and string-typed (mirrors _resolve_credentials' isinstance(...) guards).
    assert.equal(typeof parsed.token, "string");
    assert.equal(typeof parsed.ingest_url, "string");
  } finally {
    cfg.restore();
  }
});

test("writeCredentials: defaults ingest_url to the byte-identical telemetry default", () => {
  const cfg = isolatedConfig();
  try {
    writeCredentials({ token: "tap_local_default" });
    const parsed = readCredentials();
    assert.equal(parsed.ingest_url, DEFAULT_INGEST_URL);
    assert.equal(
      parsed.ingest_url,
      "https://tapagents.ai/api/account/tapagents-live/ingest",
      "must match _telemetry.py _DEFAULT_INGEST_URL exactly",
    );
  } finally {
    cfg.restore();
  }
});

test("writeCredentials: rejects a missing/empty token", () => {
  const cfg = isolatedConfig();
  try {
    assert.throws(() => writeCredentials({ token: "" }), /token` is required/);
    assert.throws(() => writeCredentials({}), /token` is required/);
  } finally {
    cfg.restore();
  }
});

test("writeCredentials: atomic overwrite tightens a pre-existing loose-perms dir", () => {
  const cfg = isolatedConfig();
  try {
    // Pre-create the dir world-readable to simulate a sloppy prior state.
    mkdirSync(configDir(), { recursive: true, mode: 0o755 });
    chmodSync(configDir(), 0o755);
    writeCredentials({ token: "tap_local_tighten" });
    const dStat = statSync(configDir());
    assert.equal(dStat.mode & 0o077, 0, "writeCredentials must tighten a loose creds dir to owner-only");
    const fStat = statSync(credentialsPath());
    assert.equal(fStat.mode & 0o777, 0o600);
  } finally {
    cfg.restore();
  }
});

test("readCredentials: null on absent / malformed file (fail-soft for whoami)", () => {
  const cfg = isolatedConfig();
  try {
    assert.equal(readCredentials(), null, "absent file → null");

    // A valid file reads back.
    writeCredentials({ token: "tap_local_ok" });
    assert.ok(readCredentials(), "valid file → object");

    // Corrupt the file with non-JSON garbage → null (no throw).
    writeFileSync(credentialsPath(), "}{ not json", { encoding: "utf8" });
    assert.equal(readCredentials(), null, "malformed JSON → null");

    // A JSON array (wrong top-level type) → null.
    writeFileSync(credentialsPath(), "[]", { encoding: "utf8" });
    assert.equal(readCredentials(), null, "non-object JSON → null");
  } finally {
    cfg.restore();
  }
});

test("deleteCredentials: idempotent — true then false", () => {
  const cfg = isolatedConfig();
  try {
    writeCredentials({ token: "tap_local_del" });
    assert.equal(deleteCredentials(), true, "first delete removes the file");
    assert.equal(deleteCredentials(), false, "second delete is a no-op");
    assert.equal(existsSync(credentialsPath()), false);
  } finally {
    cfg.restore();
  }
});

// ---------------------------------------------------------------------------
// End-to-end `main()`: login (via mock) → whoami → logout. IO is threaded via a
// test ctx (no global stdout patching, so tests run concurrently + cleanly) and
// the device flow uses a fake clock (no real 5s poll wait).
// ---------------------------------------------------------------------------

test("main login: full round-trip writes the file with the server-echoed ingest", async () => {
  const cfg = isolatedConfig();
  const srv = await startMockServer({
    echoIngest: true, // server returns its own origin as ingest_url on success
    tokenResponder: (n) =>
      n < 2
        ? { status: 400, body: { error: "authorization_pending" } }
        : { status: 200, body: { token: "tap_local_e2e", account: "octocat", token_id: "uuid-e2e" } },
  });
  const t = makeCtx();
  try {
    const code = await main(["login", "--url", `${srv.base}/api/account/tapagents-live/ingest`], t.ctx);
    assert.equal(code, 0, "login should exit 0");
    assert.match(t.out(), /Connected as @octocat/);
    assert.match(t.out(), /no further command needed/);
    // The credential file exists with the right token + the server-echoed ingest_url.
    const creds = realReadCredentials();
    assert.equal(creds.token, "tap_local_e2e");
    assert.equal(creds.ingest_url, `${srv.base}/api/account/tapagents-live/ingest`);
    assert.equal(creds.account, "octocat");
    assert.match(creds.machine, /^cli-.+-\d{4}-\d{2}-\d{2}$/);
    // The whole point of the contract: 0600 file the telemetry hook can read.
    const fStat = statSync(credentialsPath());
    assert.equal(fStat.mode & 0o777, 0o600);
  } finally {
    await srv.close();
    cfg.restore();
  }
});

test("main login: --url override is used when the server does NOT echo an ingest", async () => {
  const cfg = isolatedConfig();
  const srv = await startMockServer({
    tokenResponder: () => ({ status: 200, body: { token: "tap_local_url", account: "octocat" } }),
  });
  const t = makeCtx();
  try {
    const previewIngest = `${srv.base}/api/account/tapagents-live/ingest`;
    const code = await main(["login", "--url", previewIngest], t.ctx);
    assert.equal(code, 0);
    const creds = realReadCredentials();
    // No server echo → the credential file carries the --url value verbatim.
    assert.equal(creds.ingest_url, previewIngest);
  } finally {
    await srv.close();
    cfg.restore();
  }
});

test("main login: device-flow terminal error → exit 1, message surfaced, no file written", async () => {
  const cfg = isolatedConfig();
  const srv = await startMockServer({
    tokenResponder: () => ({ status: 400, body: { error: "access_denied" } }),
  });
  const t = makeCtx();
  try {
    const code = await main(["login", "--url", `${srv.base}/api/account/tapagents-live/ingest`], t.ctx);
    assert.equal(code, 1, "denied login exits 1");
    assert.match(t.errText(), /Request denied/);
    assert.equal(existsSync(credentialsPath()), false, "no credential file on a failed login");
  } finally {
    await srv.close();
    cfg.restore();
  }
});

test("main login: invalid --url → exit 1 before any network", async () => {
  const cfg = isolatedConfig();
  const t = makeCtx();
  try {
    const code = await main(["login", "--url", "not a url"], t.ctx);
    assert.equal(code, 1);
    assert.match(t.errText(), /Invalid --url/);
  } finally {
    cfg.restore();
  }
});

test("main whoami: reads the local file; errors when not connected", async () => {
  const cfg = isolatedConfig();
  const t = makeCtx();
  try {
    let code = await main(["whoami"], t.ctx);
    assert.equal(code, 1, "whoami exits 1 when not connected");
    assert.match(t.errText(), /Not connected/);

    realWriteCredentials({ token: "tap_local_who", account: "octocat", machine: "cli-h-2026-06-02", ingestUrl: DEFAULT_INGEST_URL });
    const t2 = makeCtx();
    code = await main(["whoami"], t2.ctx);
    assert.equal(code, 0);
    assert.match(t2.out(), /@octocat/);
    assert.match(t2.out(), /cli-h-2026-06-02/);
  } finally {
    cfg.restore();
  }
});

test("main logout: deletes the file; no-op when nothing to delete", async () => {
  const cfg = isolatedConfig();
  try {
    realWriteCredentials({ token: "tap_local_logout" });
    const t = makeCtx();
    let code = await main(["logout"], t.ctx);
    assert.equal(code, 0);
    assert.match(t.out(), /Disconnected/);
    assert.equal(existsSync(credentialsPath()), false);

    const t2 = makeCtx();
    code = await main(["logout"], t2.ctx);
    assert.equal(code, 0);
    assert.match(t2.out(), /No local credentials/);
  } finally {
    cfg.restore();
  }
});

test("main logout --revoke: routes to the browser tokens page", async () => {
  const cfg = isolatedConfig();
  try {
    realWriteCredentials({ token: "tap_local_rev", ingestUrl: "https://preview.example/api/account/tapagents-live/ingest" });
    const t = makeCtx();
    const code = await main(["logout", "--revoke"], t.ctx);
    assert.equal(code, 0);
    assert.equal(existsSync(credentialsPath()), false, "local file still deleted");
    // The browser was pointed at the (preview) origin's tokens page derived from
    // the credential file read BEFORE deletion.
    assert.equal(t.opened.length, 1);
    assert.match(t.opened[0], /^https:\/\/preview\.example\/account\/tokens$/);
  } finally {
    cfg.restore();
  }
});

test("main token list / revoke: usage-guarded, opens browser, no network", async () => {
  const cfg = isolatedConfig();
  try {
    // token revoke with no id → usage error, exit 1, no browser open.
    const t1 = makeCtx();
    let code = await main(["token", "revoke"], t1.ctx);
    assert.equal(code, 1);
    assert.match(t1.errText(), /Usage: tapagents token revoke/);
    assert.equal(t1.opened.length, 0);

    // token list → exit 0, opens the dashboard tokens page (default origin).
    const t2 = makeCtx();
    code = await main(["token", "list"], t2.ctx);
    assert.equal(code, 0);
    assert.match(t2.out(), /account\/tokens/);
    assert.equal(t2.opened.length, 1);
    assert.match(t2.opened[0], /tapagents\.ai\/account\/tokens$/);

    // token revoke <id> → exit 0, opens browser, echoes the id.
    const t3 = makeCtx();
    code = await main(["token", "revoke", "tok_123"], t3.ctx);
    assert.equal(code, 0);
    assert.match(t3.out(), /tok_123/);
    assert.equal(t3.opened.length, 1);
  } finally {
    cfg.restore();
  }
});

test("main --version / --help / unknown", async () => {
  const t1 = makeCtx();
  let code = await main(["--version"], t1.ctx);
  assert.equal(code, 0);
  assert.match(t1.out(), /^0\.28\.0$/m);

  const t2 = makeCtx();
  code = await main(["--help"], t2.ctx);
  assert.equal(code, 0);
  assert.match(t2.out(), /Usage:/);

  const t3 = makeCtx();
  code = await main(["frobnicate"], t3.ctx);
  assert.equal(code, 1);
  assert.match(t3.errText(), /Unknown command: frobnicate/);

  // Bare invocation (no command) → usage on stdout, exit 1.
  const t4 = makeCtx();
  code = await main([], t4.ctx);
  assert.equal(code, 1);
  assert.match(t4.out(), /Usage:/);
});

test("machineName: cli-<host>-<YYYY-MM-DD> shape", () => {
  const m = machineName();
  assert.match(m, /^cli-.+-\d{4}-\d{2}-\d{2}$/);
  assert.ok(m.includes((hostname() || "host").split(".")[0]));
});
