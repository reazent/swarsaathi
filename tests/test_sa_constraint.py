"""Deterministic tests for the Sa constraint + snapping math.

Runs with pytest, or directly:  python tests/test_sa_constraint.py
No labels or audio required.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.sa_constraint import (  # noqa: E402
    BAND_MAX_HZ,
    BAND_MIN_HZ,
    SA_TARGETS,
    cents_between,
    pitch_class_of,
    resolve_pitch_class,
    snap_frequency,
)


def test_band_bounds():
    assert BAND_MIN_HZ == 98.00      # G2
    assert BAND_MAX_HZ == 246.94     # B3
    assert len(SA_TARGETS) == 17


def test_pitch_class_parsing():
    assert pitch_class_of("G#2") == "G#"
    assert pitch_class_of("D3") == "D"
    assert pitch_class_of("A") == "A"


def test_cents_octave_is_1200():
    assert abs(cents_between(220.0, 110.0) - 1200.0) < 1e-6
    assert abs(cents_between(110.0, 220.0) + 1200.0) < 1e-6


def test_single_octave_classes_snap_directly():
    # C..F# appear once in the band -> octave 3, no ambiguity.
    for pc, expected_note, expected_hz in [
        ("C", "C3", 130.81),
        ("D", "D3", 146.83),
        ("E", "E3", 164.81),
        ("F", "F3", 174.61),
        ("F#", "F#3", 185.00),
    ]:
        c = resolve_pitch_class(pc)
        assert c.note == expected_note
        assert c.frequency_hz == expected_hz
        assert c.resolved_by == "single"


def test_ambiguous_classes_default_to_rarity_prior():
    # G/G#/A/A#/B default to octave 3 (octave-2 region is rare).
    for pc, expected_note in [
        ("G", "G3"), ("G#", "G#3"), ("A", "A3"), ("A#", "A#3"), ("B", "B3"),
    ]:
        c = resolve_pitch_class(pc)
        assert c.note == expected_note
        assert c.resolved_by == "rarity_prior"


def test_ambiguous_class_with_low_measured_hz_picks_octave_2():
    # A measured near 110 Hz -> A2, not A3.
    c = resolve_pitch_class("A", measured_hz=112.0)
    assert c.note == "A2"
    assert c.frequency_hz == 110.00
    assert c.resolved_by == "frequency"


def test_ambiguous_class_with_high_measured_hz_picks_octave_3():
    c = resolve_pitch_class("A", measured_hz=218.0)
    assert c.note == "A3"
    assert c.frequency_hz == 220.00


def test_register_hint_forces_lower_octave():
    c = resolve_pitch_class("G", prefer_lower_octave=True)
    assert c.note == "G2"
    assert c.resolved_by == "register"


def test_snap_frequency_in_band():
    c = snap_frequency(150.0)   # between D3 (146.83) and D#3 (155.56)
    assert c.note == "D3"
    assert abs(c.cents_off - 37.0) < 2.0


def test_snap_frequency_exact_target():
    c = snap_frequency(98.0)
    assert c.note == "G2"
    assert abs(c.cents_off) < 0.1


def test_snap_frequency_octave_error_recovers_pitch_class():
    # A vocal detected an octave too high (440 Hz, A4): octave is unreliable,
    # so recover pitch class A and apply the rarity prior -> A3.
    c = snap_frequency(440.0)
    assert c.note == "A3"
    assert c.frequency_hz == 220.00
    assert c.resolved_by == "rarity_prior"


def test_snap_frequency_very_low_recovers_pitch_class():
    # 55 Hz (A1) is out of band: recover pitch class A -> rarity prior -> A3.
    c = snap_frequency(55.0)
    assert c.note == "A3"
    assert c.resolved_by == "rarity_prior"


def test_snap_frequency_out_of_band_single_class():
    # 73.42 Hz (D2) is below band: pitch class D resolves to its single target D3.
    c = snap_frequency(73.42)
    assert c.note == "D3"


def _run_all():
    fns = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS  {fn.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL  {fn.__name__}: {exc}")
    print(f"\n{len(fns) - failed}/{len(fns)} passed")
    return failed


if __name__ == "__main__":
    sys.exit(1 if _run_all() else 0)
