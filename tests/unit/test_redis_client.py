# tests/unit/test_redis_client.py
import pytest

from app.infrastructure.redis_client import make_stats_cache_key


def test_make_stats_cache_key_starts_with_stats_prefix():
    key = make_stats_cache_key(None, None, None, None, None)
    assert key.startswith("stats:")


def test_make_stats_cache_key_deterministic():
    """Одни параметры всегда дают один и тот же ключ."""
    key1 = make_stats_cache_key(["USA", "China"], ["Article"], True, 2020, 2024)
    key2 = make_stats_cache_key(["USA", "China"], ["Article"], True, 2020, 2024)
    assert key1 == key2


def test_make_stats_cache_key_list_order_insensitive():
    """Порядок элементов в списке countries/doc_types не влияет на ключ."""
    key1 = make_stats_cache_key(["China", "USA"], ["Review", "Article"], None, None, None)
    key2 = make_stats_cache_key(["USA", "China"], ["Article", "Review"], None, None, None)
    assert key1 == key2


def test_make_stats_cache_key_different_countries():
    """Разные страны → разные ключи."""
    key1 = make_stats_cache_key(["USA"], None, None, None, None)
    key2 = make_stats_cache_key(["China"], None, None, None, None)
    assert key1 != key2


def test_make_stats_cache_key_different_year_ranges():
    """Разные диапазоны лет → разные ключи."""
    key1 = make_stats_cache_key(None, None, None, 2020, 2022)
    key2 = make_stats_cache_key(None, None, None, 2020, 2023)
    assert key1 != key2


def test_make_stats_cache_key_none_vs_value():
    """None-параметр и заполненный параметр → разные ключи."""
    key_none = make_stats_cache_key(None, None, None, None, None)
    key_oa = make_stats_cache_key(None, None, True, None, None)
    assert key_none != key_oa


def test_make_stats_cache_key_digest_length():
    """Суффикс после 'stats:' — ровно 16 символов hex-дайджеста."""
    key = make_stats_cache_key(["Germany"], ["Article"], False, 2019, 2023)
    prefix, digest = key.split(":", 1)
    assert prefix == "stats"
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
    assert make_stats_cache_key(countries, doc_types, oa, yf, yt) == make_stats_cache_key(
        countries, doc_types, oa, yf, yt
    )
