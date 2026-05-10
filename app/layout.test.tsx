import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RootLayout, { metadata } from "./layout";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "geist-sans" }),
  Geist_Mono: () => ({ variable: "geist-mono" }),
}));

vi.mock("@vercel/analytics/next", () => ({
  Analytics: () => <div data-testid="vercel-analytics" />,
}));

describe("RootLayout", () => {
  it("defines production-ready metadata for shared links", () => {
    const expectedMetadataBase = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").toString();

    expect(metadata.metadataBase?.toString()).toBe(expectedMetadataBase);
    expect(metadata.title).toEqual({
      default: "My First Commit",
      template: "%s | My First Commit",
    });
    expect(metadata.description).toBe("Find and share the first public GitHub commit for any user.");
    expect(metadata.alternates).toEqual({
      canonical: "/",
    });
    expect(metadata.openGraph).toMatchObject({
      title: "My First Commit",
      description: "Find and share the first public GitHub commit for any user.",
      type: "website",
      url: "/",
      siteName: "My First Commit",
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: "My First Commit social preview",
        },
      ],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: "My First Commit",
      description: "Find and share the first public GitHub commit for any user.",
      images: [
        {
          url: "/twitter-image",
          alt: "My First Commit social preview",
        },
      ],
    });
    expect(metadata.robots).toEqual({
      index: true,
      follow: true,
    });
  });

  it("mounts Vercel Analytics globally", () => {
    render(
      <RootLayout>
        <main>Page content</main>
      </RootLayout>,
    );

    expect(screen.getByText("Page content")).toBeInTheDocument();
    expect(screen.getByTestId("vercel-analytics")).toBeInTheDocument();
  });
});
