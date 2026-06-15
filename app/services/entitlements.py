"""Tier definitions and feature entitlements.

Single source of truth for what each tier can do. The API gates features
against this; the frontend reads it from `/api/v1/me` to show/lock UI.

Strategy (see docs/MONETIZATION-AND-INFRA.md): be generous with zero-marginal-
cost features (Riyaz runs on-device; Discover is cheap), meter the expensive one
(fresh pitch analysis = compute + licensed-audio cost). A computed Sa is cached
forever, so cached lookups stay free for everyone.

As new products are added, extend the entitlement keys here and gate in one place.
"""

from __future__ import annotations

from app.config import settings

FREE = "free"
PRO = "pro"
TIERS = (FREE, PRO)


def entitlements_for(tier: str) -> dict:
    """Return the full entitlement set for a tier (JSON-serialisable)."""
    pro = tier == PRO
    return {
        "tier": PRO if pro else FREE,
        # Pitch Finder
        "fresh_analyses_per_day": None if pro else settings.free_daily_analyses,  # None = unlimited
        "upload_analysis": pro,          # "analyze your own recording"
        "pitch_details": pro,            # alternate Sa, transpose, harmonium settings
        # Discover
        "saved_lists": pro,              # save/export smart lists
        # Riyaz (core is free for everyone; advanced is Pro)
        "riyaz_core": True,
        "riyaz_recording": pro,          # session record + playback
        "riyaz_drills": pro,             # target-swara drills + scoring
        "riyaz_progress": pro,           # progress tracking over time
        "drone_styles": ["basic", "tanpura", "shruti-box"] if pro else ["basic"],
        # General
        "ads": not pro,
        "offline": pro,
    }


def is_pro(tier: str) -> bool:
    return tier == PRO
