"use client";

import DashboardSidebar from "@/components/layout/DashboardSidebar";

export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#050505] text-[#fafafa]">
      <div className="grain-overlay" />
      <DashboardSidebar
        plan="pro"
        userName="Sahil Kumar"
        userEmail="sahil@devxray.ai"
        scansUsed={47}
        scansLimit={100}
      />
      <main className="flex-1 min-w-0 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
