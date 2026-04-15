// components/PaywallModal.tsx
// Premium paywall popup with Razorpay payment integration.

"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { PLANS } from "@/lib/plans";
import Script from "next/script";

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userEmail: string;
  userName: string;
  trigger?: "github" | "resume" | "pricing";
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function PaywallModal({
  isOpen,
  onClose,
  userId,
  userEmail,
  userName,
  trigger,
}: PaywallModalProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handlePay = async (plan: "starter" | "pro") => {
    setLoading(plan);
    setError("");

    try {
      const res = await fetch("/api/payment/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, userId }),
      });
      const { orderId, amount, currency } = await res.json();

      if (!orderId) {
        setError("Failed to create payment order. Try again.");
        setLoading(null);
        return;
      }

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount,
        currency,
        name: "DevXray",
        description: `${PLANS[plan].name} Plan — Monthly`,
        image: "https://dev-xray.vercel.app/logo.png",
        order_id: orderId,
        prefill: { name: userName, email: userEmail },
        theme: { color: "#cdff00" },
        handler: async (response: any) => {
          const verify = await fetch("/api/payment/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan,
              userId,
            }),
          });
          const result = await verify.json();
          if (result.success) {
            window.location.reload();
          } else {
            setError(
              "Payment verified but plan update failed. Contact support."
            );
          }
        },
        modal: {
          ondismiss: () => setLoading(null),
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch {
      setError("Payment initiation failed. Please try again.");
      setLoading(null);
    }
  };

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" />
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{
              background: "rgba(0,0,0,0.85)",
              backdropFilter: "blur(12px)",
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 20 }}
              className="w-full max-w-2xl rounded-3xl border border-white/10 overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, #0d0d0d 0%, #111 100%)",
              }}
            >
              {/* Header */}
              <div className="relative p-8 pb-6 text-center border-b border-white/[0.06]">
                {trigger === "pricing" ? (
                  <>
                    <h2 className="font-bold text-3xl text-white mb-2" style={{ fontFamily: "var(--font-syne)" }}>
                      Upgrade your plan
                    </h2>
                    <p className="text-[#777] text-sm max-w-md mx-auto">
                      Get full access to DevXray's reporting, CSV uploads, and comparison features.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#cdff00]/30 bg-[#cdff00]/5 text-[#cdff00] text-xs font-semibold mb-4">
                      🔒 FREE LIMIT REACHED
                    </div>
                    <h2
                      className="font-bold text-3xl text-white mb-2"
                      style={{ fontFamily: "var(--font-syne)" }}
                    >
                      You&apos;ve used your{" "}
                      {trigger === "resume"
                        ? "2 free resume scans"
                        : "2 free GitHub scans"}
                    </h2>
                    <p className="text-[#777] text-sm max-w-md mx-auto">
                      Upgrade to keep screening candidates. DevXray finds red
                      flags in seconds that take hours to uncover manually.
                    </p>
                  </>
                )}
                <button
                  onClick={onClose}
                  className="absolute top-6 right-6 text-[#555] hover:text-white transition-colors text-xl cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Plans */}
              <div className="p-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Starter */}
                <div className="rounded-2xl border border-white/[0.08] p-6 hover:border-white/20 transition-all">
                  <div className="text-white font-bold text-lg mb-1">
                    Starter
                  </div>
                  <div className="text-3xl font-black text-white mb-1">
                    ₹999
                    <span className="text-sm font-normal text-[#555]">
                      /mo
                    </span>
                  </div>
                  <div className="text-[#555] text-xs mb-6">
                    For individual HR professionals
                  </div>
                  <ul className="space-y-2 mb-6">
                    {[
                      "20 GitHub scans/mo",
                      "20 Resume scans/mo",
                      "AI Interview Kit",
                      "Claim-by-claim forensics",
                      "CSV export",
                    ].map((f) => (
                      <li
                        key={f}
                        className="flex items-center gap-2 text-xs text-[#aaa]"
                      >
                        <span className="text-[#cdff00] text-xs">✓</span>{" "}
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => handlePay("starter")}
                    disabled={!!loading}
                    className="w-full py-3 rounded-xl border border-white/20 text-white text-sm font-semibold hover:bg-white/5 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {loading === "starter"
                      ? "Opening payment..."
                      : "Get Starter"}
                  </button>
                </div>

                {/* Pro — highlighted */}
                <div className="rounded-2xl border-2 border-[#cdff00] p-6 relative overflow-hidden">
                  <div className="absolute top-3 right-3 bg-[#cdff00] text-black text-[10px] font-black px-2 py-1 rounded-full">
                    MOST POPULAR
                  </div>
                  <div className="text-white font-bold text-lg mb-1">
                    Pro
                  </div>
                  <div className="text-3xl font-black text-[#cdff00] mb-1">
                    ₹2,499
                    <span className="text-sm font-normal text-[#555]">
                      /mo
                    </span>
                  </div>
                  <div className="text-[#555] text-xs mb-6">
                    For hiring teams & companies
                  </div>
                  <ul className="space-y-2 mb-6">
                    {[
                      "100 GitHub scans/mo",
                      "100 Resume scans/mo",
                      "Everything in Starter",
                      "Bulk CSV upload (50 candidates)",
                      "Team dashboard (5 seats)",
                      "ATS-ready PDF export",
                      "Slack support",
                    ].map((f) => (
                      <li
                        key={f}
                        className="flex items-center gap-2 text-xs text-[#aaa]"
                      >
                        <span className="text-[#cdff00] text-xs">✓</span>{" "}
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => handlePay("pro")}
                    disabled={!!loading}
                    className="w-full py-3 rounded-xl bg-[#cdff00] text-black text-sm font-black hover:bg-[#b8e600] transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {loading === "pro"
                      ? "Opening payment..."
                      : "Upgrade to Pro →"}
                  </button>
                </div>
              </div>

              {/* Trust bar */}
              {error && (
                <p className="text-center text-red-400 text-xs pb-4">
                  {error}
                </p>
              )}
              <div className="px-8 pb-8 flex items-center justify-center gap-6 text-[#444] text-xs flex-wrap">
                <span>🔒 Secured by Razorpay</span>
                <span className="hidden sm:inline">•</span>
                <span>✓ Cancel anytime</span>
                <span className="hidden sm:inline">•</span>
                <span>✓ INR billing</span>
                <span className="hidden sm:inline">•</span>
                <span>✓ GST invoice included</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
