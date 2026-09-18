"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface FaqItem {
  question: string;
  answer: string;
  category: string;
}

const FAQS: FaqItem[] = [
  {
    category: "GitHub Analyzer",
    question: "What is a GitHub profile analyzer?",
    answer:
      "A GitHub profile analyzer is an automated engineering intelligence tool that inspects a developer's public repositories, commit patterns, pull requests, and code files to evaluate their authentic technical skill. Unlike vanity metrics (such as GitHub stars or follower counts), DevXray measures lines of code authored, architectural complexity, test coverage, and language mastery.",
  },
  {
    category: "Forensic Scanning",
    question: "How does DevXray check GitHub profiles and analyze code quality?",
    answer:
      "DevXray performs a 60-second deep scan across all public repositories using the GitHub API and our custom forensic code pipeline. We measure LOC-weighted language depth, calculate commit authenticity (filtering out bulk scripted commits and tutorial clone farms), evaluate repository dependencies, and generate an engineering competency radar.",
  },
  {
    category: "AI Code Detection",
    question: "Can DevXray detect AI-generated code from ChatGPT, Claude, and GitHub Copilot?",
    answer:
      "Yes. DevXray features a specialized 12-pattern AI detection scanner. It analyzes commit diffs for synthetic code signatures, generic LLM comments ('// Here is the complete code'), repetitive boilerplate docstrings, and sudden bulk code dumps, calculating a transparent AI Contribution Ratio.",
  },
  {
    category: "Resume & ATS",
    question: "How does the AI Resume Analyzer verify claims against GitHub?",
    answer:
      "When you upload a PDF resume, DevXray's Truth Engine extracts every listed skill, job experience, and project claim. It then cross-references those claims directly against the candidate's actual GitHub commit history and repository contents to verify whether they have authentic hands-on experience or merely listed keywords.",
  },
  {
    category: "Scoring",
    question: "What is the Developer Trust Score and how is it calculated?",
    answer:
      "The Developer Trust Score is an objective 0–100 score assessing candidate authenticity. It aggregates 5 key dimensions: Code Quality (modularity, error handling), Project Impact (production utility), Commit Authenticity (human commit distribution), Breadth & Depth (stack mastery), and Fraud Risk (original code vs forks/clones).",
  },
  {
    category: "Pricing & Access",
    question: "Is this GitHub profile checker free to use?",
    answer:
      "Yes! DevXray offers 2 free full forensic scans for anyone with no credit card required. For tech recruiters, hiring managers, and growing engineering teams, Starter and Pro plans provide high-volume candidate screening, ATS exports, and custom technical interview kits.",
  },
];

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="relative py-20 md:py-28 px-5 sm:px-6 md:px-12 z-10 border-t border-white/[0.04]">
      <div className="mx-auto max-w-[1000px]">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14 md:mb-16"
        >
          <span className="section-tag mb-4 inline-flex">
            Frequently Asked Questions
          </span>
          <h2
            className="font-[family-name:var(--font-syne)] font-bold text-white tracking-[-0.03em] mt-3"
            style={{ fontSize: "clamp(1.8rem, 4vw, 3rem)" }}
          >
            Everything you need to know about{" "}
            <span style={{ color: "#cdff00" }}>DevXray</span>
          </h2>
          <p className="text-[#777] text-sm sm:text-base max-w-xl mx-auto mt-4 font-light">
            Answers to common questions about GitHub profile scanning, AI code detection, and ATS resume verification.
          </p>
        </motion.div>

        {/* Accordion list */}
        <div className="space-y-4">
          {FAQS.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <motion.div
                key={faq.question}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08, duration: 0.5 }}
                className="rounded-xl border transition-all duration-300 overflow-hidden"
                style={{
                  backgroundColor: isOpen ? "rgba(255, 255, 255, 0.03)" : "rgba(255, 255, 255, 0.01)",
                  borderColor: isOpen ? "rgba(205, 255, 0, 0.3)" : "rgba(255, 255, 255, 0.06)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="w-full text-left p-5 sm:p-6 flex items-center justify-between gap-4 cursor-pointer"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <span
                      className="text-[10px] sm:text-[11px] font-[family-name:var(--font-space)] uppercase tracking-wider px-2.5 py-1 rounded-full border border-white/[0.08] text-[#888] flex-shrink-0"
                    >
                      {faq.category}
                    </span>
                    <h3 className="font-[family-name:var(--font-syne)] font-semibold text-base sm:text-lg text-white">
                      {faq.question}
                    </h3>
                  </div>

                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center border border-white/[0.1] text-sm text-[#888] transition-transform duration-300 flex-shrink-0"
                    style={{
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                      color: isOpen ? "#cdff00" : "#888",
                      borderColor: isOpen ? "rgba(205, 255, 0, 0.4)" : "rgba(255, 255, 255, 0.1)",
                    }}
                  >
                    ↓
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-1 text-[#888] text-sm sm:text-base font-light leading-relaxed border-t border-white/[0.04]">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
