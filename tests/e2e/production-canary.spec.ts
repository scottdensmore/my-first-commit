import { expect, test, type Page } from "@playwright/test";

// The one check that exercises the whole path against real infrastructure: browser to Server
// Action to GitHub to a rendered result. Everything else about search is covered by fixtures,
// which is what makes them deterministic and also what makes them blind to a revoked token, a
// changed GitHub response, or a Server Action broken only in production.
//
// Deployed targets only. Locally the fixtures cover this ground without spending anyone's quota.
const isDeployedTarget = Boolean(process.env.PLAYWRIGHT_BASE_URL);

// One search per deployment, deliberately. This is a canary, not a suite: it answers "does the
// real path work at all", and every additional search spends the shared GitHub quota that the
// rate limiting in #106 exists to protect. Untagged, so it runs on Chromium only rather than
// once per browser project.
//
// Overridable because the assertion depends on GitHub's commit search index rather than on a
// fixture. `torvalds` is chosen for having the largest and most reliably indexed history on the
// platform; if that ever stops being true, set E2E_CANARY_USERNAME rather than editing this file.
const CANARY_USERNAME = process.env.E2E_CANARY_USERNAME?.trim() || "torvalds";

async function searchFor(page: Page, username: string) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // The same hydration barrier the local suite uses: filling this controlled input before
  // hydration leaves React's state empty, so the button never enables and the click hangs.
  const searchBox = page.getByRole("searchbox", { name: "GitHub username" });
  await expect(searchBox).toBeFocused();
  await searchBox.fill(username);

  const searchButton = page.getByRole("button", { name: "Search", exact: true });
  await expect(searchButton).toBeEnabled();
  await searchButton.click();
}

test.describe("production commit search canary", () => {
  test.skip(
    !isDeployedTarget,
    "the canary reaches real GitHub, so it runs only against a deployed target",
  );

  test("a real search reaches GitHub and renders a commit", async ({ page }) => {
    // Longer than the default: this waits on GitHub rather than on a fixture, and the Server
    // Action allows itself ten seconds before reporting a timeout.
    test.setTimeout(60_000);

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await searchFor(page, CANARY_USERNAME);

    // Either heading is a pass: a partial result still proves the whole path worked, and GitHub
    // returning `incomplete_results` is its own load shedding rather than a fault of this app.
    // Failing on it would make the canary flap for a reason no deploy can fix.
    await expect(
      page.getByRole("heading", {
        name: /First public commit found|Earliest public commit found so far/,
      }),
    ).toBeVisible({ timeout: 30_000 });

    // A rendered commit, not just a heading. The timeline is an ordered list, so this asserts the
    // result actually arrived and rendered rather than that the success shell appeared.
    const timeline = page.getByRole("list", { name: /earliest public commits/i });
    await expect(timeline).toBeVisible();
    expect(await timeline.getByRole("listitem").count()).toBeGreaterThan(0);

    // The commit links out to GitHub, which is the evidence the result came from GitHub at all.
    await expect(
      page.getByRole("link", { name: /view full commit on github/i }).first(),
    ).toHaveAttribute("href", /^https:\/\/github\.com\//);

    expect(pageErrors).toEqual([]);
  });
});
