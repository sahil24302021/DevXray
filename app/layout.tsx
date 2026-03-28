import type { Metadata } from "next";
import { Syne, DM_Sans, Space_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
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

export const metadata: Metadata = {
  title: "DevXray AI — GitHub Developer Intelligence",
  description:
    "Analyze GitHub profiles instantly. No resumes. No guesswork. Just signal.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const hasClerkKey = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.includes("your_");

  const inner = (
    <html lang="en" className={`${syne.variable} ${dmSans.variable} ${spaceGrotesk.variable}`} data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );

  // Only wrap with ClerkProvider if a real key is configured
  if (hasClerkKey) {
    return (
      <ClerkProvider>
        {inner}
      </ClerkProvider>
    );
  }

  return inner;
}
