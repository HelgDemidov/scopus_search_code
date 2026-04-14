from datetime import date
from typing import List

from pydantic import BaseModel


class ArticleResponse(BaseModel):
    # Схема одной статьи — только поля, реально доступные в Scopus free-tier API
    title: str                       # Название статьи (dc:title)
    journal: str | None              # Название издания (prism:publicationName)
    author: str | None               # Первый автор (dc:creator)
    publication_date: date           # Дата публикации (prism:coverDate)
    doi: str | None                  # DOI
    keyword: str                     # Поисковый запрос сидера
    cited_by_count: int | None       # Число цитирований (citedby-count)
    document_type: str | None        # Тип документа (subtypeDescription)
    open_access: bool | None         # Open Access флаг (openaccess)
    affiliation_country: str | None  # Страна первого автора (affiliation[0])

    model_config = {"from_attributes": True}


class PaginatedArticleResponse(BaseModel):
    # Схема ответа для пагинации согласно ТЗ
    articles: List[ArticleResponse]
    total: int
