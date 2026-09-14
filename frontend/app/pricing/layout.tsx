import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing Plans — Developer GitHub & Resume Screening",
  description:
    "Affordable pricing plans for technical recruiters and engineering leaders. Scan GitHub profiles, detect AI code, and verify candidate skills.",
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "Pricing Plans — DevXray GitHub & Resume Screening Tool",
    description:
      "Start free with 2 GitHub and Resume scans. Upgrade for high-volume candidate screening, ATS-ready PDF exports, and AI interview kits.",
    url: "/pricing",
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
