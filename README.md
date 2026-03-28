# DevXray AI — GitHub Developer Intelligence Platform

> Analyze GitHub profiles instantly. No resumes. No guesswork. Just signal.

DevXray is a full-stack SaaS platform that provides **forensic-grade developer analysis** by deep-scanning GitHub profiles, detecting AI-generated code, verifying resume claims against actual code, and producing production-ready hiring intelligence reports.

## Architecture

```
devsignal/
├── app/                          # Next.js 16 App Router (Frontend)
│   ├── (dashboard)/              # Protected dashboard pages
│   │   ├── dashboard/            #   → Main overview + GitHub scanner
│   │   ├── bulk-upload/          #   → Batch resume analysis (up to 100)
│   │   ├── candidates/           #   → Saved candidate database
│   │   ├── compare/              #   → Side-by-side dual comparison
│   │   ├── how-we-score/         #   → Scoring methodology docs
│   │   ├── settings/             #   → Account & preferences
│   │   └── layout.tsx            #   → Dashboard shell + sidebar
│   ├── report/                   # Public report pages
│   │   ├── [username]/           #   → Dynamic GitHub report
│   │   └── resume/               #   → Resume analysis report
│   ├── about/                    # Marketing — About page
│   ├── pricing/                  # Marketing — Pricing page
│   ├── signin/ & signup/         # Auth pages (Clerk)
│   ├── globals.css               # Design system (tokens, components)
│   ├── layout.tsx                # Root layout (fonts, ClerkProvider)
│   └── page.tsx                  # Landing page
│
├── components/                   # Reusable React components
│   ├── layout/
│   │   └── DashboardSidebar.tsx  # Collapsible sidebar with Clerk auth
│   └── report/                   # 20+ report visualization components
│       ├── ScoreRadar.tsx        #   → Radar chart (6 dimensions)
│       ├── VerdictSection.tsx    #   → Hire/No-Hire verdict card
│       ├── VerifiedSkills.tsx    #   → Code-verified skill badges
│       ├── AuthenticityScanner.tsx  → Anti-cheat visualization
│       └── ...                   #   → 16 more report components
│
├── lib/                          # Shared utilities & API client
│   ├── api.ts                    # Backend API client (SSE + REST)
│   ├── candidates-store.ts       # Persistence layer (Supabase/localStorage)
│   ├── db.ts                     # Supabase client with graceful fallback
│   ├── types.ts                  # TypeScript interfaces
│   └── utils.ts                  # Shared helpers
│
├── backend/                      # FastAPI Backend (Python)
│   ├── main.py                   # API routes + SSE streaming endpoints
│   ├── orchestrator/             # Analysis pipeline orchestration
│   │   ├── orchestrator.py       #   → 9-step analysis pipeline
│   │   └── report_generator.py   #   → Report assembly + normalization
│   ├── ingestion/                # Data fetchers
│   │   ├── github_fetcher.py     #   → GitHub API (repos, commits, trees)
│   │   ├── token_pool.py         #   → Multi-token round-robin rotation
│   │   ├── resume_parser.py      #   → PDF/DOCX → structured data (Gemini)
│   │   ├── stackoverflow_fetcher.py  → SO activity scoring
│   │   ├── leetcode_fetcher.py   #   → LeetCode profile fetcher
│   │   └── devto_fetcher.py      #   → Dev.to article fetcher
│   ├── intelligence/             # AI/ML analysis engines
│   │   ├── authenticity_engine.py  → Anti-cheat (12 heuristics)
│   │   ├── skill_engine.py       #   → Code-verified skill detection
│   │   ├── consistency_engine.py #   → Activity pattern analysis
│   │   └── system_design_detector.py → Architecture detection
│   ├── engines/                  # Core analysis engines
│   │   ├── truth_engine.py       #   → Resume claim verification
│   │   ├── growth_engine.py      #   → Developer trajectory analysis
│   │   └── ai_detection_engine.py  → AI code detection
│   ├── scoring/                  # Final scoring & benchmarking
│   │   ├── scoring_engine.py     #   → Weighted score computation
│   │   └── explainability_engine.py → Score breakdown traces
│   ├── processing/               # Code analysis tools
│   │   ├── code_analyzer.py      #   → AST analysis, dependency extraction
│   │   ├── project_weighting_engine.py → Code intelligence metrics
│   │   └── repo_analyzer.py      #   → Project/CI/test detection
│   ├── services/                 # External service integrations
│   │   ├── gemini_client.py      #   → Google Gemini AI client
│   │   ├── ai_summary.py        #   → AI-powered report summaries
│   │   ├── web_scraper.py        #   → LinkedIn/Portfolio scraper
│   │   └── code_reviewer.py      #   → AI code review (pinned repos)
│   ├── contracts/                # Data validation schemas
│   ├── models/                   # Pydantic request/response models
│   ├── validation/               # Input data validators
│   ├── cache/                    # GitHub API response cache
│   ├── utils/                    # Logging, proof collection, etc.
│   └── tests/                    # Backend test suite
│
├── supabase/                     # Database
│   └── schema.sql                # Candidates table + RLS policies
│
├── scripts/                      # Developer tooling
│   ├── dev.sh                    # Start both servers (one command)
│   └── setup.sh                  # First-time project setup
│
├── public/                       # Static assets
│   └── favicon.ico
│
├── middleware.ts                  # Clerk auth route protection
├── docker-compose.yml            # Production container orchestration
├── Dockerfile                    # Frontend container (multi-stage)
├── .env.local.example            # Frontend env template
├── .env.example                  # Backend env template
└── .gitignore                    # Comprehensive ignore rules
```

