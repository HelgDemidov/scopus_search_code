# Product Refactor: Technical Specification, Risk Analysis, and Commit Plan — v4

Branch: `search-refactoring` of `https://github.com/HelgDemidov/scopus_search_code`
Authoritative source of truth: `README.md` on this branch.

---

## 1. Technical Specification (ТЗ)

### 1.1 Search Access Control

**Goal.** Restrict live Scopus search to authenticated users and enforce quotas; keep anonymous users useful via the local thematic collection.

**Backend requirements.**

- Modify `find_articles` in `app/routers/articles.py` (`GET /articles/find`):
  - Keep the existing `Depends(get_current_user)` guard — README already confirms the endpoint is private.
  - Keep the existing cap `count: int = Query(25, ge=1, le=25, ...)` — this already enforces "25 articles per request"; no change required but it MUST be explicitly documented.
  - Extend the endpoint signature with optional filter-capture query parameters: `year_from: int | None = Query(None)`, `year_to: int | None = Query(None)`, `doc_types: list[str] | None = Query(None)`, `open_access: bool | None = Query(None)`, and `country: list[str] | None = Query(None)`.
  - Pass the five optional filter parameters through to `SearchService.find_and_save` and store them verbatim in `search_history.filters` as a JSON object. In v1 these filters do NOT need to alter the actual Scopus API query; live Scopus search remains `keyword`-only, while filters are captured for future analytics and history filtering.
  - Introduce a new per-user weekly quota: **200 requests / 7 rolling days**, enforced *before* calling `SearchService.find_and_save`. On breach return HTTP `429` with `detail="Недельный лимит поиска исчерпан"`.
- New DB-backed rate limiter. Because the project README explicitly states Redis is not part of the stack (PostgreSQL 16 / Supabase only), the counter must live in PostgreSQL. Recommended approach: count rows in the new `search_history` table (see §1.2) where `user_id = :uid AND created_at >= now() - interval '7 days'`. Wrap the read+insert in a single transaction (or a SQL function) so concurrent `/articles/find` calls cannot both see "199 used" and each insert a 200th row.
- New endpoint `GET /articles/find/quota` returning `{ "limit": 200, "used": <int>, "remaining": <int>, "reset_at": <iso8601> }` where `reset_at` is the timestamp of the oldest counted history row + 7 days (rolling window). Depends on `get_current_user`.
- Public endpoints unchanged: `GET /articles/` (paginated local DB), `GET /articles/stats`, `GET /articles/{article_id}`. These already operate over the locally accumulated *"Artificial Intelligence and Neural Network Technologies"* collection via the seeder.

**Frontend requirements.**

- `frontend/src/pages/HomePage.tsx`:
  - Unauthenticated branch (`AnonHero` + `ArticleList`): keep the existing call path that hits `GET /articles/` via `useArticleStore.fetchArticles` (already the case — `handleSearch` only calls `getSearchStats` for authenticated users). Do NOT call `/articles/find`.
  - Add a non-dismissable banner directly under `SearchBar` in the anonymous branch:
    > «Поиск без авторизации осуществляется по статьям тематической коллекции «Artificial Intelligence and Neural Network Technologies». Для поиска по глобальной базе Scopus пройдите [авторизацию](/auth)»
  - Add a permanent, non-dismissable banner directly under the authenticated `SearchBar` with the exact text:
    > «Выдача результатов поиска по живой базе Scopus ограничена 25 статьями за 1 запрос»
- New Axios function `getScopusQuota()` in `frontend/src/api/articles.ts` hitting `GET /articles/find/quota`.
- New `useQuotaStore` (Zustand) alongside `authStore`, `articleStore`, `statsStore` in `frontend/src/stores/` to hold `{ limit, used, remaining, reset_at }`. The store must refetch after every successful `/articles/find` response and on `ProfilePage` mount.
- `frontend/src/components/articles/ScopusQuotaBadge.tsx` already shows *Scopus-side* quota (from `X-RateLimit-*` response headers of `find_articles`). Do NOT conflate the two. Introduce a new component (e.g. `LiveSearchQuotaCounter`) bound to `useQuotaStore`, rendered on `ProfilePage`.

**Acceptance criteria.**

- Anonymous user performing a search on `/` receives results only from the local DB; `ArticleList` populates; no Scopus call is issued; the banner text is exactly: «Поиск без авторизации осуществляется по статьям тематической коллекции «Artificial Intelligence and Neural Network Technologies». Для поиска по глобальной базе Scopus пройдите [авторизацию](/auth)».
- Authenticated user sees the exact banner text quoted above, cannot dismiss it.
- 201st request within 7 days returns HTTP 429; frontend surfaces a toast via the existing `Toaster` in `App.tsx`.
- `GET /articles/find/quota` returns monotonically-correct counters under concurrent requests (verified by integration test).

---

### 1.2 Search History

**Goal.** Replace the "Coming soon — requires backend support." placeholder in `ProfilePage.tsx` (lines 82–87) with a working last-100-entries view.

**Backend requirements.**

- New ORM model `app/models/search_history.py` (table `search_history`). README §"What Is Not Yet Implemented" confirms this table does NOT currently exist — migration is required.
  - Columns: `id SERIAL PK`, `user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `query TEXT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `result_count INT NOT NULL`, `filters JSONB NOT NULL DEFAULT '{}'::jsonb`.
  - `filters JSONB` stores the filter parameters submitted with the `/articles/find` request (`year_from`, `year_to`, `doc_types`, `open_access`, `country`), serialized as a JSON object. Default `{}` is valid only when no filters are submitted.
  - Indexes: `(user_id, created_at DESC)` to support both "last 100" and the rolling quota window.
- New Alembic migration in `alembic/versions/` creating the table above.
- Write into `search_history` inside `SearchService.find_and_save` (or inside `find_articles` after a successful call) on every successful `/articles/find`. The insert must include the user's `filters` payload and the count of articles actually returned.
- New endpoint `GET /articles/history` returning the last 100 rows for `current_user`, newest first, schema `SearchHistoryResponse` (list of `{id, query, created_at, result_count, filters}`).
- New endpoint `DELETE /articles/history/{id}` (optional but recommended) — not in scope unless requested.

**Frontend requirements.**

- Replace the placeholder div in `frontend/src/pages/ProfilePage.tsx` with a `SearchHistoryList` component that calls `GET /articles/history`, renders a scrollable list of items `[query, created_at, result_count, filters badge]`.
- Add a link in the Search History section: **«Перейти в аналитику по моим поискам»** → `/explore?mode=personal` (see §1.4).
- Anonymous users never hit this route (already guarded via `PrivateRoute` in `App.tsx` line 79–83).

**Acceptance criteria.**

- Running `/articles/find` creates exactly one row per successful call; rolls back on Scopus error.
- `GET /articles/history` returns ≤100 rows ordered by `created_at DESC`.
- Alembic `alembic upgrade head` creates the table; `alembic downgrade -1` drops it cleanly.

---

### 1.3 Filter Relocation

**Goal.** Remove the left filter panel from `/` and expose filters only in `/profile`, where they operate over personal search history (not the full DB).

**Decision:** Anonymous users on `/` have no filter panel. Search over the local thematic collection is full-text keyword search only (via the existing `search` query parameter on `GET /articles/`). Filtering is a profile-only, authenticated feature scoped to personal search history. If this decision is unacceptable to the product owner, treat it as an open product question before implementation.

**Frontend changes.**

- `frontend/src/pages/HomePage.tsx`:
  - Delete the desktop `<div className="hidden lg:block"><ArticleFilters /></div>` (line 188–190) and the mobile `<div className="lg:hidden"><ArticleFilters /></div>` (line 181–183).
  - Drop the left-column flex wrapper; keep `ArticleList` + `PaginationControls` + `SearchResultsDashboard` as the sole content under `SearchBar`.
- `frontend/src/components/articles/ArticleFilters.tsx`: keep the component but refactor its data source. Instead of reading `useStatsStore` (global aggregates), it must consume aggregates derived from the user's `search_history` results (year range, document type, open access, country). Either:
  - (a) compute client-side from fetched personal history, or
  - (b) add a new `GET /articles/history/stats` endpoint. Option (a) is preferred for the first iteration — avoids a second aggregation backend.
