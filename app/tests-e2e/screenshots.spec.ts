// §13.4 row: Desktop + mobile screenshots.
//
// Generates baseline PNGs at `app/screenshots/{theme}-{viewport}-{route}.png`
// for the 5 public routes + the dev-only Force-Exit panel + the
// state-bit banner under each named bit. Tagged @screenshot so the
// non-screenshot test run can grep -v @screenshot.
//
// Coverage matrix:
//   - routes: /markets /loop /positions /automation /evidence
//   - dev:    /dev/force-exit (closed panel + open panel)
//   - banner: state-bitmap-banner under each of 11 named bits
//   - themes: {dark, light}
//   - viewports: {desktop 1280x800, mobile Pixel 7} via project name
//
// Total: 5 routes × 2 themes × 2 viewports = 20
//      + 2 force-exit × 2 themes × 2 viewports = 8
//      + 11 bits × 2 themes × 2 viewports = 44
//                                          = 72 PNGs max
//
// Filenames are stable; re-running with --update-snapshots overwrites
// cleanly.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { installMockSdk, makeReadinessPayload } from "./fixtures/mock-sdk.js";
import { STATE_BITS, STATE_BIT_NAMES } from "./fixtures/mock-state.js";

const MARKET =
  "0xabcdef0000000000000000000000000000000000000000000000000000000001";
const OUT_DIR = path.resolve("./screenshots");

const ROUTES = [
  { path: "/markets", slug: "markets" },
  { path: "/loop", slug: "loop" },
  { path: "/positions", slug: "positions" },
  { path: "/automation", slug: "automation" },
  { path: "/evidence", slug: "evidence" },
];

async function setTheme(page: import("@playwright/test").Page, theme: "dark" | "light"): Promise<void> {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
}

async function snapshot(
  page: import("@playwright/test").Page,
  filename: string,
): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const buf = await page.screenshot({ fullPage: true });
  await writeFile(path.join(OUT_DIR, filename), buf);
}

for (const theme of ["dark", "light"] as const) {
  for (const route of ROUTES) {
    test(`@screenshot ${theme} ${route.slug}`, async ({ page }, testInfo) => {
      await page.goto(route.path);
      await setTheme(page, theme);
      // Give the chrome a beat to paint after theme flip.
      await page.waitForTimeout(200);
      const viewport = testInfo.project.name.includes("mobile") ? "mobile" : "desktop";
      await snapshot(page, `${theme}-${viewport}-${route.slug}.png`);
    });
  }

  test(`@screenshot ${theme} dev-force-exit-closed`, async ({ page }, testInfo) => {
    await page.goto("/dev/force-exit");
    await setTheme(page, theme);
    await page.waitForTimeout(200);
    const viewport = testInfo.project.name.includes("mobile") ? "mobile" : "desktop";
    await snapshot(page, `${theme}-${viewport}-dev-force-exit-closed.png`);
  });

  test(`@screenshot ${theme} dev-force-exit-open`, async ({ page }, testInfo) => {
    await page.goto("/dev/force-exit");
    await setTheme(page, theme);
    await page.getByTestId("dev-force-exit-open").click();
    await expect(page.getByTestId("force-exit-confirm-panel")).toBeVisible();
    await page.waitForTimeout(200);
    const viewport = testInfo.project.name.includes("mobile") ? "mobile" : "desktop";
    await snapshot(page, `${theme}-${viewport}-dev-force-exit-open.png`);
  });

  for (const bitName of STATE_BIT_NAMES) {
    const mask = STATE_BITS[bitName];
    test(`@screenshot ${theme} banner-${bitName}`, async ({ page }, testInfo) => {
      await installMockSdk(page, {
        readinessPayload: makeReadinessPayload(MARKET, { stateBitmap: mask }),
      });
      await page.goto("/markets");
      await setTheme(page, theme);
      await page.waitForTimeout(400);
      const viewport = testInfo.project.name.includes("mobile") ? "mobile" : "desktop";
      await snapshot(
        page,
        `${theme}-${viewport}-banner-${bitName}.png`,
      );
    });
  }
}
