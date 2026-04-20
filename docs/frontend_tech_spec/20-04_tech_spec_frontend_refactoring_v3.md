# Product Refactor: Technical Specification, Risk Analysis, and Commit Plan — v3

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
  - `tests/integration/test_articles.py`
- **What & why:** Expose history read and quota read. Quota math must use a rolling 7-day window keyed off `search_history.created_at`. Register `GET /articles/history` and `GET /articles/find/quota` above `GET /{article_id}` in `app/routers/articles.py` to avoid route shadowing.
- **Effort:** **5h**.
- **Dependencies:** Commit 1.

### Commit 3 — `feat(api): auth-gated search routing and per-user weekly quota`

- **Affected files:**
  - `app/routers/articles.py::find_articles` (inject quota check; add optional filter-capture query parameters)
  - `app/schemas/article_schemas.py` (add `FindArticlesFilters` schema or equivalent inline-query plumbing for `year_from`, `year_to`, `doc_types`, `open_access`, `country`)
  - `app/services/search_service.py` — inject `SearchHistoryRepository`; modify `find_and_save` to wrap article-save + history-insert in one DB transaction; insert `search_history` row (including filters payload) on every successful Scopus call.
  - `tests/integration/test_find_articles.py` (concurrent-request test, 429 test)
- **What & why:** Enforce 200 req / 7 days per user; atomically record each call. This closes §1.1 on the backend. The endpoint is already private (`Depends(get_current_user)`) and already capped at `count ≤ 25`; this commit only adds the rolling counter and the history insert.
- **Filter capture:** Extends `GET /articles/find` with five optional filter parameters (`year_from`, `year_to`, `doc_types`, `open_access`, `country`). These are not applied to the Scopus API query in v1 but are serialized and stored in `search_history.filters` on every successful call. This makes the `filters` column immediately meaningful for the §1.3 profile-page filter UX and §1.4 personal analytics.
- **Advisory-lock comment placeholder:** `await session.execute(text('SELECT pg_advisory_xact_lock(:uid)'), {'uid': int(current_user.id)})`
- **Effort:** **6h** (includes advisory-lock concurrency/race test).
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

- **Total effort:** **40 hours** (~5 working days at full focus; realistically 7–8 working days with review/testing).
- **Recommended sprint split (2 × 1-week sprints):**
  - **Sprint 1 — Backend + navbar:** Commits 1, 2, 3, 4. ~17h. Ships the data foundation and the lowest-risk frontend change.
  - **Sprint 2 — Frontend refactor:** Commits 5, 6, 7, 8. ~23h. Builds directly on the APIs from Sprint 1.
- **Critical path:** **1 → 2 → 3 → 6 → 7**. Commit 6 is the widest node — it depends on backend APIs (2) *and* on the filter-slice split landed in Commit 5, and it blocks the `/explore` dual-mode work in Commit 7. Landing Commit 1 on day 1 is the single biggest unblocker for the whole plan; Commit 4 can go in parallel to de-risk the final UI polish.

---

## 4. Test Coverage Plan

### 4.1 Backend test requirements

Tooling: backend coverage uses `pytest`, `pytest-asyncio`, and `httpx.AsyncClient` with `ASGITransport`, matching the current project test stack. Default integration tests run against the existing in-memory `sqlite+aiosqlite:///:memory:` fixture pattern; PostgreSQL-specific quota-concurrency tests must run against real PostgreSQL and be tagged `@pytest.mark.requires_postgres`.

| Commit | Test file | Test type | Scenarios covered |
|---|---|---|---|
| Commit 1 — DB schema + rate limiting infrastructure | `tests/integration/test_search_history_schema.py` | Integration | Alembic upgrade creates `search_history`; Alembic downgrade drops `search_history`; table includes `id`, `user_id`, `query`, `created_at`, `result_count`, `filters`; `search_history.user_id` references `users.id` with cascade delete; `(user_id, created_at DESC)` index exists or is validated through query metadata; `filters` default is `{}` when no filters are submitted. |
| Commit 1 — repository behavior | `tests/unit/test_search_history_repository.py` | Unit | Repository inserts one history row; repository counts rows in the rolling 7-day window; rows older than 7 days do not count toward quota; `reset_at` is calculated as oldest counted `created_at + 7 days`; `result_count` and `filters` round-trip correctly. |
| Commit 2 — history + quota endpoints | `tests/integration/test_search_history_api.py` | Integration | `GET /articles/history` requires auth; `GET /articles/history` returns only the current user's rows; response is limited to ≤100 rows; rows are ordered by `created_at DESC`; response schema includes `id`, `query`, `created_at`, `result_count`, `filters`; `GET /articles/find/quota` requires auth; quota endpoint returns correct `limit`, `used`, `remaining`, and `reset_at`; route safety: `GET /articles/history` and `GET /articles/find/quota` resolve before `GET /{article_id}` catch-all. |
| Commit 3 — live search quota + history write | `tests/integration/test_find_articles.py` | Integration | Happy path: `GET /articles/find` creates one `search_history` row; rollback: Scopus error creates no row and does not mask the original user-facing error behavior; quota boundary: 200th request succeeds and 201st returns HTTP `429`; `GET /articles/find/quota` reflects the updated count after each successful search; filter persistence: `GET /articles/find?keyword=ai&year_from=2020` stores `{\"year_from\": 2020}` in `search_history.filters`; `doc_types`, `open_access`, and `country` also persist when supplied; history insert includes `result_count`; unauthenticated access to `/articles/find` remains rejected by `Depends(get_current_user)`. |
| Commit 3 — PostgreSQL quota concurrency | `tests/integration/test_find_articles_postgres.py` | Integration, `@pytest.mark.requires_postgres` | Concurrency: 10 parallel requests from the same user near the quota boundary produce the correct number of accepted rows and reject over-limit requests with HTTP `429`; exactly one row is allowed at the final available quota slot; `pg_advisory_xact_lock(:uid)` receives `uid` as `int(current_user.id)`, not `str(current_user.id)`; concurrent requests from different users do not block each other unnecessarily. |

