"""Audio generation clients — Stable Audio (clips) + ACE-Step songs.

Model identifiers stay server-side; the product UI only exposes consumer modes.

Song path preference (best → fallback):
  1. Modal self-hosted ACE-Step v1.5 XL Turbo (`modal_apps/ace_step_song.py`)
  2. Runware `runware:ace-step@v1.5-xl-turbo` (managed 4B)
  3. WaveSpeed `wavespeed-ai/ace-step-1.5` (managed 2B)
  4. Fal `fal-ai/ace-step` (classic — last resort)

Music sketches stay on Fal Stable Audio 3.
"""

from __future__ import annotations

import time
import uuid
from typing import Any

import httpx

from app.config import settings

FAL_QUEUE = "https://queue.fal.run"
FAL_AUTH_HEADER = "Authorization"
WAVESPEED_BASE = "https://api.wavespeed.ai/api/v3"
RUNWARE_API = "https://api.runware.ai/v1"


class FalError(RuntimeError):
    def __init__(self, message: str, status: int | None = None, payload: Any = None):
        super().__init__(message)
        self.status = status
        self.payload = payload


def _headers() -> dict[str, str]:
    key = settings.fal_key.strip()
    if key.lower().startswith("key "):
        key = key[4:].strip()
    if not key:
        raise FalError("FAL_KEY is not configured")
    return {
        FAL_AUTH_HEADER: f"Key {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _fal_error_message(status: int, body: str) -> str:
    detail = body
    try:
        import json

        payload = json.loads(body)
        if isinstance(payload, dict) and payload.get("detail"):
            detail = str(payload["detail"])
    except Exception:
        pass
    lower = detail.lower()
    if status == 403 and ("exhausted balance" in lower or "top up" in lower or "locked" in lower):
        return (
            "Fal account has no balance. Top up at https://fal.ai/dashboard/billing "
            "then try again."
        )
    if status in (401, 403):
        return f"Fal auth/access error ({status}): {detail}"
    return f"Fal submit failed ({status}): {detail}"


def _submit_and_poll(
    model: str,
    body: dict[str, Any],
    *,
    timeout_sec: float = 420.0,
) -> dict[str, Any]:
    headers = _headers()
    with httpx.Client(timeout=60.0) as client:
        submit = client.post(f"{FAL_QUEUE}/{model}", headers=headers, json=body)
        if submit.status_code >= 400:
            raise FalError(
                _fal_error_message(submit.status_code, submit.text),
                status=submit.status_code,
                payload=submit.text,
            )
        submitted = submit.json()
        request_id = submitted.get("request_id") or submitted.get("requestId")
        if not request_id:
            if "audio" in submitted:
                return {"request_id": None, "data": submitted, "model": model, "provider": "fal"}
            raise FalError("Fal submit missing request_id", payload=submitted)

        status_url = submitted.get("status_url") or f"{FAL_QUEUE}/{model}/requests/{request_id}/status"
        result_url = submitted.get("response_url") or f"{FAL_QUEUE}/{model}/requests/{request_id}"

        deadline = time.monotonic() + timeout_sec
        while time.monotonic() < deadline:
            st = client.get(status_url, headers=headers, params={"logs": "0"})
            if st.status_code >= 400:
                raise FalError(
                    f"Fal status failed ({st.status_code})",
                    status=st.status_code,
                    payload=st.text,
                )
            payload = st.json()
            status = (payload.get("status") or "").upper()
            if status in {"COMPLETED", "OK"}:
                res = client.get(result_url, headers=headers)
                if res.status_code >= 400:
                    raise FalError(
                        f"Fal result failed ({res.status_code})",
                        status=res.status_code,
                        payload=res.text,
                    )
                data = res.json()
                return {
                    "request_id": request_id,
                    "data": data,
                    "model": model,
                    "provider": "fal",
                }
            if status in {"FAILED", "ERROR", "CANCELLED"}:
                raise FalError("Fal generation failed", payload=payload)
            time.sleep(1.5)

        raise FalError("Fal generation timed out", payload={"request_id": request_id})


def generate_clip_audio(
    prompt: str,
    *,
    duration: float = 30.0,
    output_format: str = "mp3",
    timeout_sec: float = 300.0,
) -> dict[str, Any]:
    """Music sketch / bed via Stable Audio 3 on Fal."""
    model = settings.fal_model_id.strip() or "fal-ai/stable-audio-3/medium/text-to-audio"
    body = {
        "prompt": prompt,
        "duration": float(duration),
        "num_inference_steps": 8,
        "enable_safety_checker": True,
        "output_format": output_format,
        "bitrate": "192k",
    }
    return _submit_and_poll(model, body, timeout_sec=timeout_sec)


def _scaffold_lyrics(prompt: str) -> str:
    theme = prompt.strip()[:280] or "a melody rising"
    return (
        f"[verse]\n{theme}\n\n"
        "[chorus]\n"
        "Hold this feeling through the night\n"
        "Every note a thread of light\n"
    )


def _generate_song_modal(
    prompt: str,
    *,
    duration: float,
    lyrics: str | None,
    instrumental: bool,
    timeout_sec: float,
) -> dict[str, Any]:
    """Self-hosted ACE-Step XL Turbo on Modal (see modal_apps/ace_step_song.py)."""
    token_id = settings.modal_token_id.strip()
    token_secret = settings.modal_token_secret.strip()
    if not token_id or not token_secret:
        raise FalError("MODAL_TOKEN_ID and MODAL_TOKEN_SECRET are required for Modal songs")

    # Modal SDK reads these env vars; ensure they're present for this process.
    import os

    os.environ.setdefault("MODAL_TOKEN_ID", token_id)
    os.environ.setdefault("MODAL_TOKEN_SECRET", token_secret)

    try:
        import modal
    except ImportError as exc:
        raise FalError(
            "modal package is not installed. Add `modal` to requirements and redeploy."
        ) from exc

    try:
        MusicGenerator = modal.Cls.from_name("sargam-ace-step", "MusicGenerator")
        meta = MusicGenerator().run.remote(
            prompt.strip(),
            (lyrics or "").strip(),
            duration=max(15.0, min(float(duration), 240.0)),
            format="mp3",
            instrumental=bool(instrumental),
        )
    except Exception as exc:  # noqa: BLE001
        raise FalError(f"Modal song generate failed: {exc}") from exc

    if not isinstance(meta, dict) or not meta.get("file_id"):
        raise FalError("Modal result missing file_id", payload=meta)

    audio_base = (
        settings.modal_ace_audio_url.strip()
        or "https://sumitv77--sargam-ace-audio.modal.run"
    )
    audio_url = (
        f"{audio_base.rstrip('/')}?file_id={meta['file_id']}"
        f"&format={meta.get('format') or 'mp3'}"
    )
    return {
        "request_id": meta["file_id"],
        "data": {
            "audio": {"url": audio_url},
            "seed": meta.get("seed"),
        },
        "model": meta.get("model") or "acestep-v15-xl-turbo",
        "provider": "modal",
    }


def _runware_headers() -> dict[str, str]:
    key = settings.runware_api_key.strip()
    if key.lower().startswith("bearer "):
        key = key[7:].strip()
    if not key:
        raise FalError("RUNWARE_API_KEY is not configured")
    return {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _generate_song_runware(
    prompt: str,
    *,
    duration: float,
    lyrics: str | None,
    instrumental: bool,
    timeout_sec: float,
) -> dict[str, Any]:
    """Best quality: ACE-Step 1.5 XL Turbo (4B) on Runware."""
    model = settings.runware_ace_model_id.strip() or "runware:ace-step@v1.5-xl-turbo"
    text = prompt.strip()
    if len(text) < 2:
        raise FalError("Song prompt is too short")
    # Runware XL turbo duration range: 30–300s
    dur = max(30.0, min(float(duration), 300.0))
    task_uuid = str(uuid.uuid4())

    song_settings: dict[str, Any] = {
        "vocalLanguage": "unknown" if instrumental else "en",
    }
    if not instrumental:
        lyric_text = (lyrics or "").strip() or _scaffold_lyrics(text)
        song_settings["lyrics"] = lyric_text[:3000]
        if len(song_settings["lyrics"]) < 10:
            song_settings["lyrics"] = _scaffold_lyrics(text)[:3000]

    body = [
        {
            "taskType": "audioInference",
            "taskUUID": task_uuid,
            "model": model,
            "positivePrompt": text[:3000],
            "duration": dur,
            "steps": 8,
            "outputFormat": "MP3",
            "deliveryMethod": "async",
            "includeCost": True,
            "settings": song_settings,
            "audioSettings": {
                "bitrate": 192,
                "channels": 2,
                "sampleRate": 44100,
            },
        }
    ]
    headers = _runware_headers()
    with httpx.Client(timeout=60.0) as client:
        submit = client.post(RUNWARE_API, headers=headers, json=body)
        if submit.status_code >= 400:
            raise FalError(
                f"Runware submit failed ({submit.status_code}): {submit.text[:500]}",
                status=submit.status_code,
                payload=submit.text,
            )
        submitted = submit.json()
        if isinstance(submitted, dict) and submitted.get("errors"):
            err = submitted["errors"][0] if submitted["errors"] else submitted
            msg = err.get("message") if isinstance(err, dict) else str(err)
            raise FalError(f"Runware submit error: {msg}", payload=submitted)

        # Async ack may only echo taskUUID; poll getResponse until audioURL.
        deadline = time.monotonic() + timeout_sec
        poll_interval = 2.0
        while time.monotonic() < deadline:
            poll = client.post(
                RUNWARE_API,
                headers=headers,
                json=[{"taskType": "getResponse", "taskUUID": task_uuid}],
            )
            if poll.status_code >= 400:
                raise FalError(
                    f"Runware poll failed ({poll.status_code})",
                    status=poll.status_code,
                    payload=poll.text,
                )
            payload = poll.json()
            errors = payload.get("errors") if isinstance(payload, dict) else None
            if errors:
                err = errors[0]
                msg = err.get("message") if isinstance(err, dict) else str(err)
                raise FalError(f"Runware generation failed: {msg}", payload=payload)

            rows = payload.get("data") if isinstance(payload, dict) else None
            if not isinstance(rows, list):
                rows = payload if isinstance(payload, list) else []

            for row in rows:
                if not isinstance(row, dict):
                    continue
                status = (row.get("status") or "").lower()
                audio_url = row.get("audioURL") or row.get("audioUrl")
                if audio_url and status in {"", "success"}:
                    return {
                        "request_id": task_uuid,
                        "data": {
                            "audio": {"url": audio_url},
                            "seed": row.get("seed"),
                            "cost": row.get("cost"),
                        },
                        "model": model,
                        "provider": "runware",
                    }
                if status == "error":
                    err = row.get("error") or row
                    msg = err.get("message") if isinstance(err, dict) else str(err)
                    raise FalError(f"Runware generation failed: {msg}", payload=row)

            time.sleep(poll_interval)
            poll_interval = min(10.0, poll_interval + 1.0)

        raise FalError("Runware generation timed out", payload={"request_id": task_uuid})


def _wavespeed_headers() -> dict[str, str]:
    key = settings.wavespeed_api_key.strip()
    if key.lower().startswith("bearer "):
        key = key[7:].strip()
    if not key:
        raise FalError("WAVESPEED_API_KEY is not configured")
    return {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _wavespeed_lyrics(
    prompt: str,
    *,
    lyrics: str | None,
    instrumental: bool,
) -> str:
    """WaveSpeed: empty lyrics ⇒ instrumental; use [instrumental] when explicit."""
    if instrumental:
        return "[instrumental]"
    text = (lyrics or "").strip()
    if text:
        return text[:4000]
    return _scaffold_lyrics(prompt)


def _generate_song_wavespeed(
    prompt: str,
    *,
    duration: float,
    lyrics: str | None,
    instrumental: bool,
    timeout_sec: float,
) -> dict[str, Any]:
    model = settings.wavespeed_ace_model_id.strip() or "wavespeed-ai/ace-step-1.5"
    tags = prompt.strip()[:500]
    if not tags:
        raise FalError("Song prompt is empty")
    dur = max(5.0, min(float(duration), 240.0))
    body = {
        "tags": tags,
        "lyrics": _wavespeed_lyrics(prompt, lyrics=lyrics, instrumental=instrumental),
        "duration": dur,
        "seed": -1,
    }
    headers = _wavespeed_headers()
    with httpx.Client(timeout=60.0) as client:
        submit = client.post(f"{WAVESPEED_BASE}/{model}", headers=headers, json=body)
        if submit.status_code >= 400:
            raise FalError(
                f"WaveSpeed submit failed ({submit.status_code}): {submit.text[:500]}",
                status=submit.status_code,
                payload=submit.text,
            )
        submitted = submit.json()
        task = submitted.get("data") if isinstance(submitted, dict) and "data" in submitted else submitted
        if not isinstance(task, dict):
            raise FalError("WaveSpeed submit returned unexpected payload", payload=submitted)
        prediction_id = task.get("id")
        if not prediction_id:
            raise FalError("WaveSpeed submit missing prediction id", payload=submitted)
        result_url = (task.get("urls") or {}).get("get") or (
            f"{WAVESPEED_BASE}/predictions/{prediction_id}/result"
        )

        deadline = time.monotonic() + timeout_sec
        poll_interval = 2.0
        while time.monotonic() < deadline:
            res = client.get(result_url, headers=headers)
            if res.status_code >= 400:
                raise FalError(
                    f"WaveSpeed poll failed ({res.status_code})",
                    status=res.status_code,
                    payload=res.text,
                )
            payload = res.json()
            if isinstance(payload, dict) and payload.get("code") not in (None, 200):
                raise FalError(
                    f"WaveSpeed result error: {payload.get('message') or payload}",
                    payload=payload,
                )
            data = payload.get("data") if isinstance(payload, dict) and "data" in payload else payload
            if not isinstance(data, dict):
                raise FalError("WaveSpeed result unexpected shape", payload=payload)
            status = (data.get("status") or "").lower()
            if status == "completed":
                outputs = data.get("outputs") or []
                audio_url = None
                if outputs:
                    first = outputs[0]
                    if isinstance(first, str):
                        audio_url = first
                    elif isinstance(first, dict):
                        audio_url = first.get("url") or first.get("audio")
                if not audio_url:
                    raise FalError("WaveSpeed result missing audio url", payload=data)
                return {
                    "request_id": str(prediction_id),
                    "data": {
                        "audio": {"url": audio_url},
                        "seed": data.get("seed"),
                        "outputs": outputs,
                    },
                    "model": model,
                    "provider": "wavespeed",
                }
            if status in {"failed", "cancelled", "timeout"}:
                err = data.get("error") or status
                raise FalError(f"WaveSpeed generation failed: {err}", payload=data)
            time.sleep(poll_interval)
            poll_interval = min(10.0, poll_interval + 1.0)

        raise FalError(
            "WaveSpeed generation timed out",
            payload={"request_id": prediction_id},
        )


def _generate_song_fal(
    prompt: str,
    *,
    duration: float,
    lyrics: str | None,
    instrumental: bool,
    timeout_sec: float,
) -> dict[str, Any]:
    lyric_text = (lyrics or "").strip()
    tags_model = settings.fal_ace_model_id.strip() or "fal-ai/ace-step"
    prompt_model = settings.fal_ace_prompt_model_id.strip() or "fal-ai/ace-step/prompt-to-audio"

    if instrumental:
        body = {
            "prompt": prompt.strip(),
            "instrumental": True,
            "duration": float(duration),
        }
        return _submit_and_poll(prompt_model, body, timeout_sec=timeout_sec)

    if lyric_text:
        body = {
            "tags": prompt.strip()[:500],
            "lyrics": lyric_text[:4000],
            "duration": float(duration),
        }
        return _submit_and_poll(tags_model, body, timeout_sec=timeout_sec)

    body = {
        "prompt": prompt.strip(),
        "instrumental": False,
        "duration": float(duration),
    }
    return _submit_and_poll(prompt_model, body, timeout_sec=timeout_sec)


def generate_song_audio(
    prompt: str,
    *,
    duration: float = 60.0,
    lyrics: str | None = None,
    instrumental: bool = False,
    timeout_sec: float = 480.0,
) -> dict[str, Any]:
    """Full-song generation: Modal XL turbo → Runware → WaveSpeed → Fal."""
    provider = (settings.sargam_song_provider or "auto").strip().lower()
    kwargs = dict(
        duration=duration,
        lyrics=lyrics,
        instrumental=instrumental,
        timeout_sec=timeout_sec,
    )

    modal_ready = bool(settings.modal_token_id.strip() and settings.modal_token_secret.strip())

    chain: list[tuple[str, Any]] = []
    if provider in {"auto", "modal"} and modal_ready:
        chain.append(("modal", _generate_song_modal))
    if provider in {"auto", "runware"} and settings.runware_api_key.strip():
        chain.append(("runware", _generate_song_runware))
    if provider in {"auto", "wavespeed"} and settings.wavespeed_api_key.strip():
        chain.append(("wavespeed", _generate_song_wavespeed))
    if provider in {"auto", "fal"} and settings.fal_key.strip():
        chain.append(("fal", _generate_song_fal))

    if provider == "modal" and not modal_ready:
        raise FalError("Modal song provider needs MODAL_TOKEN_ID and MODAL_TOKEN_SECRET")
    if provider == "runware" and not settings.runware_api_key.strip():
        raise FalError("RUNWARE_API_KEY is required for song provider=runware")
    if provider == "wavespeed" and not settings.wavespeed_api_key.strip():
        raise FalError("WAVESPEED_API_KEY is required for song provider=wavespeed")
    if provider == "fal" and not settings.fal_key.strip():
        raise FalError("FAL_KEY is required for song provider=fal")

    if not chain:
        raise FalError(
            "No song provider configured. Deploy Modal "
            "(`modal deploy modal_apps/ace_step_song.py`) and set "
            "MODAL_TOKEN_ID / MODAL_TOKEN_SECRET, or set RUNWARE_API_KEY / WAVESPEED_API_KEY."
        )

    last_exc: FalError | None = None
    for name, fn in chain:
        try:
            return fn(prompt, **kwargs)
        except FalError as exc:
            last_exc = exc
            # Only cascade in auto mode; pinned provider fails hard.
            if provider != "auto":
                raise
            continue

    assert last_exc is not None
    raise last_exc


# Back-compat alias used by older call sites / tests.
def generate_text_to_audio(
    prompt: str,
    *,
    duration: float = 30.0,
    output_format: str = "mp3",
    timeout_sec: float = 300.0,
) -> dict[str, Any]:
    return generate_clip_audio(
        prompt,
        duration=duration,
        output_format=output_format,
        timeout_sec=timeout_sec,
    )
