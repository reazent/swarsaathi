"""Sargam — Stable Audio 3 via Fal, credit-metered."""

from __future__ import annotations

import re
import time
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_client_id
from app.config import settings
from app.db.models import SargamGeneration
from app.db.session import get_db
from app.services import credits
from app.services.fal_audio import FalError, generate_text_to_audio
from app.services.resend_email import EmailError, send_sargam_sign_in_code
from app.services.supabase_auth import (
    AuthError,
    generate_sign_in_otp,
    user_from_access_token,
    verify_sign_in_otp,
)

router = APIRouter(prefix="/api/v1/sargam", tags=["sargam"])


class SargamUser(BaseModel):
    user_id: str
    email: str | None = None
    is_anonymous: bool = False


class GenerateIn(BaseModel):
    prompt: str = Field(min_length=3, max_length=2000)
    duration: float = Field(default=30, ge=5, le=380)


class GenerateOut(BaseModel):
    id: str
    status: str
    prompt: str
    duration: float
    credits_charged: int
    credits_remaining: int
    audio_url: str | None = None
    seed: int | None = None
    error: str | None = None


class MeOut(BaseModel):
    product: str
    user_id: str
    email: str | None
    is_anonymous: bool
    credits: int
    seconds_per_credit: int
    max_duration_sec: int
    free_credits_on_signup: int
    packs: list[dict]
    stripe_publishable_key: str


class CheckoutIn(BaseModel):
    pack_id: str


class SendCodeIn(BaseModel):
    email: str = Field(min_length=3, max_length=320)


