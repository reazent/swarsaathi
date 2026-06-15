"""Estimate Sa (tonic) from audio using chroma + Krumhansl key profiles.

Production note: replace/augment with vocal separation + trained Sa model.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from app.services.audio_loader import load_mono
from app.services.sa_constraint import resolve_pitch_class

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Krumhansl-Schmuckler major/minor profiles (rotatable)
MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


@dataclass
class SaAnalysis:
    sa_note: str          # pitch class, e.g. "D" (stored / compared against labels)
    confidence: float
    mode: str             # major | minor
    sa_note_full: str = ""        # band-constrained note with octave, e.g. "D3"
    sa_frequency_hz: float = 0.0  # frequency of the constrained Sa, e.g. 146.83
    resolved_by: str = ""         # how the octave was resolved


def _rotate(profile: np.ndarray, steps: int) -> np.ndarray:
    return np.roll(profile, steps)


def _best_key(chroma: np.ndarray) -> tuple[int, str, float]:
    """Return (root pitch class, mode, correlation score)."""
    vec = chroma / (np.linalg.norm(chroma) + 1e-9)
    best_root, best_mode, best_score = 0, "major", -1.0
    for root in range(12):
        major_corr = float(np.corrcoef(vec, _rotate(MAJOR, root))[0, 1])
        minor_corr = float(np.corrcoef(vec, _rotate(MINOR, root))[0, 1])
        if major_corr > best_score:
            best_score, best_root, best_mode = major_corr, root, "major"
        if minor_corr > best_score:
            best_score, best_root, best_mode = minor_corr, root, "minor"
    return best_root, best_mode, max(0.0, min(1.0, best_score))


def analyze_sa(audio_path: Path, max_duration_sec: float = 120.0) -> SaAnalysis:
    y, sr = load_mono(audio_path, sr=22050, duration=max_duration_sec)

    import librosa

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = chroma.mean(axis=1)

    root, mode, score = _best_key(chroma_mean)
    sa_note = NOTE_NAMES[root]

    # Boost confidence when one pitch class dominates
    dominance = float(chroma_mean.max() / (chroma_mean.sum() + 1e-9))
    confidence = round(min(0.98, score * 0.7 + dominance * 0.3), 3)

    # Constrain the pitch class into the realistic Sa band (G2..B3).
    # measured_hz hook is left None until the fundamental estimator is tuned
    # against verified labels; octave currently resolves via the rarity prior.
    sa = resolve_pitch_class(sa_note, measured_hz=None)

    return SaAnalysis(
        sa_note=sa_note,
        confidence=confidence,
        mode=mode,
        sa_note_full=sa.note,
        sa_frequency_hz=sa.frequency_hz,
        resolved_by=sa.resolved_by,
    )
