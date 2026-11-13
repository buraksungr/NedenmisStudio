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

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="backslashreplace")


ONES = ("", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz")
TENS = ("", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan")
SCALES = ("", "bin", "milyon", "milyar", "trilyon", "katrilyon", "kentilyon", "seksilyon", "septilyon", "oktilyon", "nonilyon", "desilyon")
MONTHS = ("Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık")
# A hyphen between two numbers is commonly a Whisper list separator, not a minus sign.
NUMBER = r"(?<![\w.])[+-]?\d+(?:\.\d+)*(?:,\d+)?"
CURRENCIES = {"₺": "lira", "tl": "lira", "try": "lira", "$": "dolar", "usd": "dolar", "€": "avro", "eur": "avro", "euro": "avro", "£": "sterlin", "gbp": "sterlin", "lira": "lira", "dolar": "dolar", "avro": "avro", "sterlin": "sterlin"}
UNITS = {
    "km/s": "kilometre bölü saniye", "m/s": "metre bölü saniye", "kwh": "kilovat saat", "khz": "kilohertz", "mhz": "megahertz", "ghz": "gigahertz",
    "km": "kilometre", "cm": "santimetre", "mm": "milimetre", "nm": "nanometre", "kg": "kilogram", "mg": "miligram", "ml": "mililitre",
    "tb": "terabayt", "gb": "gigabayt", "mb": "megabayt", "kb": "kilobayt", "kw": "kilovat", "kpa": "kilopaskal", "hpa": "hektopaskal",
    "hz": "hertz", "sn": "saniye", "dk": "dakika", "sa": "saat", "pa": "paskal", "°c": "derece", "°f": "derece Fahrenhayt",
    "m": "metre", "g": "gram", "l": "litre", "s": "saniye", "w": "vat", "v": "volt", "a": "amper",
}


def integer_words(raw: str | int) -> str:
    token = re.sub(r"\s+", "", str(raw))
    if not re.fullmatch(r"[+-]?\d+", token):
        raise ValueError(f"Tam sayı okunamıyor: {token}")
    value = int(token)
    negative = value < 0
    value = abs(value)
    if value == 0:
        return "sıfır"
    groups = []
    while value:
        groups.append(value % 1000)
        value //= 1000
    if len(groups) > len(SCALES):
        raise ValueError("Sayı Türkçe ölçek adı sınırını aşıyor.")
    parts = []
    for index in range(len(groups) - 1, -1, -1):
        group = groups[index]
        if not group:
            continue
        hundreds, rest = divmod(group, 100)
        below = " ".join(part for part in ((f"{ONES[hundreds]} " if hundreds > 1 else "") + ("yüz" if hundreds else ""), TENS[rest // 10], ONES[rest % 10]) if part)
        parts.append("bin" if index == 1 and group == 1 else below + (f" {SCALES[index]}" if index else ""))
    return ("eksi " if negative else "") + " ".join(parts)


def decimal_words(raw: str) -> str:
    token = re.sub(r"\s+", "", raw)
    sign = ""
    if token.startswith(("+", "-")):
        sign = "eksi " if token[0] == "-" else "artı "
        token = token[1:]
    integer_part = token.split(",")[0]
    if re.fullmatch(r"\d{1,3}(?:\.\d{3})+", integer_part):
        token = token.replace(".", "")
    elif re.fullmatch(r"\d+\.\d+", integer_part):
        token = token.replace(".", ",", 1)
    elif "." in integer_part:
        return sign + " nokta ".join(decimal_words(part) for part in token.split("."))
    parts = token.split(",")
    result = sign + integer_words(parts[0] or "0")
    if len(parts) > 1:
        fraction = parts[1]
        leading_zeroes = len(fraction) - len(fraction.lstrip("0"))
        remainder = fraction[leading_zeroes:]
        fraction_words = ("sıfır " * leading_zeroes + integer_words(remainder)) if remainder else "sıfır"
        result += " virgül " + fraction_words
    return result


def date_words(day: int, month: int, year: int) -> str:
    return f"{integer_words(day)} {MONTHS[month - 1]} {integer_words(year)}"


def spoken_number_canonical(source: str) -> str:
    """Canonicalize visible and Whisper-written Turkish numbers without changing audio."""
    text = unicodedata.normalize("NFC", source)

    def iso_date(match: re.Match[str]) -> str:
        year, month, day = (int(value) for value in match.groups())
        return date_words(day, month, year) if 1 <= day <= 31 and 1 <= month <= 12 else match.group(0)

    def local_date(match: re.Match[str]) -> str:
        day, month, year = (int(value) for value in match.groups())
        return date_words(day, month, year) if 1 <= day <= 31 and 1 <= month <= 12 else match.group(0)

    text = re.sub(r"\b(\d{4})-([01]?\d)-([0-3]?\d)\b", iso_date, text)
    text = re.sub(r"\b([0-3]?\d)[./-]([01]?\d)[./-](\d{4})\b", local_date, text)

    def clock(match: re.Match[str]) -> str:
        hour, minute = int(match.group(2)), int(match.group(3))
        minutes = "" if minute == 0 else f" {'sıfır ' if match.group(3).startswith('0') else ''}{integer_words(minute)}"
        return f"saat {integer_words(hour)}{minutes}"

    text = re.sub(r"\b(saat\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)\b", clock, text, flags=re.IGNORECASE)
    text = re.sub(r"%\s*(" + NUMBER + ")", lambda match: "yüzde " + decimal_words(match.group(1)), text)
    text = re.sub("(" + NUMBER + r")\s*%", lambda match: "yüzde " + decimal_words(match.group(1)), text)
    text = re.sub(r"(₺|\$|€|£)\s*(" + NUMBER + ")", lambda match: f"{decimal_words(match.group(2))} {CURRENCIES[match.group(1).lower()]}", text)
    currency_names = "|".join(re.escape(key) for key in sorted((key for key in CURRENCIES if len(key) > 1), key=len, reverse=True))
    text = re.sub("(" + NUMBER + r")\s*(" + currency_names + "|₺)", lambda match: f"{decimal_words(match.group(1))} {CURRENCIES[match.group(2).lower()]}", text, flags=re.IGNORECASE)
    unit_pattern = "|".join(re.escape(key) for key in sorted(UNITS, key=len, reverse=True))
    text = re.sub("(" + NUMBER + r")\s*(" + unit_pattern + r")\b", lambda match: f"{decimal_words(match.group(1))} {UNITS[match.group(2).lower()]}", text, flags=re.IGNORECASE)
    text = re.sub("(" + NUMBER + r")[eE]([+-]?\d+)", lambda match: f"{decimal_words(match.group(1))} çarpı on üssü {integer_words(match.group(2))}", text)
    for symbol, words in (("±", " artı eksi "), ("×", " çarpı "), ("*", " çarpı "), ("≤", " küçük eşittir "), ("≥", " büyük eşittir "), ("≠", " eşit değildir "), ("≈", " yaklaşık "), ("∞", " sonsuz "), ("/", " bölü "), ("+", " artı "), ("^", " üssü "), ("=", " eşittir "), (">", " büyüktür "), ("<", " küçüktür ")):
        text = text.replace(symbol, words)
    text = re.sub(r"(?<=\d)\s*[xX]\s*(?=\d)", " çarpı ", text)
    text = re.sub(r"(?<=\d)\s+-\s+(?=\d)", " eksi ", text)
    text = re.sub(NUMBER, lambda match: decimal_words(match.group(0)), text)
    return " ".join(text.split())


def normalized(text: str) -> str:
    text = unicodedata.normalize("NFKD", spoken_number_canonical(text)).casefold()
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


def word_distance(reference: list[str], candidate: list[str]) -> int:
    """True word error rate distance, rather than character distance divided by words."""
    if not reference:
        return len(candidate)
    previous = list(range(len(candidate) + 1))
    for i, left in enumerate(reference, 1):
        current = [i]
        for j, right in enumerate(candidate, 1):
            current.append(min(current[-1] + 1, previous[j] + 1, previous[j - 1] + (left != right)))
        previous = current
    return previous[-1]


def scores(expected: str, transcript: str) -> dict[str, float | int | str]:
    wanted = normalized(expected)
    actual = normalized(transcript)
    wanted_words, actual_words = wanted.split(), actual.split()
    char_distance = distance(wanted, actual)
    edit_words = word_distance(wanted_words, actual_words)
    return {
        "cer": char_distance / max(1, len(wanted)),
        "wer": edit_words / max(1, len(wanted_words)),
        "referenceCharacters": len(wanted),
        "referenceWords": len(wanted_words),
        "transcriptWords": len(actual_words),
        "normalizedReference": wanted,
        "normalizedTranscript": actual,
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
        print(json.dumps(results[-1], ensure_ascii=True), flush=True)
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
