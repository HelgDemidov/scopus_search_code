# tests/unit/test_seeder_keyword_generator.py
#
# Первое тестовое покрытие для db_seeder/seeder__scripts/keyword_generator.py
# (standalone-скрипт, не часть app/ — импортируется как namespace-пакет через
# pythonpath=. из pytest.ini, __init__.py не нужен).
# httpx.AsyncClient.post мокается через monkeypatch — без сетевых вызовов,
# консистентно с ScopusHTTPClient-моками в test_seeder_endpoint.py.

import httpx
import pytest

from db_seeder.seeder__scripts.keyword_generator import generate_keywords


class _MockResponse:
    def __init__(self, status_code: int, content: str) -> None:
        self.status_code = status_code
        self.text = content
        self._content = content

    def json(self) -> dict:
        return {"choices": [{"message": {"content": self._content}}]}


def _mock_openrouter(monkeypatch: pytest.MonkeyPatch, content: str, status_code: int = 200) -> None:
    async def mock_post(self, url, headers=None, json=None):  # noqa: ANN001 — сигнатура httpx.AsyncClient.post
        return _MockResponse(status_code, content)

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)


# ================================================================ #
#  Markdown code fence — Дефект 1 из docs/seeder-hardening/spec.md #
# ================================================================ #


@pytest.mark.asyncio
async def test_full_fence_complete_json_parses(monkeypatch: pytest.MonkeyPatch) -> None:
    """Полный фенс с обеих сторон, валидный JSON внутри — основной сценарий 13/61 прогонов."""
    raw = (
        '```json\n["deep learning models", "neural architecture search", "transformer attention mechanisms"]\n```'
    )
    _mock_openrouter(monkeypatch, raw)

    result = await generate_keywords(cluster_keywords=[], api_key="test-key", cluster="Test Cluster")

    assert result == [
        "deep learning models",
        "neural architecture search",
        "transformer attention mechanisms",
    ]


@pytest.mark.asyncio
async def test_leading_fence_with_clean_truncation_still_recovers(monkeypatch: pytest.MonkeyPatch) -> None:
    """Фенс + обрыв ровно на запятой (без начатой незакрытой строки) — существующая
    truncation-recovery логика восстанавливает и после снятия фенса. Обрыв ПОСЕРЕДИНЕ
    незакрытой строки recovery не восстанавливает даже без фенса (см. regression-тест
    ниже) — это заранее известное ограничение существующей логики, не в скоупе фикса."""
    raw = '```json\n["deep learning models", "neural architecture search",'
    _mock_openrouter(monkeypatch, raw)

    result = await generate_keywords(cluster_keywords=[], api_key="test-key", cluster="Test Cluster")

    assert result == ["deep learning models", "neural architecture search"]


# ================================================================ #
#  Length-фильтр — Дефект 2 из docs/seeder-hardening/spec.md       #
# ================================================================ #


@pytest.mark.asyncio
async def test_overlong_candidate_filtered_out(monkeypatch: pytest.MonkeyPatch) -> None:
    """Фраза >100 симв. (repetition-loop LLM) не должна попасть в результат —
    иначе ломает INSERT в catalog_articles (VARCHAR(100), Sentry SCOPUS-PYTHON-FASTAPI-6)."""
    overlong = "AI hardware " + "analysis metrics " * 6  # 12 + 18*6 = 120 симв.
    assert len(overlong) > 100
    raw = f'["deep learning models", "{overlong}"]'
    _mock_openrouter(monkeypatch, raw)

    result = await generate_keywords(cluster_keywords=[], api_key="test-key", cluster="Test Cluster")

    assert result == ["deep learning models"]


@pytest.mark.asyncio
async def test_short_candidate_passes(monkeypatch: pytest.MonkeyPatch) -> None:
    """Нормальная фраза (≤100 симв.) по-прежнему проходит фильтр."""
    short = "neural architecture search"
    assert len(short) <= 100
    raw = f'["{short}"]'
    _mock_openrouter(monkeypatch, raw)

    result = await generate_keywords(cluster_keywords=[], api_key="test-key", cluster="Test Cluster")

    assert result == [short]


# ================================================================ #
#  Регрессия существующего поведения (ранее непокрыта тестами)     #
# ================================================================ #


@pytest.mark.asyncio
async def test_no_fence_clean_truncation_regression(monkeypatch: pytest.MonkeyPatch) -> None:
    """Без фенса, обрыв ровно на запятой — уже работало до этого фикса, не должно сломаться."""
    raw = '["deep learning models", "neural architecture search",'
    _mock_openrouter(monkeypatch, raw)

    result = await generate_keywords(cluster_keywords=[], api_key="test-key", cluster="Test Cluster")

    assert result == ["deep learning models", "neural architecture search"]


@pytest.mark.asyncio
async def test_dedup_against_used_set_regression(monkeypatch: pytest.MonkeyPatch) -> None:
    """Фразы уже использованные в кластере (used_set) по-прежнему отсеиваются."""
    raw = '["Deep Learning Models", "neural architecture search"]'
    _mock_openrouter(monkeypatch, raw)

    result = await generate_keywords(
        cluster_keywords=["deep learning models"],  # регистронезависимое совпадение с "Deep Learning Models"
        api_key="test-key",
        cluster="Test Cluster",
    )

    assert result == ["neural architecture search"]
