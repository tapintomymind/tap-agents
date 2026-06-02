/**
 * test-changelog-format.ts
 *
 * Asserts every CHANGELOG.md version heading matches the canonical format the
 * consumer's awk extractor (in <project>/.github/workflows/adopt-tap-agents.yml)
 * expects. The auto-adoption pipeline's CHANGELOG-aggregation step depends on
 * this format being stable — if a heading drifts, the consumer silently emits
 * an empty CHANGELOG section in the adoption PR.
 *
 * Format expected:
 *   ## [X.Y.Z] — YYYY-MM-DD optional-title
 *
 * Regex: /^## \[\d+\.\d+\.\d+\] — \d{4}-\d{2}-\d{2}( .+)?$/
 *
 * Per <project> PR #28 design CR-13 + NF-9. This file is run as a tsx
 * script (tap-agents has no vitest); the test surface is node:assert.
 *
 * Wire-up: `npm run test:changelog-format` runs this; version-check.yml's CI
 * step invokes it on every PR touching CHANGELOG.md.
 *
 * Phase 2b deliverable per <project> PR #28.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

// ECMAScript regex (TS native): \d works, no escaping needed
const HEADING_REGEX = /^## \[\d+\.\d+\.\d+\] — \d{4}-\d{2}-\d{2}( .+)?$/;

// Resolve CHANGELOG.md relative to this script (scripts/ is one level under
// repo root)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const changelogPath = join(__dirname, "..", "CHANGELOG.md");

function runTests() {
  const changelog = readFileSync(changelogPath, "utf-8");
  const headingLines = changelog
    .split("\n")
    .filter((line) => line.startsWith("## ["));

  // Test 1: at least one version heading exists
  assert.ok(
    headingLines.length > 0,
    `No "## [" version headings found in ${changelogPath}. CHANGELOG.md must contain at least one version section.`,
  );
  console.log(
    `  [PASS] at least one version heading exists (found ${headingLines.length})`,
  );

  // Test 2: every version heading matches the canonical format
  const malformed = headingLines.filter((line) => !HEADING_REGEX.test(line));

  if (malformed.length > 0) {
    const detail = malformed.map((line) => `  ${line}`).join("\n");
    assert.fail(
      `Found ${malformed.length} malformed heading(s):\n${detail}\n\nFormat expected: ## [X.Y.Z] — YYYY-MM-DD optional-title\nRegex: ${HEADING_REGEX}`,
    );
  }
  console.log(
    `  [PASS] every version heading matches the canonical format (${headingLines.length}/${headingLines.length})`,
  );
}

console.log("test-changelog-format.ts");
console.log(`  CHANGELOG: ${changelogPath}`);
console.log(`  Regex:     ${HEADING_REGEX}`);
console.log("");

try {
  runTests();
  console.log("");
  console.log("All CHANGELOG.md format tests passed.");
  process.exit(0);
} catch (err) {
  console.error("");
  console.error("CHANGELOG.md format test FAILED:");
  console.error(
    err instanceof Error && err.message ? err.message : String(err),
  );
  process.exit(1);
}
