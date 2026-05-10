import { expect, test } from "@playwright/test";

test("home page search field is keyboard-ready and not treated as a credential field", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("My First Commit")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Discover your origin." })).toBeVisible();

  const searchBox = page.getByRole("searchbox", { name: "GitHub username" });
  await page.waitForLoadState("networkidle");
  await expect(searchBox).toBeFocused();
  await expect(searchBox).toHaveAttribute("type", "search");
  await expect(searchBox).toHaveAttribute("name", "commit-search");
  await expect(searchBox).toHaveAttribute("autocomplete", "off");
  await expect(searchBox).toHaveAttribute("autocorrect", "off");
  await expect(searchBox).toHaveAttribute("autocapitalize", "none");
  await expect(searchBox).toHaveAttribute("spellcheck", "false");

  const searchButton = page.getByRole("button", { name: "Search" });
  await expect(searchButton).toBeDisabled();

  await searchBox.pressSequentially("octocat");
  await expect(searchBox).toHaveValue("octocat");
  await expect(searchButton).toBeEnabled();

  await page.keyboard.press("Tab");
  await expect(searchButton).toBeFocused();

  await expect(page.getByText(/Not affiliated with GitHub/)).toBeVisible();
});

test("home page keeps the search form compact when helper text is visible", async ({ page }) => {
  await page.goto("/");

  const searchBox = page.getByRole("searchbox", { name: "GitHub username" });
  const searchButton = page.getByRole("button", { name: "Search" });

  await page.waitForLoadState("networkidle");
  await expect(searchBox).toBeVisible();
  await expect(searchButton).toBeVisible();

  const inputBox = await searchBox.boundingBox();
  const buttonBox = await searchButton.boundingBox();

  expect(inputBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect(inputBox!.height).toBeLessThanOrEqual(56);
  expect(buttonBox!.height).toBeLessThanOrEqual(inputBox!.height + 2);
  expect(Math.abs(buttonBox!.y - inputBox!.y)).toBeLessThanOrEqual(2);
});

test("home page visual layout stays stable", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const heading = page.getByRole("heading", { name: "Discover your origin." });
  const searchForm = page.getByRole("search", { name: "GitHub commit search" });
  const searchBox = page.getByRole("searchbox", { name: "GitHub username" });

  await expect(heading).toBeVisible();
  await expect(searchForm).toBeVisible();

  const headingBox = await heading.boundingBox();
  const formBox = await searchForm.boundingBox();
  const inputBox = await searchBox.boundingBox();

  expect(headingBox).not.toBeNull();
  expect(formBox).not.toBeNull();
  expect(inputBox).not.toBeNull();
  expect(headingBox!.y).toBeLessThan(formBox!.y);
  expect(formBox!.width).toBeGreaterThanOrEqual(inputBox!.width);
  expect(formBox!.height).toBeGreaterThan(inputBox!.height);
});

test("home page blocks invalid usernames without leaving keyboard flow", async ({ page }) => {
  await page.goto("/");

  const searchBox = page.getByRole("searchbox", { name: "GitHub username" });
  const searchButton = page.getByRole("button", { name: "Search" });

  await searchBox.fill("octo_cat");

  await expect(searchBox).toHaveAttribute("aria-invalid", "true");
  await expect(searchBox).toHaveAttribute("aria-describedby", "username-hint username-validation");
  await expect(page.getByRole("status")).toContainText("Use only letters, numbers, and hyphens.");
  await expect(searchButton).toBeDisabled();

  await searchBox.press("Enter");
  await expect(page).not.toHaveURL(/\?user=/);
  await expect(searchBox).toBeFocused();
});

test("home page renders recent searches stored in the browser", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("my-first-commit:recent-searches", JSON.stringify(["octocat"]));
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Recent searches" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search octocat again" })).toBeVisible();
});

test("home page advertises branded app and social preview images", async ({ page, request }) => {
  await page.goto("/");

  const iconHref = await page.locator('link[rel="icon"][type="image/png"]').getAttribute("href");
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
  const twitterImage = await page.locator('meta[name="twitter:image"]').getAttribute("content");

  expect(iconHref).toBeTruthy();
  expect(ogImage).toContain("/opengraph-image");
  expect(twitterImage).toContain("/twitter-image");

  const iconResponse = await request.get(iconHref!);
  const ogResponse = await request.get(ogImage!);
  const twitterResponse = await request.get(twitterImage!);

  expect(iconResponse.ok()).toBe(true);
  expect(ogResponse.ok()).toBe(true);
  expect(twitterResponse.ok()).toBe(true);
  expect(iconResponse.headers()["content-type"]).toContain("image/png");
  expect(ogResponse.headers()["content-type"]).toContain("image/png");
  expect(twitterResponse.headers()["content-type"]).toContain("image/png");
});

test("unknown routes show a branded not-found page", async ({ page }) => {
  const response = await page.goto("/missing-commit-path");

  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This commit path does not exist." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
});

test("health endpoint reports app status without caching", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["cache-control"]).toContain("max-age=0");

  const body = await response.json();

  expect(body).toMatchObject({
    status: "ok",
    service: "my-first-commit",
    checks: {
      siteUrl: {
        configured: expect.any(Boolean),
      },
    },
  });
  expect(Date.parse(body.timestamp)).not.toBeNaN();
});
