from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router as api_router
from app.db.session import init_db
from app.services.catalog_import import import_catalog
from app.db.session import SessionLocal


WEB_DIR = Path(__file__).resolve().parent.parent / "web"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        import_catalog(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="Shruti",
    description="Find the pitch of Indian film songs",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(api_router)
app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
