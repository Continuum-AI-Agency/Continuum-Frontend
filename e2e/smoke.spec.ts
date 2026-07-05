import { expect, test } from "@playwright/test";

// Unauthenticated smoke: the app shell must mount at the site root. This is
// intentionally auth-agnostic and route-agnostic — `/` renders through the root
// layout (src/app/layout.tsx) regardless of session or which page/redirect/404
// resolves — so it passes whenever a dev server + env are available, without
// needing the Supabase auth-mint helper.

test.describe("app shell", () => {
  test("renders at the site root", async ({ page }) => {
    // `/` redirects (unauthenticated -> login); Playwright follows it. The
    // destination still renders through the single root layout.
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Root layout signals (src/app/layout.tsx): <html lang="en"> + body wrapper.
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("body")).toBeVisible();

    // A non-empty <title> proves Next metadata/head rendered. We do not pin the
    // exact string: the resolved route (login, dashboard, 404) sets its own.
    await expect(page).toHaveTitle(/.+/);
  });
});