- `frontend/src/pages/ProfilePage.tsx`: add an "Фильтры по моей истории" section that renders `<ArticleFilters />` and re-filters `SearchHistoryList` client-side.
- `useArticleStore.filters` must be split: keep `search` / `keyword` for the home page, but move `{yearFrom, yearTo, docTypes, openAccessOnly, countries}` to a new `useHistoryStore` (or namespaced slice).
- `articleStore.keyword` continues to serve both `GET /articles/` (local collection filter) and `GET /articles/find` (live Scopus search keyword) — these are intentionally the same field because in both cases it represents "what the user typed in SearchBar". The filter parameters (`yearFrom`, `yearTo`, etc.) are the only state migrated to `historyStore`; `keyword` is NOT split.

**Acceptance criteria.**

- Anonymous user on `/` sees no filter controls at all.
- Authenticated user on `/` sees no sidebar filter; only `SearchBar`, banner, `ArticleList`, and dashboard.
- Filters on `/profile` narrow the visible history entries by year/doctype/OA/country.

---

### 1.4 `/explore` Dual Mode

**Goal.** `/explore` must behave identically to today for anonymous users (feeding from `GET /articles/stats` in `frontend/src/stores/statsStore.ts`) but add a mode switcher for authenticated users.

**Frontend changes to `frontend/src/pages/ExplorePage.tsx`.**

- Anonymous users: unchanged charts (`DocumentTypesChart`, `TopCountriesChart`, `PublicationsByYearChart`, `TopJournalsChart`), unchanged data source (`useStatsStore.fetchStats` → `GET /articles/stats`). Rename the anon CTA banner (lines 116–134) to reference the thematic collection:
  > «Вы просматриваете аналитику по тематической коллекции "Artificial Intelligence and Neural Network Technologies". Авторизуйтесь, чтобы видеть аналитику по своим запросам.»
- Authenticated users: add a `ToggleGroup` at the top: «Коллекция» | «Мои поиски». Default = Коллекция.
  - `?mode=personal` preselects «Мои поиски». Read via `useSearchParams` from `react-router-dom`.
  - «Мои поиски» renders the same four chart components but sources data from selectors/derived functions inside `useHistoryStore`, which aggregate the existing `GET /articles/history` payload client-side into `by_year`, `by_doc_type`, `by_country`, and `by_journal`.
- `KpiCard` labels stay the same; only the numbers change per mode.

**Acceptance criteria.**

- Anonymous user sees charts identical to pre-refactor behavior.
- Authenticated user navigating from Profile → "Перейти в аналитику по моим поискам" lands on `/explore?mode=personal` with personal tab preselected.
- Toggle is persistent in URL (`?mode=collection|personal`) so the tab survives reload and is shareable.

---

### 1.5 Global Auth Navigation

**Status check.** README §"What Is Not Yet Implemented" lists UI text unification but does NOT explicitly say a shared navbar is missing. Direct inspection of `frontend/src/App.tsx` confirms a `RootLayout` component (lines 39–48) is already wired into the router, and `<Header />` is rendered inside it. So a shared layout **already exists**. The remaining work is to normalize its auth affordance.

**Changes to `frontend/src/components/layout/Header.tsx`.**

- Replace the English "Sign In" label (line 83) with **«Авторизоваться»**. Link target stays `/auth`.
- In the authenticated branch, add a visible top-level nav link **«Личный кабинет»** → `/profile` alongside the existing "Explore" link in `NavigationMenuList`. The dropdown "Profile" item (line 110) may remain, but the primary action must be the visible link so it's reachable without opening the dropdown.
- Rename the dropdown item "Sign Out" (line 117) to **«Выйти»**.
- Rename the "Explore" link (line 69) to **«Исследовать»**.

**Acceptance criteria.**

- Every route (`/`, `/explore`, `/profile`, `/auth`, `/article/:id`) renders `<Header />` — already guaranteed by `RootLayout` covering all routes in `App.tsx`.
- Anonymous sees one primary CTA: **«Авторизоваться»** → `/auth`.
- Authenticated sees **«Личный кабинет»** → `/profile` as a top-level nav link (not buried in a dropdown).

---

### 1.6 Russian UI Pass

**Goal.** All visible UI strings are in Russian, except the literal collection name *"Artificial Intelligence and Neural Network Technologies"* and the product name *"Scopus Search"*.

**Files in scope (non-exhaustive, from inspection).**

- `frontend/src/components/layout/Header.tsx` — see §1.5.
- `frontend/src/pages/HomePage.tsx` — `AnonHero` strings ("Search Scopus publications", "Preview results below.", "Sign in to unlock full search.").
- `frontend/src/pages/ExplorePage.tsx` — "Explore Research", "Aggregated statistics across the current search dataset.", KPI labels ("Articles indexed", "Countries", "Open Access", "Document types"), anon CTA.
- `frontend/src/pages/ProfilePage.tsx` — "Profile", "Username", "Email", "Member since", "Search History", "Coming soon — requires backend support.", "Sign Out".
- `frontend/src/pages/AuthPage.tsx`, `frontend/src/pages/OAuthCallback.tsx`, `frontend/src/pages/ArticlePage.tsx` — audit and translate.
- Component files under `frontend/src/components/articles/` (`ArticleFilters`, `ArticleList`, `ScopusQuotaBadge`, etc.) and `frontend/src/components/search/`.

**Approach.** Inline translation is acceptable for the first pass; no i18n framework. Leave English only where the README explicitly preserves it (logo `aria-label="Scopus Search"`, and collection name literals).

**Acceptance criteria.**

- Manual walkthrough of `/`, `/explore`, `/profile`, `/auth`, `/article/:id` in both auth states shows no English-language UI copy except the two allowed exceptions.

---

## 2. Architectural Risk Analysis

### 2.1 Search Access Control

| Risk | Affected files | Current state / friction | Level | Mitigation |
|---|---|---|---|---|
| PostgreSQL-only rate limiting: TOCTOU race under concurrent `/articles/find` | `app/routers/articles.py::find_articles`, new `PostgresSearchHistoryRepository` | No Redis in stack (README lists PG 16/Supabase only). Naive `SELECT count(...) → INSERT` pattern lets two concurrent requests both read 199 and insert row 200 and 201. | **High** | Use `pg_advisory_xact_lock(user_id)` as the primary implementation choice around the quota check + history insert. Session Pooler is used for the FastAPI app, making advisory locks safe; `SERIALIZABLE` isolation is not chosen because it risks incompatibility with pooler connection reuse. Pass `user_id` as a Python `int` directly (not as a string) to `pg_advisory_xact_lock`; PostgreSQL auto-casts `INT → bigint` safely. Add an integration test with 10 parallel requests. |
| Banner text regression via i18n/minifier | `HomePage.tsx` | Banner text is spec-critical ("Выдача результатов поиска по живой базе Scopus ограничена 25 статьями за 1 запрос") | Low | Snapshot test / Playwright assertion for exact string. |
| Scopus quota headers already forwarded by `find_articles` (lines 116–122) may confuse users vs. per-user quota | `ScopusQuotaBadge.tsx`, new `LiveSearchQuotaCounter` | Two quota concepts collide | Medium | Keep `ScopusQuotaBadge` only in dev mode OR relabel it clearly (e.g. «Scopus API»); add `LiveSearchQuotaCounter` on `ProfilePage` labeled «Ваш недельный лимит». |
| Anon search must not reach Scopus | `HomePage.tsx::handleSearch` | Already correct — only `getSearchStats` is gated on `isAuthenticated`; list fetch uses `articleStore.fetchArticles` → `GET /articles/` | Low | Add unit test asserting no `/articles/find` call while `isAuthenticated=false`. |

### 2.2 Search History

| Risk | Affected files | Current state / friction | Level | Mitigation |
|---|---|---|---|---|
| `search_history` table does not exist | `app/models/`, `alembic/versions/` | README §"What Is Not Yet Implemented" explicitly confirms absence | **High** | Ship migration as commit #1. Block all other history work behind it. |
| Double-write (history insert) failing after successful Scopus call | `SearchService.find_and_save` | Scopus call is non-idempotent; quota already debited on Scopus side | Medium | Wrap article-save + history-insert in one DB transaction; on insert failure, log but do not 500 to the user (they have their results). |
| `filters JSONB` unbounded payload | new `search_history` model | Malicious client could store large blobs | Low | Validate filter schema at router layer before insert; cap JSON size (<2 KB). |
| 100-row limit drift | new `GET /articles/history` | README mandates "last 100 per user" | Low | Either `LIMIT 100` in the query, or a nightly delete-older-than-100 job. Start with `LIMIT 100` at read-time; keep full history for future analytics. |

### 2.3 Filter Relocation

