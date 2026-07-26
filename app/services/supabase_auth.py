"""Validate Supabase access tokens for Sargam."""

from __future__ import annotations

import re
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


@dataclass
class VerifiedSession:
    access_token: str
    refresh_token: str
    email: str | None
    user_id: str


def verify_sign_in_otp(
    email: str,
    token: str,
    *,
    preferred_type: str | None = None,
) -> VerifiedSession:
    """Exchange an email OTP for a session (tries signup/magiclink/email types)."""
    base = settings.supabase_url.rstrip("/")
    anon = settings.supabase_anon_key
    if not base or not anon:
        raise AuthError("Supabase is not configured")

    cleaned = re.sub(r"\D", "", token or "")
    if not cleaned:
        raise AuthError("Enter the code from your email")

    types: list[str] = []
    for t in (preferred_type, "signup", "magiclink", "email"):
        if t and t not in types:
            types.append(t)

    last_msg = "Could not verify that code"
    with httpx.Client(timeout=20.0) as client:
        for otp_type in types:
            res = client.post(
                f"{base}/auth/v1/verify",
                headers={
                    "Authorization": f"Bearer {anon}",
                    "apikey": anon,
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                json={
                    "type": otp_type,
                    "email": email.strip().lower(),
                    "token": cleaned,
                },
            )
            data = res.json() if res.content else {}
            access = data.get("access_token")
            refresh = data.get("refresh_token")
            if res.status_code < 400 and access and refresh:
                user = data.get("user") or {}
                return VerifiedSession(
                    access_token=str(access),
                    refresh_token=str(refresh),
                    email=(user.get("email") or email).strip().lower(),
                    user_id=str(user.get("id") or ""),
                )
            last_msg = str(
                data.get("msg")
                or data.get("error_description")
                or data.get("error")
                or last_msg
            )

    raise AuthError(last_msg)