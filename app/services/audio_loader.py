"""Load audio for analysis — supports m4a/mp3/wav via librosa + ffmpeg fallback."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

import librosa
import numpy as np


class AudioLoadError(RuntimeError):
    pass


def _resolve_ffmpeg() -> str:
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        return ffmpeg

    try:
        import imageio_ffmpeg
    except ImportError as exc:
        raise AudioLoadError(
            "ffmpeg is required to analyze iTunes .m4a files. "
            "Install system ffmpeg (brew install ffmpeg) or: pip install imageio-ffmpeg"
        ) from exc

    return imageio_ffmpeg.get_ffmpeg_exe()


def _load_with_ffmpeg(path: Path, sr: int, duration: float | None) -> tuple[np.ndarray, int]:
    ffmpeg = _resolve_ffmpeg()

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    cmd = [ffmpeg, "-y", "-i", str(path), "-ac", "1", "-ar", str(sr)]
    if duration:
        cmd.extend(["-t", str(duration)])
    cmd.append(str(tmp_path))

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise AudioLoadError(f"ffmpeg failed: {proc.stderr[-400:]}")
        y, loaded_sr = librosa.load(str(tmp_path), sr=sr, mono=True)
        return y, loaded_sr
    finally:
        tmp_path.unlink(missing_ok=True)


def load_mono(path: Path, sr: int = 22050, duration: float | None = 120.0) -> tuple[np.ndarray, int]:
    path = Path(path)
    if not path.is_file():
        raise FileNotFoundError(str(path))

    try:
        y, loaded_sr = librosa.load(str(path), sr=sr, mono=True, duration=duration)
        if y.size == 0:
            raise AudioLoadError("Empty audio")
        return y, loaded_sr
    except Exception:
        if path.suffix.lower() in {".m4a", ".aac", ".mp4"}:
            return _load_with_ffmpeg(path, sr, duration)
        raise
