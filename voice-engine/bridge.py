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

# Windows embedded Python otherwise defaults pipes to CP1252. NFKD diagnostics
# contain combining characters and must never abort an otherwise valid generation.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="backslashreplace")

REPO_ID = "ResembleAI/chatterbox"
# V3 model + tokenizer + decoder are one reproducible bundle, not a moving `main` alias.
MODEL_REVISION = "5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18"
REQUIRED_FILES = [
    "ve.pt",
    "t3_mtl23ls_v3.safetensors",
    "s3gen.pt",
    "grapheme_mtl_merged_expanded_v1.json",
    "conds.pt",
    "Cangjie5_TC.json",
]


def emit(event: str, **payload: object) -> None:
    print(json.dumps({"event": event, **payload}, ensure_ascii=True), flush=True)


def numeric(request: dict[str, object], key: str, default: float, low: float, high: float) -> float:
    """Model argümanlarını sessizce NaN/aralık dışına kaçırmadan sınırlar.

    Chatterbox üretimi NaN bir örnek üretirse çıktı sessizce bozuk olur; bu yüzden
    her sayısal parametre hem tip hem aralık olarak doğrulanır.
    """
    raw = request.get(key, default)
    try:
        value = float(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError) as error:
        raise ValueError(f"Geçersiz {key} değeri: {raw!r}") from error
    if value != value or value in (float("inf"), float("-inf")):
        raise ValueError(f"Geçersiz {key} değeri: {raw!r}")
    return max(low, min(high, value))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def command_status(_: argparse.Namespace) -> None:
    import inspect
    import torch
    import torchaudio
    from chatterbox import mtl_tts
    import perth
    from importlib.metadata import version

    watermarker_ready = callable(getattr(perth, "PerthImplicitWatermarker", None))
    if watermarker_ready:
        perth.PerthImplicitWatermarker(device="cpu")
    v3_supported = (
        "t3_model" in inspect.signature(mtl_tts.ChatterboxMultilingualTTS.from_local).parameters
        and getattr(mtl_tts, "MULTILINGUAL_T3_MODELS", {}).get("v3") == "t3_mtl23ls_v3.safetensors"
    )
    # Uygulamanın kullandığı paketin gerçek kimliği: sürüm numarası tek başına yetmez,
    # çünkü PyPI 0.1.7 ve sabitlenmiş kaynak aynı sürüm numarasını taşır.
    package_version = version("chatterbox-tts")
    package_file = str(Path(mtl_tts.__file__).resolve())
    mtl_digest = sha256(Path(mtl_tts.__file__).resolve())
    tokenizer_module = sys.modules.get("chatterbox.models.tokenizers.tokenizer")
    tokenizer_file = Path(tokenizer_module.__file__).resolve() if tokenizer_module else None
    emit(
        "status",
        python=platform.python_version(),
        package_version=package_version,
        package_file=package_file,
        mtl_tts_sha256=mtl_digest,
        tokenizer_sha256=sha256(tokenizer_file) if tokenizer_file else None,
        model_revision=MODEL_REVISION,
        torch=torch.__version__,
        torchaudio=torchaudio.__version__,
        chatterbox=package_version,
        v3_supported=v3_supported,
        watermarker_ready=watermarker_ready,
        cuda=bool(torch.cuda.is_available()),
        platform=platform.platform(),
    )


def command_download(args: argparse.Namespace) -> None:
    from huggingface_hub import snapshot_download

    emit("download_started", repo=REPO_ID, files=REQUIRED_FILES)
    snapshot = snapshot_download(
        repo_id=REPO_ID,
        repo_type="model",
        revision=MODEL_REVISION,
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
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS, punc_norm

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
        self.punc_norm = punc_norm
        # The archived generic loader defaults to lowercase (V2). The official V3
        # Space uses T3ConfigMultilingual.text_preproc = "NFKD,fullcase".
        # Preserve its exact V3 text path instead of feeding V2-normalized tokens.
        self.legacy_text_to_tokens = self.model.tokenizer.text_to_tokens
        def v3_text_to_tokens(text: str, language_id: str | None = None, lowercase: bool = False, nfkd_normalize: bool = True):
            return self.legacy_text_to_tokens(text, language_id=language_id, lowercase=False, nfkd_normalize=nfkd_normalize)
        self.v3_text_to_tokens = v3_text_to_tokens
        self.model.tokenizer.text_to_tokens = v3_text_to_tokens
        self.model_load_seconds = round(time.perf_counter() - started, 3)
        self.reference_signature: tuple[str, int, int] | None = None
        emit("ready", model="Chatterbox Multilingual V3", device="cpu", model_load_seconds=self.model_load_seconds, model_revision=MODEL_REVISION, text_preprocessing="NFKD,fullcase")

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
        exaggeration = numeric(request, "exaggeration", 0.5, 0.25, 2.0)
        cfg_weight = numeric(request, "cfg_weight", 0.5, 0.0, 1.0)
        temperature = numeric(request, "temperature", 0.8, 0.05, 1.5)
        repetition_penalty = numeric(request, "repetition_penalty", 1.2, 1.0, 2.0)
        legacy_lowercase = bool(request.get("legacy_lowercase", False))
        self.model.tokenizer.text_to_tokens = self.legacy_text_to_tokens if legacy_lowercase else self.v3_text_to_tokens
        normalized_text = self.punc_norm(text)
        token_row = self.model.tokenizer.text_to_tokens(normalized_text, language_id="tr")
        token_ids = [int(value) for value in token_row[0].tolist()]
        vocabulary = self.model.tokenizer.tokenizer.get_vocab()
        language_token_id = vocabulary.get("[tr]")
        unknown_token_id = vocabulary.get("[UNK]", 1)
        unknown_tokens = sum(value == unknown_token_id for value in token_ids)
        if language_token_id is None or not token_ids or token_ids[0] != language_token_id:
            raise RuntimeError("Türkçe [tr] dil tokenı metin dizisinin başına eklenemedi.")
        decoded_text = self.model.tokenizer.decode(token_ids)
        seed = int(request.get("seed", 0) or 0)
        if seed:
            self.torch.manual_seed(seed)
        emit("tokenization", language="tr", text_preprocessing="legacy-lowercase,NFKD" if legacy_lowercase else "NFKD,fullcase", normalized_text=normalized_text, decoded_text=decoded_text, token_count=len(token_ids), token_ids=token_ids, unknown_tokens=unknown_tokens, language_token_id=language_token_id, seed=seed)
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
            sample_rate=int(self.model.sr),
            channels=1,
            model_revision=MODEL_REVISION,
            text_preprocessing="legacy-lowercase,NFKD" if legacy_lowercase else "NFKD,fullcase",
            normalized_text=normalized_text,
            decoded_text=decoded_text,
            token_count=len(token_ids),
            token_ids=token_ids,
            language_token_id=language_token_id,
            unknown_tokens=unknown_tokens,
            seed=seed,
            torch=self.torch.__version__,
            effective={"exaggeration": exaggeration, "cfg_weight": cfg_weight, "temperature": temperature, "repetition_penalty": repetition_penalty},
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
            detail = traceback.format_exc()
            traceback.print_exc(file=sys.stderr)
            emit("error", id=request_id, message=str(error), traceback=detail[-12000:])


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
        detail = traceback.format_exc()
        traceback.print_exc(file=sys.stderr)
        emit("fatal", message=str(error), traceback=detail[-12000:])
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
