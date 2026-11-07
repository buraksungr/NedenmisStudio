"""Source-level regression tests; the real model remains covered by Windows E2E."""
from __future__ import annotations

import importlib.util
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

    def test_pinned_model_revision_matches_typescript(self):
        python_source = Path(__file__).with_name("bridge.py").read_text(encoding="utf-8")
        ts_source = Path(__file__).parents[1].joinpath("electron/main/services/tts/ChatterboxSource.ts").read_text(encoding="utf-8")
        revision = "5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18"
        self.assertIn(f'MODEL_REVISION = "{revision}"', python_source)
        self.assertIn(f"CHATTERBOX_MODEL_REVISION = '{revision}'", ts_source)
        self.assertIn("revision=MODEL_REVISION", python_source)


if __name__ == "__main__":
    unittest.main()
