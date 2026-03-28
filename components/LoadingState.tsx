import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function LoadingState({ username, jobId }: { username?: string, jobId?: string }) {
  const [step, setStep] = useState(0);
  const [currentText, setCurrentText] = useState("Establishing secure connection...");

  useEffect(() => {
    if (!jobId) {
      // Fallback timer
      const timer = setInterval(() => setStep((s) => s + 1), 1500);
      return () => clearInterval(timer);
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const sse = new EventSource(`${apiUrl}/api/progress/${jobId}`);
    
    sse.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.heartbeat) return;
        if (data.step) {
          setCurrentText(data.step);
          setStep((prev) => prev + 1);
        }
        if (data.done) {
          sse.close();
        }
      } catch (err) {
        // ignore
      }
    };
    
    // Fallback progression to keep UI alive if events are sparse
    const timer = setInterval(() => setStep((s) => s + 0.5), 2000);

    return () => {
      sse.close();
      clearInterval(timer);
    };
  }, [jobId]);

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6 relative overflow-hidden z-[100] fixed inset-0">
      <div className="grain-overlay" />
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#cdff00]/[0.04] blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] bg-[#cdff00]/[0.02] blur-[100px] rounded-full mix-blend-screen" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-3xl border border-white/[0.06] p-10 text-center relative overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.03)",
          backdropFilter: "blur(24px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        {/* Inner glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-[#cdff00]/10 blur-[60px] rounded-full pointer-events-none" />

        <div className="relative w-24 h-24 mx-auto mb-8">
          <svg className="w-full h-full animate-[spin_4s_linear_infinite]" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
            <circle
              cx="50" cy="50" r="46"
              fill="none"
              stroke="#cdff00"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="100 200"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="#cdff00" />
            </svg>
          </div>
        </div>

        <h2 className="font-[family-name:var(--font-syne)] font-bold text-xl text-white mb-2">
          Analyzing {username ? `@${username}` : "Candidate Profile"}
        </h2>

        <div className="h-6 relative overflow-hidden flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={currentText}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="text-sm font-medium text-[#cdff00] absolute inset-0 flex items-center justify-center whitespace-nowrap"
            >
              {currentText}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="mt-8 w-full bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
          <motion.div
            className="h-full bg-[#cdff00] rounded-full"
            initial={{ width: "0%" }}
            animate={{ width: `${Math.min(((step + 1) / 10) * 100, 95)}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </motion.div>
    </div>
  );
}
