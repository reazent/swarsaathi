from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import PitchResult, Track


def search_tracks(db: Session, query: str, limit: int = 10) -> list[dict]:
    q = query.strip().lower()
    if len(q) < 1:
        return []

    tokens = [t for t in q.split() if t]
    stmt = select(Track).order_by(Track.title).limit(200)
    tracks = db.scalars(stmt).all()

    scored: list[tuple[int, Track]] = []
    for track in tracks:
        blob = track.search_blob or ""
        title_l = (track.title or "").lower()
        if title_l.startswith(q):
            score = 100
        elif q in title_l:
            score = 80
        elif all(t in blob for t in tokens):
            score = 60 - blob.find(tokens[0]) // 10
        else:
            continue
        scored.append((score, track))

    scored.sort(key=lambda x: (-x[0], x[1].title))
    results: list[dict] = []
    for _, track in scored[:limit]:
        pitch = db.get(PitchResult, track.track_id)
        results.append(
            {
                "track_id": track.track_id,
                "title": track.title,
                "film": track.film,
                "year": track.year,
                "singer": track.singer,
                "has_pitch": pitch is not None and bool(pitch.sa_note),
                "sa_note": pitch.sa_note if pitch else None,
                "confidence": pitch.confidence if pitch else None,
                "from_label": bool(pitch and pitch.label_verified) if pitch else False,
            }
        )
    return results
