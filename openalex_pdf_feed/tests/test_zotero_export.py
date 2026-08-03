# openalex_pdf_feed/tests/test_zotero_export.py
from openalex_pdf_feed.zotero_export import build_library, work_to_csl_json

# Реальная структура полей — снята с живого ответа OpenAlex
# (GET /works/W2047045156, проверено в ходе исследования, см. историю
# переписки), урезана до полей, которые реально использует маппер.
REAL_WORK = {
    "id": "https://openalex.org/W2047045156",
    "doi": "https://doi.org/10.1007/s10447-014-9225-0",
    "title": "The Effect of Group Logotherapy on Meaning in Life and Depression Levels of Iranian Students",
    "display_name": "The Effect of Group Logotherapy on Meaning in Life and Depression Levels of Iranian Students",
    "publication_year": 2014,
    "type": "article",
    "primary_location": {
        "source": {
            "display_name": "International Journal for the Advancement of Counselling",
        },
    },
    "authorships": [
        {"author": {"display_name": "Somaye Robatmili"}},
        {"author": {"display_name": "Mahdi Sohrabi"}},
    ],
}


class TestWorkToCslJson:
    def test_maps_real_work_fields(self):
        item = work_to_csl_json(REAL_WORK)

        assert item["id"] == "W2047045156"
        assert item["type"] == "article-journal"
        assert item["title"] == REAL_WORK["title"]
        assert item["issued"] == {"date-parts": [[2014]]}
        assert item["container-title"] == "International Journal for the Advancement of Counselling"
        assert item["DOI"] == "10.1007/s10447-014-9225-0"  # без https://doi.org/ префикса
        assert item["URL"] == "https://openalex.org/W2047045156"

    def test_splits_multi_word_author_name(self):
        item = work_to_csl_json(REAL_WORK)
        assert item["author"] == [
            {"family": "Robatmili", "given": "Somaye"},
            {"family": "Sohrabi", "given": "Mahdi"},
        ]

    def test_single_word_author_name_goes_to_literal(self):
        work = {**REAL_WORK, "authorships": [{"author": {"display_name": "Cher"}}]}
        item = work_to_csl_json(work)
        assert item["author"] == [{"literal": "Cher"}]

    def test_missing_primary_location_omits_container_title(self):
        work = {k: v for k, v in REAL_WORK.items() if k != "primary_location"}
        item = work_to_csl_json(work)
        assert "container-title" not in item

    def test_null_primary_location_does_not_crash(self):
        work = {**REAL_WORK, "primary_location": None}
        item = work_to_csl_json(work)
        assert "container-title" not in item

    def test_unknown_openalex_type_falls_back_to_default(self):
        work = {**REAL_WORK, "type": "some-new-type-openalex-added-later"}
        item = work_to_csl_json(work)
        assert item["type"] == "article-journal"

    def test_missing_doi_omits_doi_field(self):
        work = {k: v for k, v in REAL_WORK.items() if k != "doi"}
        item = work_to_csl_json(work)
        assert "DOI" not in item

    def test_missing_authorships_omits_author_field(self):
        work = {k: v for k, v in REAL_WORK.items() if k != "authorships"}
        item = work_to_csl_json(work)
        assert "author" not in item

    def test_falls_back_to_display_name_when_title_missing(self):
        work = {k: v for k, v in REAL_WORK.items() if k != "title"}
        item = work_to_csl_json(work)
        assert item["title"] == REAL_WORK["display_name"]


class TestBuildLibrary:
    def test_maps_each_work_independently(self):
        other = {**REAL_WORK, "id": "https://openalex.org/W9999", "title": "Other title"}
        library = build_library([REAL_WORK, other])

        assert [item["id"] for item in library] == ["W2047045156", "W9999"]
        assert library[1]["title"] == "Other title"

    def test_empty_input_returns_empty_list(self):
        assert build_library([]) == []
