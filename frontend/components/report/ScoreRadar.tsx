"use client";

import { motion } from "framer-motion";
import { ScoreDimension } from "@/lib/api";

interface Props {
  dimensions: ScoreDimension[];
}

export default function ScoreRadar({ dimensions }: Props) {
  if (!dimensions || dimensions.length === 0) return null;

  const size = 240;
  const center = size / 2;
  const radius = 90;
  const levels = 4;
  const count = dimensions.length;
  const angleStep = (2 * Math.PI) / count;

  // Generate polygon points for a given set of values (normalized 0-1)
  const getPoints = (values: number[]) => {
    return values
      .map((v, i) => {
        const angle = angleStep * i - Math.PI / 2;
        const r = radius * v;
        return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
      })
      .join(" ");
  };

  // Background grid levels
  const gridLevels = Array.from({ length: levels }, (_, i) => (i + 1) / levels);

  // Normalized values
  const values = dimensions.map((d) => d.value / d.max);
  const dataPoints = getPoints(values);

  // Axis lines
  const axes = dimensions.map((_, i) => {
    const angle = angleStep * i - Math.PI / 2;
    return {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
    };
  });

  // Label positions (slightly outside)
  const labels = dimensions.map((d, i) => {
    const angle = angleStep * i - Math.PI / 2;
    const labelRadius = radius + 28;
    return {
      x: center + labelRadius * Math.cos(angle),
      y: center + labelRadius * Math.sin(angle),
      label: d.label,
      value: d.value,
      max: d.max,
    };
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="rounded-2xl border border-white/[0.06] p-6 flex flex-col items-center"
      style={{
        background: "rgba(255,255,255,0.03)",
        backdropFilter: "blur(24px)",
        boxShadow:
          "0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div className="flex items-center gap-2 mb-4 w-full">
        <div className="w-7 h-7 rounded-lg bg-[#cdff00]/10 flex items-center justify-center text-[#cdff00] border border-[#cdff00]/20">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </div>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">
          Score Dimensions
        </span>
      </div>

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mb-4">
        {/* Background grid */}
        {gridLevels.map((level, i) => (
          <polygon
            key={i}
            points={getPoints(Array(count).fill(level))}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
        ))}

        {/* Axis lines */}
        {axes.map((a, i) => (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={a.x}
            y2={a.y}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
        ))}

        {/* Data polygon */}
        <motion.polygon
          points={getPoints(Array(count).fill(0))}
          animate={{ points: dataPoints }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
          fill="rgba(205,255,0,0.12)"
          stroke="#cdff00"
          strokeWidth="2"
          strokeLinejoin="round"
          style={{ filter: "drop-shadow(0 0 8px rgba(205,255,0,0.2))" }}
        />

        {/* Data points */}
        {values.map((v, i) => {
          const angle = angleStep * i - Math.PI / 2;
          const r = radius * v;
          return (
            <motion.circle
              key={i}
              cx={center + r * Math.cos(angle)}
              cy={center + r * Math.sin(angle)}
              r="3"
              fill="#cdff00"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 + i * 0.1 }}
              style={{ filter: "drop-shadow(0 0 4px rgba(205,255,0,0.5))" }}
            />
          );
        })}

        {/* Labels */}
        {labels.map((l, i) => (
          <text
            key={i}
            x={l.x}
            y={l.y}
            fill="rgba(148,163,184,0.8)"
            fontSize="9"
            fontWeight="600"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {l.label}
          </text>
        ))}
      </svg>

      {/* Score values */}
      <div className="grid grid-cols-3 gap-2 w-full">
        {dimensions.map((d) => (
          <div
            key={d.key}
            className="px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.04] text-center"
          >
            <div className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">{d.label}</div>
            <div className="text-sm font-bold tabular-nums" style={{ color: d.color }}>
              {d.value}<span className="text-slate-600 text-[10px] font-normal">/{d.max}</span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
