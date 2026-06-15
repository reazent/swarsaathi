"""Daily usage quota for metered operations (fresh pitch analysis).

DB-backed implementation. The public functions are the seam: to move to Redis
(e.g. Upstash) later, reimplement these three with INCR + EXPIRE and keep the
signatures identical — nothing else changes.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db.models import UsageCounter


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def used_today(db: Session, client_id: str) -> int:
    row = db.get(UsageCounter, (client_id, _today()))
    return row.fresh_analyses if row else 0


def remaining(db: Session, client_id: str, limit: int | None) -> int | None:
    """Remaining fresh analyses today. None = unlimited."""
    if limit is None:
        return None
    return max(0, limit - used_today(db, client_id))


def increment(db: Session, client_id: str) -> int:
    day = _today()
    row = db.get(UsageCounter, (client_id, day))
    if row is None:
        row = UsageCounter(client_id=client_id, day=day, fresh_analyses=0)
        db.add(row)
    row.fresh_analyses += 1
    db.commit()
    return row.fresh_analyses
