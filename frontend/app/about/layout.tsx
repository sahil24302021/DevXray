import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Our Developer Intelligence & GitHub Analyzer",
  description:
    "Learn how DevXray analyzes GitHub profiles, inspects real repository code, detects AI-generated commits, and verifies developer experience claims.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About DevXray AI — GitHub Profile Analyzer & Developer Intelligence",
    description:
      "Forensic-grade developer analysis. Understand how DevXray evaluates code quality, repository architectures, and real engineering talent.",
    url: "/about",
  },
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
