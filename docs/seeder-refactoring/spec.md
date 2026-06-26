# Seeder Refactoring — Tech Spec

**Ветка:** `seeder-refactoring`
**Дата создания:** 2026-06-26
**Статус:** В разработке 🔧

---

## Контекст и мотивация

Сидер наполняет "AI & Neural Network Technologies Collection" (85 506 статей). Темп прироста замедлился: из-за семантического насыщения LLM генерирует лишь ~26 новых фраз вместо 120, каждая фраза при этом возвращает только 25 статей без пагинации. Цель — несколько сотен тысяч статей.

**Подтверждённые лимиты Scopus free API (тест 2026-06-26):**
- `count` — жёсткий кап **25** (50+ → HTTP 400)
- Пагинация через `start` — работает, потолок **5 000 результатов** на запрос
- Квота — **20 000 запросов/неделю** (~238 Scopus-вызовов на прогон при cron 0 */2 * * *)

**Целевая пропускная способность после рефакторинга:** ~5 950 Scopus-слотов/прогон (против текущих 650, рост 9×).

---

## Commit 1 — Фаза 1: быстрые исправления (без миграции)

**Файлы:** `db_seeder/seeder__scripts/keyword_generator.py`, `seed_db.py`

- `keyword_generator.py`: убрать `_EXCLUSION_WINDOW = 200` → передавать в промпт **все** `cluster_keywords` (600 фраз × ~5 токенов = 3 000 токенов; Mistral 32k держит легко). Ожидаемый эффект: 26 → ~80–100 новых фраз/прогон.
- `seed_db.py`: один asyncpg-коннект на весь прогон (переиспользовать в read + все write); убрать `asyncpg.connect()` внутри `_save_keyword_result`.
- `seed_db.py`: `ON CONFLICT DO UPDATE SET articles_found = seeder_keywords.articles_found + EXCLUDED.articles_found` — накопительный счётчик вместо перезаписи.
- Исправить устаревший docstring `get_todays_cluster()` (упоминает cron */4, реальный — */2).

---

## Commit 2 — Миграция 0012: добавить `last_offset`

**Файл:** `alembic/versions/0012_add_last_offset_to_seeder_keywords.py`

```sql
ALTER TABLE seeder_keywords ADD COLUMN last_offset INTEGER NOT NULL DEFAULT 0;
UPDATE seeder_keywords SET last_offset = 25;  -- страница 0 уже взята
```

---

## Commit 3 — Backend: параметр `start` в Scopus-клиенте и эндпоинте

**Файлы:** `app/infrastructure/scopus_client.py`, `app/routers/seeder_router.py`

- `ScopusHTTPClient.search()`: добавить `start: int = 0` → пробрасывать в Scopus API params.
- `POST /seeder/seed`: добавить `start: int = 0` как query param → передавать в `scopus.search()`.
- Ответ эндпоинта дополнить полем `"start": start` для логирования.

---

## Commit 4 — Двухрежимный прогон сидера

**Файл:** `db_seeder/seeder__scripts/seed_db.py`

Каждый прогон: **блок A** (новые фразы) + **блок B** (ре-пагинация старых).

| Блок | Бюджет | Логика |
|---|---|---|
| A — новые | 50 Scopus-вызовов | LLM → новые фразы, `start=0`, сохранить в seeder_keywords |
| B — ре-пагинация | 188 Scopus-вызовов | `WHERE last_offset < 5000 ORDER BY last_offset ASC` → `start=last_offset`, `last_offset += 25` |

После каждого вызова: `articles_found += saved`, `used_at = now()`, `last_offset += 25`.

---

## Commit 5 — Тесты

**Маркеры и расположение:**

| Файл | Маркер | CI-джоб |
|---|---|---|
| `tests/unit/test_scopus_client.py` | _(без маркера)_ | `test` (SQLite) |
| `tests/unit/test_seeder_router.py` | _(без маркера)_ | `test` (SQLite) |
| `tests/integration/test_seeder_endpoint.py` | _(без маркера)_ | `test` (SQLite) |

**Покрываемые сценарии:**

- `ScopusHTTPClient.search(start=N)` → `start` попадает в Scopus params (mock httpx)
- `POST /seeder/seed?start=25` → 200, ответ содержит `"start": 25`
- `POST /seeder/seed` неверный секрет → 403; Scopus вернул пустой список → `{"saved": 0}`
- Интеграционный: seed через TestClient → статьи сохраняются в SQLite in-memory DB

**Coverage-цель:** порог `--fail-under=75` сохраняется; новые тесты добавляют +1–2%.

---

## Фаза 3 (после наблюдения за прогонами)

- **Year-range шардинг:** для фраз с `last_offset = 4975` добавить `PUBYEAR=YYYY` к CQL и сбросить offset → 35 лет × 5 000 = 175 000 слотов вместо 5 000. Потребует колонки `year_shard`.
- **Расширение типов запросов:** журналы (`SRCTITLE`), subject area (`SUBJAREA`).