### 4.2 Frontend test requirements

Frontend tests are not currently configured in `frontend/package.json`, so Commit 4 or a small test-infrastructure precursor must add Vitest + Testing Library for component tests and Playwright for E2E before these requirements can be enforced in CI.

| Commit / feature | Test type | Scenarios covered |
|---|---|---|
| Commit 4 — Global navbar (§1.5) | Component test, Vitest + Testing Library | Header renders on routes covered by `RootLayout`; unauthenticated state renders **«Авторизоваться»** linking to `/auth`; authenticated state renders top-level **«Личный кабинет»** linking to `/profile`; authenticated dropdown renders **«Выйти»**; **«Исследовать»** links to `/explore`; no per-page navbar duplication is introduced. |
| Commit 5 — Home page banners + filter relocation (§1.1, §1.3) | Component test + Playwright E2E | Anonymous user on `/`: `ArticleFilters` is not rendered; anonymous banner is present with exact text «Поиск без авторизации осуществляется по статьям тематической коллекции «Artificial Intelligence and Neural Network Technologies». Для поиска по глобальной базе Scopus пройдите авторизацию»; anonymous search calls `GET /articles/` and does not call `GET /articles/find`; authenticated user on `/`: authenticated banner is present with exact text «Выдача результатов поиска по живой базе Scopus ограничена 25 статьями за 1 запрос»; no sidebar filter is rendered; `articleStore.keyword` still tracks the `SearchBar` input for both local and live search flows. |
| Commit 6 — Profile page history + quota + filters (§1.1, §1.2, §1.3) | Component test + Playwright E2E | `/profile` quota counter renders `remaining`, `used`, `limit`, and `reset_at`; quota counter updates after a successful live search; history list renders up to 100 entries; entries show query text, timestamp, result count, and filter badges; history list excludes anonymous users because `/profile` remains behind `PrivateRoute`; profile filters narrow history results client-side by year range, document type, open access, and country; link **«Перейти в аналитику по моим поискам»** navigates to `/explore?mode=personal`. |
| Commit 7 — `/explore` dual-mode (§1.4) | Component test + Playwright E2E | `/explore?mode=personal` preselects «Мои поиски» for authenticated users; personal charts render from `historyStore` selectors for `by_year`, `by_doc_type`, `by_country`, and `by_journal`; `/explore?mode=collection` selects «Коллекция»; missing `mode` defaults to collection; anonymous user sees collection charts unchanged from `GET /articles/stats`; anonymous banner describes the thematic collection; mode selection is reflected in the URL and survives reload. |
| Commit 8 — Russian UI pass (§1.6) | Component spot checks + Playwright E2E | Spot-check `/`, `/explore`, `/profile`, `/auth`, and `/article/:id` for visible English strings; allowed exceptions are only **"Scopus Search"** and **"Artificial Intelligence and Neural Network Technologies"**; ARIA labels are translated except for allowed brand/collection literals; updated tests no longer assert obsolete English copy. |

### 4.3 E2E critical-path scenarios

Minimum Playwright full-stack flows that must pass before release:

1. **Anonymous search flow:** open `/` → type query → see local results → verify the network log contains no `GET /articles/find` call.
2. **Auth + live search + quota flow:** register → log in → search 3 times → `/profile` shows `used: 3, remaining: 197`.
3. **History → Explore flow:** perform 5 searches → `/profile` shows 5 history entries → click **«Перейти в аналитику»** → `/explore?mode=personal` opens with personal charts populated.
4. **Quota exhaustion flow:** mock 200 prior rows in `search_history` → perform search → UI shows HTTP `429` toast → quota counter shows `remaining: 0`.
5. **Filter persistence flow:** search with `year_from=2020` → `/profile` history shows filter badge `2020–` on the entry.

### 4.4 Test infrastructure notes

- All non-PostgreSQL backend integration tests must run against in-memory SQLite, following the existing `tests/conftest.py` pattern, with `search_history` included in the test schema.
- E2E tests require a test PostgreSQL instance, for example a `docker-compose.test.yml` service. Add a new GitHub Actions job alongside the existing `.github/workflows/tests.yml` workflow to start PostgreSQL, run Alembic migrations, start the FastAPI backend, start the Vite frontend, and execute Playwright.
- The quota concurrency test in §4.1 requires real PostgreSQL, not SQLite, because SQLite cannot validate `pg_advisory_xact_lock` semantics or PostgreSQL row/transaction behavior. Mark it with `@pytest.mark.requires_postgres` and skip it unless the PostgreSQL test service is available.
- Frontend CI is currently absent; add `frontend` jobs for `npm run lint`, Vitest component tests, and Playwright E2E before treating the refactor as production-ready.

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
