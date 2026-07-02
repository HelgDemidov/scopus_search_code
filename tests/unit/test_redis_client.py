# tests/unit/test_redis_client.py
import pytest

from app.infrastructure.redis_client import make_stats_cache_key

_NS = "postgresql+asyncpg://user:pass@prod-host:5432/db"
_NS_OTHER = "postgresql+asyncpg://user:pass@staging-host:5432/db"


def test_make_stats_cache_key_starts_with_stats_prefix():
    key = make_stats_cache_key(None, None, None, None, None, db_namespace=_NS)
    assert key.startswith("stats:")


def test_make_stats_cache_key_deterministic():
    """Одни параметры всегда дают один и тот же ключ."""
    key1 = make_stats_cache_key(["USA", "China"], ["Article"], True, 2020, 2024, db_namespace=_NS)
    key2 = make_stats_cache_key(["USA", "China"], ["Article"], True, 2020, 2024, db_namespace=_NS)
    assert key1 == key2


def test_make_stats_cache_key_list_order_insensitive():
    """Порядок элементов в списке countries/doc_types не влияет на ключ."""
    key1 = make_stats_cache_key(["China", "USA"], ["Review", "Article"], None, None, None, db_namespace=_NS)
    key2 = make_stats_cache_key(["USA", "China"], ["Article", "Review"], None, None, None, db_namespace=_NS)
    assert key1 == key2


def test_make_stats_cache_key_different_countries():
    """Разные страны → разные ключи."""
    key1 = make_stats_cache_key(["USA"], None, None, None, None, db_namespace=_NS)
    key2 = make_stats_cache_key(["China"], None, None, None, None, db_namespace=_NS)
    assert key1 != key2


def test_make_stats_cache_key_different_year_ranges():
    """Разные диапазоны лет → разные ключи."""
    key1 = make_stats_cache_key(None, None, None, 2020, 2022, db_namespace=_NS)
    key2 = make_stats_cache_key(None, None, None, 2020, 2023, db_namespace=_NS)
    assert key1 != key2


def test_make_stats_cache_key_none_vs_value():
    """None-параметр и заполненный параметр → разные ключи."""
    key_none = make_stats_cache_key(None, None, None, None, None, db_namespace=_NS)
    key_oa = make_stats_cache_key(None, None, True, None, None, db_namespace=_NS)
    assert key_none != key_oa


def test_make_stats_cache_key_digest_length():
    """Формат ключа: 'stats:{8 hex}:{16 hex}'."""
    key = make_stats_cache_key(["Germany"], ["Article"], False, 2019, 2023, db_namespace=_NS)
    prefix, ns_digest, digest = key.split(":")
    assert prefix == "stats"
    assert len(ns_digest) == 8
    assert all(c in "0123456789abcdef" for c in ns_digest)
    assert len(digest) == 16
    assert all(c in "0123456789abcdef" for c in digest)


@pytest.mark.parametrize(
    "countries,doc_types,oa,yf,yt",
    [
        (None, None, None, None, None),
        (["USA"], None, True, 2020, 2024),
        (["Russia", "Germany"], ["Article", "Review"], False, 2015, 2023),
    ],
)
def test_make_stats_cache_key_parametrized_stability(countries, doc_types, oa, yf, yt):
    """Проверяем стабильность ключа для нескольких наборов параметров."""
    assert make_stats_cache_key(countries, doc_types, oa, yf, yt, db_namespace=_NS) == make_stats_cache_key(
        countries, doc_types, oa, yf, yt, db_namespace=_NS
    )


# ---------------------------------------------------------------------------
# db_namespace — изоляция между окружениями, делящими один физический Redis
# (регрессия на баг 2026-07-02: прод показал 1675 статей вместо ~118 тыс. —
# ровно столько, сколько в staging Supabase; e2e.yml дернул staging /articles/stats
# при push в main и перезаписал общий ключ Redis данными staging).
# ---------------------------------------------------------------------------


def test_make_stats_cache_key_different_namespace_different_key():
    """Один и тот же запрос (без фильтров) из разных окружений → разные ключи."""
    key_prod = make_stats_cache_key(None, None, None, None, None, db_namespace=_NS)
    key_staging = make_stats_cache_key(None, None, None, None, None, db_namespace=_NS_OTHER)
    assert key_prod != key_staging


def test_make_stats_cache_key_same_namespace_same_key():
    """Один и тот же namespace → ключ стабилен независимо от вызова."""
    key1 = make_stats_cache_key(["USA"], None, True, 2020, 2024, db_namespace=_NS)
    key2 = make_stats_cache_key(["USA"], None, True, 2020, 2024, db_namespace=_NS)
    assert key1 == key2


def test_make_stats_cache_key_namespace_never_appears_in_plaintext():
    """db_namespace (может содержать креды DSN) не должен утекать в сам ключ как substring."""
    key = make_stats_cache_key(None, None, None, None, None, db_namespace=_NS)
    assert _NS not in key
    assert "pass" not in key
