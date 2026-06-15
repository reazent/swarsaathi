"""Sa frequency constraint and snapping — deterministic, label-independent.

Almost all Indian film song Sa values fall in the band **G2 (98 Hz) -> B3
(246.94 Hz)**. This module converts either a measured fundamental frequency or a
bare pitch class into a constrained Sa within that band, resolving the octave
ambiguity for the wrap-around pitch classes (G, G#, A, A#, B).

This is pure deterministic math. It needs no labels and no audio — accuracy of
the *measured* fundamental that feeds `snap_frequency` is a separate, label-tuned
concern handled in the analysis engine.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# Equal temperament, A4 = 440 Hz. 17 candidate Sa targets, G2..B3 inclusive.
SA_TARGETS: list[tuple[str, float]] = [
    ("G2", 98.00),
    ("G#2", 103.83),
    ("A2", 110.00),
    ("A#2", 116.54),
    ("B2", 123.47),
    ("C3", 130.81),
    ("C#3", 138.59),
    ("D3", 146.83),
    ("D#3", 155.56),
    ("E3", 164.81),
    ("F3", 174.61),
    ("F#3", 185.00),
    ("G3", 196.00),
    ("G#3", 207.65),
    ("A3", 220.00),
    ("A#3", 233.08),
    ("B3", 246.94),
]

SA_TARGET_MAP: dict[str, float] = dict(SA_TARGETS)

BAND_MIN_HZ: float = SA_TARGETS[0][1]   # 98.00
BAND_MAX_HZ: float = SA_TARGETS[-1][1]  # 246.94

PITCH_CLASSES: list[str] = [
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
]

# Pitch classes that appear at two octaves within the band -> need a tie-breaker.
AMBIGUOUS_CLASSES: frozenset[str] = frozenset({"G", "G#", "A", "A#", "B"})


@dataclass
class SaCandidate:
    """A resolved Sa within the constraint band."""

    note: str            # e.g. "D3" (includes octave)
    pitch_class: str     # e.g. "D"
    frequency_hz: float  # e.g. 146.83
    cents_off: float = 0.0       # deviation of input from the snapped target
    resolved_by: str = "exact"   # exact | frequency | rarity_prior | register | single


def pitch_class_of(note: str) -> str:
    """Strip the octave digit from a note name. 'G#2' -> 'G#', 'D' -> 'D'."""
    pc = note.strip().rstrip("0123456789")
    pc = pc.replace("b", "").strip()  # tolerate stray flats text; we use sharps
    if pc not in PITCH_CLASSES:
        raise ValueError(f"Unrecognized pitch class in note: {note!r}")
    return pc


def cents_between(f_hz: float, ref_hz: float) -> float:
    """Signed interval in cents from ref to f. Positive = f is higher."""
    if f_hz <= 0 or ref_hz <= 0:
        raise ValueError("Frequencies must be positive")
    return 1200.0 * math.log2(f_hz / ref_hz)


def _fold_into_band(freq_hz: float) -> float:
    """Octave-shift a frequency until it lands in the band's lowest octave.

    Used only when the input is outside the band (typically an octave error in
    the detector). We fold into [BAND_MIN_HZ, BAND_MIN_HZ * 2) for determinism.
    """
    if freq_hz <= 0:
        raise ValueError("Frequency must be positive")
    lo, hi = BAND_MIN_HZ, BAND_MIN_HZ * 2.0
    f = freq_hz
    while f < lo:
        f *= 2.0
    while f >= hi:
        f /= 2.0
    return f


def snap_frequency(freq_hz: float) -> SaCandidate:
    """Snap a measured fundamental to the nearest Sa target in the band.

    - In band: trust the octave and snap to the nearest of the 17 targets.
    - Out of band (an octave error in the detector): the octave is unreliable,
      so recover only the pitch class by folding, then resolve it with the
      rarity prior (defaulting ambiguous classes to octave 3).
    """
    if in_band(freq_hz):
        note, target_hz = min(SA_TARGETS, key=lambda t: abs(cents_between(freq_hz, t[1])))
        return SaCandidate(
            note=note,
            pitch_class=pitch_class_of(note),
            frequency_hz=target_hz,
            cents_off=round(cents_between(freq_hz, target_hz), 1),
            resolved_by="frequency",
        )

    folded = _fold_into_band(freq_hz)
    nearest_note, _ = min(SA_TARGETS, key=lambda t: abs(cents_between(folded, t[1])))
    return resolve_pitch_class(pitch_class_of(nearest_note))


def resolve_pitch_class(
    pitch_class: str,
    measured_hz: float | None = None,
    prefer_lower_octave: bool = False,
) -> SaCandidate:
    """Map a bare pitch class (e.g. 'A') to a constrained Sa within the band.

    Resolution order for the ambiguous classes (G, G#, A, A#, B):
      1. measured_hz  - pick the octave whose target is closest in cents
      2. prefer_lower_octave / register hint - deep male -> octave 2
      3. rarity prior - octave-2 region is rare, so default to octave 3
    Single-octave classes (C..F#) snap directly.
    """
    pc = pitch_class_of(pitch_class)
    candidates = [(n, hz) for (n, hz) in SA_TARGETS if pitch_class_of(n) == pc]

    if not candidates:
        raise ValueError(f"No Sa target for pitch class {pc!r}")

    if len(candidates) == 1:
        note, hz = candidates[0]
        return SaCandidate(note, pc, hz, 0.0, resolved_by="single")

    # Ambiguous: two octave candidates.
    if measured_hz is not None and measured_hz > 0:
        note, hz = min(candidates, key=lambda c: abs(cents_between(measured_hz, c[1])))
        return SaCandidate(
            note, pc, hz,
            round(cents_between(measured_hz, hz), 1),
            resolved_by="frequency",
        )

    candidates.sort(key=lambda c: c[1])  # lower octave first
    if prefer_lower_octave:
        note, hz = candidates[0]
        return SaCandidate(note, pc, hz, 0.0, resolved_by="register")

    note, hz = candidates[-1]  # rarity prior -> higher (octave 3)
    return SaCandidate(note, pc, hz, 0.0, resolved_by="rarity_prior")


def in_band(freq_hz: float) -> bool:
    """True if a frequency already lies within the Sa band."""
    return BAND_MIN_HZ <= freq_hz <= BAND_MAX_HZ
