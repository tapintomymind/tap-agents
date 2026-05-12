/**
 * secret-patterns.ts — versioned regex list for §8 Risk 2 secret-scanning.
 *
 * Every propagated file body is scanned against these regexes during dry-run
 * and apply modes. A hit is a HARD FAIL — the sync aborts with the citing
 * file + line. The .gitignore already excludes .env*, *.pem, *.key, secrets/,
 * credentials/, so these regexes are belt + suspenders: they catch a secret
 * that slipped into a markdown comment, a hook source file, a doc example,
 * etc.
 *
 * Adding a new pattern: append to PATTERNS with a clear description.
 * Update fixtures in `__fixtures__/secrets-positive/` (should fail scan) and
 * `__fixtures__/secrets-negative/` (should pass scan). Re-run verify-sync.ts.
 */

export interface SecretPattern {
  readonly name: string;
  readonly description: string;
  readonly regex: RegExp;
}

export const PATTERNS: readonly SecretPattern[] = [
  {
    name: "anthropic-key",
    description: "Anthropic API key (sk-ant-...)",
    regex: /sk-ant-[A-Za-z0-9_-]{40,}/g,
  },
  {
    name: "openai-style-key",
    description: "OpenAI / generic sk- secret",
    regex: /\bsk-[A-Za-z0-9]{40,}\b/g,
  },
  {
    name: "stripe-live-secret",
    description: "Stripe live secret key (sk_live_)",
    regex: /\bsk_live_[A-Za-z0-9]{20,}\b/g,
  },
  {
    name: "stripe-restricted-key",
    description: "Stripe restricted key (rk_live_)",
    regex: /\brk_live_[A-Za-z0-9]{20,}\b/g,
  },
  {
    name: "stripe-publishable",
    description: "Stripe publishable key (defense-in-depth)",
    regex: /\bpk_live_[A-Za-z0-9]{20,}\b/g,
  },
  {
    name: "aws-access-key",
    description: "AWS long-lived access key (AKIA)",
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    name: "aws-temp-access-key",
    description: "AWS temporary access key (ASIA)",
    regex: /\bASIA[0-9A-Z]{16}\b/g,
  },
  {
    name: "aws-secret-access-key",
    description: "AWS secret access key (form match)",
    regex: /aws_secret_access_key\s*[=:]\s*['"]?[A-Za-z0-9/+=]{40}['"]?/gi,
  },
  {
    name: "vercel-token",
    description: "Vercel token (vercel_ prefix or Authorization Bearer)",
    regex: /\bvercel_[A-Za-z0-9]{24,}\b/g,
  },
  {
    name: "bearer-token",
    description: "Authorization Bearer ... long form",
    regex: /[Aa]uthorization:\s*Bearer\s+[A-Za-z0-9_-]{40,}/g,
  },
  {
    name: "postgres-conn-generic",
    description: "Generic Postgres connection string with credentials",
    regex: /\bpostgres(?:ql)?:\/\/[^@\s]+:[^@\s]+@[^/\s]+\/[^\s'"]+/g,
  },
  {
    name: "neon-conn",
    description: "Neon-specific Postgres connection string",
    regex: /\bpostgres(?:ql)?:\/\/[^@\s]+@[a-z0-9-]+\.([a-z0-9-]+\.)?neon\.tech\/[^\s'"]+/g,
  },
  {
    name: "npm-token",
    description: "npm publish token",
    regex: /\bnpm_[A-Za-z0-9]{30,}\b/g,
  },
  {
    name: "github-pat",
    description: "GitHub personal access token (all variants)",
    regex: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  },
  {
    name: "slack-bot-token",
    description: "Slack bot/user/app/refresh token",
    regex: /\b(?:xoxb-|xoxp-|xoxa-|xoxr-)[A-Za-z0-9-]{20,}\b/g,
  },
  {
    name: "private-key-pem",
    description: "Embedded private key (PEM / RSA / ED25519)",
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    name: "gcp-service-account-private-key",
    description: "GCP service-account JSON private_key field",
    regex: /"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----/g,
  },
  {
    name: "gcp-service-account-email",
    description: "GCP service-account JSON client_email field",
    regex: /"client_email"\s*:\s*"[^"]+\.iam\.gserviceaccount\.com"/g,
  },
];

/**
 * scanBody — return an array of {pattern, lineNo, snippet} for each hit.
 * Empty array means no secrets detected.
 */
export interface SecretHit {
  pattern: string;
  lineNo: number;
  snippet: string;
}

export function scanBody(body: string): SecretHit[] {
  const hits: SecretHit[] = [];
  const lines = body.split(/\r?\n/);
  for (const pattern of PATTERNS) {
    // Fresh regex per scan — global flags maintain lastIndex across calls.
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      re.lastIndex = 0;
      if (re.test(line)) {
        // Truncate the snippet to keep dry-run output readable.
        const snippet = line.length > 200 ? `${line.slice(0, 200)}...` : line;
        hits.push({ pattern: pattern.name, lineNo: i + 1, snippet });
      }
    }
  }
  return hits;
}
