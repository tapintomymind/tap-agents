// http.mjs — minimal stdlib JSON POST helper for the device-flow client.
//
// Pure Node stdlib (Pool A): `node:https` / `node:http`. No third-party deps,
// no Anthropic SDK, no `claude`, no `api.anthropic.com`. Every device-flow call
// is plain HTTPS to `tapagents.ai`.
//
// We deliberately do NOT use `fetch()` here even though Node ships it: the
// device-token endpoint returns HTTP 400 with a structured JSON body for the
// RFC-8628 pending/error states (`authorization_pending`, `slow_down`, …), and
// we need to read that body on a non-2xx response without `fetch`'s
// abort-on-error ergonomics getting in the way. The raw `request` API gives us
// the status code + body uniformly across 200 and 400.

import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { URL } from "node:url";

/**
 * POST a JSON body and read the JSON response, regardless of status code.
 *
 * Resolves with `{ status, json, raw }` for ANY completed HTTP response
 * (including 4xx/5xx) so the caller can branch on the RFC-8628 error vocabulary.
 * Rejects only on a transport-level failure (DNS, connection refused, TLS,
 * timeout) — i.e. when there is no HTTP response at all.
 *
 * @param {string} url
 * @param {object} body            JSON-serializable request body.
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs] Per-request timeout (default 30s).
 * @param {Record<string,string>} [opts.headers] Extra request headers.
 * @returns {Promise<{status: number, json: any, raw: string}>}
 */
export function postJson(url, body, opts = {}) {
  const { timeoutMs = 30_000, headers = {} } = opts;
  const u = new URL(url);
  const isHttps = u.protocol === "https:";
  const requestFn = isHttps ? httpsRequest : httpRequest;
  const payload = Buffer.from(JSON.stringify(body ?? {}), "utf8");

  return new Promise((resolve, reject) => {
    const req = requestFn(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
        path: u.pathname + u.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Content-Length": payload.length,
          "User-Agent": headers["User-Agent"] || "tapagents-cli",
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = null;
          if (raw.length > 0) {
            try {
              json = JSON.parse(raw);
            } catch {
              json = null; // non-JSON body — caller decides how to treat it.
            }
          }
          resolve({ status: res.statusCode ?? 0, json, raw });
        });
      },
    );

    req.on("error", (err) => reject(err));
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`request to ${u.host} timed out after ${timeoutMs}ms`));
    });

    req.write(payload);
    req.end();
  });
}
