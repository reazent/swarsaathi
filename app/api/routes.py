from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import get_client_id, resolve_tier
from app.db.session import get_db
from app.schemas import (
    DiscoverResponse,
    DiscoverResult,
    FacetsResponse,
    MeResponse,
    PitchResponse,
    SearchResponse,
    TrackSearchResult,
)
from app.services import usage
from app.services.audio_loader import AudioLoadError
from app.services.discovery import DiscoverFilters, discover, list_facets
from app.services.entitlements import entitlements_for, is_pro
from app.services.pitch_service import analyze_track_pitch, get_pitch, needs_fresh_analysis
from app.services.search import search_tracks

router = APIRouter(prefix="/api/v1")


@router.get("/me", response_model=MeResponse)
def api_me(request: Request, db: Session = Depends(get_db)) -> MeResponse:
    client_id = get_client_id(request)
    tier = resolve_tier(request, client_id)
    ent = entitlements_for(tier)
    limit = ent["fresh_analyses_per_day"]
    return MeResponse(
        client_id=client_id,
        tier=tier,
        entitlements=ent,
        fresh_analyses_used_today=usage.used_today(db, client_id),
        fresh_analyses_remaining=usage.remaining(db, client_id, limit),
    )


@router.get("/search", response_model=SearchResponse)
def api_search(
    q: str = Query("", min_length=0),
    limit: int = Query(10, ge=1, le=25),
    db: Session = Depends(get_db),
) -> SearchResponse:
    results = [TrackSearchResult(**r) for r in search_tracks(db, q, limit=limit)]
    return SearchResponse(query=q, results=results)


@router.get("/facets", response_model=FacetsResponse)
def api_facets(db: Session = Depends(get_db)) -> FacetsResponse:
    return FacetsResponse(**list_facets(db))


@router.get("/discover", response_model=DiscoverResponse)
def api_discover(
    text: str = Query(""),
    singer: str = Query(""),
    music_director: str = Query(""),
    writer: str = Query(""),
    genre: str = Query(""),
    label: str = Query(""),
    sa_note: str = Query(""),
    year_from: int | None = Query(None),
    year_to: int | None = Query(None),
    has_pitch: bool = Query(False),
    verified_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> DiscoverResponse:
    filters = DiscoverFilters(
        text=text,
        singer=singer,
        music_director=music_director,
        writer=writer,
        genre=genre,
        label=label,
        sa_note=sa_note,
        year_from=year_from,
        year_to=year_to,
        has_pitch=has_pitch,
        verified_only=verified_only,
        limit=limit,
        offset=offset,
    )
    data = discover(db, filters)
    return DiscoverResponse(
        total=data["total"],
        count=data["count"],
        results=[DiscoverResult(**r) for r in data["results"]],
    )


@router.get("/tracks/{track_id}/pitch", response_model=PitchResponse)
def api_get_pitch(track_id: str, db: Session = Depends(get_db)) -> PitchResponse:
    from app.db.models import Track

    track = db.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")
    pitch = get_pitch(db, track_id)
    if pitch is None:
        raise HTTPException(status_code=404, detail="Pitch not analyzed yet")
    return PitchResponse(
        track_id=track_id,
        title=track.title,
        singer=track.singer,
        sa_note=pitch.sa_note,
        confidence=pitch.confidence,
        analysis_version=pitch.analysis_version,
        from_label=pitch.label_verified,
    )


@router.post("/tracks/{track_id}/analyze", response_model=PitchResponse)
def api_analyze_pitch(
    request: Request,
    track_id: str,
    force: bool = Query(False),
    db: Session = Depends(get_db),
) -> PitchResponse:
    from app.db.models import Track

    track = db.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")

    # Meter only *fresh* analyses for free tier. Cached pitches are always free.
    client_id = get_client_id(request)
    tier = resolve_tier(request, client_id)
    fresh = needs_fresh_analysis(db, track_id, force=force)
    limit = entitlements_for(tier)["fresh_analyses_per_day"]

    if fresh and not is_pro(tier):
        if usage.remaining(db, client_id, limit) <= 0:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "quota_exceeded",
                    "message": (
                        f"You've used your {limit} free song pitches for today. "
                        "Upgrade to Pro for unlimited lookups."
                    ),
                    "limit": limit,
                    "upgrade": True,
                },
            )

    try:
        pitch = analyze_track_pitch(db, track_id, force=force)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AudioLoadError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if fresh and not is_pro(tier):
        usage.increment(db, client_id)

    return PitchResponse(
        track_id=track_id,
        title=track.title,
        singer=track.singer,
        sa_note=pitch.sa_note,
        confidence=pitch.confidence,
        analysis_version=pitch.analysis_version,
        from_label=pitch.label_verified,
    )
