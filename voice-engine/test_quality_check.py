"""ASR comparison regressions, including the actual Build 18 Whisper outputs."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location("quality_check", Path(__file__).with_name("quality_check.py"))
assert SPEC and SPEC.loader
quality_check = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(quality_check)


class TurkishAsrCanonicalizationTests(unittest.TestCase):
    def test_build18_whisper_number_outputs_meet_the_existing_thresholds(self):
        cases = [
            ("2026; 1.480; %35; 3,5; 25 km; 1080×1920.", "2026-1480-35-3.5-25 km-1080x1920"),
            ("06.11.2026; 14:30; 35 TL; 12 kg.", "6 Kasın 2026 saat 14.30 35 lira 12 kilogram."),
            ("2+3; 8/2; 1 TB; 3,05; -5; 1.000.000.", "2 artı 3, 8 bölü 2, 1 terabayt 3,05 eksi 5, 1 milyon."),
        ]
        for expected, transcript in cases:
            with self.subTest(expected=expected):
                metrics = quality_check.scores(expected, transcript)
                self.assertLessEqual(metrics["cer"], .20, metrics)
                self.assertLessEqual(metrics["wer"], .35, metrics)

    def test_original_and_whisper_number_spellings_have_the_same_canonical_form(self):
        cases = [
            ("2026; 1.480; %35; 3,5; 25 km; 1080×1920.", "2026; 1480; %35; 3.5; 25 kilometre; 1080x1920."),
            ("06.11.2026; 14:30; 35 TL; 12 kg.", "6 Kasım 2026 saat 14.30 35 lira 12 kilogram."),
            ("2+3; 8/2; 1 TB; 3,05; -5; 1.000.000.", "2 artı 3; 8 bölü 2; 1 terabayt; 3,05; eksi 5; 1 milyon."),
        ]
        for expected, transcript in cases:
            with self.subTest(expected=expected):
                self.assertEqual(quality_check.normalized(expected), quality_check.normalized(transcript))

    def test_hyphenated_whisper_list_is_not_misread_as_negative_numbers(self):
        actual = quality_check.normalized("2026-1480-35")
        self.assertNotIn("eksi", actual)
        self.assertEqual(actual, "iki bin yirmi altı bin dort yuz seksen otuz bes")
        self.assertIn("eksi bes", quality_check.normalized("-5"))
        with_unit = quality_check.normalized("2026-1480-35-3.5-25 km-1080x1920")
        self.assertNotIn("eksi", with_unit)
        self.assertIn("kilometre bin seksen carpı", with_unit)

    def test_wer_is_word_levenshtein_not_character_distance(self):
        metrics = quality_check.scores("buz suda yüzer", "buz suda batar")
        self.assertEqual(metrics["wer"], 1 / 3)
        self.assertEqual(metrics["referenceWords"], 3)
        self.assertEqual(metrics["transcriptWords"], 3)


if __name__ == "__main__":
    unittest.main()
