# Indian Pitch

Find the **Sa (home pitch)** of Indian film songs — production-oriented API + classy search UI.

## Local development

```bash
cd ~/Projects/indian-pitch
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# iTunes .m4a analysis needs ffmpeg — bundled via imageio-ffmpeg (pip install -r requirements.txt).
# Optional system install: brew install ffmpeg (included in Docker image for production).

uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000

On startup the app imports tracks from **`labels.xlsx`** (rows with audio files present in `audio/`).

## Production (Docker + PostgreSQL + Redis)

```bash
docker compose up --build
```

- API: http://localhost:8000  
- PostgreSQL + Redis reserved for scale (async jobs, cache — next phase)

## Labels workflow

See [LABELS.md](LABELS.md).

1. Add iTunes files to `audio/`  
2. `python3 scripts/fill_labels_from_audio.py`  
3. Fill `sa_note` + `verified` in Excel  
4. `python3 scripts/sync_labels_from_excel.py`  
5. Restart API (re-imports verified labels)

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/search?q=` | Autocomplete |
| POST | `/api/v1/tracks/{id}/analyze` | Run Sa analysis |
| GET | `/api/v1/tracks/{id}/pitch` | Cached pitch |

## Architecture (scale-ready)

```text
web/          → static UI (CDN-ready)
app/          → FastAPI
  services/   → search, pitch analysis, catalog import
  db/         → SQLAlchemy models (PostgreSQL in prod)
audio/        → local catalog files (S3/B2B cache later)
data/         → SQLite local DB / cache metadata
```

Future: Redis job queue, B2B stream adapter, object storage for audio cache.
