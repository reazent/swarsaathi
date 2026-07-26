"""Sargam credit balance + ledger."""

from __future__ import annotations

import math

from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import CreditAccount, CreditLedger


def credits_for_duration(duration_sec: float) -> int:
    per = max(1, settings.sargam_seconds_per_credit)
    seconds = max(1.0, float(duration_sec))
    return max(1, int(math.ceil(seconds / per)))


def get_or_create_account(db: Session, user_id: str, email: str | None = None) -> CreditAccount:
    row = db.get(CreditAccount, user_id)
    if row is None:
        row = CreditAccount(user_id=user_id, balance=0, email=email)
        db.add(row)
        db.flush()
        if settings.sargam_free_credits > 0:
            _apply(db, user_id, settings.sargam_free_credits, "signup_bonus", ref="sargam_free")
        db.commit()
        db.refresh(row)
        return row
    if email and not row.email:
        row.email = email
        db.commit()
        db.refresh(row)
    return row


def balance(db: Session, user_id: str) -> int:
    row = db.get(CreditAccount, user_id)
    return row.balance if row else 0


def _apply(db: Session, user_id: str, delta: int, reason: str, ref: str | None = None) -> CreditAccount:
    row = db.get(CreditAccount, user_id)
    if row is None:
        row = CreditAccount(user_id=user_id, balance=0)
        db.add(row)
        db.flush()
    new_balance = row.balance + delta
    if new_balance < 0:
        raise ValueError("insufficient_credits")
    row.balance = new_balance
    db.add(CreditLedger(user_id=user_id, delta=delta, reason=reason, ref=ref))
    return row


def debit(db: Session, user_id: str, amount: int, reason: str, ref: str | None = None) -> int:
    if amount <= 0:
        raise ValueError("debit_amount_must_be_positive")
    row = _apply(db, user_id, -amount, reason, ref=ref)
    db.commit()
    db.refresh(row)
    return row.balance


def credit(db: Session, user_id: str, amount: int, reason: str, ref: str | None = None) -> int:
    if amount <= 0:
        raise ValueError("credit_amount_must_be_positive")
    # Idempotent grant when ref already ledgered.
    if ref:
        exists = (
            db.query(CreditLedger)
            .filter(CreditLedger.user_id == user_id, CreditLedger.ref == ref)
            .first()
        )
        if exists:
            return balance(db, user_id)
    row = _apply(db, user_id, amount, reason, ref=ref)
    db.commit()
    db.refresh(row)
    return row.balance


def refund(db: Session, user_id: str, amount: int, ref: str | None = None) -> int:
    return credit(db, user_id, amount, "refund", ref=f"refund:{ref}" if ref else None)
