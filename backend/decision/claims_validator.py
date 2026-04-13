
import json
from datetime import datetime, timezone
from typing import Dict, Any, List

from services.gemini_client import generate_json


def _get_today_str() -> str:
    return datetime.now(timezone.utc).strftime("%B %d, %Y")


def _compute_account_age_plain(account_created: str) -> str:
    """Returns plain-English account age for LLM context."""
    if not account_created:
        return "Account creation date: unknown"
    try:
        created_dt = datetime.fromisoformat(account_created.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        days = (now - created_dt).days
        if days < 0:
            return f"WARNING: account created {abs(days)} days in the future — possible data integrity issue."
        if days < 30:
            return f"Account is {days} days old — very new."
        if days < 365:
            return f"Account is {round(float(days)/30.4, 1)} months old — recently created."
        return f"Account is {round(float(days)/365.25, 1)} years old ({days} days ago as of today {_get_today_str()})."
    except Exception:
        return f"Account creation date: {account_created}"


def _extract_repos_for_llm(github_data: dict) -> List[Dict]:
    """
    Extract the actual repo list from the github report regardless of
    which key structure the report uses.

    The report_generator may store repos under different keys depending on version.
    This function tries all known locations.
    """
    repos: List[Dict[str, Any]] = []

    # Try the direct repos list (most reliable)
    if github_data.get("repos"):
        r = github_data.get("repos")
        if isinstance(r, list): repos = r
    # Try top_repos (legacy)
    elif github_data.get("top_repos"):
        r = github_data.get("top_repos")
        if isinstance(r, list): repos = r
    # Try inside projects
    elif github_data.get("projects"):
        # projects have repo names we can use
        for p in github_data["projects"][:8]:
            if p.get("repo_name") or p.get("name"):
                repos.append({
                    "name": p.get("repo_name") or p.get("name"),
                    "description": p.get("description", ""),
                    "language": p.get("primary_language", ""),
                    "stars": p.get("stars", 0),
                })
    # Try repo_data keys from deep_data embedded in the report
    elif github_data.get("repo_data"):
        for repo_name in github_data["repo_data"].keys():
            repos.append({"name": repo_name})

    # Also try repo_context string that was injected into the report
    if not repos and github_data.get("repo_context"):
        # Parse the repo_context string to extract repo names
        import re as _re
        context_str = github_data["repo_context"]
        # Pattern: "  1. RepoName | Python | ⭐0 | ..."
        found = _re.findall(r'\d+\.\s+(\S+)\s+\|', context_str)
        for name in found[:10]:
            repos.append({"name": name})

    # Build clean LLM-friendly list
    clean: List[Dict[str, Any]] = []
    safe_repos = repos if isinstance(repos, list) else []
    for repo in safe_repos[:10]:
        if not repo:
            continue
        name = repo.get("name") or repo.get("full_name", "")
        if not name:
            continue
        clean.append({
            "name": name,
            "description": (repo.get("description") or "")[:120],
            "language": repo.get("language") or repo.get("primary_language", ""),
            "stars": repo.get("stars", repo.get("stargazers_count", 0)),
            "updated": (repo.get("updated_at") or repo.get("pushed_at") or "")[:10],
        })

    return clean


def _build_skills_context(github_data: dict) -> Dict:
    """Extract verified skills in a clean format for the prompt."""
    # Try multiple known structures — use ALL skills, not just top_skills
    all_skills = github_data.get("skills", [])
    if isinstance(all_skills, dict):
        all_skills = all_skills.get("skills", [])

    # Also get top_skills as a separate list
    top_skills = github_data.get("top_skills", [])
    verified_skills = github_data.get("verified_skills", [])

    # Merge: use all skills detected (even score < 3.0) for the matrix
    combined = all_skills or top_skills or verified_skills

    skill_names = []
    for s in combined:
        if isinstance(s, dict):
            name = s.get("skill_name") or s.get("name") or s.get("skill", "")
            score = s.get("skill_score") or s.get("score", 0)
            if name:
                skill_names.append(f"{name} ({score}/10)" if score else name)
        elif isinstance(s, str):
            skill_names.append(s)

    return {
        "verified_skills_list": skill_names,
        "total_verified": len(skill_names),
    }


async def validate_claims(
    resume_data: dict,
    github_data: dict,
    portfolio_text: str = ""
) -> dict:
    """
    Forensic cross-reference of resume claims against verified GitHub data.
    Returns authenticity scoring, per-claim validation, and red flags.
    """
    today = _get_today_str()
    claims = resume_data.get("claims", [])

    # If claims are empty, auto-generate them from projects and skills
    if not claims:
        projects = resume_data.get("projects", [])
        skills = resume_data.get("technical_skills", {})

        auto_claims = []
        for proj in projects[:5]:
            name = proj.get("name", "")
            desc = proj.get("description", "")
            techs = proj.get("technologies", [])
            if name and desc:
                auto_claims.append(f"Built {name}: {desc}")
            if techs:
                auto_claims.append(f"Used {', '.join(techs[:4])} in {name or 'a project'}")

        # Add skill claims
        all_skills: list = []
        if isinstance(skills, dict):
            for v in skills.values():
                if isinstance(v, list):
                    all_skills.extend(v[:3])
        if all_skills:
            auto_claims.append(f"Proficient in: {', '.join(all_skills[:6])}")

        claims = auto_claims
        if claims:
            print(f"[ClaimsValidator] Auto-generated {len(claims)} claims from projects/skills")

    if not claims:
        # Truly nothing to validate
        return {
            "authenticity_score": 50,
            "overall_assessment": "No verifiable claims found. GitHub data used for baseline assessment.",
            "validations": [],
            "red_flags": ["No specific technical claims found in resume to cross-reference"],
            "strengths_confirmed": [],
            "hiring_recommendation": "MAYBE — Insufficient resume detail for automated verification"
        }

    # ── Build account age context ──
    account_created = github_data.get("created_at", "")
    age_plain = _compute_account_age_plain(account_created)

    # ── Extract actual repos (fixes "top_repos empty" bug) ──
    actual_repos = _extract_repos_for_llm(github_data)
    repo_count = len(actual_repos)

    # ── Extract verified skills ──
    skills_ctx = _build_skills_context(github_data)

    # ── Build GitHub context with all real data ──
    github_context = {
        "username": github_data.get("username"),
        "public_repos_count": github_data.get("public_repos", repo_count),
        "followers": github_data.get("followers"),
        "total_stars": github_data.get("total_stars", 0),
        "account_created_raw": account_created,
        "account_age_explanation": age_plain,
        "top_languages": github_data.get("top_languages", []),
        "repositories": actual_repos,  # REAL repos, not empty list
        "repository_count_in_report": repo_count,
        "dip_score": github_data.get("final_score") or github_data.get("score"),
        "developer_tier": github_data.get("developer_tier"),
        "risk_level": github_data.get("risk_level"),
        "strengths": github_data.get("strengths", []),
        "weaknesses": github_data.get("weaknesses", []),
        "risk_flags": [
            f.get("flag") if isinstance(f, dict) else str(f)
            for f in github_data.get("risk_flags", [])
        ],
        "authenticity_score_raw": github_data.get("authenticity", {}).get("authenticity_score"),
        **skills_ctx,
        # Inject actual repo count so LLM knows the real scale
        "total_repos_on_profile": github_data.get("public_repos", repo_count),
        "note_for_validator": (
            f"This developer has {github_data.get('public_repos', repo_count)} total repos. "
            f"We deep-analyzed {repo_count} of them. The remaining repos may contain "
            f"additional skill evidence not visible here. Do NOT penalize for repos we "
            f"couldn't analyze — absence of evidence is NOT evidence of absence."
        ),
    }

    resume_skills = resume_data.get("technical_skills", {})
    resume_projects = resume_data.get("projects", [])
    resume_experience = resume_data.get("work_experience", [])
    resume_education = resume_data.get("education", [])

    prompt = f"""You are an elite forensic technical auditor for a hiring intelligence platform.
Your job is to RIGOROUSLY but FAIRLY cross-reference a candidate's resume claims against their verified GitHub activity.

Think like a skeptical but fair hiring manager who wants the TRUTH — not a witch hunt.

=== CRITICAL DATE CONTEXT — READ THIS FIRST ===
TODAY IS: {today}
GitHub Account Created: {account_created}
Account Age: {age_plain}

IMPORTANT: The account creation date above is BEFORE today ({today}).
This is NOT a "future date" issue. Do NOT use the account creation date as a reason
to mark claims as unverifiable unless the age_explanation explicitly says "future."
A developer can have a 7-month-old account AND have real projects on it.
==================================================

=== RESUME CLAIMS TO VERIFY ===
{json.dumps(claims, indent=2)}

=== RESUME SKILLS CLAIMED ===
{json.dumps(resume_skills, indent=2)}

=== RESUME PROJECTS ===
{json.dumps(resume_projects, indent=2)}

=== RESUME EDUCATION ===
{json.dumps(resume_education, indent=2)}

=== VERIFIED GITHUB DATA ===
{json.dumps(github_context, indent=2)}

=== PORTFOLIO WEBSITE TEXT ===
\"\"\"{str(portfolio_text)[:3000] if portfolio_text else "Not available"}\"\"\"

=== CRITICAL VALIDATION RULES ===

STATUS DEFINITIONS (use these exactly):
- "SUPPORTED": GitHub repositories and/or skills data DIRECTLY confirms this claim.
  Use when: A matching repo exists, OR the skill is in the verified_skills_list.
- "PARTIALLY_SUPPORTED": Some evidence exists but not complete confirmation.
  Use when: Related repo exists but doesn't perfectly match, OR skill is adjacent to verified skills.
- "WEAK_SIGNAL": Plausible but no direct GitHub evidence found.
  Use when: Claim is consistent with overall profile but specific evidence is absent.
- "UNVERIFIABLE": Cannot verify due to missing data (private repos, LinkedIn blocked, etc.).
  This is NOT the same as "fake" — absence of evidence is not evidence of absence.
- "DISCREPANCY": Something in the GitHub data CONTRADICTS this claim.
  Use ONLY when there is a specific contradiction, not just lack of evidence.

SCORING RULES (start at 50 — neutral baseline):
- Each SUPPORTED claim: +6 to +10 points
- Each PARTIALLY_SUPPORTED: +3 to +5 points
- Each WEAK_SIGNAL: 0 (neutral)
- Each UNVERIFIABLE: -2 (slight uncertainty only)
- Each DISCREPANCY: -8 to -15 points (only when actively contradicted)
- Verified skills bonus: +2 per verified skill confirmed (max +20)
- Cap final score: 0-100

IMPORTANT: Do NOT mark a claim as DISCREPANCY just because you couldn't find the
specific project in the repository list. Only use DISCREPANCY when the evidence
ACTIVELY contradicts the claim (e.g., resume says 5 years experience but account
is 3 months old and has 2 repos).

=== GENERATE JSON OUTPUT ===
{{
    "authenticity_score": 75,
    "overall_assessment": "2-3 sentence factual summary of the candidate's credibility based on evidence",
    "validations": [
        {{
            "claim": "The exact claim text",
            "status": "SUPPORTED | PARTIALLY_SUPPORTED | WEAK_SIGNAL | UNVERIFIABLE | DISCREPANCY",
            "confidence": "High | Medium | Low",
            "reasoning": "1-2 sentence explanation citing SPECIFIC evidence from GitHub data",
            "evidence": "Specific repo name, skill score, or data point that supports or contradicts"
        }}
    ],
    "red_flags": [
        "Only list GENUINE concerns with specific evidence. Do not flag normal developer behavior."
    ],
    "strengths_confirmed": [
        "Specific verified strengths with evidence (e.g., 'React confirmed at 7.3/10 via code analysis')"
    ],
    "skill_match_analysis": {{
        "verified_skills": ["Skills confirmed by GitHub repo analysis"],
        "unverified_skills": ["Skills claimed but no code evidence (not necessarily fake)"],
        "hidden_skills": ["Skills found in GitHub that candidate didn't mention on resume"]
    }},
    "timeline_consistency": "Fair assessment. Note: a relatively new GitHub account does not invalidate real skills.",
    "hiring_recommendation": "HIRE / MAYBE / PASS — 1-sentence justification based on actual evidence"
}}
"""

    try:
        result = await generate_json(prompt, temperature=0)

        # Ensure required fields with safe defaults
        result.setdefault("authenticity_score", 50)
        result.setdefault("validations", [])
        result.setdefault("red_flags", [])
        result.setdefault("strengths_confirmed", [])
        result.setdefault("hiring_recommendation", "MAYBE — Manual review recommended")
        result.setdefault("overall_assessment", "")

        # Safety clamp on score
        raw_score = result.get("authenticity_score", 50)
        try:
            result["authenticity_score"] = max(0, min(100, int(raw_score)))
        except (TypeError, ValueError):
            result["authenticity_score"] = 50

        return result

    except Exception as e:
        error_msg = str(e).lower()
        print(f"[ClaimsValidator] AI unavailable ({e}), using rule-based fallback validator")
        # NEVER crash — always return a rule-based result so the report stays useful
        return _rule_based_validate(resume_data, github_data, portfolio_text)


def _rule_based_validate(
    resume_data: Dict[str, Any],
    github_data: Dict[str, Any],
    portfolio_text: str = "",
) -> Dict[str, Any]:
    """
    100% deterministic claims validator — NO AI needed.
    Runs even when Gemini is completely down.

    Logic:
    - For each resume claim: check if GitHub repos, skills, or code confirms it
    - Match by keyword overlap between claim text and repo names/descriptions/languages
    - Check if claimed technologies appear in verified GitHub skill scores
    """
    import re as _re

    claims = resume_data.get("claims", [])
    resume_projects = resume_data.get("projects", [])
    resume_skills = resume_data.get("technical_skills", {})

    # Build flat skill list from resume
    all_resume_skills: List[str] = []
    if isinstance(resume_skills, dict):
        for group in resume_skills.values():
            if isinstance(group, list):
                all_resume_skills.extend([s.lower() for s in group if isinstance(s, str)])
    elif isinstance(resume_skills, list):
        all_resume_skills = [s.lower() for s in resume_skills if isinstance(s, str)]

    # ── Skill alias map: resume skill name → DIP engine skill name variants ──
    # This is the UNIVERSAL fix. Resume says "Python", DIP says "Python (Backend)".
    # Without this map, Python always shows as UNVERIFIED even with 10 Python repos.
    SKILL_ALIASES: dict = {
        "python": ["python (backend)", "python automation", "data science",
                   "machine learning", "deep learning", "tensorflow", "opencv",
                   "streamlit", "mediapipe", "face recognition", "tensorflow / keras",
                   "langchain", "huggingface", "openai api", "python ai/ml"],
        "c":       ["c/c++"],
        "c++":     ["c/c++"],
        "java":    ["java"],
        "javascript": ["node.js"],
        "typescript": ["typescript", "next.js", "react"],
        "react":   ["react", "next.js"],
        "node.js": ["node.js"],
        "flask":   ["python (backend)", "fastapi", "django"],
        "numpy":   ["data science", "machine learning", "deep learning"],
        "pandas":  ["data science", "machine learning"],
        "opencv":  ["opencv", "mediapipe", "face recognition", "computer vision"],
        "machine learning": ["machine learning", "deep learning", "tensorflow", "tensorflow / keras",
                              "huggingface", "scikit-learn", "data science", "python ai/ml"],
        "nlp basics": ["machine learning", "deep learning", "huggingface", "openai api"],
        "vite":    ["react", "next.js", "typescript", "tailwind css"],
        "tailwind css": ["tailwind css"],
        "postgresql": ["sql/databases", "node.js"],
        "mongodb": ["mongodb", "node.js"],
        "git":     [],   # git is a tool; never show as unverified
        "rest apis": ["node.js", "python (backend)", "fastapi"],
        "automation": ["python automation"],
        "system design basics": ["sql/databases", "node.js"],
    }

    # Skills that should NEVER appear in hidden_skills (they're labels, not technologies)
    HIDDEN_SKILL_BLOCKLIST = {
        "telegram bot", "python automation", "python (backend)", "python (frontend)",
        "machine learning", "deep learning", "data science", "sql/databases",
        "testing", "security", "ci/cd", "c/c++", "tensorflow / keras",
        "face recognition", "mediapipe", "huggingface", "openai api",
        "langchain", "python ai/ml",
        # Skills with no file evidence — DIP false positives
        "flutter",        # No .dart files anywhere in profile
        "rabbitmq",       # No pika usage anywhere
        "kafka",          # No kafka usage
        "grpc",           # No .proto files
        "kubernetes",     # No k8s YAML
        "terraform",      # No .tf files
        "swift/ios",      # No .swift files
        "react native",   # No React Native imports
        "angular",        # No @angular/core
    }

    def _is_skill_verified(resume_skill: str, v_names: set, r_langs: set) -> bool:
        """
        Universal skill verification check with alias expansion.
        Returns True if the resume skill is confirmed by GitHub data.
        """
        rs = resume_skill.lower().strip()
        # 0. Special language-based unconditional verification
        # TypeScript — if ANY repo has language: TypeScript, it's verified
        if rs in ("typescript", "ts") and "typescript" in r_langs:
            return True
        # Python — if ANY repo has language: Python, Python AND its libraries are verified
        if rs in ("python", "numpy", "pandas", "flask", "opencv", "nlp basics", "machine learning") and "python" in r_langs:
            return True
        # C/C++ — if any C/C++ repo exists, "C" on resume is verified
        if rs in ("c", "c++") and ("c++" in r_langs or "c" in r_langs):
            return True
        # 1. Direct match against DIP-detected skill names
        if rs in v_names:
            return True
        # 2. Repo primary language match (Python, TypeScript, C++, HTML…)
        if rs in r_langs:
            return True
        # 3. Common language normalizations
        _lang_norm = {
            "python": "python", "typescript": "typescript",
            "javascript": "javascript", "c": "c++", "c++": "c++",
            "java": "java", "html": "html", "css": "css",
            "rust": "rust", "go": "go", "ruby": "ruby", "swift": "swift",
        }
        if rs in _lang_norm and _lang_norm[rs] in r_langs:
            return True
        # 4. Alias expansion
        for alias in SKILL_ALIASES.get(rs, []):
            if alias in v_names:
                return True
        # 5. Partial / substring match (catches "flask" ↔ "python (backend)")
        for vname in v_names:
            if rs in vname or vname.startswith(rs):
                return True
        return False

    # Extract GitHub verified skills
    repos = _extract_repos_for_llm(github_data)
    skills_ctx = _build_skills_context(github_data)
    verified_skills_raw = skills_ctx.get("verified_skills_list", [])
    verified_skill_names = set()
    for vs in verified_skills_raw:
        name = vs.split("(")[0].strip().lower() if isinstance(vs, str) else ""
        if name:
            verified_skill_names.add(name)

    # Also pull language names from repos
    repo_languages = set()
    repo_names = set()
    repo_descriptions = ""
    for r in repos:
        lang = (r.get("language") or "").lower()
        if lang:
            repo_languages.add(lang)
        name = (r.get("name") or "").lower().replace("-", " ").replace("_", " ")
        if name:
            repo_names.add(name)
        desc = (r.get("description") or "").lower()
        repo_descriptions += " " + desc

    all_github_text = " ".join(repo_names) + " " + repo_descriptions + " " + " ".join(verified_skill_names) + " " + " ".join(repo_languages)

    # Semantic project-to-repo keyword map
    # Maps keywords in resume claim text → GitHub repo name fragments
    PROJECT_KEYWORD_MAP = {
        "jarvis":          ["telegram", "bot", "agent", "assistant", "automation"],
        "telegram":        ["telegram", "bot"],
        "hand gesture":    ["gesture", "hand", "controller", "opencv", "mediapipe"],
        "gesture":         ["gesture", "hand", "controller"],
        "emotion":         ["gesture", "emotion", "face", "opencv"],
        "image recogni":   ["image", "recognition", "tensorflow", "cnn"],
        "price alert":     ["price", "alert", "bot", "scraper"],
        "code review":     ["code", "review", "reviwer", "reviewer"],
        "productivity":    ["productivity", "dashboard", "task", "kanban"],
        "fitness":         ["fitness", "attendance", "tracker"],
        "gpt":             ["gpt", "ai", "assistant", "llm"],
        "llm":             ["code", "review", "ai", "gpt", "agent"],
        "web browsing":    ["telegram", "bot", "agent", "automation"],
        "file management": ["telegram", "bot", "agent", "automation"],
        "task automation": ["telegram", "bot", "agent", "automation"],
        "deep learning":   ["gesture", "image", "recognition", "hand", "face"],
        "computer vision": ["gesture", "image", "recognition", "hand", "opencv"],
        "openCV":          ["gesture", "image", "recognition", "hand"],
        "saas":            ["code", "review", "reviwer", "dashboard"],
    }

    # Build validations
    validations = []
    supported = 0
    partial = 0
    weak = 0
    discrepancy = 0

    for claim in claims[:20]:
        if not claim or not isinstance(claim, str):
            continue
        claim_lower = claim.lower()

        # Extract keywords from claim (ignore stopwords)
        stopwords = {"a", "an", "the", "and", "or", "for", "with", "to", "in", "of", "on",
                     "by", "is", "was", "are", "were", "be", "been", "have", "has", "had",
                     "using", "used", "built", "created", "developed", "implemented", "designed",
                     "integrated", "added", "include", "that", "this", "which", "their", "its"}
        words = _re.findall(r'\b[a-z][a-z0-9+#.]{2,}\b', claim_lower)
        keywords = [w for w in words if w not in stopwords]

        if not keywords:
            continue

        # Count matches in GitHub data
        matches = sum(1 for kw in keywords if kw in all_github_text)
        match_ratio = matches / len(keywords) if keywords else 0

        # Check skill overlap directly
        skill_match = any(kw in verified_skill_names or kw in repo_languages for kw in keywords)

        # ── Semantic project matching boost ──
        # If claim mentions a known project type, check if a matching repo exists
        semantic_boost = False
        for proj_kw, repo_hints in PROJECT_KEYWORD_MAP.items():
            if proj_kw in claim_lower:
                repo_list = list(repo_names)
                repo_desc_text = repo_descriptions
                if any(hint in rn for hint in repo_hints for rn in repo_list):
                    semantic_boost = True
                    break
                if any(hint in repo_desc_text for hint in repo_hints):
                    semantic_boost = True
                    break

        # Determine status
        if match_ratio >= 0.4 or skill_match or semantic_boost:
            status = "SUPPORTED"
            confidence = "High" if (match_ratio >= 0.5 or skill_match) else "Medium"
            matched_skills = [kw for kw in keywords if kw in verified_skill_names or kw in repo_languages]
            matched_repo_list = [r["name"] for r in repos if any(
                kw in r.get("name", "").lower() or kw in r.get("description", "").lower()
                for kw in keywords
            )]
            evidence = ""
            if matched_skills:
                evidence += f"Verified skill(s): {', '.join(matched_skills[:3])}. "
            if matched_repo_list:
                evidence += f"Related repo(s): {', '.join(matched_repo_list[:2])}."
            if semantic_boost and not evidence:
                evidence = "Matched via semantic project type analysis."
            reasoning = f"Keywords from this claim ({', '.join(keywords[:4])}) appear in verified GitHub data."
            supported += 1

        elif match_ratio >= 0.15:
            status = "PARTIALLY_SUPPORTED"
            confidence = "Medium"
            evidence = f"Partial keyword overlap with GitHub data ({int(match_ratio*100)}% match)."
            reasoning = "Some evidence found but not a complete match."
            partial += 1

        elif not repos:
            status = "UNVERIFIABLE"
            confidence = "Low"
            evidence = "No GitHub data available to cross-reference."
            reasoning = "Cannot verify — GitHub data was not fetched."
            weak += 1

        else:
            status = "WEAK_SIGNAL"
            confidence = "Low"
            evidence = "Claim keywords not found in analyzed GitHub repos or skill data."
            reasoning = "May be in private repos, or skill used in work not reflected on GitHub."
            weak += 1

        validations.append({
            "claim": claim,
            "status": status,
            "confidence": confidence,
            "reasoning": reasoning,
            "evidence": evidence,
        })

    # Compute authenticity score (weighted formula, capped at 95 for rule-based)
    total = len(validations)
    if total == 0:
        auth_score = 50
    else:
        weighted = (supported * 3 + partial * 1.5 + weak * 0.5) / (total * 3)
        # Scale to 40-95 range (never 100 from rule-based, that's AI's job)
        auth_score = int(min(95, max(40, weighted * 100)))

    # Strengths: verified skills that appear on resume
    confirmed_strengths = []
    for vs in verified_skills_raw[:8]:
        name = vs.split("(")[0].strip()
        if name.lower() in all_resume_skills or any(name.lower() in c.lower() for c in claims):
            confirmed_strengths.append(f"{vs} — confirmed via code analysis")

    # Red flags
    red_flags = []
    if discrepancy > 0:
        red_flags.append(f"{discrepancy} claim(s) appear to contradict GitHub evidence.")
    if total > 0 and supported / total < 0.2:
        red_flags.append("Low claim verification rate — many skills/projects not reflected on GitHub. Could be private repos.")
    if not repos:
        red_flags.append("No GitHub repositories found — cannot verify technical claims.")

    overall = (
        f"Rule-based verification: {supported}/{total} claims supported, "
        f"{partial} partially supported, {weak} weak signal. "
        f"Authenticity score: {auth_score}/100. "
        f"Note: AI verification unavailable — this is deterministic cross-referencing."
    )

    # ── Rebuild skill matrix with alias-aware verification ──
    # "Verified" = skill on resume AND confirmed by GitHub (repo language or DIP engine)
    # "Unverified" = skill on resume but NO evidence in GitHub at all
    # "Hidden" = skill detected by DIP in GitHub but NOT on resume (real technologies only)
    matrix_verified = []
    matrix_unverified = []
    for rs in all_resume_skills:
        if not rs:
            continue
        # Never mark git/tools as unverified — they're always present implicitly
        always_verified = {"git", "rest apis", "system design basics", "automation"}
        if rs in always_verified:
            matrix_verified.append(rs)
        elif _is_skill_verified(rs, verified_skill_names, repo_languages):
            matrix_verified.append(rs)
        else:
            matrix_unverified.append(rs)

    # Hidden = in DIP engine but not on resume, filtered to real tech names only
    hidden_clean = []
    for vs in verified_skills_raw:
        skill_display = vs.split("(")[0].strip()
        skill_lower = skill_display.lower()
        if (skill_lower not in all_resume_skills
                and skill_lower not in HIDDEN_SKILL_BLOCKLIST
                and len(skill_display) > 1
                and not _is_skill_verified(skill_lower, set(s.lower() for s in matrix_verified), set())):
            hidden_clean.append(skill_display)

    return {
        "authenticity_score": auth_score,
        "overall_assessment": overall,
        "validations": validations,
        "red_flags": red_flags,
        "strengths_confirmed": confirmed_strengths,
        "skill_match_analysis": {
            "verified_skills": matrix_verified,
            "unverified_skills": matrix_unverified,
            "hidden_skills": hidden_clean[:6],
        },
        "timeline_consistency": (
            "Profile age consistent with stated experience." if repos
            else "Cannot assess timeline — no GitHub data."
        ),
        "hiring_recommendation": (
            f"{'HIRE' if auth_score >= 65 else 'MAYBE'} — "
            f"Rule-based analysis: {supported} claims verified, authenticity {auth_score}/100. "
            f"AI review pending."
        ),
        "_validated_by": "rule_based_fallback",
    }