import { expect, test, type APIResponse, type Page } from "@playwright/test";

const isDeployedTarget = Boolean(process.env.PLAYWRIGHT_BASE_URL);

function expectSecurityHeaders(response: APIResponse) {
  const headers = response.headers();

  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["permissions-policy"]).toContain("microphone=()");
  expect(headers["permissions-policy"]).toContain("geolocation=()");
  expect(headers["permissions-policy"]).toContain("payment=()");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy-report-only"]).toContain("default-src 'self'");
  expect(headers["content-security-policy-report-only"]).toContain("frame-ancestors 'none'");
  // Without a reporting destination the report-only policy is unobservable: violations reach the
  // browser console and nowhere else.
  expect(headers["content-security-policy-report-only"]).toContain("report-uri /api/csp-report");
  expect(headers["content-security-policy-report-only"]).toContain("report-to csp-endpoint");
  expect(headers["reporting-endpoints"]).toContain('csp-endpoint="/api/csp-report"');
}

async function searchForUsername(page: Page, username: string) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const searchBox = page.getByRole("searchbox", { name: "GitHub username" });
  await searchBox.fill(username);
  await page.getByRole("button", { name: "Search", exact: true }).click();
}

function captureReactRenderErrors(page: Page) {
  const renderErrors: string[] = [];
  const recordIfRenderError = (message: string) => {
    if (/hydrat|server rendered HTML|minified React error #418/i.test(message)) {
      renderErrors.push(message);
    }
  };

  page.on("console", (message) => {
    if (message.type() === "error") recordIfRenderError(message.text());
  });
  page.on("pageerror", (error) => renderErrors.push(error.message));

  return renderErrors;
}

test("home page search field is keyboard-ready and not treated as a credential field", async ({
  page,
}) => {
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

  const searchButton = page.getByRole("button", { name: "Search", exact: true });
  await expect(searchButton).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Examples" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search example username octocat" })).toBeVisible();

  await searchBox.pressSequentially("octocat");
  await expect(searchBox).toHaveValue("octocat");
  await expect(searchButton).toBeEnabled();

  await page.keyboard.press("Tab");
  await expect(searchButton).toBeFocused();

  await expect(page.getByText(/Not affiliated with GitHub/)).toBeVisible();
  await expect(page.getByText(/Release v\d+\.\d+\.\d+-/)).toBeVisible();
});

test("home page exposes accessible landmarks and privacy content", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("banner", { name: "Site header" })).toBeVisible();
  await expect(page.getByRole("main", { name: "Commit search" })).toBeVisible();
  await expect(page.getByRole("search", { name: "GitHub commit search" })).toBeVisible();
  await expect(
    page.getByRole("contentinfo", { name: "Privacy and GitHub affiliation" }),
  ).toBeVisible();
  await expect(page.getByText(/recent searches stay in this browser only/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Read the privacy note" })).toHaveAttribute(
    "href",
    "/privacy",
  );
});

test("privacy page documents search and analytics handling", async ({ page }) => {
  await page.goto("/privacy");

  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to search" })).toHaveAttribute("href", "/");
  await expect(
    page.getByText(/usernames entered into the search form are sent to GitHub/i),
  ).toBeVisible();
  await expect(
    page.getByText(/analytics events do not include the searched GitHub username/i),
  ).toBeVisible();
  await expect(page.getByText(/never sent to the browser/i)).toBeVisible();
});

test("home page tab order keeps primary actions reachable", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("my-first-commit:recent-searches", JSON.stringify(["octocat"]));
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const searchBox = page.getByRole("searchbox", { name: "GitHub username" });
  const searchButton = page.getByRole("button", { name: "Search", exact: true });
  const clearButton = page.getByRole("button", { name: "Clear recent searches" });
  const recentSearchButton = page.getByRole("button", { name: "Search octocat again" });

  await expect(searchBox).toBeFocused();
  await expect(clearButton).toBeVisible();
  await expect(recentSearchButton).toBeVisible();

  await searchBox.pressSequentially("octocat");
  await expect(searchButton).toBeEnabled();

  await page.keyboard.press("Tab");
  await expect(searchButton).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(clearButton).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(recentSearchButton).toBeFocused();
});

test("home page keeps the search form compact when helper text is visible", async ({ page }) => {
  await page.goto("/");

  const searchBox = page.getByRole("searchbox", { name: "GitHub username" });
  const searchButton = page.getByRole("button", { name: "Search", exact: true });

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
  const searchButton = page.getByRole("button", { name: "Search", exact: true });

  await searchBox.fill("octo_cat");

  await expect(searchBox).toHaveAttribute("aria-invalid", "true");
  await expect(searchBox).toHaveAttribute("aria-describedby", "username-hint username-validation");
  await expect(page.getByRole("status")).toContainText("Use only letters, numbers, and hyphens.");
  await expect(searchButton).toBeDisabled();

  await searchBox.press("Enter");
  await expect(page).not.toHaveURL(/\?user=/);
  await expect(searchBox).toBeFocused();
});

