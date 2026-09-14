import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Resume Analyzer & Code Verifier — Cross-Reference Claims",
  description:
    "Upload a developer resume to extract technical claims and automatically verify them against real GitHub repositories, commit history, and code authenticity.",
  alternates: {
    canonical: "/report/resume",
  },
  openGraph: {
    title: "Resume Analyzer & GitHub Verifier | DevXray AI",
    description:
      "Verify developer resume claims against real GitHub code. Detect exaggerated skills, inflated timelines, and unverified achievements.",
    url: "/report/resume",
  },
};

export default function ResumeReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
