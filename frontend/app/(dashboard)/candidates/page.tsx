"use client";
export const dynamic = 'force-dynamic';

import { motion } from "framer-motion";
import Link from "next/link";
import { useState, useMemo, useEffect, useCallback } from "react";
import { listCandidates, deleteCandidate, getScoreHistory } from "@/lib/candidates-store";
import type { ScoreHistoryPoint } from "@/lib/candidates-store";
import type { CandidateRecord } from "@/lib/db";

// ─── Types ───────────────────────────────────────────────────────────────────

type Tier = "S-Tier" | "A-Tier" | "B-Tier" | "C-Tier" | "D-Tier";
type Risk = "Low" | "Medium" | "High";

const TIER_COLORS: Record<string, string> = {
  "S-Tier": "#34d399",
  "A-Tier": "#cdff00",
  "B-Tier": "#fbbf24",
  "C-Tier": "#fb923c",
  "D-Tier": "#fb7185",
};

const RISK_COLORS: Record<string, string> = {
  Low: "#34d399",
  Medium: "#fbbf24",
  High: "#fb7185",
};

const REC_COLORS: Record<string, string> = {
  "Strong Hire": "#34d399",
  "Likely Hire": "#cdff00",
  Conditional: "#fbbf24",
  "Not Recommended": "#fb7185",
};

// ─── Helper: derive tier from score ─────────────────────────────────────────
function scoreToTier(score: number): Tier {
  if (score >= 90) return "S-Tier";
  if (score >= 75) return "A-Tier";
  if (score >= 60) return "B-Tier";
  if (score >= 45) return "C-Tier";
  return "D-Tier";
}

