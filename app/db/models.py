from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Track(Base):
    __tablename__ = "tracks"

    track_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    title: Mapped[str] = mapped_column(String(512), default="")
    film: Mapped[str] = mapped_column(String(512), default="")
    year: Mapped[str] = mapped_column(String(16), default="")
    singer: Mapped[str] = mapped_column(String(256), default="")
    audio_filename: Mapped[str] = mapped_column(String(512), default="")
    audio_path: Mapped[str] = mapped_column(String(1024), default="")

    # Metadata facets (auto-extracted from audio tags) — power discovery queries
    artists: Mapped[str] = mapped_column(String(512), default="")
    music_director: Mapped[str] = mapped_column(String(256), default="")
    writers: Mapped[str] = mapped_column(String(512), default="")
    genre: Mapped[str] = mapped_column(String(128), default="")
    label: Mapped[str] = mapped_column(String(256), default="")
    track_no: Mapped[str] = mapped_column(String(16), default="")

    # B2B / catalog identifiers
    partner_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    isrc: Mapped[str | None] = mapped_column(String(32), nullable=True)

    search_blob: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PitchResult(Base):
    __tablename__ = "pitch_results"

    track_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    sa_note: Mapped[str] = mapped_column(String(8))
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    analysis_version: Mapped[str] = mapped_column(String(64), default="sa-v1-chroma")
    analyzed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Ground truth from labels (optional override display)
    label_sa_note: Mapped[str | None] = mapped_column(String(8), nullable=True)
    label_verified: Mapped[bool] = mapped_column(Boolean, default=False)


class UsageCounter(Base):
    """Per-client daily usage of metered (paid-tier) operations.

    Keyed by (client_id, day). DB-backed for now so quota survives restarts;
    swap the body of app/services/usage.py for Redis when traffic warrants it.
    """

    __tablename__ = "usage_counters"

    client_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    day: Mapped[str] = mapped_column(String(10), primary_key=True)  # YYYY-MM-DD (UTC)
    fresh_analyses: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CreditAccount(Base):
    """Sargam credit balance keyed by auth user id (or anon:{client_id} in dev)."""

    __tablename__ = "credit_accounts"

    user_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    balance: Mapped[int] = mapped_column(Integer, default=0)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CreditLedger(Base):
    """Append-only credit movements for Sargam."""

    __tablename__ = "credit_ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(128), index=True)
    delta: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(64))
    ref: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SargamGeneration(Base):
    """One Sargam generation request (song or clip)."""

    __tablename__ = "sargam_generations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(128), index=True)
    # Consumer mode id: "song" | "clip" (never a vendor model name).
    mode: Mapped[str] = mapped_column(String(32), default="clip")
    prompt: Mapped[str] = mapped_column(Text)
    lyrics: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_sec: Mapped[float] = mapped_column(Float, default=30.0)
    credits_charged: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    fal_request_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    audio_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    seed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
