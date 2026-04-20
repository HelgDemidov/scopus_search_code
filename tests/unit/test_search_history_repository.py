import datetime
from typing import List

import pytest

from app.models.search_history import SearchHistory
from app.interfaces.search_history_repo import ISearchHistoryRepository


# 1. Fake-репозиторий для изолированного тестирования бизнес-логики
class FakeSearchHistoryRepository(ISearchHistoryRepository):
    def __init__(self):
        # In-memory хранилище строк истории
        self._rows: List[SearchHistory] = []
        self._next_id: int = 1

    async def insert_row(
        self,
        user_id: int,
        query: str,
        result_count: int,
        filters: dict | None = None,
    ) -> SearchHistory:
        # Эмулируем вставку: заполняем id и created_at как это делает PostgreSQL
        row = SearchHistory(
            id=self._next_id,
            user_id=user_id,
            query=query,
            result_count=result_count,
            filters=filters or {},
            created_at=datetime.datetime.now(tz=datetime.timezone.utc),
        )
        self._rows.append(row)
        self._next_id += 1
        return row

    async def count_in_window(
        self,
        user_id: int,
        since: datetime.datetime,
    ) -> int:
        # Считаем строки для user_id с created_at >= since
        return sum(
            1 for r in self._rows
            if r.user_id == user_id and r.created_at >= since
        )

    async def get_last_n(
        self,
        user_id: int,
        n: int = 100,
    ) -> List[SearchHistory]:
        # Фильтруем по user_id, сортируем desc, обрезаем до n
        rows = [r for r in self._rows if r.user_id == user_id]
        rows.sort(key=lambda r: r.created_at, reverse=True)
        return rows[:n]

    async def get_oldest_in_window_created_at(
        self,
        user_id: int,
        since: datetime.datetime,
    ) -> datetime.datetime | None:
        # Ищем самую раннюю запись в окне для user_id
        candidates = [
            r.created_at for r in self._rows
            if r.user_id == user_id and r.created_at >= since
        ]
        return min(candidates) if candidates else None


# 2. Тест: вставка одной строки
@pytest.mark.asyncio
async def test_insert_row_creates_entry():
    repo = FakeSearchHistoryRepository()

    row = await repo.insert_row(user_id=1, query="neural networks", result_count=25)

    assert row.id == 1
    assert row.user_id == 1
    assert row.query == "neural networks"
    assert row.result_count == 25
    assert row.filters == {}          # None нормализуется в {}
    assert row.created_at is not None


# 3. Тест: filters=None нормализуется в {}
@pytest.mark.asyncio
async def test_insert_row_filters_none_becomes_empty_dict():
    repo = FakeSearchHistoryRepository()

    row = await repo.insert_row(user_id=1, query="AI", result_count=10, filters=None)

    assert row.filters == {}


# 4. Тест: filters round-trip сохраняет переданные значения
@pytest.mark.asyncio
async def test_insert_row_filters_roundtrip():
    repo = FakeSearchHistoryRepository()
    payload = {"year_from": 2020, "open_access": True}

    row = await repo.insert_row(user_id=1, query="AI", result_count=5, filters=payload)

    assert row.filters == payload


# 5. Тест: count_in_window считает только строки в окне
@pytest.mark.asyncio
async def test_count_in_window_counts_only_recent_rows():
    repo = FakeSearchHistoryRepository()
    now = datetime.datetime.now(tz=datetime.timezone.utc)
    since = now - datetime.timedelta(days=7)

    # Вставляем строку в окне
    await repo.insert_row(user_id=1, query="AI", result_count=5)
    count = await repo.count_in_window(user_id=1, since=since)

    assert count == 1


# 6. Тест: строки старше 7 дней не попадают в счётчик квоты
@pytest.mark.asyncio
async def test_count_in_window_excludes_old_rows():
    repo = FakeSearchHistoryRepository()

    # Вручную вставляем строку с датой 8 дней назад
    old_row = SearchHistory(
        id=1,
        user_id=1,
        query="old query",
        result_count=10,
        filters={},
        created_at=datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(days=8),
    )
    repo._rows.append(old_row)
    repo._next_id = 2

    since = datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(days=7)
    count = await repo.count_in_window(user_id=1, since=since)

    assert count == 0


# 7. Тест: get_last_n возвращает не более n строк, упорядоченных desc
@pytest.mark.asyncio
async def test_get_last_n_returns_at_most_n_rows_ordered_desc():
    repo = FakeSearchHistoryRepository()

    # Вставляем 5 строк
    for i in range(5):
        await repo.insert_row(user_id=1, query=f"query {i}", result_count=i)

    rows = await repo.get_last_n(user_id=1, n=3)

    assert len(rows) == 3
    # Проверяем порядок: каждая следующая запись не новее предыдущей
    for i in range(len(rows) - 1):
        assert rows[i].created_at >= rows[i + 1].created_at


# 8. Тест: get_oldest_in_window_created_at возвращает None для пустого окна
@pytest.mark.asyncio
async def test_get_oldest_in_window_returns_none_when_empty():
    repo = FakeSearchHistoryRepository()
    since = datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(days=7)

    result = await repo.get_oldest_in_window_created_at(user_id=1, since=since)

    assert result is None


# 9. Тест: reset_at = oldest_created_at + 7 days вычисляется корректно
@pytest.mark.asyncio
async def test_reset_at_calculation():
    repo = FakeSearchHistoryRepository()
    now = datetime.datetime.now(tz=datetime.timezone.utc)
    since = now - datetime.timedelta(days=7)

    row = await repo.insert_row(user_id=1, query="AI", result_count=5)
    oldest = await repo.get_oldest_in_window_created_at(user_id=1, since=since)

    assert oldest is not None
    reset_at = oldest + datetime.timedelta(days=7)
    # reset_at должен быть в будущем относительно now
    assert reset_at > now
