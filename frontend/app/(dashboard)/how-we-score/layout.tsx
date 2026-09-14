import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How We Score Developers — Forensic Algorithms & Methodology",
  description:
    "Explore how DevXray evaluates developer skills, repository depth, code consistency, and fraud risks with our transparent multi-dimensional scoring engine.",
  alternates: {
    canonical: "/how-we-score",
  },
  openGraph: {
    title: "How We Score Developers — DevXray Methodology",
    description:
      "Deep dive into DevXray's developer scoring algorithms: Code Quality, Skills Verification, Consistency, Growth, and Fraud Risk analysis.",
    url: "/how-we-score",
  },
};

export default function HowWeScoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
