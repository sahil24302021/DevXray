import { motion } from "framer-motion";

export interface VerificationSource {
  name: string;
  status: string;
  detail?: string;
  url?: string;
  handle?: string;
}

export default function VerificationSources({ data }: { data: VerificationSource[] }) {
  if (!data || data.length === 0) return null;

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case "verified":
      case "live":
      case "fetched":
      case "found":
        return { icon: "✅", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", label: "Found" };
      case "blocked":
      case "pending":
        return { icon: "⏳", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", label: "Pending" };
      case "not_found":
      default:
        return { icon: "⚪", color: "text-slate-400", bg: "bg-slate-500/10", border: "border-slate-500/20", label: "Not Found" };
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl border border-white/[0.06] p-6 mb-5"
      style={{
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-cyan-400" /> Multi-Source Verification
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {data.map((source, i) => {
          const s = getStatusDisplay(source.status);
          return (
            <div key={i} className={`p-4 rounded-xl border ${s.border} ${s.bg}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-white text-sm">{source.name}</span>
                <span title={s.label}>{s.icon}</span>
              </div>
              
              {source.handle && (
                <p className="text-xs text-slate-400 truncate mb-1">{source.handle}</p>
              )}
              {source.url && (
                <a href={source.url} target="_blank" className="text-xs text-cyan-400 hover:underline truncate block mb-1">
                  View Source ↗
                </a>
              )}
              {source.detail && (
                <p className={`text-[10px] font-medium ${s.color} truncate mt-2 uppercase tracking-wider`}>
                  {source.detail}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}
