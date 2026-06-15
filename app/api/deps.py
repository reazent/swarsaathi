"""Request-scoped helpers for identity and tier.

Today there is no auth: a client is identified by an `X-Client-Id` header that
the frontend generates and stores locally. Tier resolution is a stub that reads
a manual Pro allow-list (and, in dev, an `X-Shruti-Tier` override for testing).

When auth + billing land, replace `resolve_tier()` with a lookup that maps the
authenticated user -> entitlement synced from RevenueCat/Stripe webhooks. The
call sites in routes.py won't change.
"""

from __future__ import annotations

from fastapi import Request

from app.config import settings
from app.services.entitlements import FREE, PRO


def get_client_id(request: Request) -> str:
    """Stable per-device id from the frontend, falling back to the peer IP."""
    cid = request.headers.get("X-Client-Id", "").strip()
    if cid:
        return cid[:128]
    host = request.client.host if request.client else "anon"
    return f"ip:{host}"


def resolve_tier(request: Request, client_id: str) -> str:
    # Dev-only override so the UI can be exercised in both states.
    if settings.is_dev:
        override = request.headers.get("X-Shruti-Tier", "").strip().lower()
        if override in (FREE, PRO):
            return override
    # Manual grants until billing is wired.
    if client_id in settings.pro_client_id_set:
        return PRO
    return FREE
