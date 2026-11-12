"""Türkçe TTS kalite kapısı: gerçek WAV → bağımsız ASR (faster-whisper).

Bu adım yalnızca anlaşılırlık kanıtı üretir. İnsan dinlemesi, doğal prozodi veya
konuşmacı benzerliği iddia etmez; ASR sonuçları raporda ayrı başlık altındadır.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys
import unicodedata

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="backslashreplace")

# Türkçe kalite vakaları: karakterler, sayı/birim, özel ad, uzun cümle, konuşma dili, ekler.
CASES = [
    ("turkish-characters", "Işık İĞDIR çığlığı şoförün ölçümünü gösterdi; güvercin ğ ile ünlüydü.", "ıİşğçöüÜŞĞÇÖ"),
    ("numbers-units", "Sıcaklık eksi sekiz derece, rüzgâr yirmi beş kilometre bölü saniye, alan yedi yüz seksen üç bin beş yüz altmış iki kilometre kare.", "8 °C"),
    ("proper-nouns", "TÜBİTAK'ın Çankırı'daki ölçümünde Niğde, Şanlıurfa ve İstanbul karşılaştırıldı.", "TÜBİTAK"),
    ("long-sentence", "Buzun suda yüzmesinin nedeni, su donarken moleküllerin düzenli ve açık bir kristal kafes oluşturması, bu kafesin daha fazla yer kaplaması ve böylece buzun yoğunluğunun sudan daha düşük kalmasıdır.", "kristal"),
    ("conversational", "Bakın, aslında olay çok basit: buz sudan hafif olduğu için yüzüyor, o kadar!", "buz"),
    ("suffixes", "Ankara'ya, İzmir'den, Bursa'da, Trabzon'a giden yolları ölçtük ve sonuçları karşılaştırdık.", "Ankara"),
    ("ordinal-and-percent", "Yarışmada üçüncü oldu; sıcaklık yüzde on dört virgül beş arttı.", "üçüncü"),
]

# ASR'de okunuş farkı yaratan ama anlamı bozmayan ekleri karşılaştırmak için
# Türkçe'ye duyarlı sadeleştirme: aksan/NFKD farkları ve noktalama yok sayılır.
def normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text).casefold().replace("i\u0307", "i")
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    return " ".join(text.split())


def edit_distance(reference: list[str], hypothesis: list[str]) -> int:
    previous = list(range(len(hypothesis) + 1))
    for index, ref in enumerate(reference, start=1):
        current = [index]
        for position, hyp in enumerate(hypothesis, start=1):
            current.append(min(previous[position] + 1, current[position - 1] + 1, previous[position - 1] + (ref != hyp)))
        previous = current
    return previous[-1]


def scores(expected: str, transcript: str) -> dict[str, object]:
    reference_words, hypothesis_words = normalize(expected).split(), normalize(transcript).split()
    reference_chars, hypothesis_chars = list(normalize(expected).replace(" ", "")), list(normalize(transcript).replace(" ", ""))
    cer = edit_distance(reference_chars, hypothesis_chars) / max(1, len(reference_chars))
    wer = edit_distance(reference_words, hypothesis_words) / max(1, len(reference_words))
    return {"cer": round(cer, 4), "wer": round(wer, 4), "transcriptWords": len(hypothesis_words), "referenceWords": len(reference_words)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True, help="Bu betikle üretilmiş gerçek Türkçe WAV dosyası")
    parser.add_argument("--text", required=True, help="Sentezlenmiş referans metin")
    parser.add_argument("--case", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="small")
    args = parser.parse_args()
    report: dict[str, object] = {"case": args.case, "audio": args.audio, "expectedText": args.text, "humanListeningPerformed": False, "asr": None, "status": "unknown"}
    try:
        from faster_whisper import WhisperModel  # type: ignore[import-not-found]
    except Exception as error:  # noqa: BLE001
        report["status"] = "asr-unavailable"
        report["error"] = f"faster-whisper kurulu değil: {type(error).__name__}: {error}"
        report["scores"] = scores(args.text, "")
        Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"status": report["status"]}, ensure_ascii=False))
        return 2
    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    segments, info = model.transcribe(args.audio, language="tr", beam_size=5, vad_filter=True, condition_on_previous_text=False)
    transcript = " ".join(segment.text.strip() for segment in segments).strip()
    report["asr"] = {"engine": "faster-whisper", "model": args.model, "computeType": "int8", "language": info.language, "languageProbability": round(float(info.language_probability), 3)}
    report["transcript"] = transcript
    report["scores"] = scores(args.text, transcript)
    report["status"] = "evaluated"
    report["note"] = "ASR yalnızca anlaşılırlığı ölçer; doğal prozodi, vurgu ve konuşmacı benzerliği dinlenmeden doğrulanmış sayılmaz."
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"status": report["status"], "cer": report["scores"]["cer"], "wer": report["scores"]["wer"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
