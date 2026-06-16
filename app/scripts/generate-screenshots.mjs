#!/usr/bin/env node
// Orchestrates the screenshot batch for PR-16 §13.4 row 23.
//
// Runs Playwright with --grep @screenshot --update-snapshots so the
// tests-e2e/screenshots.spec.ts file regenerates baseline PNGs under
// app/screenshots/.
//
// Usage:
//   node scripts/generate-screenshots.mjs
//
// Exits 0 on success, non-zero on Playwright failure. Re-running is safe;
// existing PNGs are overwritten.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, "..");
const OUT_DIR = path.join(APP_DIR, "screenshots");

if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true });
}

console.log(`[screenshots] writing to ${OUT_DIR}`);
console.log(`[screenshots] running: npx playwright test --grep @screenshot`);

const proc = spawn(
  "npx",
  ["playwright", "test", "--grep", "@screenshot"],
  {
    cwd: APP_DIR,
    stdio: "inherit",
    env: process.env,
  },
);

proc.on("exit", (code) => {
  if (code === 0) {
    console.log(`[screenshots] done`);
  } else {
    console.error(`[screenshots] FAILED with exit code ${code}`);
    console.error(
      `[screenshots] Note: screenshots committed to the worktree are baseline references. ` +
        `Failed-run PNGs in test-results/ should NOT be committed.`,
    );
  }
  process.exit(code ?? 1);
});
