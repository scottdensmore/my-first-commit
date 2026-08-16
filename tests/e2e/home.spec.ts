import { expect, test, type APIResponse, type Locator, type Page } from "@playwright/test";

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

// Fixture usernames must stay within GitHub's 39-character limit, which the client
// validates: over it, the Search button silently stays disabled and the journey fails
// as an unexplained click timeout rather than as a validation error.
const MAX_GITHUB_USERNAME_LENGTH = 39;

async function searchForUsername(page: Page, username: string) {
  expect(username.length).toBeLessThanOrEqual(MAX_GITHUB_USERNAME_LENGTH);

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // The page takes focus in a mount effect, so this is the hydration barrier.
  // `networkidle` is not one: filling this controlled input before hydration leaves
  // React's state empty, so the Search button never enables and the click hangs for
  // the full timeout with no indication of why.
  const searchBox = page.getByRole("searchbox", { name: "GitHub username" });
  await expect(searchBox).toBeFocused();
  await searchBox.fill(username);

  const searchButton = page.getByRole("button", { name: "Search", exact: true });
  await expect(searchButton).toBeEnabled();
  await searchButton.click();
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

async function getTextContrastRatio(locator: Locator) {
  return locator.evaluate((element) => {
    // Resolve through a canvas rather than parsing the string: Tailwind 4 serializes its
    // palette as `lab()`, whose digits are not sRGB channels. Reading them as though they
    // were reports a wrong ratio in both directions -- it once passed a 9.1:1 button as
    // 16.4:1 while failing an 8.8:1 panel as 1.2:1.
    const parseRgb = (color: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d")!;
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
      return [red!, green!, blue!];
    };
    const relativeLuminance = (color: string) => {
      const channels = parseRgb(color).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
    };
    const styles = getComputedStyle(element);
    const foreground = relativeLuminance(styles.color);
    const background = relativeLuminance(styles.backgroundColor);
    const lighter = Math.max(foreground, background);
    const darker = Math.min(foreground, background);

    return (lighter + 0.05) / (darker + 0.05);
  });
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

test(
  "home page exposes accessible landmarks and privacy content",
  { tag: ["@mobile"] },
  async ({ page }) => {
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
  },
);

test("privacy page documents search and analytics handling", async ({ page }) => {
  await page.goto("/privacy");

  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to search" })).toHaveAttribute("href", "/");
  await expect(
    page.getByText(/usernames entered into the search form are sent to GitHub/i),
  ).toBeVisible();
  await expect(
    page.getByText(/removes the shared-search user query parameter before analytics events/i),
  ).toBeVisible();
  await expect(
    page.getByText(/event properties do not include the searched GitHub username/i),
  ).toBeVisible();
  await expect(page.getByText(/never sent to the browser/i)).toBeVisible();
});

test(
  "home page tab order keeps primary actions reachable",
  { tag: ["@webkit"] },
  async ({ page }) => {
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
  },
);

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

test(
  "home page blocks invalid usernames without leaving keyboard flow",
  { tag: ["@mobile"] },
  async ({ page }) => {
    await page.goto("/");

    const searchBox = page.getByRole("searchbox", { name: "GitHub username" });
    // Same hydration barrier as searchForUsername: a pre-hydration fill leaves React's
    // state empty, so the validation this asserts never runs.
    await expect(searchBox).toBeFocused();
    const searchButton = page.getByRole("button", { name: "Search", exact: true });

    await searchBox.fill("octo_cat");

    await expect(searchBox).toHaveAttribute("aria-invalid", "true");
    await expect(searchBox).toHaveAttribute(
      "aria-describedby",
      "username-hint username-validation",
    );
    await expect(page.getByRole("status")).toContainText("Use only letters, numbers, and hyphens.");
    await expect(searchButton).toBeDisabled();

    await searchBox.press("Enter");
    await expect(page).not.toHaveURL(/\?user=/);
    await expect(searchBox).toBeFocused();
  },
);

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

test("home page ignores corrupt stored recent searches", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "my-first-commit:recent-searches",
      JSON.stringify(["", "  ", "octocat", 42, "not a username", "  OCTOCAT  "]),
    );
  });

  await page.goto("/");

  // Asserting the row's visible text, because that is what the visitor reads and it is the
  // only form that catches every case at once. Before this fix the same stored list rendered
  // "@", "@", "@octocat", "@ OCTOCAT": blanks became bare "@" buttons that searched for
  // nothing, and a case variant became a second button for the same person.
  //
  // An accessible-name assertion would not do it. These buttons carry an aria-label, so a
  // blank entry is named "Search  again" rather than "@", and Playwright's name matching is
  // a case-insensitive substring by default, so "Search octocat again" also matches
  // "@OCTOCAT".
  const recentSearches = page.getByRole("region", { name: "Recent searches" });
  await expect(recentSearches.getByRole("button")).toHaveText(["Clear", "@octocat"]);
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

