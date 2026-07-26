from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.billing import router as billing_router
from app.api.routes import router as api_router
from app.api.sargam import router as sargam_router
from app.config import settings
from app.db.session import SessionLocal, init_db
from app.services.catalog_import import import_catalog

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
SITE_DIR = Path(__file__).resolve().parent.parent / "site"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        import_catalog(db)
    finally:
        db.close()

    if settings.sentry_dsn:
        try:
            import sentry_sdk

            sentry_sdk.init(dsn=settings.sentry_dsn, traces_sample_rate=0.05)
        except Exception:
            pass
    yield


app = FastAPI(
    title="SwarSaathi",
    description="Indian music learning tools and pitch services",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.include_router(sargam_router)
app.include_router(billing_router)
app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")


@app.get("/milap-preview")
def milap_preview() -> FileResponse:
    return FileResponse(WEB_DIR / "milap-preview.html")


@app.get("/styles.css")
def site_styles() -> FileResponse:
    return FileResponse(SITE_DIR / "styles.css")


@app.get("/health")
def health() -> dict:
    # Booleans only — helps confirm Render env vars without exposing secrets.
    return {
        "status": "ok",
        "product": settings.product_name,
        "env": settings.app_env,
        "config": {
            "database": bool(settings.database_url),
            "fal_key": bool(settings.fal_key),
            "supabase": bool(settings.supabase_url and settings.supabase_anon_key),
            "stripe_secret": bool(settings.stripe_secret_key),
            "stripe_publishable": bool(settings.stripe_publishable_key),
            "stripe_webhook_secret": bool(settings.stripe_webhook_secret),
            "resend_from": bool(settings.resend_from),
            "resend_api_key": bool(settings.resend_api_key),
            "supabase_service_key": bool(settings.supabase_service_key),
        },
    }


# Marketing Sargam UI (also deployed via Cloudflare Pages from site/).
if (SITE_DIR / "sargam").is_dir():
    app.mount("/sargam", StaticFiles(directory=SITE_DIR / "sargam", html=True), name="sargam")
