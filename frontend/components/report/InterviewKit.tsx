"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface InterviewQuestion {
  category: string;
  question: string;
  good_answer?: string;
  triggered_by?: string;
  severity?: string;
}

interface InterviewKitProps {
  reportData: any;
  candidateName: string;
}

const SEVERITY_CONFIG: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  "CRITICAL": { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-400", icon: "🔴" },
  "HIGH": { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400", icon: "🟠" },
  "MEDIUM": { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", icon: "🟡" },
  "LOW": { bg: "bg-slate-500/10", border: "border-slate-500/30", text: "text-slate-400", icon: "⚪" },
  "POSITIVE": { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", icon: "✅" },
};

const CATEGORY_ICONS: Record<string, string> = {
  "Originality": "🎨",
  "Authenticity": "🔍",
  "Consistency": "📊",
  "Engineering Practices": "⚙️",
  "Documentation": "📝",
  "Breadth": "🌐",
  "Depth": "🧠",
  "Verification": "✔️",
  "Career Continuity": "📅",
  "Growth": "📈",
  "Technical Depth": "🏗️",
};

/**
 * Compute difficulty level from the candidate's score:
 * < 60 → "junior", 60-80 → "mid", > 80 → "senior"
 */
function getDifficulty(reportData: any): string {
  const github = reportData?.github_intelligence || reportData?.github_report;
  const score: number =
    Number(reportData?.final_score) ||
    Number(reportData?.score) ||
    Number(github?.final_score) ||
    Number(github?.score) ||
    Number(reportData?.deep_report?.overall_score) ||
    Number(reportData?.claims_validation?.authenticity_score) ||
    0;
  if (score < 60) return "junior";
  if (score <= 80) return "mid";
  return "senior";
}

/**
 * Extract the candidate's current role from the report, with a sensible fallback.
 */
function getCandidateRole(reportData: any): string {
  return (
    reportData?.resume_data?.current_role ||
    reportData?.github_intelligence?.role_fit?.best_role ||
    "Software Engineer"
  );
}

export default function InterviewKit({ reportData, candidateName }: InterviewKitProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [interviewKit, setInterviewKit] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"auto" | "ai">("auto");
  const [error, setError] = useState("");

  const github = reportData?.github_intelligence || reportData?.github_report;
  const autoQuestions: InterviewQuestion[] = (
    github?.auto_interview_questions ||
    reportData?.auto_interview_questions ||
    []
  );

  // Generate fallback questions from weaknesses if auto list is empty
  const weaknesses: string[] = github?.weaknesses || reportData?.weaknesses || [];
  const fallbackQuestions: InterviewQuestion[] = weaknesses.slice(0, 3).map((w: string, i: number) => ({
    category: "Gap Analysis",
    question: `Your assessment flagged: "${w}". Can you walk me through a specific example where you encountered this challenge and how you handled it?`,
    good_answer: "Candidate shows self-awareness and describes concrete steps they took or are taking to improve.",
    triggered_by: w,
    severity: "MEDIUM"
  }));

  const displayQuestions = autoQuestions.length > 0 ? autoQuestions : fallbackQuestions;

  // ── Check for existing interview kit data in the report ──
  // If already present, load it immediately instead of making an API call.
  useEffect(() => {
    const existingKit =
      reportData?.interview_kit ||
      reportData?.deep_report?.interview_kit ||
      null;

    if (existingKit && typeof existingKit === "object" && Object.keys(existingKit).length > 0) {
      setInterviewKit(existingKit);
    }
  }, [reportData]);

  // ── Generate Interview Kit instantly from loaded report data ──
  const generateAIKit = () => {
    if (interviewKit) { setActiveTab("ai"); return; }

    const github = reportData?.github_intelligence || reportData?.github_report || reportData;
    const resume = reportData?.resume_data || {};
    const score = Number(reportData?.final_score) || Number(reportData?.score) || Number(github?.final_score) || Number(github?.score) || Number(reportData?.deep_report?.overall_score) || 0;

    // ── Role-based skill priority override ──
    const ROLE_SKILL_PRIORITIES: Record<string, string[]> = {
      "ai/ml": ["Python", "TensorFlow", "OpenCV", "Machine Learning", "Deep Learning"],
      "full stack": ["Python", "React", "Node.js", "PostgreSQL"],
      "ml": ["Python", "TensorFlow", "PyTorch", "OpenCV"],
      "backend": ["Python", "Node.js", "Flask", "FastAPI", "PostgreSQL"],
      "frontend": ["React", "TypeScript", "Next.js", "Tailwind CSS"],
    };

    const roleLower = String(github?.developer_tier?.tier || github?.developer_tier || "").toLowerCase();
    const candidateRole = String(resume?.current_role || "").toLowerCase();

    // Find matching priority list
    let prioritySkills: string[] = [];
    for (const [roleKey, roleSkills] of Object.entries(ROLE_SKILL_PRIORITIES)) {
      if (candidateRole.includes(roleKey) || roleLower.includes(roleKey)) {
        prioritySkills = roleSkills;
        break;
      }
    }

    // Get all verified skill names for cross-referencing
    const verifiedSkills = (github?.skills || github?.verified_skills || github?.top_skills || []);
    const verifiedSkillNames = verifiedSkills.map((s: any) =>
      typeof s === "string" ? s : s?.skill_name || s?.name || ""
    ).filter(Boolean);

    // Use priority skills if they exist in verified_skills, otherwise fall back to DIP top_skills
    const allTopSkills = (github?.top_skills || []).slice(0, 5).map((s: any) =>
      typeof s === "string" ? s : s.skill_name || s.name || s
    ).filter(Boolean);

    const deepDiveSkills = prioritySkills.length > 0
      ? prioritySkills.filter(ps =>
          verifiedSkillNames.some((vs: string) => String(vs).toLowerCase().includes(String(ps).toLowerCase()))
        ).slice(0, 4)
      : [];

    // Merge: priority skills first, then fill remaining from top_skills
    const usedSkills = new Set(deepDiveSkills.map((s: string) => String(s).toLowerCase()));
    const remainingSlots = 5 - deepDiveSkills.length;
    const fillerSkills = allTopSkills
      .filter((s: string) => !usedSkills.has(String(s).toLowerCase()))
      .slice(0, remainingSlots);
    const skills = [...deepDiveSkills, ...fillerSkills];
    const weaknesses = (github?.weaknesses || github?.score_breakdown?.weaknesses || []).slice(0, 4);
    const redFlags = (github?.risk_flags || github?.red_flags || []).slice(0, 3).map((f: any) => {
      if (typeof f === "string") return f;
      return String(f?.flag || f?.description || f?.message || f?.title || "").trim();
    }).filter((s: string) => s.length > 2);
    const name = candidateName || resume?.name || "the candidate";
    const role = getCandidateRole(reportData);
    const difficulty = getDifficulty(reportData);
    const topRepos = (github?.top_repos || []).slice(0, 3).map((r: any) => r.name || r).filter(Boolean);

    const kit = {
      overall_interview_strategy: `${name} scores ${Math.round(score)}/100 — a ${difficulty}-level ${role}. 
Focus the interview on verifying depth of knowledge in ${skills.slice(0,2).join(" and ") || "their claimed skills"}. 
${redFlags.length > 0 ? `Key areas to probe: ${redFlags.slice(0,2).join(", ")}.` : "No major red flags detected — focus on growth potential."}
${topRepos.length > 0 ? `Reference their actual projects: ${topRepos.join(", ")}.` : ""}`,

      time_allocation: {
        technical: "35 min",
        behavioral: "15 min", 
        system_design: "20 min",
        "q&a": "10 min"
      },

      opening_questions: [
        {
          question: `Walk me through ${topRepos[0] ? `your "${topRepos[0]}" project` : "your most complex project"} — what problem did it solve and what were the key technical decisions?`,
          purpose: "Assess communication, ownership, and technical depth"
        },
        {
          question: `What's the hardest bug you've ever debugged? Walk me through exactly how you found and fixed it.`,
          purpose: "Tests systematic problem-solving and debugging skills"
        },
        {
          question: `How do you decide when code is "good enough" to ship vs needs more work?`,
          purpose: "Assesses engineering judgment and quality standards"
        }
      ],

      technical_deep_dives: (() => {
        const FAILURE_MODES: Record<string, string> = {
          "React": "performance issues from excessive re-renders",
          "Next.js": "hydration mismatches between server and client",
          "Vue": "reactivity pitfalls with deeply nested objects",
          "Angular": "change detection performance in large component trees",
          "Node.js": "blocking the event loop under high concurrency",
          "Express": "unhandled promise rejections crashing the process",
          "Tailwind CSS": "bundle size bloat in large applications",
          "TypeScript": "type-safety gaps when integrating untyped libraries",
          "Python": "GIL limitations in CPU-bound tasks",
          "FastAPI": "async dependency injection deadlocks under load",
          "Flask": "lack of async support under high traffic",
          "Django": "N+1 query problems with the ORM",
          "PostgreSQL": "slow queries on tables with millions of rows",
          "MongoDB": "schema inconsistency across documents over time",
          "Redis": "cache invalidation and memory pressure",
          "Docker": "container networking failures in multi-service setups",
          "Kubernetes": "pod scheduling failures during rolling deployments",
          "AWS": "cold starts and timeout issues in Lambda functions",
          "GraphQL": "N+1 query problems and overfetching in resolvers",
          "WebSockets": "connection drops and reconnection logic at scale",
          "Java": "memory leaks from unclosed resources and classloader issues",
          "Go": "goroutine leaks and channel deadlocks",
          "C++": "memory corruption and undefined behavior in production",
        };
        const getFailureMode = (s: string) =>
          FAILURE_MODES[s] || `scaling and production failure scenarios for ${s}`;

        return [
          ...(skills.slice(0, 4).map((skill: string) => ({
            skill,
            question: `You listed ${skill} as a skill. Walk me through a real production problem you solved with it — not a tutorial, something you actually built or debugged.`,
            follow_up: `How would you handle ${getFailureMode(skill)} at scale?`,
            good_answer_looks_like: `Mentions specific project, describes a real challenge, shows understanding of trade-offs and limitations.`,
            red_flag_answer: `Only describes tutorial-level usage, cannot explain internals, or gives a textbook definition.`
          }))),
          {
            skill: "System Design",
            question: `Design a basic URL shortener. Walk me through your data model, API design, and how you'd handle 1 million requests per day.`,
            follow_up: `How would you handle the same users clicking the same short link 10,000 times in 1 minute?`,
            good_answer_looks_like: `Mentions caching, database choice rationale, handles edge cases, thinks about failure modes.`,
            red_flag_answer: `Jumps to code immediately, ignores scale, cannot explain why they chose their database.`
          }
        ];
      })(),

      gap_probing_questions: weaknesses.length > 0 
        ? weaknesses.map((w: string) => ({
            question: `Our analysis flagged "${w}" as a potential gap. Can you give me a specific example where you encountered this limitation and what you did about it?`,
            probes_for: `Self-awareness about ${w} and concrete improvement plan`
          }))
        : [
            {
              question: `What is the most significant technical skill you wish you had right now and what are you doing to build it?`,
              probes_for: `Self-awareness and learning mindset`
            }
          ],

      system_design_challenge: (() => {
        // Choose system design based on candidate's projects/skills
        const allRepoNames = (github?.top_repos || topRepos || []).map((r: any) =>
          (String(r?.name || r || "") + " " + String(r?.description || "")).toLowerCase()
        ).join(" ");
        const allSkillsLower = skills.map((s: string) => String(s).toLowerCase()).join(" ");

        if (/bot|automat|webhook|cron|scraper|crawl|discord|slack|telegram/.test(allRepoNames + allSkillsLower)) {
          return {
            problem: score >= 70
              ? `Design a webhook delivery system that guarantees at-least-once delivery to 50,000 endpoints. Handle retries with exponential backoff, dead-letter queues, and endpoint health tracking.`
              : `Design a webhook delivery system for a SaaS app. An event occurs → your system delivers a POST to a customer's URL. Handle failures and retries.`,
            what_to_look_for: score >= 70
              ? ["Message queues", "Retry strategies", "Dead-letter queues", "Endpoint health scoring", "Idempotency keys"]
              : ["Queue basics", "Retry logic", "Failure logging", "HTTP POST semantics"],
            time_allocation: "20 minutes"
          };
        }
        if (/ml|ai|model|tensorflow|pytorch|opencv|machine.?learn|deep.?learn|neural|llm|gpt|nlp/.test(allRepoNames + allSkillsLower)) {
          return {
            problem: score >= 70
              ? `Design a model serving pipeline that handles 1,000 inference requests/sec. Include model versioning, A/B testing between model versions, auto-scaling, and graceful degradation when GPU resources are exhausted.`
              : `Design a simple model serving API: a user uploads an image, your system runs an ML model on it and returns predictions. How would you handle model loading, request queuing, and error cases?`,
            what_to_look_for: score >= 70
              ? ["Model registry", "A/B traffic splitting", "GPU resource management", "Batching inference", "Canary deployments"]
              : ["REST API design", "Model loading strategy", "Request timeout handling", "Basic error responses"],
            time_allocation: "20 minutes"
          };
        }
        if (/mobile|ios|android|swift|kotlin|flutter|react.?native|expo/.test(allRepoNames + allSkillsLower)) {
          return {
            problem: score >= 70
              ? `Design an offline-first mobile sync system. Users create/edit data while offline, and changes sync when connectivity returns. Handle conflict resolution for concurrent edits and ensure data consistency.`
              : `Design a mobile app that works offline. Users can create notes without internet and sync when they come back online. How do you store data locally and handle sync?`,
            what_to_look_for: score >= 70
              ? ["CRDT or OT for conflicts", "Local-first storage", "Sync queue design", "Conflict resolution UI", "Optimistic updates"]
              : ["SQLite/local storage", "Sync queue basics", "Last-write-wins vs manual merge", "Network state detection"],
            time_allocation: "20 minutes"
          };
        }
        // Default: web projects (URL shortener)
        return {
          problem: score >= 70
            ? `Design a URL shortener like bit.ly that handles 10 million short URLs and 1 billion redirects/month. Include analytics (click count, referrers, geo), custom aliases, and link expiration.`
            : `Design a URL shortener: users submit a long URL, get a short one back. When someone visits the short URL, they get redirected. Focus on database schema, the shortening algorithm, and redirect flow.`,
          what_to_look_for: score >= 70
            ? ["Hash collision handling", "Read-heavy caching strategy", "Analytics pipeline", "Rate limiting", "Custom alias validation"]
            : ["Database schema", "Base62 encoding", "301 vs 302 redirects", "Basic caching"],
          time_allocation: "20 minutes"
        };
      })(),

      culture_fit_questions: (() => {
        // Q1 is always the same (disagreement question)
        const q1 = {
          question: `Tell me about a time you disagreed with a technical decision your team made. What did you do?`,
          good_signal: `Raised concern with data, communicated clearly, committed to team decision even if overruled.`,
          red_flag: `Went silent and resented it, or overruled the team without consensus.`
        };

        // Q2: pick based on candidate's specific detected gaps
        const allFlags = redFlags.join(" ").toLowerCase();
        const allWeaknesses = weaknesses.map((w: any) => String(w)).join(" ").toLowerCase();

        let q2;
        if (/no test|test.*missing|test.*sparse|low.*coverage|no.*unit/.test(allFlags + allWeaknesses)) {
          q2 = {
            question: `Our analysis found limited test coverage in your projects. Walk me through your testing philosophy — when do you write tests, what kind, and how do you decide what's worth testing?`,
            good_signal: `Distinguishes between unit/integration/e2e, explains trade-offs, has a real process — even if selective.`,
            red_flag: `Says "I test manually" or "tests slow me down" with no nuance.`
          };
        } else if (/inconsisten|irregular|gap|burst|inactiv|sporadic/.test(allFlags + allWeaknesses)) {
          q2 = {
            question: `Your GitHub shows periods of high activity followed by quiet stretches. How do you manage long-term projects and maintain momentum when motivation dips?`,
            good_signal: `Describes real habits: sprint planning, accountability partners, breaking work into milestones. Acknowledges the challenge.`,
            red_flag: `Blames external factors without describing any system for consistency.`
          };
        } else if (/documentation|readme|no docs/.test(allFlags + allWeaknesses)) {
          q2 = {
            question: `Several of your repos lack documentation. When you join a new team, how do you approach documenting your work — and how do you balance speed vs. thoroughness?`,
            good_signal: `Has opinions on README structure, API docs, or inline comments. Understands docs are for future-self and teammates.`,
            red_flag: `Says "the code is self-documenting" without qualification.`
          };
        } else if (/fork|originality|template|boilerplate/.test(allFlags + allWeaknesses)) {
          q2 = {
            question: `Some of your repos appear to be forks or template-based. When you start a new project, how do you decide between building from scratch vs. using a starter? What do you customize first?`,
            good_signal: `Explains trade-offs of DRY vs understanding, describes what they change and why.`,
            red_flag: `Can't articulate what they changed from the template.`
          };
        } else {
          // Clean profile — ask a growth-oriented question
          q2 = {
            question: `What's the biggest technical mistake you've made in the last year, and what did you change in your process because of it?`,
            good_signal: `Names a specific mistake, describes the lesson and the process change — shows growth mindset.`,
            red_flag: `Says they've never made a significant mistake, or gives a non-technical answer.`
          };
        }

        return [q1, q2];
      })(),

      coding_challenge: (() => {
        // Get primary language from top_languages (actual language names like "Python", "JavaScript")
        // instead of top_skills (framework names like "React", "FastAPI")
        const topLangs = (github?.top_languages || reportData?.top_languages || []);
        const primaryLang = String(topLangs[0] || skills[0] || "").toLowerCase();

        // Language-specific coding challenges
        if (/python/.test(primaryLang)) {
          return {
            problem: score >= 70
              ? `Write a function that finds all duplicate files in a directory tree by content (not name). Use hashing for efficiency. Handle large files by reading in chunks. Return groups of duplicate file paths.`
              : `Write a function that takes a directory path and returns all duplicate files (same content, different names). You can use os.walk and hashlib. Focus on correctness first, then optimize.`,
            difficulty,
            what_it_tests: score >= 70
              ? "File I/O, hashing strategy, memory management for large files, generator patterns"
              : "Basic file operations, hashing, dictionary usage, problem decomposition"
          };
        }
        if (/javascript|react|typescript|next|vue|angular|node/.test(primaryLang)) {
          return {
            problem: score >= 70
              ? `Implement a production-grade debounce function from scratch. It should support: leading/trailing edge options, a cancel method, a flush method, and return a promise that resolves with the debounced function's return value.`
              : `Implement a debounce function from scratch: debounce(fn, delay) returns a new function that only calls fn after delay ms of inactivity. Add a .cancel() method to clear pending calls.`,
            difficulty,
            what_it_tests: score >= 70
              ? "Closure mastery, timer management, Promise integration, API design"
              : "Closures, setTimeout/clearTimeout, basic API design"
          };
        }
        if (/java/.test(primaryLang)) {
          return {
            problem: score >= 70
              ? `Implement a thread-safe LRU cache with O(1) get/put. Use a doubly-linked list + ConcurrentHashMap. Support a configurable max size, TTL-based expiration, and an eviction callback.`
              : `Implement an LRU (Least Recently Used) cache with O(1) get and put operations. Use a combination of a HashMap and a doubly-linked list. Support a configurable capacity.`,
            difficulty,
            what_it_tests: score >= 70
              ? "Concurrency primitives, data structure design, cache invalidation, thread safety"
              : "LinkedHashMap internals, data structure choice, basic OOP design"
          };
        }
        if (/go|golang/.test(primaryLang)) {
          return {
            problem: score >= 70
              ? `Implement a concurrent rate limiter using the token bucket algorithm. It should be safe for use by multiple goroutines, support configurable rate and burst size, and implement the http.Handler interface as middleware.`
              : `Implement a simple rate limiter in Go: given a max number of requests per second, write a function that returns true if a request is allowed, false if it should be throttled. Make it goroutine-safe.`,
            difficulty,
            what_it_tests: score >= 70
              ? "Goroutine safety, channel vs mutex trade-offs, middleware patterns, time.Ticker usage"
              : "Basic concurrency with sync.Mutex, time-based logic, interface design"
          };
        }
        if (/c\+\+|cpp|c#|csharp|rust/.test(primaryLang)) {
          return {
            problem: score >= 70
              ? `Implement a memory pool allocator that pre-allocates a fixed block of memory and hands out fixed-size chunks. Support alloc() and free() in O(1). Handle fragmentation with a free-list.`
              : `Implement a simple stack-based memory allocator: allocate(size) returns a pointer from a pre-allocated buffer, and reset() frees everything at once. No need for individual free().`,
            difficulty,
            what_it_tests: score >= 70
              ? "Memory management, pointer arithmetic, free-list data structure, fragmentation awareness"
              : "Basic memory concepts, pointer/reference handling, buffer management"
          };
        }
        if (/dart|flutter/.test(primaryLang)) {
          return {
            problem: score >= 70
              ? `Build a Flutter widget that implements a search-as-you-type feature: a TextField that debounces input (300ms), calls a mock API, and displays results in a ListView with loading/error/empty states. Use a Cubit or ValueNotifier for state management — no setState.`
              : `Build a Flutter widget with a TextField and a ListView. When the user types, filter a hardcoded list of items and display matching results below. Handle empty state with a "No results" message.`,
            difficulty,
            what_it_tests: score >= 70
              ? "State management patterns, debouncing in Dart, widget composition, error handling"
              : "Basic Flutter widgets, setState vs stateless, list filtering, UI composition"
          };
        }
        if (/tensorflow|pytorch|keras|machine.?learn|deep.?learn|ml|ai/.test(primaryLang) || 
            /tensorflow|pytorch|keras|scikit/.test(skills.map((s: string) => String(s).toLowerCase()).join(" "))) {
          return {
            problem: score >= 70
              ? `Write a custom training loop in PyTorch/TensorFlow that supports: gradient accumulation (effective batch size = N * accumulation_steps), mixed-precision training, and early stopping with patience. Include proper gradient clipping and learning rate warmup.`
              : `Write a function that loads a CSV dataset, handles missing values (fill numeric with median, categorical with mode), normalizes numeric columns to 0-1 range, and splits into train/test sets. Use pandas and scikit-learn.`,
            difficulty,
            what_it_tests: score >= 70
              ? "Training loop internals, gradient management, mixed precision, optimization techniques"
              : "Data preprocessing, pandas operations, scikit-learn pipeline basics, train/test splitting"
          };
        }

        // Default: adapted two-sum based on skill level
        return {
          problem: score >= 70
            ? `Given a stream of stock prices arriving in real-time, design a data structure that efficiently answers: "What was the maximum profit achievable from a single buy-sell pair in the last N prices?" Support O(1) queries and O(1) updates.`
            : `Write a function that takes an array of integers and a target sum. Return the indices of the two numbers that add up to the target. Solve it in O(n) time using a hash map. Handle edge cases (no solution, duplicate values).`,
          difficulty,
          what_it_tests: score >= 70
            ? "Sliding window, monotonic data structures, amortized complexity analysis"
            : "Hash map usage, problem decomposition, edge case handling, code clarity"
        };
      })(),

      closing_questions: [
        "What does your code review process look like — what do you look for when reviewing others' code?",
        "How do you stay updated with new technologies? What have you learned in the last 3 months?",
        "What would your ideal dev environment and team process look like?",
        "What's something you built that you're genuinely proud of and why?"
      ]
    };

    setInterviewKit(kit);
    setActiveTab("ai");
    setIsLoading(false);
  };

  const buildPrintableHTML = (): string => {
    if (!interviewKit) return "<p>No interview kit generated.</p>";
    const kit = interviewKit;
    const esc = (s: string) => (s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const role = getCandidateRole(reportData);
    const difficulty = getDifficulty(reportData);

    let html = `<div class="header"><h1>Interview Kit — ${esc(candidateName)}</h1>
      <p>Role: ${esc(role)} · Difficulty: ${esc(difficulty)} · Generated by DevXray AI</p></div>`;

    if (kit.overall_interview_strategy) {
      html += `<div class="strategy-box"><p>${esc(kit.overall_interview_strategy)}</p></div>`;
    }

    const renderSection = (title: string, items: any[]) => {
      if (!items?.length) return "";
      let s = `<div class="section"><div class="section-title">${title}</div>`;
      items.forEach((item: any, i: number) => {
        const q = typeof item === "string" ? item : (item.question || item.text || "");
        const purpose = item.purpose || "";
        const followup = item.follow_up || item.followup || "";
        const good = item.good_answer_looks_like || item.good_signal || item.good_answer || "";
        const bad = item.red_flag_answer || item.red_flag || "";
        s += `<div class="question">
          <div class="question-text"><span class="question-num">Q${i+1}.</span>${esc(q)}</div>
          ${followup ? `<div class="followup">Follow-up: ${esc(followup)}</div>` : ""}
          ${purpose ? `<div class="purpose">Purpose: ${esc(purpose)}</div>` : ""}
          ${good ? `<div class="good-answer"><div class="good-label">Good answer</div><p>${esc(good)}</p></div>` : ""}
          ${bad ? `<div class="red-flag"><div class="red-label">Red flag answer</div><p>${esc(bad)}</p></div>` : ""}
          ${item.skill ? `<div class="purpose">Tests: ${esc(item.skill)}</div>` : ""}
          ${item.probes_for ? `<div class="purpose">Probes for: ${esc(item.probes_for)}</div>` : ""}
        </div>`;
      });
      s += `</div>`;
      return s;
    };

    if (kit.opening_questions?.length) html += renderSection("Opening Questions", kit.opening_questions);
    if (kit.technical_deep_dives?.length) html += renderSection("Technical Deep Dives", kit.technical_deep_dives);
    if (kit.gap_probing_questions?.length) html += renderSection("Gap Probing Questions", kit.gap_probing_questions);
    if (kit.culture_fit_questions?.length) html += renderSection("Culture Fit", kit.culture_fit_questions);

    if (kit.system_design_challenge) {
      const sd = typeof kit.system_design_challenge === "string" ? kit.system_design_challenge : kit.system_design_challenge.problem || "";
      html += `<div class="coding-challenge"><div class="section-title">System Design Challenge</div>
        <p style="font-size:14px;line-height:1.6;color:#1e40af">${esc(sd)}</p></div>`;
    }

    if (kit.coding_challenge) {
      const cc = typeof kit.coding_challenge === "string" ? kit.coding_challenge : kit.coding_challenge.problem || "";
      html += `<div class="coding-challenge" style="margin-top:12px"><div class="section-title">Coding Challenge</div>
        <p style="font-size:14px;line-height:1.6;color:#1e40af">${esc(cc)}</p></div>`;
    }

    if (kit.closing_questions?.length) {
      html += `<div class="section"><div class="section-title">Closing — Questions candidate should ask</div><div class="closing"><ul>`;
      kit.closing_questions.forEach((q: any) => { html += `<li>${esc(typeof q === "string" ? q : q.question || "")}</li>`; });
      html += `</ul></div></div>`;
    }

    return html;
  };

  const handlePrint = () => {
    const content = buildPrintableHTML();
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) { window.print(); return; }
    printWindow.document.write(`<!DOCTYPE html><html><head>
      <title>DevXray Interview Kit — ${candidateName}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fff;color:#111;padding:32px;max-width:900px;margin:0 auto}
        .header{border-bottom:2px solid #e5e7eb;padding-bottom:16px;margin-bottom:24px}
        .header h1{font-size:24px;font-weight:700;color:#111}
        .header p{font-size:13px;color:#6b7280;margin-top:4px}
        .strategy-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:24px}
        .strategy-box p{font-size:14px;color:#374151;line-height:1.6}
        .section{margin-bottom:24px}
        .section-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;margin-bottom:12px;border-bottom:1px solid #f3f4f6;padding-bottom:6px}
        .question{background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:14px;margin-bottom:10px}
        .question-text{font-size:14px;font-weight:600;color:#111;margin-bottom:8px}
        .question-num{font-size:11px;color:#9ca3af;margin-right:6px;font-family:monospace}
        .followup{font-size:12px;color:#0ea5e9;margin-top:6px}
        .good-answer{background:#f0fdf4;border-left:3px solid #22c55e;padding:8px 10px;margin-top:8px;border-radius:0 4px 4px 0}
        .red-flag{background:#fff7f7;border-left:3px solid #ef4444;padding:8px 10px;margin-top:6px;border-radius:0 4px 4px 0}
        .good-answer p,.red-flag p{font-size:11px;color:#374151}
        .good-label{font-size:10px;font-weight:700;color:#16a34a;text-transform:uppercase;margin-bottom:2px}
        .red-label{font-size:10px;font-weight:700;color:#dc2626;text-transform:uppercase;margin-bottom:2px}
        .purpose{font-size:11px;color:#9ca3af;margin-top:6px;font-style:italic}
        .coding-challenge{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-top:12px}
        .closing{background:#f8fafc;border-radius:8px;padding:16px}
        .closing li{font-size:13px;color:#374151;margin-bottom:6px;margin-left:16px}
        .footer{margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center}
        @media print{body{padding:16px}}
      </style>
    </head><body>${content}
      <div class="footer">Generated by DevXray AI · Confidential Hiring Intelligence · ${new Date().toLocaleDateString()}</div>
    </body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  };

  // ── Helper: render a list of Q&A items ──
  const renderQAList = (items: any[], sectionColor: string) => {
    if (!items || !Array.isArray(items) || items.length === 0) return null;
    return (
      <div className="space-y-3">
        {items.map((item: any, i: number) => (
          <div
            key={i}
            className={`p-4 rounded-xl border border-${sectionColor}-500/20 bg-${sectionColor}-500/5 print:border-gray-300 print:bg-white`}
          >
            <p className="text-sm text-white font-medium leading-relaxed print:text-black">
              <span className="text-slate-500 font-mono mr-2 text-xs">Q{i + 1}.</span>
              {typeof item === "string" ? item : item.question || item.text || JSON.stringify(item)}
            </p>
            {item.purpose && (
              <p className="text-[11px] text-slate-500 mt-2 print:text-gray-500">
                <span className="font-bold text-slate-400">Purpose:</span> {item.purpose}
              </p>
            )}
            {item.follow_up && (
              <p className="text-[11px] text-cyan-400/70 mt-1.5 print:text-gray-500">
                <span className="font-bold">Follow-up:</span> {item.follow_up}
              </p>
            )}
            {item.good_answer_looks_like && (
              <div className="mt-2 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                <span className="text-[9px] uppercase tracking-widest text-emerald-500 font-bold block mb-1">
                  ✓ Good answer looks like
                </span>
                <p className="text-[11px] text-emerald-300/70 leading-relaxed print:text-gray-600">
                  {item.good_answer_looks_like}
                </p>
              </div>
            )}
            {item.red_flag_answer && (
              <div className="mt-2 p-2.5 rounded-lg bg-rose-500/5 border border-rose-500/10">
                <span className="text-[9px] uppercase tracking-widest text-rose-500 font-bold block mb-1">
                  🚩 Red flag answer
                </span>
                <p className="text-[11px] text-rose-300/70 leading-relaxed print:text-gray-600">
                  {item.red_flag_answer}
                </p>
              </div>
            )}
            {item.skill && (
              <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded bg-white/5 text-slate-500 border border-white/5">
                Tests: {item.skill}
              </span>
            )}
            {item.probes_for && (
              <p className="text-[10px] text-slate-600 mt-1.5 print:text-gray-400">
                Probes for: {item.probes_for}
              </p>
            )}
            {item.good_signal && (
              <p className="text-[11px] text-emerald-400/60 mt-1.5 print:text-gray-500">
                <span className="font-bold">Good signal:</span> {item.good_signal}
              </p>
            )}
            {item.red_flag && (
              <p className="text-[11px] text-rose-400/60 mt-1 print:text-gray-500">
                <span className="font-bold">Red flag:</span> {item.red_flag}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      {/* Trigger Button */}
      <motion.button
        onClick={() => { setIsOpen(true); if (!interviewKit && !isLoading) generateAIKit(); }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        disabled={isLoading}
        className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all cursor-pointer disabled:opacity-60"
        style={{
          background: "linear-gradient(135deg, rgba(205,255,0,0.15), rgba(205,255,0,0.05))",
          border: "1px solid rgba(205,255,0,0.3)",
          color: "#cdff00",
        }}
      >
        {isLoading ? (
          <>
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Generating...
          </>
        ) : (
          <>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Generate Interview Kit
          </>
        )}
      </motion.button>

      {/* Full-screen Modal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto print:static print:overflow-visible"
            style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
          >
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.97 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-4xl mx-4 my-8 print:mx-0 print:my-0 print:max-w-none"
            >
              {/* Header */}
              <div className="rounded-t-2xl px-8 py-6 border border-white/[0.06] print:border-black/10"
                   style={{ background: "linear-gradient(135deg, rgba(205,255,0,0.08), rgba(255,255,255,0.03))" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white print:text-black"
                        style={{ fontFamily: "var(--font-syne)" }}>
                      Interview Kit
                    </h2>
                    <p className="text-sm text-slate-400 mt-1 print:text-gray-600">
                      Prepared for: <span className="text-white print:text-black font-medium">{candidateName}</span>
                      {interviewKit && (
                        <span className="ml-3 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          ✓ Kit Ready
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 print:hidden">
                    <button
                      onClick={handlePrint}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-white/10 rounded-lg hover:bg-white/20 border border-white/10 cursor-pointer flex items-center gap-1.5 transition-colors"
                    >
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Print
                    </button>
                    <button
                      onClick={() => setIsOpen(false)}
                      className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer border border-white/[0.06]"
                    >
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mt-4 print:hidden">
                  <button
                    onClick={() => setActiveTab("auto")}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      activeTab === "auto"
                        ? "bg-[#cdff00]/15 text-[#cdff00] border border-[#cdff00]/30"
                        : "bg-white/5 text-slate-400 border border-white/[0.06] hover:bg-white/10"
                    }`}
                  >
                    🎯 Auto-Generated ({displayQuestions.length})
                  </button>
                  <button
                    onClick={generateAIKit}
                    disabled={isLoading}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                      activeTab === "ai"
                        ? "bg-purple-500/15 text-purple-400 border border-purple-500/30"
                        : "bg-white/5 text-slate-400 border border-white/[0.06] hover:bg-white/10"
                    } disabled:opacity-50`}
                  >
                    {isLoading ? (
                      <>
                        <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Generating...
                      </>
                    ) : (
                      <>🤖 AI Deep-Dive {interviewKit ? "✓" : ""}</>
                    )}
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="rounded-b-2xl border border-t-0 border-white/[0.06] p-6 space-y-4 print:border-black/10"
                   style={{ background: "rgba(5,5,5,0.95)" }}>

                {error && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
                    ⚠️ {error}
                  </div>
                )}

                {/* Auto-Generated Questions Tab */}
                {activeTab === "auto" && (
                  <div className="space-y-3">
                    {displayQuestions.length === 0 ? (
                      <div className="text-center py-12 text-slate-500">
                        <p className="text-lg mb-2">No auto-generated questions</p>
                        <p className="text-sm">No specific red flags or weak dimensions detected. Try the AI deep-dive instead.</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-slate-500 mb-4">
                          These questions are auto-generated from detected red flags and score weaknesses — zero AI cost.
                        </p>
                        {displayQuestions.map((q, i) => {
                          const sev = SEVERITY_CONFIG[q.severity || "MEDIUM"] || SEVERITY_CONFIG["MEDIUM"];
                          const icon = CATEGORY_ICONS[q.category] || "❓";
                          return (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.06 }}
                              className={`p-5 rounded-xl border ${sev.border} ${sev.bg} print:border-gray-300 print:bg-white`}
                            >
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-sm">{icon}</span>
                                <span className={`text-[10px] uppercase tracking-widest font-bold ${sev.text} print:text-gray-600`}>
                                  {q.category}
                                </span>
                                <span className="text-[9px] text-slate-600 ml-auto print:text-gray-400">
                                  {sev.icon} {q.severity}
                                </span>
                              </div>
                              <p className="text-sm text-white font-medium leading-relaxed mb-3 print:text-black">
                                {q.question}
                              </p>
                              {q.good_answer && (
                                <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.05] print:bg-gray-50 print:border-gray-200">
                                  <span className="text-[9px] uppercase tracking-widest text-emerald-500 font-bold block mb-1">
                                    ✓ What a good answer looks like
                                  </span>
                                  <p className="text-xs text-slate-400 leading-relaxed print:text-gray-600">
                                    {q.good_answer}
                                  </p>
                                </div>
                              )}
                              {q.triggered_by && (
                                <p className="text-[10px] text-slate-600 mt-2 print:text-gray-400">
                                  Triggered by: {q.triggered_by}
                                </p>
                              )}
                            </motion.div>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}

                {/* AI Deep-Dive Tab — Loading */}
                {activeTab === "ai" && isLoading && (
                  <div style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", padding: "4rem 2rem", gap: "1rem"
                  }}>
                    <div style={{
                      width: 36, height: 36,
                      border: "2px solid rgba(168,85,247,0.3)",
                      borderTopColor: "#a855f7",
                      borderRadius: "50%",
                      animation: "devxray-spin 0.8s linear infinite"
                    }} />
                    <p style={{fontSize: 13, color: "rgba(255,255,255,0.5)", margin: 0}}>
                      Generating AI deep-dive interview kit...
                    </p>
                  </div>
                )}

                {/* AI Deep-Dive Tab — Rendered Kit */}
                {activeTab === "ai" && interviewKit && !isLoading && (
                  <div className="space-y-6">
                    <p className="text-xs text-slate-500 mb-2">
                      AI-generated comprehensive interview kit — role: <span className="text-purple-400 font-bold">{getCandidateRole(reportData)}</span>, difficulty: <span className="text-purple-400 font-bold">{getDifficulty(reportData)}</span>
                    </p>

                    {/* Overall Interview Strategy */}
                    {interviewKit.overall_interview_strategy && (
                      <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20">
                        <h4 className="text-sm font-bold text-purple-400 mb-2 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                          📋 Interview Strategy
                        </h4>
                        <p className="text-sm text-slate-300 leading-relaxed print:text-black">
                          {interviewKit.overall_interview_strategy}
                        </p>
                      </div>
                    )}

                    {/* Time Allocation */}
                    {interviewKit.time_allocation && (
                      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                        <h4 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          ⏱️ Time Allocation
                        </h4>
                        <div className="flex flex-wrap gap-3">
                          {Object.entries(interviewKit.time_allocation).map(([section, time]: [string, any]) => (
                            <div key={section} className="px-3 py-2 rounded-lg bg-white/5 border border-white/5">
                              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">{section.replace(/_/g, " ")}</span>
                              <span className="text-sm font-bold text-white">{time}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Opening Questions */}
                    {interviewKit.opening_questions?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold text-[#cdff00] mb-3 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#cdff00]" />
                          👋 Opening Questions
                        </h4>
                        {renderQAList(interviewKit.opening_questions, "yellow")}
                      </div>
                    )}

                    {/* Technical Deep Dives */}
                    {interviewKit.technical_deep_dives?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold text-cyan-400 mb-3 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                          🔬 Technical Deep Dives
                        </h4>
                        {renderQAList(interviewKit.technical_deep_dives, "cyan")}
                      </div>
                    )}

                    {/* Gap Probing Questions */}
                    {interviewKit.gap_probing_questions?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold text-amber-400 mb-3 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          🔍 Gap Probing Questions
                        </h4>
                        {renderQAList(interviewKit.gap_probing_questions, "amber")}
                      </div>
                    )}

                    {/* System Design Challenge */}
                    {interviewKit.system_design_challenge && (
                      <div className="p-4 rounded-xl bg-[#cdff00]/5 border border-[#cdff00]/20 print:border-gray-300 print:bg-white">
                        <h4 className="text-sm font-bold text-[#cdff00] mb-2 print:text-gray-800">🏗️ System Design Challenge</h4>
                        <p className="text-sm text-slate-300 leading-relaxed print:text-black mb-3">
                          {typeof interviewKit.system_design_challenge === "string"
                            ? interviewKit.system_design_challenge
                            : interviewKit.system_design_challenge.problem || JSON.stringify(interviewKit.system_design_challenge)}
                        </p>
                        {interviewKit.system_design_challenge.what_to_look_for && (
                          <div className="mt-2">
                            <span className="text-[10px] uppercase tracking-widest text-[#cdff00]/60 font-bold block mb-1.5">
                              What to look for:
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {interviewKit.system_design_challenge.what_to_look_for.map((item: string, i: number) => (
                                <span key={i} className="text-[11px] px-2 py-1 rounded-md bg-[#cdff00]/10 text-[#cdff00]/80 border border-[#cdff00]/15">
                                  {item}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {interviewKit.system_design_challenge.time_allocation && (
                          <p className="text-[10px] text-slate-500 mt-2">
                            ⏱️ Suggested time: {interviewKit.system_design_challenge.time_allocation}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Culture Fit Questions */}
                    {interviewKit.culture_fit_questions?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold text-emerald-400 mb-3 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          🤝 Culture Fit
                        </h4>
                        {renderQAList(interviewKit.culture_fit_questions, "emerald")}
                      </div>
                    )}

                    {/* Coding Challenge */}
                    {interviewKit.coding_challenge && (
                      <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/20 print:border-gray-300 print:bg-white">
                        <h4 className="text-sm font-bold text-indigo-400 mb-2 print:text-gray-800">💻 Coding Challenge</h4>
                        <p className="text-sm text-slate-300 leading-relaxed print:text-black">
                          {typeof interviewKit.coding_challenge === "string"
                            ? interviewKit.coding_challenge
                            : interviewKit.coding_challenge.problem || JSON.stringify(interviewKit.coding_challenge)}
                        </p>
                        {interviewKit.coding_challenge.difficulty && (
                          <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 uppercase tracking-wider font-bold">
                            {interviewKit.coding_challenge.difficulty}
                          </span>
                        )}
                        {interviewKit.coding_challenge.what_it_tests && (
                          <p className="text-[11px] text-slate-500 mt-2">
                            Tests: {interviewKit.coding_challenge.what_it_tests}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Closing Questions */}
                    {interviewKit.closing_questions?.length > 0 && (
                      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                        <h4 className="text-sm font-bold text-slate-300 mb-2">🎤 Closing — Questions the candidate should ask</h4>
                        <ul className="space-y-1.5">
                          {interviewKit.closing_questions.map((q: any, i: number) => (
                            <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                              <span className="text-slate-600 mt-0.5">•</span>
                              {typeof q === "string" ? q : q.question || JSON.stringify(q)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Fallback: if the kit has a flat "questions" dict (legacy format) */}
                    {interviewKit.questions && typeof interviewKit.questions === "object" && !interviewKit.technical_deep_dives && (
                      <>
                        {Object.entries(interviewKit.questions).map(([category, items]: [string, any], idx) => (
                          <div key={category} className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20 print:border-gray-300 print:bg-white">
                            <h4 className="text-sm font-bold text-purple-400 mb-3 flex items-center gap-2 print:text-gray-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                              {category}
                            </h4>
                            <div className="space-y-2.5">
                              {(Array.isArray(items) ? items : [items]).map((q: any, j: number) => (
                                <div key={j} className="flex items-start gap-3">
                                  <span className="text-slate-600 text-xs mt-0.5 font-mono">{j + 1}.</span>
                                  <p className="text-sm text-slate-300 leading-relaxed print:text-black">
                                    {typeof q === "string" ? q : q.question || q.text || JSON.stringify(q)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* Spin animation for the loading spinner */
const spinStyle = typeof document !== 'undefined' ? (() => {
  const id = 'devxray-spin-keyframes';
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = '@keyframes devxray-spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }
  return null;
})() : null;
