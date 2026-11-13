"""Türkçe ASR değerlendirmesinin normalizasyon testleri.

Regresyon (CI 43302791720): metin sayıları yazıyla ("yüzde on dört virgül beş")
içerirken ASR rakamla ("yüzde 14 5") yazdığı için CER 0.50 çıkıyor ve telaffuz
hatası gibi görünüyordu. Normalizasyon iki gösterimi eşitler; gerçek eksik
sözcükler hâlâ cezalandırılır.
"""
import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("turkish_asr_eval", Path(__file__).with_name("turkish_asr_eval.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class NormalizeTests(unittest.TestCase):
    def test_number_words_become_digits(self):
        self.assertEqual(MODULE.normalize("yedi yüz seksen üç bin beş yüz altmış iki"), "783562")
        self.assertEqual(MODULE.normalize("iki bin yirmi altı"), "2026")
        self.assertEqual(MODULE.normalize("yüz"), "100")

    def test_decimal_comma_becomes_dot(self):
        self.assertEqual(MODULE.normalize("yüzde on dört virgül beş"), "yüzde 14.5")

    def test_non_numeric_words_are_preserved(self):
        self.assertEqual(MODULE.normalize("üçüncü oldu"), "üçüncü oldu")
        self.assertEqual(MODULE.normalize("Sıcaklık eksi sekiz derece."), "sıcaklık eksi 8 derece.")


class ScoreTests(unittest.TestCase):
    def test_digit_and_word_spellings_score_equal(self):
        reference = "Yarışmada üçüncü oldu; sıcaklık yüzde on dört virgül beş arttı."
        transcript = "Yarışmada üçüncü oldu sıcaklık yüzde 14 5 arttı"
        self.assertLessEqual(MODULE.scores(reference, transcript)["cer"], 0.1)

    def test_real_content_loss_is_penalized(self):
        reference = "Yarışmada üçüncü oldu; sıcaklık yüzde on dört virgül beş arttı."
        transcript = "Yarışmada oldu"
        self.assertGreater(MODULE.scores(reference, transcript)["cer"], 0.35)

    def test_exact_transcript_scores_zero(self):
        text = "Buz sudan hafif olduğu için yüzüyor."
        self.assertEqual(MODULE.scores(text, text)["cer"], 0.0)


if __name__ == "__main__":
    unittest.main()
