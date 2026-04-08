"""
Username Variants Generator — Multi-Source Platform Lookup.

Generates plausible username variations from available user data
(name, email, GitHub handle, bio) for cross-platform lookups
on StackOverflow, npm, PyPI, LeetCode, Dev.to, etc.

Usage:
    from utils.username_variants import generate_username_variants
    variants = generate_username_variants(
        github_username="sahil24302021",
        name="Sahil Kumar",
        email="sahil.kumar.work@gmail.com",
        bio="@sahildev on Twitter"
    )
    # → ['sahil24302021', 'sahilkumar', 'sahil-kumar', 'sahil.kumar.work',
    #    'sahildev', 'sahil_kumar', 'sahil', 'sahilk']
"""
import re
from typing import List, Optional


def generate_username_variants(
    github_username: str = "",
    name: str = "",
    email: str = "",
    bio: str = "",
    max_variants: int = 8,
) -> List[str]:
    """
    Generate ordered username variants for multi-platform lookups.

    Priority order:
    1. GitHub username as-is (most likely match)
    2. GitHub username with numbers stripped
    3. Email prefix (before @)
    4. Name combinations (first.last, firstlast, first-last)
    5. Bio social handles (@mentions)
    6. First name only, first + last initial

    Returns de-duplicated list of max_variants strings.
    """
    candidates: List[str] = []

    # ── 1. GitHub username as-is ──
    if github_username:
        candidates.append(github_username.strip().lower())

        # Strip trailing numbers (sahil24302021 → sahil)
        stripped = re.sub(r'\d+$', '', github_username).strip().lower()
        if stripped and stripped != github_username.lower() and len(stripped) >= 3:
            candidates.append(stripped)

        # Strip leading/trailing underscores and hyphens
        clean = github_username.strip("-_").lower()
        if clean and clean != github_username.lower():
            candidates.append(clean)

    # ── 2. Email prefix ──
    if email and "@" in email:
        prefix = email.split("@")[0].lower().strip()
        if prefix and len(prefix) >= 3:
            candidates.append(prefix)
            # Also try without dots/numbers (sahil.kumar.work → sahilkumarwork, sahilkumar)
            no_dots = prefix.replace(".", "")
            if no_dots != prefix:
                candidates.append(no_dots)
            no_nums = re.sub(r'\d+', '', prefix).replace(".", "")
            if no_nums and no_nums not in (prefix, no_dots) and len(no_nums) >= 3:
                candidates.append(no_nums)

    # ── 3. Name combinations ──
    if name:
        parts = name.strip().lower().split()
        if len(parts) >= 2:
            first, last = parts[0], parts[-1]
            candidates.extend([
                f"{first}{last}",       # sahilkumar
                f"{first}-{last}",      # sahil-kumar
                f"{first}_{last}",      # sahil_kumar
                f"{first}.{last}",      # sahil.kumar
                f"{first}{last[0]}",    # sahilk
            ])
        if len(parts) >= 1:
            candidates.append(parts[0])  # sahil

    # ── 4. Bio social handles ──
    if bio:
        # Look for @handles in bio text
        handles = re.findall(r'@(\w{3,30})', bio)
        for h in handles:
            h_lower = h.lower()
            # Skip common non-username handles
            if h_lower not in ("gmail", "email", "twitter", "github", "linkedin"):
                candidates.append(h_lower)

        # Look for explicit platform mentions
        platform_patterns = [
            r'twitter\.com/(\w+)',
            r'dev\.to/(\w+)',
            r'leetcode\.com/(\w+)',
            r'stackoverflow\.com/users/\d+/(\w+)',
            r'npmjs\.com/~(\w+)',
        ]
        for pat in platform_patterns:
            m = re.search(pat, bio, re.I)
            if m:
                candidates.append(m.group(1).lower())

    # ── De-duplicate while preserving order ──
    seen = set()
    unique: List[str] = []
    for c in candidates:
        c = c.strip().lower()
        if c and c not in seen and len(c) >= 2:
            seen.add(c)
            unique.append(c)
            if len(unique) >= max_variants:
                break

    return unique
