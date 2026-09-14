import type { Metadata } from "next";
import { Syne, DM_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-syne",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  variable: "--font-dm-sans",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space",
  display: "swap",
});

import BackendKeepAlive from "@/components/BackendKeepAlive";
import JsonLd from "@/components/JsonLd";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://dev-xray.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "DevXray AI — #1 GitHub Analyzer, Resume Analyzer & Profile Checker",
    template: "%s | DevXray AI",
  },
  description:
    "The #1 GitHub Analyzer & Resume Checker. Scan any developer's GitHub profile instantly to evaluate code quality, detect AI-generated code, verify resume claims, and uncover true engineering signal.",
  keywords: [
    "github analyzer",
    "resume analyzer",
    "github profile checker",
    "github resume checker",
    "github scanning",
    "github scanner",
    "github profile analyzer",
    "developer analyzer",
    "ai code detector github",
    "developer trust score",
    "resume checker",
    "candidate screening tool",
    "technical hiring analyzer",
    "github code quality checker",
    "github portfolio reviewer",
    "engineering candidate assessment",
    "code fraud detection",
    "github stats checker",
    "hire developer analyzer",
    "developer intelligence",
    "tech recruiter tool",
    "github commit analyzer",
  ],
  authors: [{ name: "DevXray AI", url: baseUrl }],
  creator: "DevXray AI",
  publisher: "DevXray AI",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: baseUrl,
    siteName: "DevXray AI",
    title: "DevXray AI — #1 GitHub Analyzer & Resume Screening Tool",
    description:
      "Forensic-grade developer analysis. Deep-scan GitHub profiles, detect AI-generated code, cross-reference resume claims against actual commits, and hire with confidence.",
    images: [
      {
        url: `${baseUrl}/devxray-logo.png`,
        width: 1200,
        height: 630,
        alt: "DevXray AI — GitHub Analyzer & Developer Intelligence",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DevXray AI — GitHub Analyzer, Resume Checker & Profile Scanner",
    description:
      "Analyze GitHub profiles instantly. Detect AI code, verify claims, and uncover developer signal in seconds.",
    images: [`${baseUrl}/devxray-logo.png`],
    creator: "@DevXrayAI",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  category: "technology",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable} ${spaceGrotesk.variable}`} data-scroll-behavior="smooth">
      <head>
        <link rel="icon" href="/devxray-logo.png" type="image/png" />
      </head>
      <body>
        <JsonLd />
        <BackendKeepAlive />
        {children}
      </body>
    </html>
  );
}
