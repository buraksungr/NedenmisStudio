"""Nedenmiş Studio — gerçek Chatterbox Multilingual V3 köprüsü.

Bu dosya bağımsız çalıştırılabilir; Electron yalnızca JSON Lines protokolünü kullanır.
Model asla başka bir TTS motoruyla değiştirilmez.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import sys
import time
import traceback
import wave

REPO_ID = "ResembleAI/chatterbox"
REQUIRED_FILES = [
    "ve.pt",
    "t3_mtl23ls_v3.safetensors",
    "s3gen.pt",
    "grapheme_mtl_merged_expanded_v1.json",
    "conds.pt",
    "Cangjie5_TC.json",
]


def emit(event: str, **payload: object) -> None:
    print(json.dumps({"event": event, **payload}, ensure_ascii=False), flush=True)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def command_status(_: argparse.Namespace) -> None:
    import torch
    import torchaudio
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # noqa: F401
    from importlib.metadata import version

    emit(
        "status",
        python=platform.python_version(),
        torch=torch.__version__,
        torchaudio=torchaudio.__version__,
        chatterbox=version("chatterbox-tts"),
        cuda=bool(torch.cuda.is_available()),
        platform=platform.platform(),
    )


def command_download(args: argparse.Namespace) -> None:
    from huggingface_hub import snapshot_download

    emit("download_started", repo=REPO_ID, files=REQUIRED_FILES)
    snapshot = snapshot_download(
        repo_id=REPO_ID,
        repo_type="model",
        revision="main",
        allow_patterns=REQUIRED_FILES,
    )
    missing = [name for name in REQUIRED_FILES if not (Path(snapshot) / name).is_file()]
    if missing:
        raise RuntimeError(f"Model indirmesi eksik: {', '.join(missing)}")
    emit("download_complete", snapshot=snapshot)


class Worker:
    def __init__(self, args: argparse.Namespace) -> None:
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
        os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
        import torch
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        self.torch = torch
        torch.set_num_threads(args.threads)
        torch.set_num_interop_threads(1)
        snapshot = Path(args.snapshot)
        missing = [name for name in REQUIRED_FILES if not (snapshot / name).is_file()]
        if missing:
            raise RuntimeError(f"Model dosyaları eksik: {', '.join(missing)}")
        emit("model_loading", model="Chatterbox Multilingual V3", device="cpu", threads=args.threads)
        started = time.perf_counter()
        self.model = ChatterboxMultilingualTTS.from_local(snapshot, device="cpu", t3_model="v3")
        self.model_load_seconds = round(time.perf_counter() - started, 3)
        self.reference_signature: tuple[str, int, int] | None = None
        emit("ready", model="Chatterbox Multilingual V3", device="cpu", model_load_seconds=self.model_load_seconds)

    def prepare_reference(self, reference: Path, exaggeration: float) -> str:
        signature = (str(reference), reference.stat().st_size, reference.stat().st_mtime_ns)
        if signature != self.reference_signature:
            emit("reference_loading", path=str(reference))
            self.model.prepare_conditionals(str(reference), exaggeration=exaggeration)
            self.reference_signature = signature
        return sha256(reference)

    def synthesize(self, request: dict[str, object]) -> None:
        text = str(request.get("text", "")).strip()
        reference = Path(str(request.get("reference_path", "")))
        output = Path(str(request.get("output_path", "")))
        if not text:
            raise ValueError("Seslendirilecek metin boş olamaz.")
        if not reference.is_file():
            raise ValueError("Referans ses bulunamadı. Önce izinli bir ses kaydı yükleyin.")
        exaggeration = float(request.get("exaggeration", 0.5))
        cfg_weight = float(request.get("cfg_weight", 0.5))
        temperature = float(request.get("temperature", 0.8))
        repetition_penalty = float(request.get("repetition_penalty", 1.2))
        reference_hash = self.prepare_reference(reference, exaggeration)
        output.parent.mkdir(parents=True, exist_ok=True)
        emit("generation_started", language="tr", model="Chatterbox Multilingual V3")
        started = time.perf_counter()
        with self.torch.inference_mode():
            samples = self.model.generate(
                text,
                language_id="tr",
                audio_prompt_path=None,  # Koşullar yukarıda gerçek referanstan hazırlandı.
                exaggeration=exaggeration,
                cfg_weight=cfg_weight,
                temperature=temperature,
                repetition_penalty=repetition_penalty,
            )
        generation_seconds = round(time.perf_counter() - started, 3)
        pcm = samples.squeeze(0).detach().cpu().numpy()
        pcm = self.torch.clamp(self.torch.from_numpy(pcm), -1.0, 1.0).numpy()
        with wave.open(str(output), "wb") as target:
            target.setnchannels(1)
            target.setsampwidth(2)
            target.setframerate(self.model.sr)
            target.writeframes((pcm * 32767.0).astype("<i2").tobytes())
        with wave.open(str(output), "rb") as generated:
            duration = generated.getnframes() / generated.getframerate()
        if duration <= 0 or output.stat().st_size < 1000:
            raise RuntimeError("Model boş veya geçersiz bir ses dosyası üretti.")
        emit(
            "result",
            output_path=str(output),
            duration=round(duration, 3),
            generation_seconds=generation_seconds,
            model_load_seconds=self.model_load_seconds,
            reference_sha256=reference_hash,
            model="Chatterbox Multilingual V3",
            checkpoint="t3_mtl23ls_v3.safetensors",
            language="tr",
            device="cpu",
            torch=self.torch.__version__,
        )


def command_worker(args: argparse.Namespace) -> None:
    worker = Worker(args)
    for line in sys.stdin:
        request_id = "unknown"
        try:
            request = json.loads(line)
            request_id = str(request.get("id", "unknown"))
            worker.synthesize(request)
        except Exception as error:  # Worker can remain available for the next scene.
            traceback.print_exc(file=sys.stderr)
            emit("error", id=request_id, message=str(error))


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status")
    sub.add_parser("download")
    worker = sub.add_parser("worker")
    worker.add_argument("--snapshot", required=True)
    worker.add_argument("--threads", type=int, default=2)
    args = parser.parse_args()
    try:
        if args.command == "status":
            command_status(args)
        elif args.command == "download":
            command_download(args)
        else:
            command_worker(args)
    except Exception as error:
        traceback.print_exc(file=sys.stderr)
        emit("fatal", message=str(error))
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
