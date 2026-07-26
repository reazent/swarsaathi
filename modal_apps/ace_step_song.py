"""Sargam full-song generation on Modal — ACE-Step 1.5 XL Turbo.

Deploy:
  modal deploy modal_apps/ace_step_song.py

Smoke test (after deploy):
  modal run modal_apps/ace_step_song.py --prompt "warm bollywood ballad" --duration 30

The Render API calls the authenticated generate web endpoint with
MODAL_TOKEN_ID / MODAL_TOKEN_SECRET (Modal-Key / Modal-Secret headers).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

import modal

APP_NAME = "sargam-ace-step"
# Best hosted-quality checkpoint in the ACE-Step 1.5 family (4B DiT).
DEFAULT_CONFIG = "acestep-v15-xl-turbo"
DEFAULT_LM = "acestep-5Hz-lm-4B"

checkpoints_dir = "/opt/ace-step/checkpoints"
audio_dir = "/opt/ace-step/generated"
model_cache = modal.Volume.from_name("sargam-ace-step-checkpoints", create_if_missing=True)
audio_cache = modal.Volume.from_name("sargam-ace-step-audio", create_if_missing=True)

image = (
    modal.Image.from_registry(
        "nvidia/cuda:13.0.0-cudnn-devel-ubuntu22.04",
        add_python="3.12",
    )
    .apt_install("git", "ffmpeg")
    .run_commands(
        "git clone --branch v0.1.6 --depth 1 https://github.com/ace-step/ACE-Step-1.5.git /opt/ace-step",
    )
    .uv_pip_install(
        "/opt/ace-step",
        "hf_transfer==0.1.9",
        "torchcodec==0.10.0",
        "torch~=2.10.0",
        "fastapi[standard]==0.115.4",
    )
    .env(
        {
            "ACESTEP_PROJECT_ROOT": "/opt/ace-step",
            "HF_HUB_ENABLE_HF_TRANSFER": "1",
            "ACESTEP_CONFIG_PATH": DEFAULT_CONFIG,
            "ACESTEP_LM_MODEL": DEFAULT_LM,
        }
    )
    .entrypoint([])
)

serve_image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "fastapi[standard]==0.115.4",
)

app = modal.App(APP_NAME)


def _ensure_xl_turbo_weights() -> None:
    """Download ACE-Step XL turbo weights into the shared Volume if missing."""
    from huggingface_hub import snapshot_download

    target = Path(checkpoints_dir) / "acestep-v15-xl-turbo"
    marker = target / "config.json"
    if marker.exists() or any(target.glob("*.safetensors")):
        return
    target.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id="ACE-Step/acestep-v15-xl-turbo",
        local_dir=str(target),
        local_dir_use_symlinks=False,
    )


@app.cls(
    # A10 (24GB) works without Modal L40S billing; upgrade to L40S/A100-80GB for XL headroom.
    gpu="A10",
    image=image,
    volumes={checkpoints_dir: model_cache, audio_dir: audio_cache},
    timeout=900,
    scaledown_window=300,
)
class MusicGenerator:
    @modal.enter()
    def init(self) -> None:
        import os

        from acestep.handler import AceStepHandler
        from acestep.llm_inference import LLMHandler
        from acestep.model_downloader import ensure_lm_model, ensure_main_model

        config_path = os.environ.get("ACESTEP_CONFIG_PATH", DEFAULT_CONFIG)
        lm_model_name = os.environ.get("ACESTEP_LM_MODEL", DEFAULT_LM)

        Path(checkpoints_dir).mkdir(parents=True, exist_ok=True)
        Path(audio_dir).mkdir(parents=True, exist_ok=True)

        # Base ACE-Step 1.5 assets + optional XL turbo DiT override.
        ensure_main_model(checkpoints_dir=checkpoints_dir)
        if "xl" in config_path:
            _ensure_xl_turbo_weights()
        ensure_lm_model(model_name=lm_model_name, checkpoints_dir=checkpoints_dir)

        self.dit_handler = AceStepHandler()
        init_status, enable_generate = self.dit_handler.initialize_service(
            project_root="/opt/ace-step",
            config_path=config_path,
            device="cuda",
        )
        if not enable_generate:
            raise RuntimeError(f"DiT model initialization failed: {init_status}")

        self.llm_handler = LLMHandler()
        lm_status, lm_success = self.llm_handler.initialize(
            checkpoint_dir=checkpoints_dir,
            lm_model_path=lm_model_name,
            backend="vllm",
            device="cuda",
        )
        if not lm_success:
            raise RuntimeError(f"LM initialization failed: {lm_status}")

        self.config_path = config_path

    @modal.method()
    def run(
        self,
        prompt: str,
        lyrics: str,
        duration: float = 60.0,
        format: str = "mp3",
        manual_seeds: Optional[int] = None,
        instrumental: bool = False,
    ) -> dict[str, Any]:
        from acestep.inference import GenerationConfig, GenerationParams, generate_music

        lyric_text = "[Instrumental]" if instrumental else (lyrics or "").strip()
        if not lyric_text:
            lyric_text = (
                f"[verse]\n{prompt.strip()[:280]}\n\n"
                "[chorus]\nHold this feeling through the night\n"
                "Every note a thread of light\n"
            )

        dur = max(15.0, min(float(duration), 240.0))
        params = GenerationParams(
            caption=prompt.strip(),
            lyrics=lyric_text,
            duration=dur,
            thinking=True,
        )
        config = GenerationConfig(
            audio_format=format,
            batch_size=1,
            seeds=[manual_seeds] if manual_seeds is not None else None,
            use_random_seed=manual_seeds is None,
        )
        result = generate_music(
            self.dit_handler,
            self.llm_handler,
            params,
            config,
            save_dir="/dev/shm",
        )
        if not result.success:
            raise RuntimeError(f"Music generation failed: {result.error}")

        src = Path(result.audios[0]["path"])
        file_id = uuid4().hex
        dest = Path(audio_dir) / f"{file_id}.{format}"
        dest.write_bytes(src.read_bytes())
        audio_cache.commit()

        seed = None
        if manual_seeds is not None:
            seed = manual_seeds
        elif getattr(result, "seeds", None):
            seed = result.seeds[0] if result.seeds else None

        return {
            "file_id": file_id,
            "format": format,
            "duration": dur,
            "seed": seed,
            "model": self.config_path,
        }

@app.function(
    image=serve_image,
    volumes={audio_dir: audio_cache},
    timeout=60,
)
@modal.fastapi_endpoint(method="GET", label="sargam-ace-audio")
def serve_audio(file_id: str, format: str = "mp3"):
    """Public audio fetch for generated clips (UUID is the capability)."""
    from fastapi import HTTPException
    from fastapi.responses import Response

    fmt = format.lower() if format in {"mp3", "wav"} else "mp3"
    # Basic path safety — only hex ids we mint.
    if not file_id or any(c not in "0123456789abcdef" for c in file_id.lower()):
        raise HTTPException(status_code=400, detail="invalid file_id")
    path = Path(audio_dir) / f"{file_id}.{fmt}"
    if not path.exists():
        audio_cache.reload()
    if not path.exists():
        raise HTTPException(status_code=404, detail="not found")
    media = "audio/mpeg" if fmt == "mp3" else "audio/wav"
    return Response(
        content=path.read_bytes(),
        media_type=media,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.local_entrypoint()
def main(
    prompt: str = "warm bollywood romantic ballad, soft strings, tabla, female vocals",
    lyrics: str = "",
    duration: float = 30.0,
    instrumental: bool = False,
):
    gen = MusicGenerator()
    meta = gen.run.remote(
        prompt,
        lyrics,
        duration=duration,
        format="mp3",
        instrumental=instrumental,
    )
    print("generated:", meta)
    print(f"file_id={meta['file_id']} format={meta['format']}")
