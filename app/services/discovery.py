"""Faceted discovery over the catalog.

Powers granular queries like "Rafi songs by R.D. Burman from the 1960s in D
pitch" by ANDing structured filters over track metadata + known Sa.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import PitchResult, Track


@dataclass
class DiscoverFilters:
    text: str = ""
    singer: str = ""
    music_director: str = ""
    writer: str = ""
    genre: str = ""
    label: str = ""
    sa_note: str = ""
    year_from: int | None = None
    year_to: int | None = None
    has_pitch: bool = False
    verified_only: bool = False
    limit: int = 50
    offset: int = 0


def _year_int(value: str | None) -> int | None:
    if not value:
        return None
    digits = "".join(c for c in str(value) if c.isdigit())[:4]
    return int(digits) if len(digits) == 4 else None


def _ilike(column, value: str):
    return func.lower(column).like(f"%{value.strip().lower()}%")


def discover(db: Session, f: DiscoverFilters) -> dict:
    stmt = select(Track, PitchResult).join(
        PitchResult, PitchResult.track_id == Track.track_id, isouter=True
    )

    if f.text:
        stmt = stmt.where(_ilike(Track.search_blob, f.text))
    if f.singer:
        stmt = stmt.where(_ilike(Track.artists, f.singer))
    if f.music_director:
        stmt = stmt.where(_ilike(Track.music_director, f.music_director))
    if f.writer:
        stmt = stmt.where(_ilike(Track.writers, f.writer))
    if f.genre:
        stmt = stmt.where(_ilike(Track.genre, f.genre))
    if f.label:
        stmt = stmt.where(_ilike(Track.label, f.label))

    rows = db.execute(stmt.order_by(Track.year.desc(), Track.title)).all()

    results: list[dict] = []
    for track, pitch in rows:
        sa = pitch.sa_note if pitch else None
        verified = bool(pitch and pitch.label_verified)
        has_pitch = bool(pitch and pitch.sa_note)

        # Post-filters that depend on joined pitch or parsed year.
        if f.has_pitch and not has_pitch:
            continue
        if f.verified_only and not verified:
            continue
        if f.sa_note and (not sa or sa.strip().upper() != f.sa_note.strip().upper()):
            continue
        yr = _year_int(track.year)
        if f.year_from is not None and (yr is None or yr < f.year_from):
            continue
        if f.year_to is not None and (yr is None or yr > f.year_to):
            continue

        results.append(
            {
                "track_id": track.track_id,
                "title": track.title,
                "film": track.film,
                "year": track.year,
                "singer": track.singer,
                "artists": track.artists,
                "music_director": track.music_director,
                "writers": track.writers,
                "genre": track.genre,
                "label": track.label,
                "isrc": track.isrc,
                "has_pitch": has_pitch,
                "sa_note": sa,
                "confidence": pitch.confidence if pitch else None,
                "from_label": verified,
            }
        )

    total = len(results)
    page = results[f.offset : f.offset + f.limit]
    return {"total": total, "count": len(page), "results": page}


def list_facets(db: Session) -> dict:
    """Distinct values for filter dropdowns, plus decades and known pitches."""
    tracks = db.scalars(select(Track)).all()

    def distinct(attr: str) -> list[str]:
        vals = {getattr(t, attr).strip() for t in tracks if getattr(t, attr)}
        return sorted(vals)

    singers = sorted({t.singer.strip() for t in tracks if t.singer})

    decades = sorted(
        {
            (yr // 10) * 10
            for t in tracks
            if (yr := _year_int(t.year)) is not None
        }
    )

    pitches = sorted(
        {p.sa_note.strip() for p in db.scalars(select(PitchResult)).all() if p.sa_note}
    )

    return {
        "singers": singers,
        "music_directors": distinct("music_director"),
        "writers": distinct("writers"),
        "genres": distinct("genre"),
        "labels": distinct("label"),
        "decades": [f"{d}s" for d in decades],
        "pitches": pitches,
    }
