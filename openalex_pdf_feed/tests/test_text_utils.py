# openalex_pdf_feed/tests/test_text_utils.py
from openalex_pdf_feed.text_utils import slugify, split_author_name


class TestSplitAuthorName:
    def test_multi_word_name_splits_family_given(self):
        assert split_author_name("Somaye Robatmili") == {"family": "Robatmili", "given": "Somaye"}

    def test_single_word_name_goes_to_literal(self):
        assert split_author_name("Cher") == {"literal": "Cher"}


class TestSlugify:
    def test_lowercases_and_hyphenates_spaces(self):
        assert slugify("Existential Analysis", max_len=60) == "existential-analysis"

    def test_collapses_punctuation_to_single_hyphen(self):
        assert slugify("Being & Time: Revisited!!", max_len=60) == "being-time-revisited"

    def test_strips_leading_trailing_hyphens(self):
        assert slugify("  --Hello--  ", max_len=60) == "hello"

    def test_truncates_to_max_len_without_trailing_hyphen(self):
        result = slugify("a very long title that keeps going and going", max_len=10)
        assert len(result) <= 10
        assert not result.endswith("-")

    def test_transliterates_cyrillic(self):
        assert slugify("Экзистенциальный анализ", max_len=60) == "ekzistentsialnyy-analiz"

    def test_strips_french_diacritics(self):
        assert slugify("Phénoménologie générale", max_len=60) == "phenomenologie-generale"

    def test_empty_input_returns_empty_string(self):
        assert slugify("", max_len=60) == ""