test("invalid shared URLs hydrate cleanly and show validation", async ({ page }) => {
  const renderErrors = captureReactRenderErrors(page);

  await page.goto("/?user=octo_cat");

  const searchBox = page.getByRole("searchbox", { name: "GitHub username" });
  await expect(searchBox).toHaveValue("octo_cat");
  await expect(page.getByRole("status")).toContainText("Use only letters, numbers, and hyphens.");
  await expect(searchBox).toBeFocused();
  expect(renderErrors).toEqual([]);
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

test("app responses include baseline security headers", async ({ request }) => {
  const homeResponse = await request.get("/");
  const healthResponse = await request.get("/api/health");
  const notFoundResponse = await request.get("/missing-commit-path");
  const ogResponse = await request.get("/opengraph-image");

  expect(homeResponse.ok()).toBe(true);
  expect(healthResponse.ok()).toBe(true);
  expect(notFoundResponse.status()).toBe(404);
  expect(ogResponse.ok()).toBe(true);

  expectSecurityHeaders(homeResponse);
  expectSecurityHeaders(healthResponse);
  expectSecurityHeaders(notFoundResponse);
  expectSecurityHeaders(ogResponse);
});

test("unknown routes show a branded not-found page", async ({ page }) => {
  const response = await page.goto("/missing-commit-path");

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "This commit path does not exist." }),
  ).toBeVisible();
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
      githubToken: {
        configured: expect.any(Boolean),
      },
    },
  });
  expect(Date.parse(body.timestamp)).not.toBeNaN();

  // Against a deployed target this is the check that catches a botched token rotation. Locally the
  // token is optional, so only its shape is asserted above.
  if (isDeployedTarget) {
    expect(body.checks.githubToken.configured).toBe(true);
  }

  expect(JSON.stringify(body)).not.toMatch(/gh[pousr]_/);
});

test("csp report endpoint accepts a violation report", async ({ request }) => {
  // Local only. Against production this would write a synthetic violation into the very logs the
  // endpoint exists to make trustworthy.
  test.skip(isDeployedTarget, "csp report posting only runs against the local Playwright server");

  const response = await request.post("/api/csp-report", {
    headers: { "content-type": "application/csp-report" },
    data: {
      "csp-report": {
        "document-uri": "http://localhost/",
        "effective-directive": "img-src",
        "blocked-uri": "https://example.test/pixel.gif",
        disposition: "report",
      },
    },
  });

  expect(response.status()).toBe(204);
});

test.describe("local mocked commit search states", () => {
  test.skip(
    isDeployedTarget,
    "mocked commit search states only run against the local Playwright server",
  );

  test("valid shared URLs automatically render search results", async ({ page }) => {
    const renderErrors = captureReactRenderErrors(page);

    await page.goto("/?user=e2e-result");

    await expect(page.getByRole("heading", { name: "First public commit found" })).toBeVisible();
    await expect(
      page.getByText(/earliest indexed public commit for @e2e-result appears in/i),
    ).toBeVisible();
    await expect(page).toHaveURL(/\?user=e2e-result$/);
    expect(renderErrors).toEqual([]);
  });

  test("search shortcuts stay disabled while a request is pending", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "my-first-commit:recent-searches",
        JSON.stringify(["e2e-slow-result", "e2e-result"]),
      );
    });
    await page.goto("/");

    const slowSearch = page.getByRole("button", { name: "Search e2e-slow-result again" });
    const secondSearch = page.getByRole("button", { name: "Search e2e-result again" });
    await slowSearch.click();

    await expect(page.getByRole("button", { name: "Clear recent searches" })).toBeDisabled();
    await expect(slowSearch).toBeDisabled();
    await expect(secondSearch).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Search example username octocat" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Search example username torvalds" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Search example username gaearon" }),
    ).toBeDisabled();

    await secondSearch.evaluate((button: HTMLButtonElement) => button.click());
    await expect(page).toHaveURL(/\?user=e2e-slow-result$/);
    await expect(page.getByRole("heading", { name: "First public commit found" })).toBeVisible();
    await expect(
      page.getByText(/earliest indexed public commit for @e2e-slow-result appears in/i),
    ).toBeVisible();
  });

  test("home page renders result sharing and source context", async ({ context, page }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await searchForUsername(page, "e2e-result");

    await expect(page.getByRole("heading", { name: "First public commit found" })).toBeVisible();
    await expect(
      page.getByText(/earliest indexed public commit for @e2e-result appears in/i),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "e2e-user/origin-repo" })).toHaveAttribute(
      "href",
      "https://github.com/e2e-user/origin-repo",
    );
    await expect(page.getByRole("link", { name: "Initial public commit" })).toHaveAttribute(
      "href",
      "https://github.com/e2e-user/origin-repo/commit/abcdef123456",
    );
    await expect(page.getByText("Commit date")).toBeVisible();
    await expect(page.locator('dl time[datetime="2020-01-02T03:04:05Z"]')).toHaveCount(1);
    await expect(page.getByText("Commit age")).toBeVisible();
    await expect(page.getByText("Source repository")).toBeVisible();

    await page.getByRole("button", { name: "Copy result" }).click();

    await expect(page.getByRole("status")).toContainText("Result copied.");
  });

  test("home page renders a helpful empty search state", async ({ page }) => {
    await searchForUsername(page, "e2e-empty");

    await expect(page.getByRole("heading", { name: "No public commits found." })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("No public commits found.");
    await expect(page.getByText(/GitHub commit search indexing can lag/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Check a known public profile" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Search example username octocat" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit username" })).toBeVisible();
  });

  test("home page renders retry guidance for rate limits", async ({ page }) => {
    await searchForUsername(page, "e2e-rate-limit");

    await expect(
      page.getByRole("heading", { name: "GitHub is asking us to slow down." }),
    ).toBeVisible();
    await expect(
      page.locator('main [role="alert"]').filter({ hasText: "GitHub is asking us to slow down." }),
    ).toBeVisible();
    await expect(page.getByText(/temporarily limited commit search requests/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("home page renders retry guidance when GitHub is unavailable", async ({ page }) => {
    await searchForUsername(page, "e2e-unavailable");

    await expect(
      page.getByRole("heading", { name: "GitHub search is temporarily unavailable." }),
    ).toBeVisible();
    await expect(
      page
        .locator('main [role="alert"]')
        .filter({ hasText: "GitHub search is temporarily unavailable." }),
    ).toBeVisible();
    await expect(page.getByText(/temporary service error/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});