| Risk | Affected files | Current state / friction | Level | Mitigation |
|---|---|---|---|---|
| `ArticleFilters` is currently driven by `useStatsStore` (global DB aggregates) | `frontend/src/components/articles/ArticleFilters.tsx`, `stores/articleStore.ts`, `stores/statsStore.ts` | Rewriting the data source is non-trivial; year bounds and country list must come from history, not the whole DB | Medium | Introduce a dedicated `useHistoryStore` that derives filter options from the user's own history payload; avoid a new endpoint in v1. |
| Filter state coupling in `useArticleStore.filters` (`search`, `keyword`, `yearFrom`, `yearTo`, `docTypes`, `openAccessOnly`, `countries`) | `articleStore.ts`, `HomePage.tsx`, `ExplorePage.tsx` | Today these are one object | Medium | Split into search-concerns (`search`, `keyword`) kept in `articleStore`, and personal-history filters in new `historyStore`. Migrate call sites atomically. |
| User expectation that filters on `/profile` also affect `/` | product UX | After relocation `/` has no filters | Low | Banner on `/profile` explaining scope, plus changelog note. |

### 2.4 `/explore` Dual Mode

| Risk | Affected files | Current state / friction | Level | Mitigation |
|---|---|---|---|---|
| Anon chart data source (`GET /articles/stats` via `useStatsStore`) must remain unchanged | `ExplorePage.tsx` (`fetchStats` on mount, line 69) | `App.tsx` line 117 also prefetches stats globally | Low | Gate the mode-toggle UI behind `isAuthenticated`; anon render path is untouched. |
| Adding a `GET /articles/history/stats` endpoint duplicates the aggregation code in `ArticleService.get_stats` | `app/services/article_service.py` (future) | Cost: ~1 day to refactor aggregation to accept a scope filter | Medium | Skip the endpoint in v1 — aggregate client-side from `GET /articles/history` (≤100 rows; trivially cheap). Add endpoint later if analytics grow beyond 100 rows. |
| `?mode=personal` preselect breaks if query param is absent | `ExplorePage.tsx` | New URL contract | Low | Default to `collection`; write unit test for both branches. |
| Shared chart components assume collection-shaped payload (`by_year`, `by_doc_type`, `by_country`, `by_journal`) | `components/charts/*` | `SearchStatsResponse` shape in `articles.py` matches `StatsResponse` for the four chart fields | Low | Reuse the existing `CountByField[]` shape when emitting client-side aggregates; no chart changes needed. |

### 2.5 Global Auth Navigation

| Risk | Affected files | Current state / friction | Level | Mitigation |
|---|---|---|---|---|
| Spec assumed a shared navbar may not exist | `frontend/src/App.tsx`, `frontend/src/components/layout/Header.tsx` | Direct inspection shows `RootLayout` + `<Header />` already exist and wrap every route | Low | No new layout component needed. Scope the commit to *relabelling* + adding the «Личный кабинет» nav link. |
| Dropdown-only access to Profile | `Header.tsx` lines 88–121 | Profile link is nested inside `DropdownMenu` | Low | Add a top-level `NavigationMenuItem` for «Личный кабинет» when `isAuthenticated`. |
| `PrivateRoute` coupling | `frontend/src/components/layout/PrivateRoute.tsx` | Already guards `/profile` | Low | No change required. |

### 2.6 Russian UI Pass

| Risk | Affected files | Current state / friction | Level | Mitigation |
|---|---|---|---|---|
| Test assertions hard-code English strings | `tests/` (frontend, if any), Playwright snapshots | Likely some tests match on copy | Medium | Update assertions alongside copy; grep for each old string before edit. |
| Collection name / product name accidentally translated | `HomePage.tsx`, `ExplorePage.tsx`, `Header.tsx` | Spec explicitly forbids | Low | Lint rule or code-review checklist; search for `"Artificial Intelligence and Neural Network Technologies"` and `"Scopus Search"` literals. |
| ARIA labels / `aria-label` text mixed-language | `Header.tsx` (`aria-label="Scopus Search"`, `aria-label="User menu for ..."`) | Screen reader a11y | Low | Keep product name English; translate `User menu for` to `Меню пользователя` interpolated. |

---

## 3. Atomic Commit Plan

Conventional commits, 8 milestones, ordered by dependency.

### Commit 1 — `feat(db): add search_history table and weekly quota infrastructure`

- **Affected files:**
  - new `app/models/search_history.py`
  - `alembic/env.py` (model import registration for Alembic autogenerate)
  - new `alembic/versions/<rev>_add_search_history.py`
  - new `app/infrastructure/postgres_search_history_repo.py`
  - new `app/interfaces/search_history_repo.py`
- **What & why:** Create the `search_history` table with `(user_id, query, created_at, result_count, filters)` and the repository abstraction. Both search history (§1.2) and quota counting (§1.1) depend on this row source, so it ships first. README explicitly confirms the table does not exist yet. Add `from app.models.search_history import SearchHistory  # noqa: F401` to `alembic/env.py`, because Alembic currently imports ORM models directly there before assigning `target_metadata = Base.metadata`.
- **Effort:** **4h** (model + migration + repo + happy-path test).
- **Dependencies:** none.

### Commit 2 — `feat(api): search history endpoints + quota endpoint`

- **Affected files:**
  - `app/routers/articles.py` (new `GET /articles/history`, `GET /articles/find/quota`)
  - new `app/schemas/search_history_schemas.py` (`SearchHistoryResponse`, `QuotaResponse`)
  - new `app/services/search_history_service.py`
  - new `tests/integration/test_search_history_api.py`
- **What & why:** Expose history read and quota read. Quota math must use a rolling 7-day window keyed off `search_history.created_at`. Register `GET /articles/history` and `GET /articles/find/quota` above `GET /{article_id}` in `app/routers/articles.py` to avoid route shadowing.
- **Effort:** **5h**.
- **Dependencies:** Commit 1.

### Commit 3 — `feat(api): auth-gated search routing and per-user weekly quota`

- **Affected files:**
  - `app/routers/articles.py::find_articles` (inject quota check; add optional filter-capture query parameters)
  - `app/routers/articles.py::get_search_service` (update DI factory to inject `SearchHistoryRepository`)
  - `app/schemas/article_schemas.py` (add `FindArticlesFilters` schema or equivalent inline-query plumbing for `year_from`, `year_to`, `doc_types`, `open_access`, `country`)
  - `app/services/search_service.py` — inject `SearchHistoryRepository`; modify `find_and_save` to wrap article-save + history-insert in one DB transaction; insert `search_history` row (including filters payload) on every successful Scopus call.
  - `tests/integration/test_find_articles.py` (concurrent-request test, 429 test)
  - `tests/unit/test_search_service.py` (update constructor calls if it exists; otherwise create it in this commit)
- **What & why:** Enforce 200 req / 7 days per user; atomically record each call. This closes §1.1 on the backend. The endpoint is already private (`Depends(get_current_user)`) and already capped at `count ≤ 25`; this commit only adds the rolling counter and the history insert.
- **SearchService refactor:** Extends `SearchService.__init__` to accept a `SearchHistoryRepository` instance alongside the existing `ISearchClient` and `IArticleRepository`. Extends `find_and_save` signature to `find_and_save(keyword, count, *, user_id: int, filters: dict | None = None)`. Updates the `get_search_service` factory in `app/routers/articles.py` to inject `PostgresSearchHistoryRepository` via `Depends`. Any existing unit tests constructing `SearchService` directly must be updated to pass a stub `SearchHistoryRepository`.
- **Filter capture:** Extends `GET /articles/find` with five optional filter parameters (`year_from`, `year_to`, `doc_types`, `open_access`, `country`). These are not applied to the Scopus API query in v1 but are serialized and stored in `search_history.filters` on every successful call. This makes the `filters` column immediately meaningful for the §1.3 profile-page filter UX and §1.4 personal analytics.
- **Advisory-lock comment placeholder:** `await session.execute(text('SELECT pg_advisory_xact_lock(:uid)'), {'uid': int(current_user.id)})`
- **Effort:** **8h** (includes advisory-lock concurrency/race test plus `SearchService` constructor/signature and DI factory refactor).
- **Dependencies:** Commits 1, 2.

### Commit 4 — `feat(frontend): global navbar — RU labels and Profile link`

- **Affected files:**
  - `frontend/src/components/layout/Header.tsx`
