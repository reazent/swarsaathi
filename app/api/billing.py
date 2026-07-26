"""Stripe webhooks for Sargam credit packs."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db
from app.services import credits

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


@router.post("/stripe/webhook")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
    stripe_signature: str | None = Header(default=None, alias="stripe-signature"),
) -> dict:
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Stripe is not configured")

    import stripe

    stripe.api_key = settings.stripe_secret_key
    payload = await request.body()

    if settings.stripe_webhook_secret:
        if not stripe_signature:
            raise HTTPException(status_code=400, detail="Missing stripe-signature")
        try:
            event = stripe.Webhook.construct_event(
                payload, stripe_signature, settings.stripe_webhook_secret
            )
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=f"Invalid signature: {exc}") from exc
    else:
        # Dev-only path when webhook secret not yet configured.
        if not settings.is_dev:
            raise HTTPException(status_code=503, detail="STRIPE_WEBHOOK_SECRET is required")
        event = stripe.Event.construct_from(
            __import__("json").loads(payload.decode("utf-8")), stripe.api_key
        )

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        meta = session.get("metadata") or {}
        if meta.get("product") != "sargam":
            return {"ok": True, "ignored": True}
        user_id = meta.get("user_id")
        pack_credits = int(meta.get("credits") or 0)
        session_id = session.get("id")
        if not user_id or pack_credits <= 0:
            raise HTTPException(status_code=400, detail="Missing credit metadata")
        credits.get_or_create_account(db, user_id, email=session.get("customer_email"))
        credits.credit(
            db,
            user_id,
            pack_credits,
            reason="stripe_pack",
            ref=f"stripe:{session_id}",
        )
        return {"ok": True, "credited": pack_credits, "user_id": user_id}

    return {"ok": True}