class VerifyCodeIn(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    token: str = Field(min_length=4, max_length=16)
    verification_type: str | None = None


# Simple process-local throttle for OTP sends (Render free = one instance).
_OTP_SEND_AT: dict[str, float] = {}
_OTP_COOLDOWN_SEC = 60
# email -> last verification_type from generate_link (helps verify-code).
_OTP_TYPE_AT: dict[str, str] = {}


def _public_generate_error(exc: Exception) -> str:
    text = str(exc).lower()
    if "balance" in text or "top up" in text or "locked" in text or "fal" in text:
        return "Generation is temporarily unavailable. Please try again later."
    return "Generation failed. Please try again."


def _bearer_token(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        return token or None
    return None


def resolve_sargam_user(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> SargamUser:
    token = _bearer_token(authorization)
    if token:
        try:
            user = user_from_access_token(token)
            return SargamUser(user_id=user.user_id, email=user.email, is_anonymous=False)
        except AuthError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

    # Dev / soft-launch: allow anonymous metering via X-Client-Id.
    if settings.is_dev or not settings.supabase_url:
        cid = get_client_id(request)
        return SargamUser(user_id=f"anon:{cid}", email=None, is_anonymous=True)

    raise HTTPException(status_code=401, detail="Sign in required")


def resolve_sargam_user_optional(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> SargamUser | None:
    """Signed-in user, or None when production visitors are signed out.

    /me must succeed without auth so the marketing UI can render packs and the
    sign-in form. Generate/checkout still use resolve_sargam_user.
    """
    token = _bearer_token(authorization)
    if token:
        try:
            user = user_from_access_token(token)
            return SargamUser(user_id=user.user_id, email=user.email, is_anonymous=False)
        except AuthError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

    if settings.is_dev or not settings.supabase_url:
        cid = get_client_id(request)
        return SargamUser(user_id=f"anon:{cid}", email=None, is_anonymous=True)

    return None


@router.get("/config")
def sargam_config() -> dict:
    """Public client config (Supabase anon key is designed to be public)."""
    return {
        "product": settings.product_name,
        "supabase_url": settings.supabase_url,
        "supabase_anon_key": settings.supabase_anon_key,
        "stripe_publishable_key": settings.stripe_publishable_key,
        "seconds_per_credit": settings.sargam_seconds_per_credit,
        "max_duration_sec": settings.sargam_max_duration_sec,
        "free_credits_on_signup": settings.sargam_free_credits,
        "packs": settings.credit_packs(),
        "auth_email_configured": bool(
            settings.resend_api_key and settings.resend_from and settings.supabase_service_key
        ),
    }


@router.post("/auth/send-code")
def sargam_send_code(body: SendCodeIn) -> dict:
    """Generate a Supabase OTP and email it via Resend (bypasses free-tier template lock)."""
    email = str(body.email).strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")

    now = time.time()
    last = _OTP_SEND_AT.get(email, 0.0)
    if now - last < _OTP_COOLDOWN_SEC:
        wait = int(_OTP_COOLDOWN_SEC - (now - last))
        raise HTTPException(
            status_code=429,
            detail=f"Please wait {wait}s before requesting another code.",
        )

    if not settings.supabase_service_key:
        raise HTTPException(status_code=503, detail="Sign-in is temporarily unavailable.")
    if not settings.resend_api_key:
        raise HTTPException(status_code=503, detail="Sign-in email is temporarily unavailable.")

    try:
        otp = generate_sign_in_otp(email, redirect_to=settings.sargam_public_url)
        send_sargam_sign_in_code(to=otp.email, code=otp.email_otp)
    except AuthError as exc:
        raise HTTPException(status_code=502, detail="Could not create a sign-in code. Try again.") from exc
    except EmailError as exc:
        raise HTTPException(status_code=502, detail="Could not send the sign-in email. Try again.") from exc

    _OTP_SEND_AT[email] = now
    _OTP_TYPE_AT[email] = otp.verification_type
    # Bound memory on long-lived processes.
    if len(_OTP_SEND_AT) > 5000:
        cutoff = now - 3600
        for key, ts in list(_OTP_SEND_AT.items()):
            if ts < cutoff:
                _OTP_SEND_AT.pop(key, None)
                _OTP_TYPE_AT.pop(key, None)

    return {
        "ok": True,
        "email": otp.email,
        # Lets the client verify with the correct Supabase OTP type first.
        "verification_type": otp.verification_type,
        "otp_length": len(otp.email_otp),
    }


@router.post("/auth/verify-code")
def sargam_verify_code(body: VerifyCodeIn) -> dict:
    """Verify email OTP server-side and return session tokens for the browser."""
    email = str(body.email).strip().lower()
    token = re.sub(r"\D", "", str(body.token or ""))
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    if not re.fullmatch(r"\d{6,8}", token):
        raise HTTPException(status_code=400, detail="Enter the full code from your email.")

    preferred = (body.verification_type or _OTP_TYPE_AT.get(email) or "").strip() or None
    try:
        session = verify_sign_in_otp(email, token, preferred_type=preferred)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc) or "Could not verify that code.") from exc

    _OTP_TYPE_AT.pop(email, None)
    return {
        "ok": True,
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "email": session.email,
        "user_id": session.user_id,
    }


@router.get("/me", response_model=MeOut)
def sargam_me(
    user: SargamUser | None = Depends(resolve_sargam_user_optional),
    db: Session = Depends(get_db),
) -> MeOut:
    if user is None:
        return MeOut(
            product=settings.product_name,
            user_id="",
            email=None,
            is_anonymous=True,
            credits=0,
            seconds_per_credit=settings.sargam_seconds_per_credit,
            max_duration_sec=settings.sargam_max_duration_sec,
            free_credits_on_signup=settings.sargam_free_credits,
            packs=settings.credit_packs(),
            stripe_publishable_key=settings.stripe_publishable_key,
        )

    account = credits.get_or_create_account(db, user.user_id, email=user.email)
    return MeOut(
        product=settings.product_name,
        user_id=user.user_id,
        email=user.email,
        is_anonymous=user.is_anonymous,
        credits=account.balance,
        seconds_per_credit=settings.sargam_seconds_per_credit,
        max_duration_sec=settings.sargam_max_duration_sec,
        free_credits_on_signup=settings.sargam_free_credits,
        packs=settings.credit_packs(),
        stripe_publishable_key=settings.stripe_publishable_key,
    )


@router.post("/generate", response_model=GenerateOut)
def sargam_generate(
    body: GenerateIn,
    user: SargamUser = Depends(resolve_sargam_user),
    db: Session = Depends(get_db),
) -> GenerateOut:
    if not settings.fal_key:
        raise HTTPException(
            status_code=503,
            detail="Generation is temporarily unavailable. Please try again later.",
        )

    duration = min(float(body.duration), float(settings.sargam_max_duration_sec))
    cost = credits.credits_for_duration(duration)
    credits.get_or_create_account(db, user.user_id, email=user.email)
    if credits.balance(db, user.user_id) < cost:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "insufficient_credits",
                "credits_required": cost,
                "credits_remaining": credits.balance(db, user.user_id),
                "upgrade": True,
            },
        )

    gen_id = uuid.uuid4().hex
    row = SargamGeneration(
        id=gen_id,
        user_id=user.user_id,
        prompt=body.prompt.strip(),
        duration_sec=duration,
        credits_charged=cost,
        status="running",
    )
    db.add(row)
    db.commit()

    try:
        credits.debit(db, user.user_id, cost, reason="generate", ref=gen_id)
    except ValueError:
        row.status = "failed"
        row.error = "insufficient_credits"
        db.commit()
        raise HTTPException(status_code=402, detail={"error": "insufficient_credits", "upgrade": True})

    try:
        result = generate_text_to_audio(body.prompt.strip(), duration=duration)
        data = result.get("data") or {}
        audio = data.get("audio") or {}
        audio_url = audio.get("url")
        if not audio_url:
            raise FalError("Fal result missing audio url", payload=data)
        row.status = "completed"
        row.fal_request_id = result.get("request_id")
        row.audio_url = audio_url
        row.seed = data.get("seed")
        row.completed_at = datetime.now(timezone.utc)
        db.commit()
    except FalError as exc:
        row.status = "failed"
        row.error = str(exc)[:1000]
        db.commit()
        credits.refund(db, user.user_id, cost, ref=gen_id)
        raise HTTPException(status_code=502, detail=_public_generate_error(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        row.status = "failed"
        row.error = str(exc)[:1000]
        db.commit()
        credits.refund(db, user.user_id, cost, ref=gen_id)
        raise HTTPException(
            status_code=502,
            detail="Generation failed. Please try again.",
        ) from exc

    return GenerateOut(
        id=gen_id,
        status=row.status,
        prompt=row.prompt,
        duration=row.duration_sec,
        credits_charged=cost,
        credits_remaining=credits.balance(db, user.user_id),
        audio_url=row.audio_url,
        seed=row.seed,
    )


@router.get("/generations/{gen_id}", response_model=GenerateOut)
def sargam_generation(
    gen_id: str,
    user: SargamUser = Depends(resolve_sargam_user),
    db: Session = Depends(get_db),
) -> GenerateOut:
    row = db.get(SargamGeneration, gen_id)
    if row is None or row.user_id != user.user_id:
        raise HTTPException(status_code=404, detail="Not found")
    public_error = None
    if row.status == "failed":
        public_error = "Generation failed. Please try again."
    return GenerateOut(
        id=row.id,
        status=row.status,
        prompt=row.prompt,
        duration=row.duration_sec,
        credits_charged=row.credits_charged,
        credits_remaining=credits.balance(db, user.user_id),
        audio_url=row.audio_url,
        seed=row.seed,
        error=public_error,
    )


@router.post("/checkout")
def sargam_checkout(
    body: CheckoutIn,
    user: SargamUser = Depends(resolve_sargam_user),
) -> dict:
    if user.is_anonymous:
        raise HTTPException(status_code=401, detail="Sign in to buy credits")
    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=503,
            detail="Purchases are temporarily unavailable. Please try again later.",
        )

    pack = next((p for p in settings.credit_packs() if p["id"] == body.pack_id), None)
    if not pack:
        raise HTTPException(status_code=400, detail="Unknown pack")

    import stripe

    stripe.api_key = settings.stripe_secret_key
    session = stripe.checkout.Session.create(
        mode="payment",
        success_url=f"{settings.sargam_public_url}?checkout=success",
        cancel_url=f"{settings.sargam_public_url}?checkout=cancel",
        line_items=[
            {
                "quantity": 1,
                "price_data": {
                    "currency": "usd",
                    "unit_amount": int(pack["amount_cents"]),
                    "product_data": {
                        "name": f"{settings.product_name} — {pack['label']}",
                        "description": f"{pack['credits']} generation credits",
                    },
                },
            }
        ],
        metadata={
            "product": "sargam",
            "user_id": user.user_id,
            "pack_id": pack["id"],
            "credits": str(pack["credits"]),
        },
        customer_email=user.email,
    )
    return {"checkout_url": session.url, "session_id": session.id}
