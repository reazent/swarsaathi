from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    database_url: str = "sqlite:///./data/indian_pitch.db"
    redis_url: str = "redis://localhost:6379/0"

    root_dir: Path = Path(__file__).resolve().parent.parent
    audio_dir: Path = root_dir / "audio"
    data_dir: Path = root_dir / "data"
    labels_xlsx: Path = root_dir / "labels.xlsx"

    analysis_version: str = "sa-v1-chroma"

    # --- Monetization (pitch) ---
    free_daily_analyses: int = 5
    pro_client_ids: str = ""

    # --- Sargam (audio generation via Fal) ---
    product_name: str = "Sargam"
    fal_key: str = ""
    # Clip / music-sketch engine (Stable Audio 3).
    fal_model_id: str = "fal-ai/stable-audio-3/medium/text-to-audio"
    stability_model_id: str = "stabilityai/stable-audio-3-medium"
    # Full-song engine (Fal ACE-Step). Target HF id kept for docs / future self-host.
    fal_ace_model_id: str = "fal-ai/ace-step"
    fal_ace_prompt_model_id: str = "fal-ai/ace-step/prompt-to-audio"
    ace_step_model_ref: str = "ACE-Step/acestep-v15-xl-turbo"
    sargam_free_credits: int = 3
    sargam_seconds_per_credit: int = 30
    sargam_max_duration_sec: int = 180
    sargam_song_max_duration_sec: int = 240
    sargam_public_url: str = "https://swarsaathi.com/sargam/"
    # JSON map pack_id -> {credits, amount_cents, label}; overridable via env.
    sargam_credit_packs_json: str = ""

    def public_generation_modes(self) -> list[dict]:
        """Consumer-facing modes — never expose vendor/model ids here."""
        return [
            {
                "id": "song",
                "label": "Full song",
                "description": "A complete track with structure — optional lyrics, longer form.",
                "default_duration": 60,
                "max_duration_sec": self.sargam_song_max_duration_sec,
                "supports_lyrics": True,
            },
            {
                "id": "clip",
                "label": "Music sketch",
                "description": "Short mood beds, loops, and textures for other creative uses.",
                "default_duration": 30,
                "max_duration_sec": self.sargam_max_duration_sec,
                "supports_lyrics": False,
            },
        ]

    # --- Auth ---
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_key: str = ""

    # --- Billing ---
    stripe_secret_key: str = ""
    stripe_publishable_key: str = ""
    stripe_webhook_secret: str = ""
    revenuecat_public_key: str = ""
    revenuecat_public_key_ios: str = ""
    revenuecat_secret_key: str = ""
    revenuecat_webhook_secret: str = ""

    # --- Observability / email ---
    sentry_dsn: str = ""
    posthog_key: str = ""
    posthog_host: str = "https://us.i.posthog.com"
    resend_api_key: str = ""
    resend_from: str = "SwarSaathi <support@swarsaathi.com>"

    # --- CORS (comma-separated origins) ---
    cors_origins: str = "http://localhost:8000,http://127.0.0.1:8000,https://swarsaathi.com,https://www.swarsaathi.com"

    @property
    def is_dev(self) -> bool:
        return self.app_env.lower() in ("development", "dev", "local")

    @property
    def pro_client_id_set(self) -> set[str]:
        return {c.strip() for c in self.pro_client_ids.split(",") if c.strip()}

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def credit_packs(self) -> list[dict]:
        import json

        if self.sargam_credit_packs_json.strip():
            data = json.loads(self.sargam_credit_packs_json)
            return list(data)
        return [
            {"id": "starter", "credits": 20, "amount_cents": 900, "label": "Starter · 20 credits"},
            {"id": "studio", "credits": 100, "amount_cents": 3900, "label": "Studio · 100 credits"},
            {"id": "label", "credits": 500, "amount_cents": 14900, "label": "Label · 500 credits"},
        ]


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