- **What & why:** Rename «Sign In» → «Авторизоваться», «Explore» → «Исследовать», «Sign Out» → «Выйти»; add top-level **«Личный кабинет»** link for authenticated users. `RootLayout` in `App.tsx` already renders `<Header />` on every route, so no new layout component is introduced.
- **Effort:** **2h**.
- **Dependencies:** none (can land in parallel with backend work).

### Commit 5 — `feat(frontend): home page — banners, anon local search, remove sidebar filters`

- **Affected files:**
  - `frontend/src/pages/HomePage.tsx` (delete `ArticleFilters` sidebar, add two banners, translate `AnonHero` copy)
  - `frontend/src/components/search/SearchBar.tsx` (if copy)
  - `frontend/src/stores/articleStore.ts` (split filter slice, §1.3)
- **What & why:** Implements §1.1 (banners) and §1.3 (remove left filter panel). Anon path already hits `GET /articles/` — confirmed in source — so no backend change needed for anon. `articleStore.keyword` continues to serve both `GET /articles/` (local collection filter) and `GET /articles/find` (live Scopus search keyword) — these are intentionally the same field because in both cases it represents "what the user typed in SearchBar". The filter parameters (`yearFrom`, `yearTo`, etc.) are the only state migrated to `historyStore`; `keyword` is NOT split.
- **Effort:** **4h**.
- **Dependencies:** Commit 4 (for consistent Header language). None on backend.

### Commit 6 — `feat(frontend): profile page — history list, quota counter, filters`

- **Affected files:**
  - `frontend/src/pages/ProfilePage.tsx` (replace stub on lines 82–87; add filters section)
  - new `frontend/src/components/profile/SearchHistoryList.tsx`
  - new `frontend/src/components/profile/LiveSearchQuotaCounter.tsx`
  - new `frontend/src/stores/historyStore.ts` (holds fetched history + derived filter state)
  - new `frontend/src/stores/quotaStore.ts`
  - `frontend/src/api/articles.ts` (add `getSearchHistory`, `getScopusQuota`)
  - `frontend/src/components/articles/ArticleFilters.tsx` (swap data source to `historyStore`)
- **What & why:** Implements §1.2 (history) and §1.3 (filters moved here) and the live remaining counter from §1.1. Also adds the «Перейти в аналитику по моим поискам» link to `/explore?mode=personal`.
- **Effort:** **10h** (realistic). 8h was optimistic; 10h includes integration wiring, manual testing, and first-pass bug fixes.
- **Dependencies:** Commits 2 (history + quota APIs), 5 (filter slice split).

### Commit 7 — `feat(frontend): /explore dual-mode (collection vs personal)`

- **Affected files:**
  - `frontend/src/pages/ExplorePage.tsx` (add `ToggleGroup`, read `?mode=`)
  - `frontend/src/stores/historyStore.ts` (add selectors/derived functions for `by_year`, `by_doc_type`, `by_country`, `by_journal`)
  - translate anon CTA to reference the thematic collection
- **What & why:** Implements §1.4. Anon behavior unchanged (still `GET /articles/stats` via `useStatsStore`). Auth toggle defaults to Коллекция; `?mode=personal` preselects personal. No new backend endpoint and no duplicated stats store — `ExplorePage.tsx` reads personal chart aggregates directly from `historyStore` selectors derived client-side over ≤100 rows.
- **Effort:** **5h**.
- **Dependencies:** Commit 6 (for `historyStore`).

### Commit 8 — `chore(frontend): russian UI pass`

- **Affected files:**
  - `frontend/src/pages/AuthPage.tsx`
  - `frontend/src/pages/OAuthCallback.tsx`
  - `frontend/src/pages/ArticlePage.tsx`
  - `frontend/src/pages/ProfilePage.tsx` (residual strings)
  - `frontend/src/pages/ExplorePage.tsx` (KPI labels, "Explore Research" → «Исследование»)
  - `frontend/src/components/articles/*` (ArticleList, ArticleFilters copy, ScopusQuotaBadge)
  - `frontend/src/components/search/*`
  - `frontend/src/components/ui/PaginationControls.tsx` if any copy
