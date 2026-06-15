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

    # --- Monetization ---
    # Free tier: how many *fresh* pitch analyses per client per UTC day.
    # Cached/known pitches are always free and unlimited.
    free_daily_analyses: int = 5
    # Manual Pro grants (comma-separated client ids) until billing is wired.
    pro_client_ids: str = ""

    @property
    def is_dev(self) -> bool:
        return self.app_env.lower() in ("development", "dev", "local")

    @property
    def pro_client_id_set(self) -> set[str]:
        return {c.strip() for c in self.pro_client_ids.split(",") if c.strip()}


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
