import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const siteDescription = "Find and share the first public GitHub commit for any user.";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
