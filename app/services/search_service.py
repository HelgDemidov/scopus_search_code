# Сервис пользовательского поиска — оркестрирует Scopus API + сохранение результатов
import datetime
from typing import List

from sqlalchemy.ext.asyncio import AsyncSession

from app.interfaces.article_repository import IArticleRepository
from app.interfaces.search_client import ISearchClient
from app.interfaces.search_history_repo import ISearchHistoryRepository
from app.interfaces.search_result_repo import ISearchResultRepository
from app.models.article import Article
from app.services.search_history_service import SearchHistoryService


class SearchService:
    """Оркестрирует поиск: Scopus API → upsert статей → история → связка результатов.

    Не знает ни про httpx, ни про SQLAlchemy напрямую.
    Единственная точка, где происходит commit() для всей транзакции поиска.
    """

    def __init__(
        self,
        search_client: ISearchClient,
        article_repo: IArticleRepository,
        history_repo: ISearchHistoryRepository,
        search_result_repo: ISearchResultRepository,
        session: AsyncSession,
    ):
        self.search_client = search_client
        self.article_repo = article_repo
        self.history_repo = history_repo
        self.search_result_repo = search_result_repo
        self.session = session

    async def find_and_save(
        self,
        keyword: str,
        count: int = 25,
        *,
        user_id: int,
        filters: dict | None = None,
    ) -> List[Article]:
        """Выполняет поиск и атомарно сохраняет все результаты.

        Порядок операций (все в одной транзакции):
        1. Запрос к Scopus API
        2. upsert статей в таблицу articles → получаем id (пропускается, если Scopus
           вернул 0 статей — upsert-ить нечего)
        3. INSERT в search_history → получаем search_history.id (пишется ВСЕГДА,
           даже при result_count=0: реальный вызов Scopus API уже израсходован и
           должен попадать в квоту и быть виден пользователю, а не исчезать молча)
        4. Retention: trim_to_last_n — удаляем историю сверх лимита на юзера
        5. INSERT в search_result_articles с rank = порядок в выдаче Scopus
           (пропускается при 0 статей — save_results() и так no-op на пустом списке,
           но пропуск явно избегает бессмысленного вызова)
        6. commit()

        Если любой шаг бросает исключение — транзакция откатывается целиком.
        """
        # Вычисляем итоговый CQL-запрос заранее — до обращения в Scopus.
        # search_client.search() вызовет тот же build_query() внутри, но здесь
        # нам нужна строка для сохранения в search_history.scopus_query
        scopus_query = self.search_client.build_query(keyword, filters)

        # Шаг 1: идем в Scopus с ключевым словом и фильтрами, получаем статьи без id
        articles = await self.search_client.search(
            keyword=keyword,
            count=count,
            filters=filters,  # Пробрасываем фильтры в CQL-запрос Scopus
        )

        # Шаг 2: upsert в articles — статьи получают id из БД.
        # Если Scopus вернул 0 статей, upsert-ить нечего — но поиск всё равно
        # реально израсходовал вызов Scopus API и должен попасть в историю (шаг 3).
        articles_with_ids: List[Article] = []
        if articles:
            articles_with_ids = await self.article_repo.upsert_many(articles)

        # Шаг 3: фиксируем запрос в search_history — получаем history_row.id
        # Если upsert_many бросил — сюда не дойдем (история не пишется)
        history_row = await self.history_repo.insert_row(
            user_id=user_id,
            query=keyword,
            result_count=len(articles_with_ids),
            filters=filters,
            scopus_query=scopus_query,  # Сохраняем построенный CQL-запрос
        )

        # Шаг 4: retention — новая строка всегда самая свежая (largest created_at/id)
        # и гарантированно переживает trim; 101-я по счету (самая старая) тихо
        # удаляется здесь же, в той же транзакции. Блока/ошибки для пользователя нет
        # (docs/personal-search-data/spec.md §1). Cascade на search_result_articles —
        # через ondelete="CASCADE" в модели, отдельного шага не требует.
        #
        # keep_since обязателен: HISTORY_DEPTH_LIMIT(100) < QUOTA_LIMIT(200) за то же
        # 7-дневное окно — без этого предохранителя retention удалял бы строки, ещё
        # учитываемые в count_in_window() при проверке квоты в роутере, и used
        # никогда не смог бы дойти до 200 → 429 стал бы недостижим для активных
        # пользователей (найдено при проектировании интеграционного теста, не было
        # в исходной спеке §1).
        quota_window_start = datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(
            days=SearchHistoryService.WINDOW_DAYS
        )
        await self.history_repo.trim_to_last_n(
            user_id=user_id,
            n=SearchHistoryService.HISTORY_DEPTH_LIMIT,
            keep_since=quota_window_start,
        )

        # Шаг 5: связываем статьи с записью истории через search_result_articles
        # rank = порядковый индекс в выдаче Scopus (0-based). Пропускаем при 0
        # статей — save_results() и так no-op на пустом списке, но пропуск явно
        # избегает бессмысленного вызова репозитория.
        if articles_with_ids:
            await self.search_result_repo.save_results(
                search_history_id=history_row.id,
                articles=articles_with_ids,
            )

        # Шаг 6: единственный commit() — атомарно фиксируем articles +
        # search_history + search_result_articles одной транзакцией
        await self.session.commit()

        return articles_with_ids
