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
