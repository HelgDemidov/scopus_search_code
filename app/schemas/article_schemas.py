from datetime import date
from pydantic import BaseModel
from typing import List

class ArticleResponse(BaseModel):
    # Схема одной статьи
    title: str
    author: str | None
    date: date
    doi: str | None

    model_config = {"from_attributes": True}

class PaginatedArticleResponse(BaseModel):
    # Схема ответа для пагинации согласно ТЗ
    articles: List[ArticleResponse]
    total: int
