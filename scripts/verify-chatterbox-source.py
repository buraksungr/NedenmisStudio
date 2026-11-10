"""Uygulamanın gerçekten kullandığı Chatterbox kaynağını ve model revizyonunu doğrular.

Bu betik ağdan indirilen *sabitlenmiş* kaynağı (PyPI değil, codeload arşivi) ve
Türkçe metin yolunun ayrıntılarını kanıtlar. Model ağırlıkları Hugging Face'ten
indirilir; ağ erişimi yoksa betik bunu açıkça `skipped` olarak raporlar, asla
"doğrulandı" demez.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import sys
import urllib.request
import zipfile

SOURCE_REVISION = "ab55923c27757c90cfcc407baa57dc25a7d25217"
MODEL_REVISION = "5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18"
SOURCE_URL = f"https://codeload.github.com/resemble-ai/chatterbox/zip/{SOURCE_REVISION}"
MODEL_API = f"https://huggingface.co/api/models/ResembleAI/chatterbox/revision/{MODEL_REVISION}"
REQUIRED_FILES = ("ve.pt", "t3_mtl23ls_v3.safetensors", "s3gen.pt", "grapheme_mtl_merged_expanded_v1.json", "conds.pt", "Cangjie5_TC.json")

CHECKS = {
    "src/chatterbox/mtl_tts.py": [
        ('"tr": "Turkish"', "Türkçe dil kimliği resmî modelde kayıtlı"),
        ('"v3": "t3_mtl23ls_v3.safetensors"', "V3 ağırlık dosyası seçilebilir"),
        ("language_id.lower()", "generate() dil kimliğini küçük harfe çeviriyor"),
    ],
    "src/chatterbox/models/tokenizers/tokenizer.py": [
        ("def preprocess_text(self, raw_text: str, language_id: str = None, lowercase: bool = True", "tokenizer varsayılan olarak lowercase=True"),
        ('normalize("NFKD", preprocessed_text)', "NFKD normalizasyonu uygulanıyor"),
        ('txt = f"[{language_id.lower()}]{txt}"', "[tr] dil tokenı dizinin başına ekleniyor"),
    ],
}


def fetch(url: str, timeout: int = 60) -> bytes:
    with urllib.request.urlopen(url, timeout=timeout) as response:  # noqa: S310 - sabit URL
        return response.read()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    report: dict[str, object] = {
        "sourceRevision": SOURCE_REVISION, "modelRevision": MODEL_REVISION, "sourceUrl": SOURCE_URL,
        "checkedAt": None, "sourceChecks": [], "modelFiles": None, "status": "unknown", "error": None,
    }
    import datetime
    report["checkedAt"] = datetime.datetime.now(datetime.UTC).isoformat()
    try:
        archive = fetch(SOURCE_URL, timeout=120)
        report["sourceArchiveSha256"] = hashlib.sha256(archive).hexdigest()
        report["sourceArchiveBytes"] = len(archive)
        with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
            root = bundle.namelist()[0].split("/")[0]
            for name, checks in CHECKS.items():
                content = bundle.read(f"{root}/{name}").decode("utf-8")
                digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
                for needle, description in checks:
                    report["sourceChecks"].append({"file": name, "sha256": digest, "needle": needle, "description": description, "ok": needle in content})
        report["sourceVerified"] = bool(report["sourceChecks"]) and all(item["ok"] for item in report["sourceChecks"])
    except Exception as error:  # noqa: BLE001 - rapora yazılır, yutulmaz
        report["sourceVerified"] = False
        report["error"] = f"Kaynak doğrulanamadı: {type(error).__name__}: {error}"
    try:
        payload = json.loads(fetch(MODEL_API).decode("utf-8"))
        siblings = {item["rfilename"] for item in payload.get("siblings", [])}
        present = {name: name in siblings for name in REQUIRED_FILES}
        report["modelFiles"] = present
        report["modelVerified"] = all(present.values()) and payload.get("sha") == MODEL_REVISION
    except Exception as error:  # noqa: BLE001
        report["modelVerified"] = False
        report["modelFiles"] = None
        report["modelError"] = f"Model deposu doğrulanamadı: {type(error).__name__}: {error}"
    source_ok = bool(report.get("sourceVerified"))
    model_ok = bool(report.get("modelVerified"))
    report["status"] = "verified" if source_ok and model_ok else ("source-only" if source_ok else "unverified")
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"status": report["status"], "sourceVerified": source_ok, "modelVerified": model_ok}, ensure_ascii=False))
    return 0 if report["status"] == "verified" else 1


if __name__ == "__main__":
    sys.exit(main())
