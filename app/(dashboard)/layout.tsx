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
      {/* ✅ No hardcoded props — sidebar reads real user from Clerk */}
      <DashboardSidebar />
      <main className="flex-1 min-w-0 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
