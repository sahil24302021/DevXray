"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import Link from "next/link";

type SettingsTab = "profile" | "api" | "team" | "plan" | "integrations" | "notifications";

const NAV_TABS: { id: SettingsTab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "api", label: "API Keys" },
  { id: "team", label: "Team" },
  { id: "plan", label: "Plan & Billing" },
  { id: "integrations", label: "Integrations" },
  { id: "notifications", label: "Notifications" },
];

const mockApiKey = "dxr_live_sk_a7f2b3c84e1d6f9a240b5c7e8d3f1a2b";
const mockWebhookKey = "dxr_wh_9c4e1b7f3a2d8e5f1c6b4d7a9e2f3b1d";

const teamMembers = [
  { name: "Sahil Kumar", email: "sahil@company.com", role: "Admin", avatar: "S", active: true },
  { name: "Priya Sharma", email: "priya@company.com", role: "Member", avatar: "P", active: true },
  { name: "Rahul Dev", email: "rahul@company.com", role: "Viewer", avatar: "R", active: false },
];

const integrations = [
  { name: "Slack", desc: "Send hiring alerts to Slack channels", connected: true, logo: "SL" },
  { name: "Greenhouse", desc: "Sync candidate scores to your ATS", connected: false, logo: "GH" },
  { name: "Lever", desc: "Push DevXray reports directly to Lever", connected: false, logo: "LV" },
  { name: "Notion", desc: "Export reports to Notion databases", connected: true, logo: "NO" },
  { name: "Zapier", desc: "Automate workflows with 5000+ apps", connected: false, logo: "ZP" },
  { name: "Webhooks", desc: "Real-time events via HTTP webhook", connected: false, logo: "WH" },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("profile");
  const [apiVisible, setApiVisible] = useState(false);
  const [copied, setCopied] = useState("");
  const [saved, setSaved] = useState(false);

  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    import("@/lib/auth").then((mod) => {
      mod.getCurrentUser().then(setUser);
    });
  }, []);

  const copyKey = (key: string, label: string) => {
    navigator.clipboard.writeText(key).catch(() => {});
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

  return (
    <div className="min-h-screen p-6 md:p-8" style={{ fontFamily: "var(--font-dm-sans)" }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1" style={{ fontFamily: "var(--font-syne)" }}>
          Account <span style={{ color: "#cdff00" }}>Settings</span>
        </h1>
        <p className="text-[#555] text-sm">Manage your profile, API keys, team, and integrations</p>
      </motion.div>

      <div className="flex gap-8">
        {/* Sidebar nav */}
        <motion.aside initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
          className="w-44 shrink-0">
          <nav className="space-y-0.5">
            {NAV_TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`w-full text-left px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                  tab === t.id ? "bg-[#cdff00]/10 text-[#cdff00]" : "text-[#555] hover:text-white hover:bg-white/[0.02]"
                }`}>
                {t.label}
              </button>
            ))}
          </nav>
        </motion.aside>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <motion.div key={tab} variants={stagger} initial="hidden" animate="show" className="space-y-5">

            {/* ── PROFILE ── */}
            {tab === "profile" && (
              <>
                <motion.div variants={fadeUp} className="rounded-2xl p-6 border" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}>
                  <h2 className="text-sm font-bold text-white mb-5">Personal Information</h2>
                  <div className="flex items-start gap-5 mb-6">
                    {user?.avatar_url ? (
                      <img src={user.avatar_url} alt="Avatar" className="w-16 h-16 rounded-2xl border border-white/10 shrink-0" />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-[#050505] shrink-0"
                        style={{ background: "#cdff00" }}>{user?.fullName ? user.fullName.charAt(0).toUpperCase() : "S"}</div>
                    )}
                    <div>
                      <button className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-white/10 text-[#888] hover:text-white hover:border-white/20 transition-all">
                        Change Photo
                      </button>
                      <p className="text-[11px] text-[#444] mt-1">JPG, PNG or GIF. Max 2MB.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: "Full Name", value: user?.fullName || "DevXray User" },
                      { label: "Email", value: user?.email || "user@devxray.ai" },
                      { label: "Company", value: "DevXray Org" },
                      { label: "Role", value: "Software Engineer" },
                    ].map(f => (
                      <div key={f.label}>
                        <label className="block text-[10px] font-bold text-[#555] uppercase tracking-wider mb-2">{f.label}</label>
                        <input type="text" defaultValue={f.value}
                          className="w-full rounded-xl px-4 py-2.5 text-sm text-white border outline-none transition-all focus:border-[#cdff00]/40"
                          style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}
                        />
                      </div>
                    ))}
                  </div>
                  <button onClick={handleSave}
                    className="mt-5 px-5 py-2.5 rounded-xl text-sm font-bold text-[#050505] transition-all hover:opacity-90"
                    style={{ background: saved ? "#34d399" : "#cdff00" }}>
                    {saved ? "Saved!" : "Save Changes"}
                  </button>
                </motion.div>

                <motion.div variants={fadeUp} className="rounded-2xl p-6 border" style={{ background: "rgba(255,65,65,0.03)", borderColor: "rgba(255,65,65,0.12)" }}>
                  <h2 className="text-sm font-bold text-[#fb7185] mb-2">Danger Zone</h2>
                  <p className="text-[12px] text-[#555] mb-4">Permanently delete your account and all data. This cannot be undone.</p>
                  <button className="px-4 py-2 rounded-xl text-xs font-bold text-[#fb7185] border border-[#fb7185]/30 hover:bg-[#fb7185]/10 transition-all">
                    Delete Account
                  </button>
                </motion.div>
              </>
            )}

            {/* ── API KEYS ── */}
            {tab === "api" && (
              <>
                <motion.div variants={fadeUp} className="rounded-2xl p-6 border" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}>
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h2 className="text-sm font-bold text-white">Live API Key</h2>
                      <p className="text-[11px] text-[#555] mt-0.5">Use this key to authenticate API requests</p>
                    </div>
                    <button onClick={() => setApiVisible(!apiVisible)} className="text-[11px] text-[#cdff00] hover:underline font-semibold">
                      {apiVisible ? "Hide" : "Reveal"} Key
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <code className="flex-1 px-4 py-3 rounded-xl text-[12px] font-mono text-[#cdff00] border"
                      style={{ background: "rgba(205,255,0,0.04)", borderColor: "rgba(205,255,0,0.12)" }}>
                      {apiVisible ? mockApiKey : "dxr_live_sk_" + "•".repeat(28)}
                    </code>
                    <button onClick={() => copyKey(mockApiKey, "api")}
                      className="px-4 py-3 rounded-xl text-[11px] font-bold border transition-all hover:border-white/20"
                      style={{ borderColor: "rgba(255,255,255,0.1)", color: copied === "api" ? "#34d399" : "#888" }}>
                      {copied === "api" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </motion.div>

                <motion.div variants={fadeUp} className="rounded-2xl p-6 border" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}>
                  <h2 className="text-sm font-bold text-white mb-2">Webhook Secret</h2>
                  <p className="text-[11px] text-[#555] mb-4">Used to verify webhook payload signatures</p>
                  <div className="flex items-center gap-3">
                    <code className="flex-1 px-4 py-3 rounded-xl text-[12px] font-mono text-[#888] border"
                      style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
                      {apiVisible ? mockWebhookKey : "dxr_wh_" + "•".repeat(33)}
                    </code>
                    <button onClick={() => copyKey(mockWebhookKey, "wh")}
                      className="px-4 py-3 rounded-xl text-[11px] font-bold border transition-all hover:border-white/20"
                      style={{ borderColor: "rgba(255,255,255,0.1)", color: copied === "wh" ? "#34d399" : "#888" }}>
                      {copied === "wh" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </motion.div>

                <motion.div variants={fadeUp} className="rounded-2xl p-5 border"
                  style={{ background: "rgba(167,139,250,0.04)", borderColor: "rgba(167,139,250,0.12)" }}>
                  <p className="text-[12px] text-[#888]">
                    API rate limit: <strong className="text-white">1,000 req/min</strong> (Pro plan) ·{" "}
                    <Link href="/pricing" className="text-[#a78bfa] hover:underline">Upgrade for more</Link>
                  </p>
                </motion.div>
              </>
            )}

            {/* ── TEAM ── */}
            {tab === "team" && (
              <motion.div variants={fadeUp} className="rounded-2xl border overflow-hidden" style={{ background: "rgba(255,255,255,0.01)", borderColor: "rgba(255,255,255,0.07)" }}>
                <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                  <h2 className="text-sm font-bold text-white">Team Members (3/10)</h2>
                  <button className="px-4 py-2 text-xs font-bold text-[#050505] rounded-xl" style={{ background: "#cdff00" }}>
                    + Invite Member
                  </button>
                </div>
                <div>
                  {teamMembers.map(m => (
                    <div key={m.email} className="flex items-center gap-4 px-6 py-4 border-b hover:bg-white/[0.01] transition-colors"
                      style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                      <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[#050505]"
                        style={{ background: m.active ? "#cdff00" : "#333" }}>
                        {m.avatar}
                      </div>
                      <div className="flex-1">
                        <p className="text-[13px] font-semibold text-white">{m.name}</p>
                        <p className="text-[11px] text-[#555]">{m.email}</p>
                      </div>
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                        style={{ background: m.role === "Admin" ? "rgba(205,255,0,0.1)" : "rgba(255,255,255,0.04)", color: m.role === "Admin" ? "#cdff00" : "#666" }}>
                        {m.role}
                      </span>
                      <div className={`w-2 h-2 rounded-full ${m.active ? "bg-[#34d399]" : "bg-[#444]"}`} />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── PLAN ── */}
            {tab === "plan" && (
              <>
                <motion.div variants={fadeUp} className="rounded-2xl p-6 border" style={{ background: "rgba(205,255,0,0.03)", borderColor: "rgba(205,255,0,0.15)" }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-[#050505] mr-2" style={{ background: "#cdff00" }}>PRO</span>
                      <h2 className="text-lg font-bold text-white mt-3 mb-1" style={{ fontFamily: "var(--font-syne)" }}>Pro Plan · $49/month</h2>
                      <p className="text-[12px] text-[#666]">Billed monthly · Renews April 26, 2026</p>
                    </div>
                    <Link href="/pricing" className="px-4 py-2 text-xs font-bold text-[#a78bfa] rounded-xl border no-underline hover:bg-[#a78bfa]/10 transition-all"
                      style={{ borderColor: "rgba(167,139,250,0.3)" }}>
                      Upgrade to Enterprise
                    </Link>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-5">
                    {[
                      { label: "Scans Used", value: "47 / 100", pct: 47 },
                      { label: "Bulk Uploads", value: "3 / 10", pct: 30 },
                      { label: "Team Seats", value: "3 / 10", pct: 30 },
                    ].map(stat => (
                      <div key={stat.label} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)" }}>
                        <p className="text-[10px] text-[#555] mb-1">{stat.label}</p>
                        <p className="text-sm font-bold text-white mb-2">{stat.value}</p>
                        <div className="h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                          <div className="h-full rounded-full" style={{ width: `${stat.pct}%`, background: "#cdff00" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
                <motion.div variants={fadeUp} className="rounded-2xl p-6 border" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}>
                  <h2 className="text-sm font-bold text-white mb-4">Payment Method</h2>
                  <div className="flex items-center gap-4 p-4 rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                    <div className="w-10 h-7 rounded bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center text-[8px] font-bold text-white">VISA</div>
                    <span className="text-sm text-white">•••• •••• •••• 4242</span>
                    <span className="text-[11px] text-[#555] ml-auto">Expires 12/27</span>
                    <button className="text-[11px] text-[#cdff00] hover:underline">Update</button>
                  </div>
                </motion.div>
              </>
            )}

            {/* ── INTEGRATIONS ── */}
            {tab === "integrations" && (
              <motion.div variants={fadeUp} className="grid grid-cols-2 gap-4">
                {integrations.map(integ => (
                  <div key={integ.name} className="rounded-2xl p-5 border flex items-start gap-4 transition-all hover:border-white/12"
                    style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs shrink-0"
                      style={{ background: integ.connected ? "rgba(205,255,0,0.1)" : "rgba(255,255,255,0.05)", color: integ.connected ? "#cdff00" : "#555", border: `1px solid ${integ.connected ? "rgba(205,255,0,0.2)" : "rgba(255,255,255,0.08)"}` }}>
                      {integ.logo}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[13px] font-bold text-white">{integ.name}</h3>
                        {integ.connected && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-[#34d399]"
                            style={{ background: "rgba(52,211,153,0.12)" }}>Connected</span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#555] mt-0.5">{integ.desc}</p>
                    </div>
                    <button className={`text-[11px] font-bold px-3 py-1.5 rounded-lg shrink-0 transition-all ${
                      integ.connected ? "text-[#fb7185] hover:bg-[#fb7185]/10" : "text-[#cdff00] hover:bg-[#cdff00]/10"
                    }`}>
                      {integ.connected ? "Disconnect" : "Connect"}
                    </button>
                  </div>
                ))}
              </motion.div>
            )}

            {/* ── NOTIFICATIONS ── */}
            {tab === "notifications" && (
              <motion.div variants={fadeUp} className="rounded-2xl border overflow-hidden" style={{ background: "rgba(255,255,255,0.01)", borderColor: "rgba(255,255,255,0.07)" }}>
                {[
                  { label: "Scan Completed", desc: "Get notified when GitHub or resume analysis finishes", enabled: true },
                  { label: "Bulk Upload Done", desc: "Alert when all resumes in a batch are processed", enabled: true },
                  { label: "High-Risk Candidate", desc: "Immediate alert when a critical red flag is detected", enabled: true },
                  { label: "Strong Hire Found", desc: "Notify team when a candidate scores 85+", enabled: false },
                  { label: "Quota Warning", desc: "Alert when you have used 80% of your monthly scans", enabled: true },
                  { label: "Weekly Report", desc: "Summary email every Monday morning", enabled: false },
                ].map((item, i) => (
                  <div key={item.label} className="flex items-center justify-between px-6 py-4 border-b hover:bg-white/[0.01] transition-colors"
                    style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                    <div>
                      <p className="text-[13px] font-semibold text-white">{item.label}</p>
                      <p className="text-[11px] text-[#444] mt-0.5">{item.desc}</p>
                    </div>
                    {/* Toggle */}
                    <div className={`w-10 h-5.5 rounded-full relative cursor-pointer transition-all duration-300 ${item.enabled ? "bg-[#cdff00]" : "bg-white/10"}`}
                      style={{ height: "22px" }}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-300 ${item.enabled ? "right-0.5" : "left-0.5"}`} />
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
