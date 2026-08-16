import type { Metadata } from "next";
import PrivacySafeAnalytics from "./PrivacySafeAnalytics";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const siteDescription = "Find and share the first public GitHub commit for any user.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "My First Commit",
    template: "%s | My First Commit",
  },
  description: siteDescription,
  applicationName: "My First Commit",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "My First Commit",
    description: siteDescription,
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
  },
  twitter: {
    card: "summary_large_image",
    title: "My First Commit",
    description: siteDescription,
    images: [
      {
        url: "/twitter-image",
        alt: "My First Commit social preview",
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <PrivacySafeAnalytics />
      </body>
    </html>
  );
}