- **What & why:** Final §1.6 sweep. Preserve «Scopus Search» (logo) and the collection name literal.
- **Effort:** **4h**.
- **Dependencies:** Commits 4–7 (so translated strings don't collide with in-flight UI changes).

---

### Summary

- **Total effort:** **42 hours** (~5–6 working days at full focus; realistically 7–8 working days with review/testing).
- **Recommended sprint split (2 × 1-week sprints):**
  - **Sprint 1 — Backend + navbar:** Commits 1, 2, 3, 4. ~19h. Ships the data foundation and the lowest-risk frontend change.
  - **Sprint 2 — Frontend refactor:** Commits 5, 6, 7, 8. ~23h. Builds directly on the APIs from Sprint 1.
- **Critical path:** **1 → 2 → 3 → 6 → 7**. Commit 6 is the widest node — it depends on backend APIs (2) *and* on the filter-slice split landed in Commit 5, and it blocks the `/explore` dual-mode work in Commit 7. Landing Commit 1 on day 1 is the single biggest unblocker for the whole plan; Commit 4 can go in parallel to de-risk the final UI polish.

---

## 4. Test Coverage Plan

### 4.1 Backend test requirements

Tooling: backend coverage uses `pytest`, `pytest-asyncio`, and `httpx.AsyncClient` with `ASGITransport`, matching the current project test stack. Backend `pytest` tests already run locally and in CI via the existing `.github/workflows/tests.yml`. Default integration tests run against the existing in-memory `sqlite+aiosqlite:///:memory:` fixture pattern; PostgreSQL-specific quota-concurrency tests must run against real PostgreSQL and be tagged `@pytest.mark.requires_postgres`.

| Commit | Test file | Test type | Scenarios covered |
|---|---|---|---|
| Commit 1 — DB schema + rate limiting infrastructure | `tests/integration/test_search_history_schema.py` | Integration | Alembic upgrade creates `search_history`; table includes `id`, `user_id`, `query`, `created_at`, `result_count`, `filters`; `search_history.user_id` references `users.id` with cascade delete; `(user_id, created_at DESC)` index exists or is validated through query metadata; `filters` default is `{}` when no filters are submitted. The `alembic downgrade -1` scenario must be tagged `@pytest.mark.requires_postgres` and excluded from the SQLite fixture, because `TIMESTAMPTZ` and `JSONB` DDL is PostgreSQL-specific. All other schema-inspection tests in this row can use SQLite. |
| Commit 1 — repository behavior | `tests/unit/test_search_history_repository.py` | Unit | Repository inserts one history row; repository counts rows in the rolling 7-day window; rows older than 7 days do not count toward quota; `reset_at` is calculated as oldest counted `created_at + 7 days`; `result_count` and `filters` round-trip correctly. |
| Commit 2 — history + quota endpoints | `tests/integration/test_search_history_api.py` | Integration | `GET /articles/history` requires auth; `GET /articles/history` returns only the current user's rows; response is limited to ≤100 rows; rows are ordered by `created_at DESC`; response schema includes `id`, `query`, `created_at`, `result_count`, `filters`; `GET /articles/find/quota` requires auth; quota endpoint returns correct `limit`, `used`, `remaining`, and `reset_at`; route safety: `GET /articles/history` and `GET /articles/find/quota` resolve before `GET /{article_id}` catch-all. |
| Commit 3 — live search quota + history write | `tests/integration/test_find_articles.py` | Integration | Happy path: `GET /articles/find` creates one `search_history` row; rollback: Scopus error creates no row and does not mask the original user-facing error behavior; quota boundary: 200th request succeeds and 201st returns HTTP `429`; `GET /articles/find/quota` reflects the updated count after each successful search; filter persistence: `GET /articles/find?keyword=ai&year_from=2020` stores `{\"year_from\": 2020}` in `search_history.filters`; `doc_types`, `open_access`, and `country` also persist when supplied; history insert includes `result_count`; unauthenticated access to `/articles/find` remains rejected by `Depends(get_current_user)`. |
| Commit 3 — PostgreSQL quota concurrency | `tests/integration/test_find_articles_postgres.py` | Integration, `@pytest.mark.requires_postgres` | Concurrency: 10 parallel requests from the same user near the quota boundary produce the correct number of accepted rows and reject over-limit requests with HTTP `429`; exactly one row is allowed at the final available quota slot; `pg_advisory_xact_lock(:uid)` receives `uid` as `int(current_user.id)`, not `str(current_user.id)`; concurrent requests from different users do not block each other unnecessarily. |

### 4.2 Frontend test requirements

**Frontend testing approach for this project:** No dedicated frontend test framework (Vitest, Jest, Playwright) is configured. Frontend correctness is verified through **manual browser testing** following a structured checklist, runnable locally from VS Code with `npm run dev`. For each frontend commit (4–8), the developer must complete the checklist below before the commit is considered done.

**Commit 4 checklist:**

- [ ] Unauthenticated: Header shows «Авторизоваться», links to `/auth`
- [ ] Authenticated: Header shows top-level «Личный кабинет» linking to `/profile`
- [ ] Authenticated: Dropdown shows «Выйти»; «Исследовать» links to `/explore`

**Commit 5 checklist:**

- [ ] Anonymous user on `/`: no `ArticleFilters` rendered; anon banner present with exact text
- [ ] Anonymous user on `/`: network tab shows no `GET /articles/find` calls after search
- [ ] Authenticated user on `/`: authenticated banner present; no sidebar filter

**Commit 6 checklist:**

- [ ] `/profile` quota counter shows `limit`, `used`, `remaining`, `reset_at`
- [ ] Quota counter updates after performing a live search
- [ ] History list renders entries with query text, timestamp, result count, filter badges
- [ ] History filters (year / doctype / OA / country) narrow list client-side
- [ ] «Перейти в аналитику по моим поискам» navigates to `/explore?mode=personal`

**Commit 7 checklist:**

- [ ] `/explore?mode=personal` preselects «Мои поиски» for logged-in users
- [ ] Personal charts render with data from history
- [ ] `/explore` (no param) defaults to «Коллекция»
- [ ] Anonymous user sees collection charts unchanged

**Commit 8 checklist:**

- [ ] Spot-check `/`, `/explore`, `/profile`, `/auth`, `/article/:id` — no English UI copy except «Scopus Search» (logo) and the collection name literal

### 4.3 E2E critical-path scenarios

Run these 5 flows manually before any release. No automation required.

1. **Anonymous search:** open `/` → type query → confirm local results load → confirm DevTools Network shows no `/articles/find` call.
2. **Auth + quota tracking:** log in → perform 3 searches → open `/profile` → confirm quota counter shows `used: 3, remaining: 197`.
3. **History → Explore:** perform 5 searches → `/profile` shows 5 entries → click «Перейти в аналитику» → `/explore?mode=personal` opens, charts populated.
4. **Quota exhaustion:** use a DB client (e.g. TablePlus) to insert 200 dummy `search_history` rows for your test user → attempt a search → confirm 429 toast appears and quota counter shows `remaining: 0`.
5. **Filter persistence:** search with `year_from=2020` via DevTools (or a REST client) → open `/profile` → confirm the history entry shows a `2020–` filter badge.

### 4.4 Test infrastructure notes

- Backend tests (`pytest`) run locally with `pytest tests/` and in CI via the existing `.github/workflows/tests.yml`. No new CI infrastructure is needed for backend tests.
- Tests tagged `@pytest.mark.requires_postgres` require a live PostgreSQL connection (local or Supabase). Skip them with `pytest -m "not requires_postgres"` when only a SQLite environment is available.
- Frontend has no automated test runner. Use the manual checklists in §4.2 and the manual smoke tests in §4.3 before marking any frontend commit as done.
- If the project later grows beyond pet-project scope, the natural upgrade path is: add Vitest for component tests, then Playwright for E2E automation, then wire both into a new GitHub Actions frontend job.

---

## Notes — inspected files & uncertain assumptions

**Inspected (as instructed):**

- `README.md` (branch `search-refactoring`) — authoritative.
- `app/models/user.py`
- `app/routers/articles.py`
- `app/routers/users.py`
- `frontend/src/App.tsx`
- `frontend/src/pages/ProfilePage.tsx`
- `frontend/src/pages/ExplorePage.tsx`
- `frontend/src/stores/authStore.ts`

**Additionally skimmed for route/component/endpoint facts only, no code changes:**

- `frontend/src/components/layout/Header.tsx` — confirmed shared header exists.
- `frontend/src/pages/HomePage.tsx` — confirmed anon path uses `GET /articles/` via `useArticleStore`, not `/articles/find`.
- `frontend/src/components/articles/ArticleFilters.tsx` (first 30 lines) — confirmed it reads `useStatsStore` and `useArticleStore`.
- Directory listings of `frontend/src/pages/`, `frontend/src/stores/`, `frontend/src/components/layout/`, `frontend/src/components/search/`, `frontend/src/api/`.

**Uncertain assumptions flagged for review:**

1. *Advisory-lock implementation details must be validated against the deployed pooler mode.* The FastAPI app uses Session Pooler, so `pg_advisory_xact_lock(user_id)` is the primary quota-concurrency mechanism; do not rely on `SERIALIZABLE` session settings for this feature.
2. *Client-side aggregation over ≤100 history rows is acceptable* for §1.4 personal analytics. If the product later raises the 100-row ceiling, add `GET /articles/history/stats` (deferred).
3. *No existing `/articles/history*` route collides* — `/articles/find/quota` and `/articles/history` were chosen to stay under the existing `router = APIRouter(prefix="/articles")`; verify no slug conflict with the `/{article_id}` catch-all by registering new literal paths before `GET /{article_id}` in `articles.py`, because FastAPI route priority follows registration order. The current `/{article_id}` route is last, so this is confirmed safe as long as the new literal routes are inserted above it.
4. *README's "UI text not unified" item* is the only indication that global language work remains. The README does not explicitly say "no shared navbar" — inspection shows a `RootLayout`+`Header` already exist, so §1.5 is de-scoped from "add shared layout" to "relabel + add nav link."
5. *No existing tests assert English copy strings*; if `tests/integration` or frontend tests do, Commit 8 must also update them.

***

---

## 5. Implementation Status

> **Last updated:** 2026-04-21
> **Scope:** ветка `search-refactoring`, влита в `main` через PR #3 (2026-04-20),
> PR #4 и прямые коммиты в `main` (2026-04-21).
> **CI:** оба job'а — `test` (SQLite) и `test-pg` (PostgreSQL 16) — проходят на `main`.
> **Итог:** коммиты 1–8 реализованы; все 6 разделов ТЗ (§1.1–1.6) закрыты.

---

### Commit 1 — `feat(db): add search_history table and weekly quota infrastructure`

**Статус: ✅ DONE — [`26ebd0f`](https://github.com/HelgDemidov/scopus_search_code/commit/26ebd0f06d59830b2b1cea5dae86a0b78cda18e8)**

#### Созданные файлы

| Файл | Факт из кода |
|---|---|
| `app/models/search_history.py` | Модель `SearchHistory` с колонками `id`, `user_id` (FK → `users.id` ON DELETE CASCADE), `query`, `created_at`, `result_count`, `filters`. |
| `alembic/versions/0005_add_search_history.py` | `down_revision = 'd2c4aaedfd4e'`. `upgrade()` создаёт таблицу и составной индекс; `downgrade()` удаляет и то, и другое. |
| `alembic/env.py` | Добавлен `from app.models.search_history import SearchHistory  # noqa: F401` для autogenerate. |
| `app/interfaces/search_history_repo.py` | ABC `ISearchHistoryRepository` с методами `insert_row`, `count_in_window`, `get_last_n`, `get_oldest_in_window_created_at`. |
| `app/infrastructure/postgres_search_history_repo.py` | `PostgresSearchHistoryRepository` реализует все четыре метода. В `insert_row` применяется `flush()` (не `commit()`), чтобы управление транзакцией оставалось у вызывающего кода. |
| `tests/unit/test_search_history_repository.py` | 9 unit-тестов через `FakeSearchHistoryRepository`. |

#### Отклонения от ТЗ

**1. Тип колонки `filters` в ORM-модели.**
Миграция `0005_add_search_history.py` использует `postgresql.JSONB` и `server_default=sa.text("'{}'")` — точное соответствие спецификации. ORM-модель применяет собственный `JsonField(TypeDecorator)` и устанавливает `default=dict` на стороне Python для совместимости с SQLite-тестами. DDL в PostgreSQL соответствует ТЗ.

**2. Составной индекс: `DESC` в миграции, отсутствует в `__table_args__`.**
`alembic/versions/0005_add_search_history.py` создаёт индекс `(user_id, created_at DESC)` на стороне PostgreSQL — как требует ТЗ. `__table_args__` без направления используется только для `Base.metadata.create_all` в SQLite-тестах, которые не поддерживают сортировку индекса.

---

### Commit 2 — `feat(api): search history endpoints + quota endpoint`

**Статус: ✅ DONE — [`8d05fc8`](https://github.com/HelgDemidov/scopus_search_code/commit/8d05fc8eaeea7759ebabaddf63a3179d88330dd1), [`55e0983`](https://github.com/HelgDemidov/scopus_search_code/commit/55e09832af5e4f836349539495bfdf5bd557f906), [`f6e8685`](https://github.com/HelgDemidov/scopus_search_code/commit/f6e8685c3e85e59125663cd456626437bf276621), [`c23ed33`](https://github.com/HelgDemidov/scopus_search_code/commit/c23ed3363af7155c03159c55d65c6fc695d11f10) + фиксы в [`847392f`](https://github.com/HelgDemidov/scopus_search_code/commit/847392f0b6f7a34b9caecfb9168eb168d3a87604), [`2dfd409`](https://github.com/HelgDemidov/scopus_search_code/commit/2dfd409d0e377a73ba9607a1349b64f81a16f88d)**

#### Созданные / изменённые файлы

| Файл | Факт из кода |
|---|---|
| `app/schemas/search_history_schemas.py` | Схемы `SearchHistoryItemResponse`, `SearchHistoryResponse` (обёртка `{items, total}`), `QuotaResponse` (`limit`, `used`, `remaining`, `reset_at` + дополнительное поле `window_days: int = 7`). |
| `app/services/search_history_service.py` | `SearchHistoryService` с методами `get_history(user_id, n=100)` и `get_quota(user_id)`. |
| `app/routers/articles.py` | `GET /articles/history` и `GET /articles/find/quota` добавлены выше catch-all `GET /{article_id}` — риск перекрытия маршрутов устранён. |
| `tests/integration/test_search_history_api.py` | 9 интеграционных тестов, все помечены `@pytest.mark.requires_pg`. |

#### Отклонения от ТЗ

1. **`GET /articles/history` возвращает `{items, total}` вместо bare-array.** Клиент (`getSearchHistory()` в `api/articles.ts`) обрабатывает оба формата: `if (Array.isArray(data)) return data; else return data.items` — обратная совместимость обеспечена.
2. **`QuotaResponse` содержит дополнительное поле `window_days: int = 7`** — не нарушает контракт ТЗ, исключает хардкод константы на фронтенде.
3. **Попытка `scope="module"` для async-фикстур** (промежуточный коммит [`2dfd409`](https://github.com/HelgDemidov/scopus_search_code/commit/2dfd409d0e377a73ba9607a1349b64f81a16f88d)) вызвала `ScopeMismatch` с `asyncio_default_fixture_loop_scope = function` из `pytest.ini`; откат к `scope="function"` выполнен в том же коммите.

---

### Тестовая инфраструктура: PostgreSQL E2E в GitHub Actions

**Статус: ✅ DONE — [`7718987`](https://github.com/HelgDemidov/scopus_search_code/commit/7718987878dbea32aae21a5f957f2974ce139e57), [`ef16f5a`](https://github.com/HelgDemidov/scopus_search_code/commit/ef16f5a40d1642b145279c1fa101fcd3aa49586f), [`9eabc37`](https://github.com/HelgDemidov/scopus_search_code/commit/9eabc37c2ba4540d1eddf501fd980f2954b71893)**

В `.github/workflows/tests.yml` добавлен второй job `test-pg` с сервисным контейнером PostgreSQL 16. Предупреждение `authlib` устранено в [`b12df2d`](https://github.com/HelgDemidov/scopus_search_code/commit/b12df2d4c888441a2f68eb3a56c93ef77213a3d6) и [`3ed7b9f`](https://github.com/HelgDemidov/scopus_search_code/commit/3ed7b9f2421682ef8a382feb09c6f0a7904aa0f8).

| Job | БД | Фильтр тестов |
|---|---|---|
| `test` (существующий) | SQLite in-memory | `-m "not requires_pg"` |
| `test-pg` (новый) | PostgreSQL 16 (сервисный контейнер) | `-m requires_pg` |

---

### Commit 3 — `feat(api): auth-gated search routing and per-user weekly quota`

**Статус: ✅ DONE — [`fd0bba6`](https://github.com/HelgDemidov/scopus_search_code/commit/fd0bba64c8e8f33b91431743ad58045a97e3e6ff)**

#### Что реализовано (верифицировано по diff коммита)

- **`SearchService` рефакторинг:** конструктор принимает `ISearchHistoryRepository`; `find_and_save` расширен параметрами `user_id: int` и `filters: dict | None = None`; после успешного `save_many` вставляется строка в `search_history` в той же транзакции.
- **`GET /articles/find`:** добавлены опциональные параметры `year_from`, `year_to`, `doc_types`, `open_access`, `country`; они сохраняются в `search_history.filters`, но **не** передаются в Scopus API — соответствие ТЗ v1.
- **Квота через `pg_advisory_xact_lock`:** `await session.execute(text('SELECT pg_advisory_xact_lock(:uid)'), {'uid': int(current_user.id)})` перед проверкой 7-дневного счётчика; HTTP 429 (`"Недельный лимит поиска исчерпан"`) без вызова Scopus и без вставки строки при исчерпании.
- **DI factory:** `PostgresSearchHistoryRepository` подключён на тот же `AsyncSession`, что и `PostgresArticleRepository` — advisory lock, квота, сохранение статей и история делят одну транзакцию.
- **Тесты:** `tests/unit/test_search_service.py` (5 unit-тестов), `tests/integration/test_find_articles.py` (SQLite, 7 тестов), `tests/integration/test_find_articles_postgres.py` (`@pytest.mark.requires_pg`, 3 теста на конкурентность, сценарий «ровно один слот», изоляция замков разных пользователей).

#### Таблица критериев приёмки

| Критерий ТЗ | Статус |
|---|---|
| 201-й запрос → HTTP 429 | ✅ SQLite + PG тесты |
| История пишется только при успехе, откат при ошибке Scopus | ✅ unit + integration тесты |
| `pg_advisory_xact_lock` получает `int(uid)` | ✅ PG-тест на изоляцию |
| Параметры фильтров сохраняются в `search_history.filters` | ✅ тест `filter persistence` |

---

### Commit 4 — `feat(frontend): global navbar — RU labels and Profile link`

**Статус: ✅ DONE — [`ed5932d`](https://github.com/HelgDemidov/scopus_search_code/commit/ed5932d49eadf32def61c00a521e406cd5547f6a)**

**Изменённый файл:** `frontend/src/components/layout/Header.tsx`.

Верифицировано по финальному коду файла:

| Требование ТЗ | Факт в коде |
|---|---|
| «Sign In» → «Авторизоваться» | `<Link to="/auth">Авторизоваться</Link>` в `Button` |
| «Explore» → «Исследовать» | `<Link to="/explore">Исследовать</Link>` в `NavigationMenuItem` |
| «Sign Out» → «Выйти» | `<DropdownMenuItem>Выйти</DropdownMenuItem>` |
| Верхнеуровневая ссылка «Личный кабинет» для авторизованных | `<Link to="/profile">Личный кабинет</Link>` в отдельном `NavigationMenuItem`, условный рендер `{isAuthenticated && ...}` |
| `aria-label` логотипа остаётся `"Scopus Search"` | `aria-label="Scopus Search"` на SVG-элементе |
| `aria-label` аватара переведён | `aria-label={`Меню пользователя ${displayName}`}` |

В дропдауне также присутствует `<Link to="/profile">Личный кабинет</Link>` — обе точки входа реализованы.

---

### Commit 5 — `feat(frontend): home page banners + remove sidebar filters`

**Статус: ✅ DONE — [`d5a599a`](https://github.com/HelgDemidov/scopus_search_code/commit/d5a599a21d754d2c73fd291e64cf87bea6c9ed24) + пост-merge фикс [`3d7fdc7`](https://github.com/HelgDemidov/scopus_search_code/commit/3d7fdc727bcd88c6ba405944e73cda37bf97bef0), рефакторинг стора [`edbc0fd`](https://github.com/HelgDemidov/scopus_search_code/commit/edbc0fdf5a997e139701e2099fb176d4d075aff7)**

Верифицировано по финальному коду `HomePage.tsx`:

- **Фильтровая панель удалена:** ни в анонимной, ни в авторизованной ветке `ArticleFilters` не рендерится; в финальном коде файла `<ArticleFilters />` отсутствует полностью — только `SearchBar`, `ScopusQuotaBadge`, баннер, `ArticleList`, `SearchResultsDashboard`.
- **Анонимный баннер:** в компоненте `AnonHero` присутствует точный текст ТЗ: «Поиск без авторизации осуществляется по статьям тематической коллекции «Artificial Intelligence and Neural Network Technologies». Для поиска по глобальной базе Scopus пройдите [авторизацию](/auth)». Реализован как `<p className="text-xs ...">` с `<Link to="/auth">`.
- **Авторизованный баннер:** `<p className="text-xs text-slate-500 ...">Выдача результатов поиска по живой базе Scopus ограничена 25 статьями за 1 запрос</p>` — непосредственно под `SearchBar`, без возможности закрыть.
- **`AnonHero` строки:** заголовок «Поиск публикаций Scopus», подпись «Предпросмотр результатов ниже. [Войдите] для полного поиска.» — переведены; слова «Search Scopus publications», «Preview results below.», «Sign in to unlock full search.» в файле отсутствуют.
- **Анонимный `handleSearch`:** вызывает `setFilters({ search: query, keyword: undefined })` и `fetchArticles()` — `GET /articles/`, без вызова `/articles/find`.
- **Авторизованный `handleSearch`:** вызывает `searchScopusLive(query)` — `GET /articles/find`.

#### Filter-slice split (`articleStore` → `historyStore`)

Верифицировано по финальному `articleStore.ts`:

- `filters: ArticleFilters` содержит только серверные поля: `keyword` и `search`. Полей `yearFrom`, `yearTo`, `docTypes`, `openAccessOnly`, `countries` в интерфейсе `ArticleFilters` нет.
- `applyClientFilters(articles, clientFilters)` получает `clientFilters` через `useHistoryStore.getState().historyFilters` — динамический импорт внутри `fetchArticles`.
- `ArticleClientFilters` экспортируется из `types/api.ts` и используется как `HistoryFilters` в `historyStore.ts`.

#### Пост-merge фикс

`getScopusQuota()` в первоначальном `api/articles.ts` обращался к `/articles/quota`. Исправлено на `/articles/find/quota` в [`3d7fdc7`](https://github.com/HelgDemidov/scopus_search_code/commit/3d7fdc727bcd88c6ba405944e73cda37bf97bef0) (D-1). Финальный файл `api/articles.ts` содержит: `apiClient.get<QuotaResponse>('/articles/find/quota')`.

---

### Commit 6 — `feat(frontend): profile page — history list, quota counter, filters`

**Статус: ✅ DONE — [`d5a599a`](https://github.com/HelgDemidov/scopus_search_code/commit/d5a599a21d754d2c73fd291e64cf87bea6c9ed24) + фикс [`a65d9183`](https://github.com/HelgDemidov/scopus_search_code/commit/a65d9183bd989122150e6998a5925f99fbbd8d94) + серия фиксов `quotaStore` [`71bec9af`](https://github.com/HelgDemidov/scopus_search_code/commit/71bec9afb4f7cdbf880df651856e6de0ba59f43d), [`6e63f793`](https://github.com/HelgDemidov/scopus_search_code/commit/6e63f793ad0d01edd458c711f79275e639678242), [`6f0244cb`](https://github.com/HelgDemidov/scopus_search_code/commit/6f0244cba3fad9f8932052e7ef5e3ebcb0c8b3f1)**

#### Верификация по финальным файлам

**`ProfilePage.tsx`:**
- Импортирует `useQuotaStore`, `useHistoryStore`, `LiveSearchQuotaCounter`, `SearchHistoryList`.
- В `useEffect` при монтировании вызывает `fetchQuota()` и `fetchHistory()` — соответствие требованию ТЗ «на ProfilePage mount».
- Стаб «Coming soon — requires backend support.» (строки 82–87 оригинала) полностью заменён секциями `<LiveSearchQuotaCounter />` и `<SearchHistoryList />`.
- Все надписи на русском: «Профиль», «Имя пользователя», «Email», «Дата регистрации», «Выйти».

**`quotaStore.ts`:**
- Содержит `quota: QuotaResponse | null`, `isLoading: boolean`, `fetchQuota: () => Promise<void>`.
- `fetchQuota` вызывает `getScopusQuota()` → `GET /articles/find/quota`, сохраняет полный объект `QuotaResponse`.
- Никакого `setState` со сторонними данными нет — только через `fetchQuota()`.

**`LiveSearchQuotaCounter.tsx`:**
- Читает `useQuotaStore((s) => s.quota)`.
- Отображает 4 ячейки: «Лимит», «Использовано», «Осталось», «Сбросится» с форматированием `toLocaleString('ru-RU')` и датой через `Intl.DateTimeFormat`.
- При `quota === null` рендерит `<Skeleton className="h-16 w-full" />`.

**`SearchHistoryList.tsx`:**
- Читает `items`, `historyFilters`, `setHistoryFilters`, `isLoading` из `useHistoryStore`.
- `useMemo filtered()` фильтрует по `yearFrom`, `yearTo`, `openAccessOnly`, `docTypes` (пересечение с `item.filters.docTypes`), `countries` (пересечение с `item.filters.countries` или `item.filters.country`).
- `availableDocTypes` и `availableCountries` выводятся из `items` (не из `statsStore`).
- `resetFilters()` обнуляет все пять полей: `yearFrom`, `yearTo`, `openAccessOnly`, `docTypes`, `countries`.
- Каждая запись отображает: текст запроса, дату (через `Intl.DateTimeFormat('ru-RU')`), `result_count` в формате «N статей», фильтровые бейджи (`<Badge variant="secondary">`).
- Ссылка «Перейти в аналитику по моим поискам →» ведёт на `/explore?mode=personal`.

**`historyStore.ts`:**
- Состояние: `items: SearchHistoryItem[]`, `isLoading`, `error`, `historyFilters: HistoryFilters`.
- `HistoryFilters = ArticleClientFilters` (алиас из `types/api.ts`).
- `fetchHistory()` вызывает `getSearchHistory()`.
- Четыре чистых селектора: `selectByYear`, `selectByDocType`, `selectByCountry`, `selectByJournal` — агрегируют `items` в `LabelCount[]` без обращения к бэкенду.

**`articleStore.ts` — синхронизация quotaStore:**

После успешного `searchScopusLive`:
```typescript
if (quota) {
  void import('./quotaStore').then(({ useQuotaStore }) =>
    useQuotaStore.getState().fetchQuota(),
  );
}
```
Динамический импорт и вызов `fetchQuota()` вместо `setState` — одиночный дополнительный HTTP-запрос к `/articles/find/quota`. `articleStore.scopusQuota` сохранён для обратной совместимости с `ScopusQuotaBadge`.

При ошибке 429:
```typescript
if (err?.response?.status === 429) {
  message = 'QUOTA_EXCEEDED';
}
```
`HomePage.tsx` в `useEffect([error, isAuthenticated])` вызывает `toast.error('Недельный лимит поиска исчерпан')` при `error === 'QUOTA_EXCEEDED'`.

---

### Commit 7 — `feat(frontend): /explore dual-mode (collection vs personal)`

**Статус: ✅ DONE — [`76b54c1d`](https://github.com/HelgDemidov/scopus_search_code/commit/76b54c1d4217f306dcf9e9b971d3411be9e39804) + ARIA-фикс [`3d7fdc7`](https://github.com/HelgDemidov/scopus_search_code/commit/3d7fdc727bcd88c6ba405944e73cda37bf97bef0)**

Верифицировано по финальному `ExplorePage.tsx`:

- **`useSearchParams`** из `react-router-dom` — режим читается: `modeParam === 'personal' && isAuthenticated ? 'personal' : 'collection'`. Анонимный пользователь всегда получает `'collection'` независимо от URL.
- **Переключатель** рендерится только при `isAuthenticated`: два `<Button>` с `role="group"` / `aria-label="Режим аналитики"` и `aria-pressed` на каждой кнопке. Кнопки «По коллекции» и «По моим поискам».
- **`switchMode`:** при выборе `'personal'` устанавливает `params.set('mode', 'personal')`; при `'collection'` удаляет параметр через `params.delete('mode')`. URL обновляется через `setSearchParams` — состояние персистентно и пережит перезагрузку.
- **Данные `mode=collection`:** `useStatsStore.fetchStats` → `GET /articles/stats` — путь для анонимных пользователей не изменён.
- **Данные `mode=personal`:** вычисляются через `useMemo` из `personalData = { by_year, by_doc_type, by_country, by_journal }`, где каждое поле — результат селектора из `historyStore` (`selectByYear`, `selectByDocType`, `selectByCountry`, `selectByJournal`). Новый backend-эндпоинт не требуется.
- **KPI-карточки `mode=personal`:** «Всего поисков» (`historyItems.length`), «Найдено статей» (сумма `result_count`), «Стран» (`personalData.by_country.length`), «Типов документов» (`personalData.by_doc_type.length`).
- **CTA-баннер для анонимных:** текст «Вы просматриваете аналитику по тематической коллекции "Artificial Intelligence and Neural Network Technologies". Авторизуйтесь, чтобы видеть аналитику по своим запросам.» — рендерится при `!isAuthenticated`.
- **Чарты:** `DocumentTypesChart`, `TopCountriesChart`, `PublicationsByYearChart`, `TopJournalsChart` загружаются через `React.lazy` / `Suspense` — lazy-splitting не был в ТЗ, добавлен сверх требований.

---

### Commit 8 — `chore(frontend): Russian UI pass`

**Статус: ✅ DONE — [`76b54c1d`](https://github.com/HelgDemidov/scopus_search_code/commit/76b54c1d4217f306dcf9e9b971d3411be9e39804) + остаточный фикс [`3d7fdc7`](https://github.com/HelgDemidov/scopus_search_code/commit/3d7fdc727bcd88c6ba405944e73cda37bf97bef0)**

Верифицировано по diff [`76b54c1d`](https://github.com/HelgDemidov/scopus_search_code/commit/76b54c1d4217f306dcf9e9b971d3411be9e39804) (изменены: `AuthPage.tsx`, `OAuthCallback.tsx`, `ArticleFilters.tsx`, `ScopusQuotaBadge.tsx`, `SearchBar.tsx`, `HomePage.tsx` остаточные строки, `ExplorePage.tsx` КПИ-метки):

- **`AuthPage.tsx`:** 16 добавлений / 16 удалений — переведены все видимые строки.
- **`OAuthCallback.tsx`:** 1 добавление / 1 удаление — переведена одна строка состояния.
- **`ArticleFilters.tsx`:** `CommandInput placeholder` переведён в [`3d7fdc7`](https://github.com/HelgDemidov/scopus_search_code/commit/3d7fdc727bcd88c6ba405944e97bef0) (D-7).
- **`ScopusQuotaBadge.tsx`:** 2 добавления / 2 удаления.
- **`SearchBar.tsx`:** 3 добавления / 3 удаления.
- **`ArticlePage.tsx`:** по сообщению коммита D-6 в [`3d7fdc7`](https://github.com/HelgDemidov/scopus_search_code/commit/3d7fdc727bcd88c6ba405944e73cda37bf97bef0) подтверждён полностью переведённым, изменений не потребовалось.
- Исключения согласно ТЗ §1.6 сохранены: `aria-label="Scopus Search"` на SVG-логотипе, литерал «Artificial Intelligence and Neural Network Technologies» в баннерах и CTA.

---

### Финальный коммит — `fix(frontend): route authenticated home search to live Scopus results`

**Статус: ✅ DONE — [`372d5f5e`](https://github.com/HelgDemidov/scopus_search_code/commit/372d5f5e8e3d1fd56139f091c4a7b3e4ecb82660)**

Обнаружен баг при живом тестировании: авторизованный пользователь после всех merge-коммитов всё ещё попадал на путь `fetchArticles()` (локальная БД) вместо `searchScopusLive()`. Исправлено в этом коммите.

Верифицировано по финальному `HomePage.tsx`:
- `handleSearch` в авторизованной ветке: `void searchScopusLive(query)` — первый вызов.
- `displayArticles = isAuthenticated ? liveResults : articles` — отображаемый список берётся из `liveResults` (Scopus), а не из `articles` (локальная БД).
- `isLoading={isLiveSearching}` в `<ArticleList>` для авторизованных — используется флаг live-поиска, не `isLoading` локальной БД.

---

### §1.1–1.6 Итоговый чек-лист

| Раздел | Критерий ТЗ | Статус |
|---|---|---|
| §1.1 | Анонимный поиск: только `GET /articles/`, вызов `/articles/find` не производится | ✅ `handleSearch` анонима вызывает `fetchArticles()` |
| §1.1 | Авторизованный поиск: `GET /articles/find`, результаты из `liveResults` | ✅ `handleSearch` авторизованного вызывает `searchScopusLive()` |
| §1.1 | 201-й запрос → HTTP 429, toast «Недельный лимит поиска исчерпан» | ✅ backend + `error === 'QUOTA_EXCEEDED'` → toast |
| §1.1 | `GET /articles/find/quota` корректен при конкурентных запросах | ✅ `pg_advisory_xact_lock`, тест в `test_find_articles_postgres.py` |
| §1.1 | Авторизованный баннер — точный текст ТЗ | ✅ вербально совпадает в `HomePage.tsx` |
| §1.1 | Анонимный баннер — точный текст ТЗ с ссылкой `/auth` | ✅ `AnonHero` в `HomePage.tsx` |
| §1.2 | `alembic upgrade head` создаёт таблицу, `downgrade -1` удаляет | ✅ `0005_add_search_history.py` |
| §1.2 | Запись в историю только при успехе; откат при ошибке Scopus | ✅ unit + integration тесты |
| §1.2 | `GET /articles/history` ≤ 100 строк, `created_at DESC` | ✅ `LIMIT 100` в `get_last_n` |
| §1.2 | ProfilePage: список с query, created_at, result_count, фильтровые бейджи | ✅ `SearchHistoryList.tsx` |
| §1.2 | Ссылка «Перейти в аналитику по моим поискам» → `/explore?mode=personal` | ✅ `<Link to="/explore?mode=personal">` в `SearchHistoryList` |
| §1.3 | Анонимный: никаких фильтровых элементов на `/` | ✅ `ArticleFilters` удалён из `HomePage.tsx` |
| §1.3 | Авторизованный: никакой боковой панели фильтров на `/` | ✅ то же |
| §1.3 | Фильтры на `/profile` сужают историю по году/OA/docType/country | ✅ `SearchHistoryList` — `useMemo filtered()` |
| §1.3 | Серверные поля (`keyword`, `search`) в `articleStore`, клиентские фильтры в `historyStore` | ✅ `ArticleFilters` vs `ArticleClientFilters` в финальном `articleStore.ts` |
| §1.4 | Анонимный `/explore`: чарты без изменений (`GET /articles/stats`) | ✅ `mode` принудительно `'collection'` при `!isAuthenticated` |
| §1.4 | `/explore?mode=personal`: личные чарты из `historyStore` | ✅ `selectByYear` / `selectByDocType` / `selectByCountry` / `selectByJournal` |
| §1.4 | Переключатель персистентен в URL | ✅ `setSearchParams` + `params.delete/set('mode')` |
| §1.5 | «Авторизоваться» / «Исследовать» / «Выйти» / верхнеуровневый «Личный кабинет» | ✅ `Header.tsx` |
| §1.6 | Нет английских UI-строк кроме «Scopus Search» и названия коллекции | ✅ все файлы переведены; исключения сохранены |

---

### Открытые вопросы / отложенная работа

1. **`DELETE /articles/history/{id}`** — в ТЗ помечен «optional, not in scope unless requested». Не реализован.
2. **`GET /articles/history/stats`** — отложен в пользу клиентской агрегации над ≤ 100 строками (spec-compliant для v1).
3. **Frontend автотесты (Vitest / Playwright)** — не настроены; верификация покрыта только backend-тестами и живым тестированием.
4. **`ScopusQuotaBadge`** — ТЗ §2.1 рекомендует перевести в dev-режим или переименовать, чтобы не путать с `LiveSearchQuotaCounter`. Компонент рендерится в `Header` авторизованных; вопрос не решён в текущем scope.
5. **Рефакторинг cookie-утилит: выделить `_set_rt_cookie` в отдельный модуль**. В настоящее время константы `_RT_COOKIE_NAME`, `_RT_COOKIE_MAX_AGE` и логика формирования RT cookie **дублируются** в двух независимых роутерах — `app/routers/auth.py` и `app/routers/users.py`.
Архитектурно правильное решение — вынести функцию `_set_rt_cookie` и связанные константы в отдельный модуль `app/core/cookie_utils.py`, который оба роутера импортируют как единственный источник правды. Это устраняет риск рассинхронизации параметров cookie (например, `samesite`) при будущих изменениях и упрощает аудит безопасности конфигурации cookie.