## Quick Start

```bash
# 1. Clone & setup
git clone https://github.com/yourorg/devxray.git
cd devxray
chmod +x scripts/*.sh
./scripts/setup.sh

# 2. Configure environment
# Edit .env.local (Clerk keys, Supabase URL)
# Edit backend/.env (Gemini API key, GitHub tokens)

# 3. Run both servers
./scripts/dev.sh
```

**Frontend** → http://localhost:3000  
**Backend API** → http://localhost:8000  
**API Docs** → http://localhost:8000/docs

## Environment Variables

### Frontend (`.env.local`)
| Variable | Required | Description |
|:---|:---:|:---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Optional | Clerk auth (works without) |
| `CLERK_SECRET_KEY` | Optional | Clerk server-side auth |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | Supabase URL (falls back to localStorage) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | Supabase anon key |
| `NEXT_PUBLIC_API_URL` | Yes | Backend URL (default: `http://localhost:8000`) |

### Backend (`backend/.env`)
| Variable | Required | Description |
|:---|:---:|:---|
| `GEMINI_API_KEY` | **Yes** | Google Gemini (resume parsing + AI summary) |
| `GITHUB_TOKEN` | Recommended | Single GitHub PAT (5000 req/hr) |
| `GITHUB_TOKENS` | Recommended | Comma-separated PATs for rotation |
| `RAPIDAPI_KEY` | Optional | LinkedIn cross-reference |
| `SO_API_KEY` | Optional | Stack Overflow rate limits |

## Tech Stack

| Layer | Technology |
|:---|:---|
| Frontend | Next.js 16, React, TypeScript, Tailwind CSS, Framer Motion |
| Backend | Python 3.14, FastAPI, Uvicorn |
| AI/LLM | Google Gemini 2.0 Flash |
| Auth | Clerk (optional, graceful fallback) |
| Database | Supabase PostgreSQL (optional, localStorage fallback) |
| Code Analysis | Tree-sitter AST, Radon complexity metrics |
| Deployment | Docker, Docker Compose |

## Scoring Formula

```
Final Score = Σ(wᵢ × dimensionᵢ) - risk_penalties + bonuses

Dimensions (adaptive weights):
  0.30 × Code Quality      (AST analysis, complexity, structure)
  0.20 × Skill Depth       (verified tech stack depth)
  0.15 × Authenticity       (anti-cheat, commit patterns)
  0.15 × Consistency       (activity stability, streaks)
  0.10 × Growth            (tech evolution, complexity progression)
  0.10 × Truth Score       (resume claim verification — when available)
```

## License

Proprietary — All rights reserved.
