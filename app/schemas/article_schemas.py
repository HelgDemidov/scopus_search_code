from datetime import date
from typing import List

from pydantic import BaseModel


class ArticleResponse(BaseModel):
    # Схема одной статьи
    title: str
    author: str | None
    date: date
    doi: str | None
    keyword: str

    model_config = {"from_attributes": True}

class PaginatedArticleResponse(BaseModel):
    # Схема ответа для пагинации согласно ТЗ
    articles: List[ArticleResponse]
    total: int
