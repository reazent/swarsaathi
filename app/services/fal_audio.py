"""Fal.ai Stable Audio 3 client (queue + poll)."""

from __future__ import annotations

import time
from typing import Any

import httpx

from app.config import settings

FAL_QUEUE = "https://queue.fal.run"
FAL_AUTH_HEADER = "Authorization"


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


def generate_text_to_audio(
    prompt: str,
    *,
    duration: float = 30.0,
    output_format: str = "mp3",
    timeout_sec: float = 300.0,
) -> dict[str, Any]:
    """Submit + poll Fal queue until Stable Audio result is ready."""
    model = settings.fal_model_id.strip() or "fal-ai/stable-audio-3/medium/text-to-audio"
    body = {
        "prompt": prompt,
        "duration": float(duration),
        "num_inference_steps": 8,
        "enable_safety_checker": True,
        "output_format": output_format,
        "bitrate": "192k",
    }
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
            # Some endpoints return the result synchronously.
            if "audio" in submitted:
                return {"request_id": None, "data": submitted}
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
                return {"request_id": request_id, "data": data}
            if status in {"FAILED", "ERROR", "CANCELLED"}:
                raise FalError("Fal generation failed", payload=payload)
            time.sleep(1.5)

        raise FalError("Fal generation timed out", payload={"request_id": request_id})
