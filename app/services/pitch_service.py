from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import PitchResult, Track
from app.services.pitch_analysis import analyze_sa


def get_pitch(db: Session, track_id: str) -> PitchResult | None:
    return db.get(PitchResult, track_id)


def needs_fresh_analysis(db: Session, track_id: str, force: bool = False) -> bool:
    """True if a call would actually run the (metered) analysis engine.

    Mirrors the early-return logic in `analyze_track_pitch` so the API can decide
    whether to charge a quota *before* doing the work. Cached/verified pitches
    return False (free + unlimited).
    """
    if force:
        return True
    existing = db.get(PitchResult, track_id)
    if existing is None:
        return True
    if existing.label_verified and existing.label_sa_note:
        return False
    if existing.analysis_version != "human-label":
        return False
    return True


def analyze_track_pitch(db: Session, track_id: str, force: bool = False) -> PitchResult:
    track = db.get(Track, track_id)
    if track is None:
        raise LookupError(f"Track not found: {track_id}")

    existing = db.get(PitchResult, track_id)
    if existing and not force:
        if existing.label_verified and existing.label_sa_note:
            existing.sa_note = existing.label_sa_note
            existing.confidence = 1.0
            return existing
        if existing.analysis_version != "human-label":
            return existing

    audio_file = settings.root_dir / track.audio_path
    if not audio_file.is_file():
        raise FileNotFoundError(f"Audio missing: {track.audio_path}")

    result = analyze_sa(audio_file)

    if existing is None:
        existing = PitchResult(track_id=track_id, sa_note=result.sa_note)
        db.add(existing)

    existing.sa_note = result.sa_note
    existing.confidence = result.confidence
    existing.analysis_version = settings.analysis_version
    existing.analyzed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(existing)
    return existing
