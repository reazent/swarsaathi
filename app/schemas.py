from pydantic import BaseModel, Field


class TrackSearchResult(BaseModel):
    track_id: str
    title: str
    film: str
    year: str
    singer: str
    has_pitch: bool
    sa_note: str | None = None
    confidence: float | None = None
    from_label: bool = False


class SearchResponse(BaseModel):
    query: str
    results: list[TrackSearchResult]


class DiscoverResult(BaseModel):
    track_id: str
    title: str
    film: str
    year: str
    singer: str
    artists: str = ""
    music_director: str = ""
    writers: str = ""
    genre: str = ""
    label: str = ""
    isrc: str | None = None
    has_pitch: bool = False
    sa_note: str | None = None
    confidence: float | None = None
    from_label: bool = False


class DiscoverResponse(BaseModel):
    total: int
    count: int
    results: list[DiscoverResult]


class FacetsResponse(BaseModel):
    singers: list[str]
    music_directors: list[str]
    writers: list[str]
    genres: list[str]
    labels: list[str]
    decades: list[str]
    pitches: list[str]


class PitchResponse(BaseModel):
    track_id: str
    title: str
    singer: str
    sa_note: str = Field(description="Sa mapped to Western note name (movable tonic)")
    confidence: float
    analysis_version: str
    from_label: bool = False
    mode_hint: str | None = None


class MeResponse(BaseModel):
    client_id: str
    tier: str
    entitlements: dict
    fresh_analyses_used_today: int
    fresh_analyses_remaining: int | None = None  # None = unlimited
