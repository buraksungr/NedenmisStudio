"""Independent Turkish intelligibility evidence for generated Chatterbox audio.

This is test-only tooling. It never replaces the production TTS engine and does
not claim human perceptual evaluation. faster-whisper is installed only by CI.
"""
from __future__ import annotations

import argparse
from array import array
import json
import math
from pathlib import Path
import re
import sys
import unicodedata
import wave


def normalized(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).casefold()
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = "".join(char if char.isalnum() else " " for char in text)
    return " ".join(text.split())


def distance(reference: str, candidate: str) -> int:
    if not reference:
        return len(candidate)
    previous = list(range(len(candidate) + 1))
    for i, left in enumerate(reference, 1):
        current = [i]
        for j, right in enumerate(candidate, 1):
            current.append(min(current[-1] + 1, previous[j] + 1, previous[j - 1] + (left != right)))
        previous = current
    return previous[-1]


def scores(expected: str, transcript: str) -> dict[str, float | int]:
    wanted = normalized(expected)
    actual = normalized(transcript)
    wanted_words, actual_words = wanted.split(), actual.split()
    char_distance = distance(wanted, actual)
    word_distance = distance(" ".join(wanted_words), " ".join(actual_words))
    return {
        "cer": char_distance / max(1, len(wanted)),
        "wer": word_distance / max(1, len(wanted_words)),
        "referenceCharacters": len(wanted),
        "referenceWords": len(wanted_words),
        "transcriptWords": len(actual_words),
    }


def waveform(path: Path) -> dict[str, float | int]:
    try:
        with wave.open(str(path), "rb") as source:
            channels, width, rate, count = source.getnchannels(), source.getsampwidth(), source.getframerate(), source.getnframes()
            if width != 2:
                return {"channels": channels, "sampleRate": rate, "sampleWidth": width, "frames": count, "durationSeconds": count / rate}
            raw = source.readframes(count)
        samples = array("h")
        samples.frombytes(raw)
        if sys.byteorder != "little":
            samples.byteswap()
        if not samples:
            raise ValueError("empty PCM")
        peak = max(abs(value) for value in samples)
        rms = math.sqrt(sum(value * value for value in samples) / len(samples)) / 32768
        return {
            "channels": channels,
            "sampleRate": rate,
            "sampleWidth": width,
            "frames": count,
            "durationSeconds": count / rate,
            "peak": peak / 32768,
            "rms": rms,
            "clippedRatio": sum(abs(value) >= 32750 for value in samples) / len(samples),
            "nearSilentRatio": sum(abs(value) < 100 for value in samples) / len(samples),
        }
    except (wave.Error, EOFError):
        # MP4/AAC is intentionally decoded by PyAV through faster-whisper.
        return {}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="large-v3-turbo")
    parser.add_argument("--compute-type", default="int8")
    args = parser.parse_args()
    manifest_path = Path(args.manifest)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    from faster_whisper import WhisperModel

    model = WhisperModel(args.model, device="cpu", compute_type=args.compute_type, cpu_threads=2, download_root=str(manifest_path.parent / "asr-models"))
    results = []
    for case in manifest["cases"]:
        audio = Path(case["audio"])
        if not audio.is_file():
            raise FileNotFoundError(audio)
        segments_iter, info = model.transcribe(
            str(audio), language="tr", beam_size=5, vad_filter=True,
            condition_on_previous_text=False, word_timestamps=True,
        )
        segments = [{"start": round(item.start, 3), "end": round(item.end, 3), "text": item.text.strip()} for item in segments_iter]
        transcript = " ".join(item["text"] for item in segments).strip()
        metrics = scores(case["text"], transcript)
        required = bool(case.get("required", False))
        passed = bool(transcript) and metrics["cer"] <= .20 and metrics["wer"] <= .35
        results.append({
            "id": case["id"], "audio": str(audio), "expectedText": case["text"],
            "transcript": transcript, "detectedLanguage": info.language,
            "languageProbability": info.language_probability, **metrics,
            "waveform": waveform(audio), "segments": segments,
            "required": required, "asrIntelligibilityPassed": passed,
        })
        print(json.dumps(results[-1], ensure_ascii=False), flush=True)
    failed = [item["id"] for item in results if item["required"] and not item["asrIntelligibilityPassed"]]
    report = {
        "ok": not failed,
        "asr": {"engine": "faster-whisper", "model": args.model, "device": "cpu", "computeType": args.compute_type, "forcedLanguage": "tr", "beamSize": 5},
        "thresholds": {"maxCER": .20, "maxWER": .35},
        "failedRequiredCases": failed,
        "humanListeningPerformed": False,
        "limitation": "ASR similarity is evidence of intelligibility, not proof of natural prosody, speaker similarity, or human listening quality.",
        "cases": results,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if failed:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
