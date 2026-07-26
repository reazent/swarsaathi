"""Validate Supabase access tokens for Sargam."""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.config import settings


@dataclass
class AuthUser:
    user_id: str
    email: str | None = None


@dataclass
class GeneratedOtp:
    email: str
    email_otp: str
    verification_type: str


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


def generate_sign_in_otp(email: str, *, redirect_to: str | None = None) -> GeneratedOtp:
    """Create a magic-link OTP via Admin API without sending Supabase's default email."""
    base = settings.supabase_url.rstrip("/")
    service = settings.supabase_service_key
    if not base or not service:
        raise AuthError("Supabase admin is not configured")

    payload: dict = {"type": "magiclink", "email": email.strip().lower()}
    if redirect_to:
        payload["options"] = {"redirect_to": redirect_to}

    with httpx.Client(timeout=20.0) as client:
        res = client.post(
            f"{base}/auth/v1/admin/generate_link",
            headers={
                "Authorization": f"Bearer {service}",
                "apikey": service,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json=payload,
        )
    if res.status_code >= 400:
        raise AuthError(f"Could not create sign-in code ({res.status_code})")
    data = res.json()
    otp = str(data.get("email_otp") or "").strip()
    if not otp:
        raise AuthError("Supabase did not return a sign-in code")
    return GeneratedOtp(
        email=str(data.get("email") or email).strip().lower(),
        email_otp=otp,
        verification_type=str(data.get("verification_type") or "magiclink"),
    )