"""Validate Supabase access tokens for Sargam."""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.config import settings


@dataclass
class AuthUser:
    user_id: str
    email: str | None = None


class AuthError(Exception):
    pass


def user_from_access_token(token: str) -> AuthUser:
    base = settings.supabase_url.rstrip("/")
    anon = settings.supabase_anon_key or settings.supabase_service_key
    if not base or not anon:
        raise AuthError("Supabase is not configured")
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": anon,
        "Accept": "application/json",
    }
    with httpx.Client(timeout=15.0) as client:
        res = client.get(f"{base}/auth/v1/user", headers=headers)
    if res.status_code == 401 or res.status_code == 403:
        raise AuthError("Invalid or expired session")
    if res.status_code >= 400:
        raise AuthError(f"Supabase auth failed ({res.status_code})")
    data = res.json()
    uid = data.get("id")
    if not uid:
        raise AuthError("Supabase user missing id")
    return AuthUser(user_id=str(uid), email=data.get("email"))
