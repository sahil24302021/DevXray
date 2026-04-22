"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Logo from "@/components/Logo";

// ── Telegram Integration ──
// Set these in your .env.local or Vercel env vars:
//   NEXT_PUBLIC_TELEGRAM_BOT_TOKEN=your_bot_token
//   NEXT_PUBLIC_TELEGRAM_CHAT_ID=your_chat_id
const TELEGRAM_BOT_TOKEN = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID || "";

async function sendToTelegram(data: {
  name: string;
  email: string;
  company: string;
  phone: string;
  message: string;
  plan: string;
}): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("[Contact] Telegram env vars not set — skipping");
    return true; // Don't block the form
  }

  const text = `
📩 *New DevXray Contact Form*
━━━━━━━━━━━━━━━━━━━━

*Name:* ${data.name}
*Email:* ${data.email}
*Company:* ${data.company || "Not provided"}
*Phone:* ${data.phone || "Not provided"}
*Plan Interest:* ${data.plan || "Not specified"}

*Message:*
${data.message}

━━━━━━━━━━━━━━━━━━━━
_Sent from DevXray Contact Page_
  `.trim();

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: "Markdown",
        }),
      }
    );
    return res.ok;
  } catch (err) {
    console.error("[Contact] Telegram send failed:", err);
    return false;
  }
}

