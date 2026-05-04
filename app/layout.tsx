import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

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
  description: "Find the first public GitHub commit for any user.",
  applicationName: "My First Commit",
  openGraph: {
    title: "My First Commit",
    description: "Find the first public GitHub commit for any user.",
    type: "website",
    url: "/",
    siteName: "My First Commit",
  },
  twitter: {
    card: "summary_large_image",
    title: "My First Commit",
    description: "Find the first public GitHub commit for any user.",
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