function scoreToRisk(score: number): Risk {
  if (score >= 70) return "Low";
  if (score >= 50) return "Medium";
  return "High";
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return iso;
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ScoreBadge({ score, tier }: { score: number; tier: string }) {
  const color = TIER_COLORS[tier] ?? "#cdff00";
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-8 h-8">
        <svg viewBox="0 0 32 32" className="w-8 h-8 -rotate-90">
          <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
          <circle cx="16" cy="16" r="13" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${(score / 100) * 81.7} 81.7`} strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold" style={{ color }}>
          {Math.round(score)}
        </span>
      </div>
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
        style={{ background: `${color}18`, color }}>
        {tier}
      </span>
    </div>
  );
}

function Avatar({ name, avatar }: { name: string; avatar?: string }) {
  if (avatar) return <img src={avatar} alt={name} className="w-8 h-8 rounded-full object-cover" />;
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px] text-[#050505]"
      style={{ background: "#cdff00" }}>
      {(name || "?").charAt(0).toUpperCase()}
    </div>
  );
}

/* Score Trend sparkline — PDF Guide: "Score trend over time" */
function TrendSparkline({ username }: { username: string }) {
  const history = getScoreHistory(username);
  if (history.length < 2) {
    return <span className="text-[9px] text-[#333]">—</span>;
  }

  const W = 48, H = 20;
  const scores = history.map(h => h.score);
  const min = Math.min(...scores) - 5;
  const max = Math.max(...scores) + 5;
  const range = max - min || 1;

  const points = scores.map((s, i) => {
    const x = (i / (scores.length - 1)) * W;
    const y = H - ((s - min) / range) * H;
    return `${x},${y}`;
  }).join(" ");

  const trending = scores[scores.length - 1] >= scores[0];

  return (
    <div className="flex items-center gap-1" title={`${history.length} scans • ${trending ? "↑ Improving" : "↓ Declining"}`}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0">
        <polyline
          points={points}
          fill="none"
          stroke={trending ? "#34d399" : "#fb7185"}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <span className={`text-[9px] font-bold ${trending ? "text-emerald-400" : "text-rose-400"}`}>
        {trending ? "↑" : "↓"}
      </span>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

const PER_PAGE = 8;

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"score" | "name" | "date">("score");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listCandidates();
      setCandidates(data);
    } catch (err) {
      console.error("Failed to load candidates:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (username: string) => {
    if (!confirm(`Remove ${username} from candidates?`)) return;
    await deleteCandidate(username);
    await load();
  };

  const filtered = useMemo(() => {
    let arr = [...candidates];
    if (search) arr = arr.filter(c =>
      (c.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      c.username.toLowerCase().includes(search.toLowerCase())
    );
    if (tierFilter !== "all") {
      arr = arr.filter(c => {
        const tier = scoreToTier(Number(c.final_score ?? c.score ?? 0));
        return tier === tierFilter;
      });
    }
    if (sortBy === "score") arr.sort((a, b) => Number(b.final_score ?? b.score ?? 0) - Number(a.final_score ?? a.score ?? 0));
    else if (sortBy === "name") arr.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    else arr.sort((a, b) => new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime());
    return arr;
  }, [candidates, search, tierFilter, sortBy]);

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
  const fadeIn = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

  // Stats derived from real data
  const strongHires = candidates.filter(c => String(c.hiring_recommendation ?? "").toLowerCase().includes("strong")).length;
  const avgScore = candidates.length > 0
    ? Math.round(candidates.reduce((s, c) => s + Number(c.final_score ?? c.score ?? 0), 0) / candidates.length)
    : 0;
  const highRisk = candidates.filter(c => (c.risk_level as string) === "High" || Number(c.final_score ?? c.score ?? 0) < 50).length;

  // Get selected usernames for compare link
  const selectedUsernames = candidates
    .filter(c => selected.has(c.id))
    .map(c => c.username)
    .slice(0, 2);

  return (
    <div className="min-h-screen p-4 pt-14 sm:p-6 md:p-8 lg:pt-8" style={{ fontFamily: "var(--font-dm-sans)" }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-1" style={{ fontFamily: "var(--font-syne)" }}>
            Candidates <span style={{ color: "#cdff00" }}>({candidates.length})</span>
          </h1>
          <p className="text-[#555] text-xs sm:text-sm">
            {loading ? "Loading candidates…" : candidates.length === 0
              ? "No candidates yet — run a GitHub scan to populate this dashboard"
              : "All analyzed candidates — search, filter, and compare"}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {selected.size > 0 && selected.size < 2 && (
            <button disabled className="px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-bold text-[#555] rounded-xl cursor-not-allowed"
              style={{ background: "rgba(205,255,0,0.1)", border: "1px solid rgba(205,255,0,0.2)" }} title="Select 2 candidates to compare">
              Select 1 more
            </button>
          )}
          {selected.size >= 2 && selectedUsernames.length >= 2 && (
            <Link href={`/compare?a=${selectedUsernames[0]}&b=${selectedUsernames[1]}`}
              className="px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-bold text-[#050505] rounded-xl no-underline hover:opacity-90 transition-all shadow-[0_0_15px_rgba(205,255,0,0.2)]"
              style={{ background: "#cdff00" }}>
              Compare {selected.size}
            </Link>
          )}
          <Link href="/bulk-upload"
            className="px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-bold text-white rounded-xl no-underline border border-white/10 hover:border-white/20 transition-all">
            + Bulk Upload
          </Link>
          <button onClick={load}
            className="px-3 py-2 text-[10px] sm:text-xs font-bold text-[#555] hover:text-white rounded-xl border border-white/[0.06] hover:border-white/10 transition-all">
            ↻ Refresh
          </button>
        </div>
      </motion.div>

      {/* Summary stats */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Analyzed", value: candidates.length, color: "#cdff00" },
          { label: "Strong Hires", value: strongHires, color: "#34d399" },
          { label: "Avg Score", value: avgScore || "—", color: "#a78bfa" },
          { label: "High Risk", value: highRisk, color: "#fb7185" },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl p-4 border" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
            <p className="text-[10px] text-[#444] uppercase tracking-wider mb-1">{stat.label}</p>
            <p className="text-2xl font-bold" style={{ color: stat.color, fontFamily: "var(--font-syne)" }}>{stat.value}</p>
          </div>
        ))}
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 mb-6">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-[320px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#444]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input type="text" placeholder="Search candidates..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-white placeholder-[#333] border outline-none transition-all focus:border-[#cdff00]/40"
            style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}
          />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl overflow-x-auto no-scrollbar" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {(["all", "S-Tier", "A-Tier", "B-Tier", "C-Tier"] as const).map(t => (
            <button key={t} onClick={() => { setTierFilter(t); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap shrink-0 ${tierFilter === t ? "bg-[#cdff00] text-[#050505]" : "text-[#555] hover:text-white"}`}>
              {t === "all" ? "All" : t}
            </button>
          ))}
        </div>

        <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="px-3 py-2.5 rounded-xl text-sm text-[#888] border outline-none w-full sm:w-auto"
          style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}>
          <option value="score">Sort: Score</option>
          <option value="name">Sort: Name</option>
          <option value="date">Sort: Date</option>
        </select>
      </motion.div>

      {/* Loading state */}
      {loading && (
        <div className="text-center py-16 text-[#444]">
          <svg className="animate-spin w-6 h-6 text-[#cdff00] mx-auto mb-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm">Loading candidates…</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && candidates.length === 0 && (
        <div className="text-center py-20 rounded-2xl border border-dashed border-white/[0.06]">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.03] flex items-center justify-center mx-auto mb-4 border border-white/[0.06]">
            <svg className="w-6 h-6 text-[#444]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-white font-semibold mb-2">No candidates yet</h3>
          <p className="text-[#444] text-sm mb-6 max-w-sm mx-auto">
            Run a GitHub scan from the dashboard — candidates are automatically saved here after each analysis.
          </p>
          <Link href="/dashboard"
            className="px-6 py-2.5 text-sm font-bold text-[#050505] rounded-xl no-underline inline-block"
            style={{ background: "#cdff00" }}>
            Go to Dashboard
          </Link>
        </div>
      )}

      {/* Table — Desktop */}
      {!loading && paginated.length > 0 && (
        <>
          {/* Desktop table view */}
          <motion.div variants={stagger} initial="hidden" animate="show"
            className="hidden md:block rounded-2xl border overflow-hidden"
            style={{ background: "rgba(255,255,255,0.01)", borderColor: "rgba(255,255,255,0.06)" }}>
            {/* Header */}
            <div className="grid gap-4 px-5 py-3 border-b text-[10px] font-bold uppercase tracking-wider text-[#444]"
              style={{ gridTemplateColumns: "24px 2fr 1fr 60px 1fr 1.5fr 80px 32px", borderColor: "rgba(255,255,255,0.04)", background: "rgba(255,255,255,0.01)" }}>
              <div />
              <div>Candidate</div>
              <div>Score</div>
              <div>Trend</div>
              <div>Risk</div>
              <div>Recommendation</div>
              <div>Scanned</div>
              <div />
            </div>

            {paginated.map((c) => {
              const tier = (c.developer_tier as string) || scoreToTier(Number(c.final_score ?? c.score ?? 0));
              const risk = (c.risk_level as string) || scoreToRisk(Number(c.final_score ?? c.score ?? 0));
              const _fs = Number(c.final_score ?? c.score ?? 0);
              const rec = (c.hiring_recommendation as string) || (_fs >= 80 ? "Strong Hire" : _fs >= 65 ? "Likely Hire" : _fs >= 50 ? "Conditional" : "Not Recommended");
              const langs = (c.top_languages as string[]) ?? [];

              return (
                <motion.div key={c.id} variants={fadeIn}
                  className="grid gap-4 px-5 py-4 border-b items-center hover:bg-white/[0.01] transition-colors group"
                  style={{ gridTemplateColumns: "24px 2fr 1fr 60px 1fr 1.5fr 80px 32px", borderColor: "rgba(255,255,255,0.03)" }}>
                  <div className={`w-4 h-4 rounded border cursor-pointer flex items-center justify-center transition-all ${selected.has(c.id) ? "border-[#cdff00] bg-[#cdff00]" : "border-white/15 hover:border-white/30"}`}
                    onClick={() => toggleSelect(c.id)}>
                    {selected.has(c.id) && (
                      <svg width="8" height="7" viewBox="0 0 8 7" fill="none">
                        <path d="M1 3.5L3 5.5L7 1.5" stroke="#050505" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={c.name || c.username} avatar={c.avatar_url} />
                    <div className="min-w-0">
                      <Link href={`/report/${c.username}`} className="text-[13px] font-semibold text-white hover:text-[#cdff00] transition-colors no-underline block truncate">
                        {c.name || c.username}
                      </Link>
                      <p className="text-[11px] text-[#444]">@{c.username}
                        {langs.length > 0 && <span className="ml-2 text-[#333]">{langs.slice(0, 2).join(", ")}</span>}
                      </p>
                    </div>
                  </div>
                  <ScoreBadge score={Number(c.final_score ?? c.score ?? 0)} tier={tier} />
                  <TrendSparkline username={c.username} />
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block"
                    style={{ background: `${RISK_COLORS[risk] ?? "#fbbf24"}18`, color: RISK_COLORS[risk] ?? "#fbbf24" }}>
                    {risk}
                  </span>
                  <span className="text-[11px] font-semibold" style={{ color: REC_COLORS[rec] || "#ccc" }}>
                    {rec}
                  </span>
                  <span className="text-[11px] text-[#444]">{formatDate(c.scanned_at)}</span>
                  <button onClick={() => handleDelete(c.username)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-[#333] hover:text-[#fb7185]" title="Remove">
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Mobile card view */}
          <motion.div variants={stagger} initial="hidden" animate="show"
            className="md:hidden space-y-3">
            {paginated.map((c) => {
              const tier = (c.developer_tier as string) || scoreToTier(Number(c.final_score ?? c.score ?? 0));
              const risk = (c.risk_level as string) || scoreToRisk(Number(c.final_score ?? c.score ?? 0));
              const _fs = Number(c.final_score ?? c.score ?? 0);
              const rec = (c.hiring_recommendation as string) || (_fs >= 80 ? "Strong Hire" : _fs >= 65 ? "Likely Hire" : _fs >= 50 ? "Conditional" : "Not Recommended");
              const langs = (c.top_languages as string[]) ?? [];

              return (
                <motion.div key={c.id} variants={fadeIn}
                  className="rounded-xl border p-4 group"
                  style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-5 h-5 rounded border cursor-pointer flex items-center justify-center transition-all shrink-0 ${selected.has(c.id) ? "border-[#cdff00] bg-[#cdff00]" : "border-white/15"}`}
                      onClick={() => toggleSelect(c.id)}>
                      {selected.has(c.id) && (
                        <svg width="8" height="7" viewBox="0 0 8 7" fill="none">
                          <path d="M1 3.5L3 5.5L7 1.5" stroke="#050505" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <Avatar name={c.name || c.username} avatar={c.avatar_url} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/report/${c.username}`} className="text-sm font-semibold text-white hover:text-[#cdff00] transition-colors no-underline block truncate">
                        {c.name || c.username}
                      </Link>
                      <p className="text-[11px] text-[#444] truncate">@{c.username}{langs.length > 0 && ` · ${langs.slice(0, 2).join(", ")}`}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <ScoreBadge score={Number(c.final_score ?? c.score ?? 0)} tier={tier} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: `${RISK_COLORS[risk] ?? "#fbbf24"}18`, color: RISK_COLORS[risk] ?? "#fbbf24" }}>
                      {risk} Risk
                    </span>
                    <span className="text-[10px] font-semibold" style={{ color: REC_COLORS[rec] || "#ccc" }}>
                      {rec}
                    </span>
                    <span className="ml-auto text-[10px] text-[#444]">{formatDate(c.scanned_at)}</span>
                    <button onClick={() => handleDelete(c.username)}
                      className="text-[#444] hover:text-[#fb7185] p-1" title="Remove">
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-5">
          <span className="text-[11px] sm:text-[12px] text-[#444]">
            Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/[0.06] text-[#555] hover:text-white hover:border-white/15 transition-all disabled:opacity-30">
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" strokeLinecap="round" /></svg>
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => setPage(n)}
                className={`w-8 h-8 rounded-lg text-[12px] font-semibold transition-all ${page === n ? "text-[#050505] bg-[#cdff00]" : "text-[#555] hover:text-white border border-white/[0.06]"}`}>
                {n}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/[0.06] text-[#555] hover:text-white hover:border-white/15 transition-all disabled:opacity-30">
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
