# openalex_pdf_feed/tests/test_mac_publish.py
import json

from openalex_pdf_feed.mac_publish import build_slug_filename, publish_new_papers

WORK = {
    "id": "https://openalex.org/W2047045156",
    "title": "The Effect of Group Logotherapy on Meaning in Life",
    "publication_year": 2014,
    "authorships": [
        {"author": {"display_name": "Somaye Robatmili"}},
        {"author": {"display_name": "Mahdi Sohrabi"}},
    ],
}


class TestBuildSlugFilename:
    def test_builds_year_author_title_id_slug(self):
        slug = build_slug_filename(WORK, "W2047045156")
        assert slug == "2014_robatmili_the-effect-of-group-logotherapy-on-meaning-in-life__W2047045156"

    def test_missing_year_falls_back(self):
        work = {k: v for k, v in WORK.items() if k != "publication_year"}
        slug = build_slug_filename(work, "W2047045156")
        assert slug.startswith("unknown-year_")

    def test_missing_authorships_falls_back(self):
        work = {k: v for k, v in WORK.items() if k != "authorships"}
        slug = build_slug_filename(work, "W2047045156")
        assert "_unknown-author_" in slug

    def test_single_word_author_uses_literal(self):
        work = {**WORK, "authorships": [{"author": {"display_name": "Cher"}}]}
        slug = build_slug_filename(work, "W2047045156")
        assert "_cher_" in slug

    def test_missing_title_falls_back_to_display_name(self):
        work = {k: v for k, v in WORK.items() if k != "title"}
        work["display_name"] = "Fallback Title"
        slug = build_slug_filename(work, "W2047045156")
        assert "_fallback-title__" in slug

    def test_ends_with_id_suffix_for_uniqueness(self):
        slug = build_slug_filename(WORK, "W2047045156")
        assert slug.endswith("__W2047045156")


class TestPublishNewPapers:
    def _write_pair(self, staging_dir, openalex_id, work):
        (staging_dir / f"{openalex_id}.json").write_text(json.dumps(work), encoding="utf-8")
        (staging_dir / f"{openalex_id}.pdf").write_bytes(b"%PDF-1.4 fake")

    def test_publishes_new_pair_under_slug_name(self, tmp_path):
        staging = tmp_path / "staging"
        dest = tmp_path / "dest"
        staging.mkdir()
        self._write_pair(staging, "W2047045156", WORK)

        count = publish_new_papers(staging, dest)

        assert count == 1
        pdfs = list(dest.glob("*__W2047045156.pdf"))
        jsons = list(dest.glob("*__W2047045156.json"))
        assert len(pdfs) == 1
        assert len(jsons) == 1
        assert pdfs[0].read_bytes() == b"%PDF-1.4 fake"

    def test_second_run_does_not_republish(self, tmp_path):
        staging = tmp_path / "staging"
        dest = tmp_path / "dest"
        staging.mkdir()
        self._write_pair(staging, "W2047045156", WORK)

        first = publish_new_papers(staging, dest)
        second = publish_new_papers(staging, dest)

        assert first == 1
        assert second == 0
        assert len(list(dest.glob("*.pdf"))) == 1

    def test_skips_json_without_matching_pdf(self, tmp_path):
        staging = tmp_path / "staging"
        dest = tmp_path / "dest"
        staging.mkdir()
        (staging / "W999.json").write_text(json.dumps(WORK), encoding="utf-8")

        count = publish_new_papers(staging, dest)

        assert count == 0
        assert list(dest.glob("*")) == []

    def test_publishes_multiple_distinct_papers(self, tmp_path):
        staging = tmp_path / "staging"
        dest = tmp_path / "dest"
        staging.mkdir()
        self._write_pair(staging, "W1", {**WORK, "id": "https://openalex.org/W1"})
        self._write_pair(staging, "W2", {**WORK, "id": "https://openalex.org/W2"})

        count = publish_new_papers(staging, dest)

        assert count == 2
        assert len(list(dest.glob("*.pdf"))) == 2
