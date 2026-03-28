import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-syne)", "sans-serif"],
        body: ["var(--font-dm-sans)", "sans-serif"],
        mono: ["var(--font-space)", "monospace"],
      },
      colors: {
        void: "#030712",
        surface: {
          DEFAULT: "#060b18",
          2: "rgba(255,255,255,0.03)",
          3: "rgba(255,255,255,0.05)",
          4: "rgba(255,255,255,0.08)",
        },
        accent: {
          cyan: "#22d3ee",
          violet: "#a78bfa",
          emerald: "#34d399",
          rose: "#fb7185",
          amber: "#fbbf24",
          blue: "#60a5fa",
        },
        neon: {
          cyan: "rgba(34, 211, 238, 0.15)",
          violet: "rgba(167, 139, 250, 0.15)",
          emerald: "rgba(52, 211, 153, 0.15)",
        },
        border: {
          DEFAULT: "rgba(255,255,255,0.06)",
          2: "rgba(255,255,255,0.10)",
          glow: "rgba(34, 211, 238, 0.2)",
        },
        text: {
          DEFAULT: "#f1f5f9",
          secondary: "#94a3b8",
          muted: "#475569",
        },
      },
      animation: {
        "fade-up": "fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) both",
        "fade-up-1": "fadeUp 0.6s 0.1s cubic-bezier(0.16,1,0.3,1) both",
        "fade-up-2": "fadeUp 0.6s 0.2s cubic-bezier(0.16,1,0.3,1) both",
        "fade-up-3": "fadeUp 0.6s 0.3s cubic-bezier(0.16,1,0.3,1) both",
        "fade-up-4": "fadeUp 0.6s 0.4s cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 2s ease infinite",
        scroll: "scroll 25s linear infinite",
        pulse2: "pulse2 2s ease infinite",
        "grow-bar": "growBar 2.6s ease forwards",
        float: "float 6s ease-in-out infinite",
        "float-delayed": "float 6s 2s ease-in-out infinite",
        "glow-pulse": "glowPulse 3s ease-in-out infinite",
        "spin-slow": "spin 8s linear infinite",
        "border-flow": "borderFlow 4s linear infinite",
      },
      keyframes: {
        fadeUp: {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        scroll: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        pulse2: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.5", transform: "scale(1.05)" },
        },
        growBar: {
          "0%": { width: "0%" },
          "60%": { width: "75%" },
          "90%": { width: "92%" },
          "100%": { width: "100%" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        glowPulse: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        borderFlow: {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
      },
      boxShadow: {
        glass: "0 4px 30px rgba(0, 0, 0, 0.3)",
        "glass-hover": "0 8px 40px rgba(0, 0, 0, 0.4), 0 0 20px rgba(34, 211, 238, 0.05)",
        "neon-cyan": "0 0 20px rgba(34, 211, 238, 0.15), 0 0 60px rgba(34, 211, 238, 0.05)",
        "neon-violet": "0 0 20px rgba(167, 139, 250, 0.15), 0 0 60px rgba(167, 139, 250, 0.05)",
        "neon-emerald": "0 0 20px rgba(52, 211, 153, 0.15), 0 0 60px rgba(52, 211, 153, 0.05)",
        soft: "0 2px 10px rgba(0, 0, 0, 0.2)",
      },
    },
  },
  plugins: [],
};

export default config;