export default function ContactPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    message: "",
    plan: "enterprise",
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    setError("");
    setSending(true);

    const ok = await sendToTelegram(form);

    if (ok) {
      setSent(true);
    } else {
      setError("Failed to send message. Please try again or email us directly.");
    }
    setSending(false);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#cdff00]/[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-purple-500/[0.03] blur-[100px] rounded-full" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 md:px-12 py-3 sm:py-4"
        style={{ background: "rgba(5,5,5,0.8)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 no-underline">
            <Logo className="w-7 h-7" />
            <span className="font-[family-name:var(--font-syne)] font-bold text-base text-white">
              Dev<span style={{ color: "#cdff00" }}>Xray</span>
            </span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-6">
            <Link href="/" className="hidden sm:inline text-xs font-medium text-[#666] hover:text-white transition-colors no-underline uppercase tracking-widest">Home</Link>
            <Link href="/pricing" className="hidden sm:inline text-xs font-medium text-[#666] hover:text-white transition-colors no-underline uppercase tracking-widest">Pricing</Link>
            <Link href="/about" className="hidden sm:inline text-xs font-medium text-[#666] hover:text-white transition-colors no-underline uppercase tracking-widest">About</Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <section className="relative pt-24 sm:pt-32 pb-12 sm:pb-20 px-4 sm:px-6 md:px-12 z-10">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-20">

            {/* Left — Info */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#cdff00]/20 bg-[#cdff00]/5 text-[#cdff00] text-[10px] font-bold uppercase tracking-[0.2em] mb-6">
                Get in Touch
              </span>

              <h1
                className="font-[family-name:var(--font-syne)] font-extrabold tracking-[-0.03em] text-white leading-[0.95] mb-6"
                style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
              >
                Let&apos;s talk about<br />
                <span style={{ color: "#cdff00" }}>your hiring needs.</span>
              </h1>

              <p className="text-[#888] text-base leading-relaxed mb-10 max-w-md">
                Whether you need custom integrations, enterprise pricing, or just
                want to learn how DevXray can transform your hiring pipeline — we&apos;re here.
              </p>

              {/* Contact Info Cards */}
              <div className="space-y-4">
                {[
                  { icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z", label: "Email", value: "contact@devxray.ai" },
                  { icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z", label: "Based in", value: "India" },
                  { icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", label: "Response time", value: "Within 24 hours" },
                ].map(({ icon, label, value }) => (
                  <div key={label} className="flex items-center gap-4 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                    <div className="w-10 h-10 rounded-lg bg-[#cdff00]/10 border border-[#cdff00]/20 flex items-center justify-center shrink-0">
                      <svg className="w-4.5 h-4.5 text-[#cdff00]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                      </svg>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#555] uppercase tracking-widest font-medium">{label}</div>
                      <div className="text-sm text-white font-medium mt-0.5">{value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Right — Form */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
            >
              {sent ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-10 text-center">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
                    <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="font-[family-name:var(--font-syne)] font-bold text-xl text-white mb-2">Message sent!</h3>
                  <p className="text-sm text-[#888] mb-6">We&apos;ll get back to you within 24 hours.</p>
                  <Link
                    href="/"
                    className="inline-flex px-6 py-2.5 rounded-xl bg-[#cdff00] text-[#050505] text-sm font-bold no-underline hover:bg-[#b8e600] transition-colors"
                  >
                    Back to Home
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 md:p-8 space-y-5"
                  style={{ backdropFilter: "blur(12px)" }}
                >
                  <h2 className="font-[family-name:var(--font-syne)] font-bold text-lg text-white mb-1">Send us a message</h2>
                  <p className="text-xs text-[#555] mb-4">Fields marked with * are required</p>

                  {error && (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
                      {error}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] text-[#666] uppercase tracking-widest font-medium mb-1.5">Full Name *</label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => update("name", e.target.value)}
                        placeholder="Your name"
                        className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-[#cdff00]/40 transition-colors"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#666] uppercase tracking-widest font-medium mb-1.5">Email *</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => update("email", e.target.value)}
                        placeholder="you@company.com"
                        className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-[#cdff00]/40 transition-colors"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] text-[#666] uppercase tracking-widest font-medium mb-1.5">Company</label>
                      <input
                        type="text"
                        value={form.company}
                        onChange={(e) => update("company", e.target.value)}
                        placeholder="Your company"
                        className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-[#cdff00]/40 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#666] uppercase tracking-widest font-medium mb-1.5">Phone</label>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => update("phone", e.target.value)}
                        placeholder="+91 XXXXX XXXXX"
                        className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-[#cdff00]/40 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-[#666] uppercase tracking-widest font-medium mb-1.5">Plan Interest</label>
                    <select
                      value={form.plan}
                      onChange={(e) => update("plan", e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-[#cdff00]/40 transition-colors appearance-none cursor-pointer"
                    >
                      <option value="starter" className="bg-[#111]">Starter</option>
                      <option value="pro" className="bg-[#111]">Pro</option>
                      <option value="enterprise" className="bg-[#111]">Enterprise</option>
                      <option value="custom" className="bg-[#111]">Custom / Not sure</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-[#666] uppercase tracking-widest font-medium mb-1.5">Message *</label>
                    <textarea
                      value={form.message}
                      onChange={(e) => update("message", e.target.value)}
                      placeholder="Tell us about your team size, hiring goals, and what you're looking for..."
                      rows={4}
                      className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-[#cdff00]/40 transition-colors resize-none"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full py-3.5 rounded-xl bg-[#cdff00] text-[#050505] font-black text-sm hover:shadow-[0_0_30px_rgba(205,255,0,0.3)] hover:-translate-y-0.5 transition-all cursor-pointer disabled:opacity-60"
                  >
                    {sending ? "Sending..." : "Send Message"}
                  </button>

                  <p className="text-[10px] text-[#444] text-center mt-2">
                    We typically respond within 24 hours on business days.
                  </p>
                </form>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.04] py-6 sm:py-8 px-4 sm:px-6 md:px-12">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Logo className="w-5 h-5" />
            <span className="text-xs text-[#555]">DevXray &mdash; AI-Powered Developer Intelligence</span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6">
            <Link href="/pricing" className="text-xs text-[#555] hover:text-white transition-colors no-underline">Pricing</Link>
            <Link href="/about" className="text-xs text-[#555] hover:text-white transition-colors no-underline">About</Link>
            <Link href="/" className="text-xs text-[#555] hover:text-white transition-colors no-underline">Home</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
