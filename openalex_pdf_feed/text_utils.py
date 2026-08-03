# openalex_pdf_feed/text_utils.py
"""Текстовые хелперы, общие для zotero_export.py и mac_publish.py."""

import unicodedata

_CYRILLIC_TRANSLIT = {
    "а": "a",
    "б": "b",
    "в": "v",
    "г": "g",
    "д": "d",
    "е": "e",
    "ё": "e",
    "ж": "zh",
    "з": "z",
    "и": "i",
    "й": "y",
    "к": "k",
    "л": "l",
    "м": "m",
    "н": "n",
    "о": "o",
    "п": "p",
    "р": "r",
    "с": "s",
    "т": "t",
    "у": "u",
    "ф": "f",
    "х": "kh",
    "ц": "ts",
    "ч": "ch",
    "ш": "sh",
    "щ": "shch",
    "ъ": "",
    "ы": "y",
    "ь": "",
    "э": "e",
    "ю": "yu",
    "я": "ya",
}


def split_author_name(display_name: str) -> dict[str, str]:
    """CSL-JSON и человекочитаемые имена файлов ожидают family/given; OpenAlex
    отдаёт только цельное display_name. Эвристика: последнее слово — family,
    остальное — given. Однословные имена (организации и т.п.) кладём в
    literal, не гадаем split."""
    parts = display_name.split()
    if len(parts) < 2:
        return {"literal": display_name}
    return {"family": parts[-1], "given": " ".join(parts[:-1])}


def slugify(text: str, max_len: int) -> str:
    """Человекочитаемое имя файла: только [a-z0-9-], без служебных символов
    файловой системы. Кириллица транслитерируется (иначе русскоязычные
    названия — а language:ru теперь в скоупе discovery — схлопнулись бы в
    пустую строку), латинские диакритики (French) снимаются через NFKD."""
    text = "".join(_CYRILLIC_TRANSLIT.get(ch, ch) for ch in text.lower())
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    slug = "".join(ch if ch.isalnum() else "-" for ch in text)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-")[:max_len].strip("-")
