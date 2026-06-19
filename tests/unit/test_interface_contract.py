# tests/unit/test_interface_contract.py
"""
Страж ABC-контракта ISearchClient.

Проверяет, что любая реализация ISearchClient, пропустившая build_query
или search, не может быть инстанциирована — Python задержит это на этапе импорта.
Такие тесты гарантируют, что контракт стабилен при рефакторинге интерфейса.
"""
from typing import List

import pytest

from app.interfaces.search_client import ISearchClient
from app.models.article import Article


# ================================================================ #
#  Вспомогательные классы для проверок                               #
# ================================================================ #

class _NoBuildQuery(ISearchClient):
    """ Реализация без build_query — не должна инстанциироваться."""
    @property
    def last_rate_limit(self) -> str | None:
        return None

    @property
    def last_rate_remaining(self) -> str | None:
        return None

    @property
    def last_rate_reset(self) -> str | None:
        return None

    # build_query опущен намеренно

    async def search(
        self,
        keyword: str,
        count: int = 25,
        filters: dict | None = None,
    ) -> List[Article]:
        return []


class _NoSearch(ISearchClient):
    """ Реализация без search — не должна инстанциероваться."""
    @property
    def last_rate_limit(self) -> str | None:
        return None

    @property
    def last_rate_remaining(self) -> str | None:
        return None

    @property
    def last_rate_reset(self) -> str | None:
        return None

    def build_query(self, keyword: str, filters: dict | None = None) -> str:
        return f"TITLE-ABS-KEY({keyword})"

    # search опущен намеренно


class _FullImpl(ISearchClient):
    """ Полная реализация всех абстрактных методов — должна инстанциероваться."""
    @property
    def last_rate_limit(self) -> str | None:
        return None

    @property
    def last_rate_remaining(self) -> str | None:
        return None

    @property
    def last_rate_reset(self) -> str | None:
        return None

    def build_query(self, keyword: str, filters: dict | None = None) -> str:
        return f"TITLE-ABS-KEY({keyword})"

    async def search(
        self,
        keyword: str,
        count: int = 25,
        filters: dict | None = None,
    ) -> List[Article]:
        return []


# ================================================================ #
#  Тесты                                                          #
# ================================================================ #

def test_cannot_instantiate_without_build_query():
    # build_query является частью ABC-контракта ISearchClient.
    # Пропуск метода должен привести к TypeError при попытке инстанции
    with pytest.raises(TypeError):
        _NoBuildQuery()


def test_cannot_instantiate_without_search():
    # search является частью ABC-контракта ISearchClient.
    # Пропуск метода должен привести к TypeError при попытке инстанции
    with pytest.raises(TypeError):
        _NoSearch()


def test_full_implementation_instantiates_without_errors():
    # Полная реализация всех @abstractmethod-методов должна
    # инстанциироваться без ошибок — проверяем атрибутный доступ
    instance = _FullImpl()
    # build_query доступен как публичный метод (не начинается с _)
    assert callable(instance.build_query)
    # search доступен как публичный метод
    assert callable(instance.search)
    # Приватного _build_query не должно существовать
    assert not hasattr(instance, "_build_query"), (
        "_build_query не должен появляться в интерфейсе или реализации"
    )
