"""Source-level regression tests; the real model remains covered by Windows E2E."""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch


class FakeTokenizer:
    def __init__(self):
        self.calls = []

    def text_to_tokens(self, text, language_id=None, lowercase=True, nfkd_normalize=True):
        self.calls.append({"text": text, "language": language_id, "lowercase": lowercase, "nfkd": nfkd_normalize})
        return text


class FakeModel:
    def __init__(self):
        self.tokenizer = FakeTokenizer()


class BridgeTests(unittest.TestCase):
    def load_worker(self):
        model = FakeModel()
        fake_module = types.ModuleType("chatterbox.mtl_tts")
        fake_module.ChatterboxMultilingualTTS = types.SimpleNamespace(from_local=lambda *args, **kwargs: model)
        fake_module.punc_norm = lambda text: text
        path = Path(__file__).with_name("bridge.py")
        spec = importlib.util.spec_from_file_location("bridge_under_test", path)
        module = importlib.util.module_from_spec(spec)
        fake_torch = types.SimpleNamespace(set_num_threads=lambda value: None, set_num_interop_threads=lambda value: None)
        with patch.dict(sys.modules, {"torch": fake_torch, "chatterbox": types.ModuleType("chatterbox"), "chatterbox.mtl_tts": fake_module}):
            spec.loader.exec_module(module)
            with tempfile.TemporaryDirectory() as directory:
                for name in module.REQUIRED_FILES:
                    target = Path(directory, name); target.parent.mkdir(parents=True, exist_ok=True); target.touch()
                worker = module.Worker(types.SimpleNamespace(threads=1, snapshot=directory))
        worker.test_module = module
        return worker

    def test_v3_preserves_case_and_nfkd_normalization_flag(self):
        worker = self.load_worker()
        result = worker.model.tokenizer.text_to_tokens("Buz İÇİN yüzer.", language_id="tr")
        self.assertEqual(result, "Buz İÇİN yüzer.")
        self.assertEqual(worker.model.tokenizer.calls[-1]["lowercase"], False)
        self.assertEqual(worker.model.tokenizer.calls[-1]["nfkd"], True)
        self.assertEqual(worker.model.tokenizer.calls[-1]["language"], "tr")

    def test_legacy_path_is_only_an_explicit_diagnostic_baseline(self):
        worker = self.load_worker()
        worker.model.tokenizer.text_to_tokens = worker.legacy_text_to_tokens
        worker.model.tokenizer.text_to_tokens("Build 10", language_id="tr")
        self.assertEqual(worker.model.tokenizer.calls[-1]["lowercase"], True)
        worker.model.tokenizer.text_to_tokens = worker.v3_text_to_tokens
        worker.model.tokenizer.text_to_tokens("Build 11", language_id="tr", lowercase=True)
        self.assertEqual(worker.model.tokenizer.calls[-1]["lowercase"], False)

    def test_nfkd_diagnostics_are_safe_on_cp1252_stdout(self):
        module = self.load_worker().test_module
        with tempfile.NamedTemporaryFile(mode="w+", encoding="cp1252") as stream:
            with patch.object(module.sys, "stdout", stream):
                module.emit("tokenization", decoded_text="Buz i\u0308c\u0327in ğüşöç")
            stream.seek(0)
            payload = stream.read()
        self.assertIn("\\u0308", payload)
        self.assertEqual(json.loads(payload)["decoded_text"], "Buz i\u0308c\u0327in ğüşöç")

    def test_numeric_parameters_are_clamped_and_reject_nan(self):
        worker = self.load_worker()
        module = worker.test_module
        self.assertEqual(module.numeric({"exaggeration": 9}, "exaggeration", 0.5, 0.25, 2.0), 2.0)
        self.assertEqual(module.numeric({}, "cfg_weight", 0.5, 0.0, 1.0), 0.5)
        self.assertEqual(module.numeric({"temperature": -3}, "temperature", 0.8, 0.05, 1.5), 0.05)
        for bad in (float("nan"), float("inf"), "abc"):
            with self.assertRaises(ValueError):
                module.numeric({"cfg_weight": bad}, "cfg_weight", 0.5, 0.0, 1.0)

    def test_v3_lowercase_default_produces_dotted_i_for_turkish(self):
        """Belgelenmiş kök neden: Python varsayılan lower() Türkçe I/İ eşlemesini bozar."""
        model_default_lowercase = "Işık İĞDIR".lower()
        self.assertNotEqual(model_default_lowercase, "ışık iğdır")
        self.assertIn("\u0130".lower(), ("i\u0307", "i", "ı"))
        # V3 yolu lowercase=False kullandığı için bu bozulma üretimde devre dışı.
        worker = self.load_worker()
        worker.model.tokenizer.text_to_tokens("Işık İĞDIR", language_id="tr")
        self.assertFalse(worker.model.tokenizer.calls[-1]["lowercase"])

    def test_pinned_model_revision_matches_typescript(self):
        python_source = Path(__file__).with_name("bridge.py").read_text(encoding="utf-8")
        ts_source = Path(__file__).parents[1].joinpath("electron/main/services/tts/ChatterboxSource.ts").read_text(encoding="utf-8")
        revision = "5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18"
        self.assertIn(f'MODEL_REVISION = "{revision}"', python_source)
        self.assertIn(f"CHATTERBOX_MODEL_REVISION = '{revision}'", ts_source)
        self.assertIn("revision=MODEL_REVISION", python_source)


if __name__ == "__main__":
    unittest.main()


class SourceIdentityTests(unittest.TestCase):
    """Uygulamanın doğruladığı paket kimliği, indirilen sabit kaynakla aynı olmalı."""

    def test_status_reports_source_identity_not_only_version_number(self):
        source = Path(__file__).with_name("bridge.py").read_text(encoding="utf-8")
        for needle in ("mtl_tts_sha256", "tokenizer_sha256", "package_file", "package_version"):
            self.assertIn(needle, source, f"status olayı {needle} alanını bildirmeli")

    def test_pinned_source_hashes_match_application_expectations(self):
        """Sabitlenmiş V3 kaynağının Türkçe metin yolu beklenen özetlerle eşleşmeli."""
        expected = {
            "src/chatterbox/mtl_tts.py": "936759044e54cffe8c68b91b32e01da0bc032a1e084f769f0403080d86ad153c",
            "src/chatterbox/models/tokenizers/tokenizer.py": "e169f02f14b008e8e7a4f29df66ecafaa29972ff4a38724b51545b8563861889",
        }
        root = Path(os.environ.get("NEDENMIS_CHATTERBOX_SOURCE", "")) if os.environ.get("NEDENMIS_CHATTERBOX_SOURCE") else None
        if root is None or not root.is_dir():
            self.skipTest("Sabitlenmiş Chatterbox kaynağı yerelde yok (NEDENMIS_CHATTERBOX_SOURCE ayarlanmadı).")
        import hashlib
        for name, digest in expected.items():
            self.assertEqual(hashlib.sha256((root / name).read_bytes()).hexdigest(), digest, name)