test("unknown routes show a branded not-found page", { tag: ["@webkit"] }, async ({ page }) => {
  const response = await page.goto("/missing-commit-path");

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "This commit path does not exist." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
});

test("the homepage internals directory is not a route", async ({ page }) => {
  // `app/_home/` holds the homepage's components and modules, not a page. The leading
  // underscore is Next.js's private-folder marker, so the segment cannot become a route even
  // if someone later adds a `page.tsx` there. This asserts the outcome rather than the
  // mechanism: it passed before the rename too, when the directory was `app/home/` and only
  // the absence of a `page.tsx` kept `/home` free.
  const response = await page.goto("/home");

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "This commit path does not exist." }),
  ).toBeVisible();
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

test("csp report endpoint refuses oversized and unexpected posts", async ({ request }) => {
  // Local only, for the same reason as the test above.
  test.skip(isDeployedTarget, "csp report posting only runs against the local Playwright server");

  const oversized = await request.post("/api/csp-report", {
    headers: { "content-type": "application/csp-report" },
    // 6,000 characters at three bytes each: only a byte limit rejects this.
    data: "€".repeat(6_000),
  });

  expect(oversized.status()).toBe(413);

  const wrongType = await request.post("/api/csp-report", {
    headers: { "content-type": "application/json" },
    data: {
      "csp-report": {
        "document-uri": "http://localhost/",
        "effective-directive": "img-src",
        "blocked-uri": "https://example.test/pixel.gif",
      },
    },
  });

  expect(wrongType.status()).toBe(415);
});

test("a maximum-length handle does not scroll the page sideways at 320px", async ({ page }) => {
  // 39 characters is the longest handle GitHub issues, and #102 made that bound real by
  // validating on read, so this is the widest label the row can ever hold.
  const longestHandle = "a".repeat(39);
  await page.addInitScript((handle) => {
    window.localStorage.setItem("my-first-commit:recent-searches", JSON.stringify([handle]));
  }, longestHandle);

  // 320px is also what 200% zoom produces on a 640px window, which is the WCAG 1.4.10
  // reflow condition: content must reflow rather than require two-dimensional scrolling.
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const shortcut = page.getByRole("button", { name: `Search ${longestHandle} again` });
  await expect(shortcut).toBeVisible();

  // Two assertions, because the page-level one alone is not enough. Capping the button at
  // `max-w-full` stops the page scrolling while the label still overruns its own padding and
  // renders across the border, which looks broken and is not the reflow 1.4.10 asks for.
  const overflow = await shortcut.evaluate((button) => ({
    labelOverflowsButton: button.scrollWidth > button.clientWidth,
    pageScrollWidth: document.documentElement.scrollWidth,
    pageClientWidth: document.documentElement.clientWidth,
  }));

  expect(overflow.labelOverflowsButton).toBe(false);
  expect(overflow.pageScrollWidth).toBeLessThanOrEqual(overflow.pageClientWidth);
});

