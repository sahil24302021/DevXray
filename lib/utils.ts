export function extractUsername(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/github\.com\/([^\/\?#\s]+)/);
  if (match) return match[1].toLowerCase();
  if (/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(trimmed)) return trimmed.toLowerCase();
  return trimmed.toLowerCase().replace(/[^a-z0-9-]/g, "") || "unknown";
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function getScoreColor(score: number): string {
  if (score >= 80) return "text-cyan-400";
  if (score >= 60) return "text-amber-400";
  return "text-red-400";
}

export function getScoreGradClass(score: number): string {
  if (score >= 80) return "grad-text-score-strong";
  if (score >= 60) return "grad-text-score-moderate";
  return "grad-text-score-risky";
}

export function getRiskColor(risk: string): string {
  switch (risk) {
    case "Low": return "text-emerald-400";
    case "Medium": return "text-amber-400";
    case "High": return "text-red-400";
    default: return "text-zinc-400";
  }
}

export function getRiskBgColor(risk: string): string {
  switch (risk) {
    case "Low": return "bg-emerald-500/10 border-emerald-500/15";
    case "Medium": return "bg-amber-500/10 border-amber-500/15";
    case "High": return "bg-red-500/10 border-red-500/15";
    default: return "bg-zinc-500/10 border-zinc-500/15";
  }
}
