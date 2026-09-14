import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const cleanUsername = decodeURIComponent(username || "");

  return {
    title: `@${cleanUsername} GitHub Intelligence Report`,
    description: `Forensic developer intelligence analysis of @${cleanUsername}. In-depth review of public repositories, commit patterns, AI-assisted code detection, and overall engineering competence.`,
    alternates: {
      canonical: `/report/${cleanUsername}`,
    },
    openGraph: {
      title: `@${cleanUsername} GitHub Developer Report | DevXray AI`,
      description: `Detailed developer audit for @${cleanUsername}: code quality score, fraud risk detection, and hiring verdict.`,
      url: `/report/${cleanUsername}`,
    },
  };
}

export default function ReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