test.describe("local mocked commit search states", () => {
  test.skip(
    isDeployedTarget,
    "mocked commit search states only run against the local Playwright server",
  );

  test(
    "valid shared URLs automatically render search results",
    { tag: ["@webkit"] },
    async ({ page }) => {
      const renderErrors = captureReactRenderErrors(page);

      await page.goto("/?user=e2e-result");

      await expect(page.getByRole("heading", { name: "First public commit found" })).toBeVisible();
      await expect(
        page.getByText(/earliest indexed public commit for @e2e-result appears in/i),
      ).toBeVisible();
      await expect(page).toHaveURL(/\?user=e2e-result$/);
      expect(renderErrors).toEqual([]);
    },
  );

  test(
    "successful search focuses its heading and action colors meet AA contrast",
    { tag: ["@mobile", "@webkit"] },
    async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Same hydration barrier as searchForUsername: a pre-hydration fill leaves React's
      // state empty, so the button never enables and this dies as an unexplained timeout.
      const searchBox = page.getByRole("searchbox", { name: "GitHub username" });
      await expect(searchBox).toBeFocused();
      await searchBox.fill("e2e-result");
      const searchButton = page.getByRole("button", { name: "Search", exact: true });
      await expect(searchButton).toBeEnabled();
      expect(await getTextContrastRatio(searchButton)).toBeGreaterThanOrEqual(4.5);

      await searchButton.hover();
      await expect.poll(() => getTextContrastRatio(searchButton)).toBeGreaterThanOrEqual(4.5);
      await searchButton.click();

      const resultHeading = page.getByRole("heading", { name: "First public commit found" });
      await expect(resultHeading).toBeFocused();

      await page.getByRole("button", { name: "Search another user" }).click();
      await expect(page.getByRole("searchbox", { name: "GitHub username" })).toBeFocused();
    },
  );

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

  test("copying a result always answers the visitor", { tag: ["@webkit"] }, async ({ page }) => {
    // The sibling test above grants clipboard permissions and asserts the success message. It
    // cannot run on WebKit at all: Playwright does not support `clipboard-read`/`clipboard-write`
    // there, which is the whole reason this app has a fallback. So this asserts the contract that
    // holds in every engine instead of the outcome that only holds in one -- pressing Copy always
    // says something, and never throws.
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await searchForUsername(page, "e2e-result");
    await expect(page.getByRole("heading", { name: "First public commit found" })).toBeVisible();

    await page.getByRole("button", { name: "Copy result" }).click();

    // One of the three `copyResult` outcomes: copied, refused, or unavailable. Which one depends
    // on the engine's clipboard policy, and pinning a particular one here would assert the
    // policy rather than the app's handling of it.
    await expect(page.getByRole("status")).toContainText(
      /Result copied\.|Could not copy result\.|Copy is not available in this browser\./,
    );
    expect(pageErrors).toEqual([]);
  });

  test(
    "the commit timeline is an ordered list that survives long content at 320px",
    { tag: ["@mobile", "@webkit"] },
    async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 720 });
      await searchForUsername(page, "e2e-long-data");

      await expect(page.getByRole("heading", { name: "First public commit found" })).toBeVisible();

      // List semantics, so assistive technology announces "list, 2 items" instead of reading two
      // indistinguishable card-shaped groups of divs.
      const timeline = page.getByRole("list", { name: /earliest public commits/i });
      await expect(timeline).toBeVisible();
      await expect(timeline.getByRole("listitem")).toHaveCount(2);

      // Nothing may escape the page, and no card may overrun its own box. The page check alone
      // passes while a card clips its content internally, which is the defect here.
      const overflow = await page.evaluate(() => {
        const cards = [...document.querySelectorAll("[data-commit-card]")];
        return {
          pageScrollWidth: document.documentElement.scrollWidth,
          pageClientWidth: document.documentElement.clientWidth,
          overflowingCards: cards.filter((card) => card.scrollWidth > card.clientWidth).length,
          cardCount: cards.length,
        };
      });

      expect(overflow.pageScrollWidth).toBeLessThanOrEqual(overflow.pageClientWidth);
      expect(overflow.cardCount).toBe(2);
      expect(overflow.overflowingCards).toBe(0);
    },
  );

  test("mixed valid and malformed commit dates render without crashing", async ({ page }) => {
    const renderErrors = captureReactRenderErrors(page);

    await searchForUsername(page, "e2e-malformed-dates");

    await expect(page.getByRole("heading", { name: "First public commit found" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Initial public commit" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Commit with malformed date" })).toBeVisible();
    await expect(page.getByText("Date unavailable")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Something went wrong." })).toHaveCount(0);
    expect(renderErrors).toEqual([]);
  });

  test("home page flags a partial result instead of claiming a first commit", async ({ page }) => {
    await searchForUsername(page, "e2e-incomplete");

    await expect(
      page.getByRole("heading", { name: "Earliest public commit found so far" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "First public commit found" })).toHaveCount(0);

    const partialResultRegion = page.getByRole("region", {
      name: "GitHub returned a partial result",
    });
    await expect(partialResultRegion).toBeVisible();
    await expect(partialResultRegion).toContainText(/an earlier commit may be missing/i);
    await expect(page.getByRole("link", { name: "Initial public commit" })).toBeVisible();

    // The caveat is announced through the heading that takes focus, not a live region.
    const partialResultHeading = page.getByRole("heading", {
      name: "Earliest public commit found so far",
    });
    await expect(partialResultHeading).toBeFocused();
    const describedBy = await partialResultHeading.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`#${describedBy!.split(" ")[0]}`)).toContainText(
      /an earlier commit may be missing/i,
    );

    // The amber panel is a new surface in this palette; assert it clears AA rather than
    // trusting that it looks fine.
    expect(await getTextContrastRatio(partialResultRegion)).toBeGreaterThanOrEqual(4.5);
  });

  test("a retry that is still partial says so and keeps focus on the button", async ({ page }) => {
    await searchForUsername(page, "e2e-incomplete");

    const retryButton = page.getByRole("button", { name: "Search again" });
    await retryButton.click();

    // The fixture is always partial, so this is the repeat-partial outcome: nothing else
    // on screen changes, and without a message the button reads as broken.
    await expect(page.getByText(/still returned a partial result/i)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Earliest public commit found so far" }),
    ).toBeVisible();
    await expect(retryButton).toBeFocused();
  });

  test("retrying a partial result reaches the complete history", async ({ page }, testInfo) => {
    const partialUsername = `e2e-incomplete-once-${testInfo.workerIndex}-${Date.now().toString(36)}`;

    await searchForUsername(page, partialUsername);
    await expect(
      page.getByRole("heading", { name: "Earliest public commit found so far" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Search again" }).click();

    // The fixture returns a complete result on the second call, so the panel clearing
    // proves the retry re-issued the search rather than re-rendering the same state.
    await expect(page.getByRole("heading", { name: "First public commit found" })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "GitHub returned a partial result" }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Follow-up commit" })).toBeVisible();
  });

  test("a failed retry keeps the partial result on screen", async ({ page }, testInfo) => {
    const partialUsername = `e2e-incomplete-then-error-${testInfo.workerIndex}-${Date.now().toString(36)}`;

    await searchForUsername(page, partialUsername);
    const retryButton = page.getByRole("button", { name: "Search again" });
    await expect(retryButton).toBeVisible();
    const buttonBoxBefore = await retryButton.boundingBox();
    expect(buttonBoxBefore).not.toBeNull();

    await retryButton.click();

    await expect(page.getByText(/still the earlier partial result/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Initial public commit" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "GitHub is asking us to slow down." }),
    ).toHaveCount(0);

    // The failure renders below the button, so the control the visitor may press again
    // does not shift out from under them.
    const buttonBoxAfter = await retryButton.boundingBox();
    expect(buttonBoxAfter).not.toBeNull();
    // Tolerance rather than equality: the claim is that the button did not move, and an
    // exact float comparison would fail on a sub-pixel rendering difference instead.
    expect(Math.abs(buttonBoxAfter!.y - buttonBoxBefore!.y)).toBeLessThan(1);
    expect(await getTextContrastRatio(retryButton)).toBeGreaterThanOrEqual(4.5);
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

  test("home page distinguishes an unfinished search from an empty one", async ({ page }) => {
    await searchForUsername(page, "e2e-incomplete-empty");

    await expect(
      page.getByRole("heading", { name: "GitHub could not finish this search." }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "No public commits found." })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    // Suggesting other profiles would imply this username was searched and came up empty.
    await expect(page.getByRole("heading", { name: "Check a known public profile" })).toHaveCount(
      0,
    );
  });

  test(
    "home page renders retry guidance for rate limits",
    { tag: ["@mobile"] },
    async ({ page }) => {
      await searchForUsername(page, "e2e-rate-limit");

      await expect(
        page.getByRole("heading", { name: "GitHub is asking us to slow down." }),
      ).toBeVisible();
      await expect(
        page
          .locator('main [role="alert"]')
          .filter({ hasText: "GitHub is asking us to slow down." }),
      ).toBeVisible();
      await expect(page.getByText(/temporarily limited commit search requests/i)).toBeVisible();
      await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

      // This fixture answers the same way every time, so the retry lands back on this panel
      // with the button still mounted. A `disabled` retry is blurred to <body> the moment it
      // is pressed and nothing ever gives the focus back, so a keyboard visitor finishes the
      // request with no place in the document. jsdom does not reproduce that blur, which is
      // why this assertion lives in a real browser.
      const retryButton = page.getByRole("button", { name: "Try again" });
      // Activated from the keyboard, which is both the affected path and the one that does
      // not depend on a platform's click-to-focus behaviour. The pending label is
      // deliberately not asserted: the fixture answers immediately, so that window is a race.
      await retryButton.focus();
      await page.keyboard.press("Enter");

      await expect(retryButton).toBeVisible();
      await expect(retryButton).toBeFocused();
    },
  );

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

  test("home page recovers from an unexpected Server Action rejection", async ({
    page,
  }, testInfo) => {
    const rejectionUsername = `e2e-reject-once-${testInfo.workerIndex}-${Date.now().toString(36)}`;
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await searchForUsername(page, rejectionUsername);

    await expect(
      page.getByRole("heading", { name: "We could not complete that search." }),
    ).toBeVisible();
    await expect(page.locator('main [role="alert"]')).toContainText(
      "GitHub commit search failed. Please try again.",
    );
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          JSON.parse(window.localStorage.getItem("my-first-commit:recent-searches") ?? "[]"),
        ),
      )
      .toEqual([]);

    await page.getByRole("button", { name: "Try again" }).click();

    await expect(page.getByRole("heading", { name: "First public commit found" })).toBeVisible();
    await expect(
      page.getByText(
        new RegExp(`earliest indexed public commit for @${rejectionUsername} appears in`, "i"),
      ),
    ).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
