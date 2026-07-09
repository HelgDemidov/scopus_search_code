Turn a feature/refactor/large-task request into a structured spec (ТЗ), following this repo's `docs/*/spec.md` convention.

Take the task description from the user's message (and any command args) as the primary input. Everything below is a DEFAULT — an explicit instruction in that message (different length, different process, different location) overrides it.

## Сквозной принцип — современные практики и стандарты

ТЗ разрабатывается исходя из лучших практик и передовых стандартов, принятых в индустриальной разработке ПО на сегодняшний день — с точки зрения системной архитектуры (в т.ч. соответствия принципам SOLID), устойчивости и чистоты кода, а также безопасной разработки. Для фронтенд-фич дополнительно учитывать актуальные тренды, паттерны и лучшие мировые практики веб-дизайна в релевантных нишах. Это не отдельный шаг, а критерий, который применяется на всех этапах — черновик (Step 2), самокритика (Step 3), финализация (Step 4).

## Step 1 — Ground the spec in reality

Read the relevant existing code, related `docs/*/spec.md` (for tone/structure), `CLAUDE.md`/`frontend/CLAUDE.md`, and relevant project memory (`MEMORY.md` index + linked files). Every concrete claim that ends up in the spec — file path, function name, endpoint, table — must be verified against the actual repo, not assumed.

## Step 2 — Draft (round 1)

Write an initial spec: problem/goal, technical approach, affected files/layers, test coverage needed, commit/PR breakdown. Base it on the user's requirements plus Step 1 research.

## Step 3 — Adversarial self-critique (round 2)

Re-read the round-1 draft as a skeptical senior reviewer, not its author. Look for: wrong assumptions about existing code, missing edge cases, unstated scope boundaries, security/perf implications, gaps in the test plan, an unrealistic commit breakdown, SOLID/architecture violations, dated patterns that don't match current industry best practices (and, for frontend work, dated UI/UX approaches vs. current web-design conventions). List concrete objections, then revise to address each one.

## Step 4 — Verify (round 3, when warranted)

Run a third pass only if round 2 raised material issues or the task is unusually complex. Re-check every file/function/endpoint reference against the repo (grep/read, not memory), confirm no contradictions between sections, finalize wording.

Only the synthesized final spec goes in the document — never the round-by-round working.

## Step 5 — Assemble the document

Target **≤100 lines**. Exceed only for genuinely high-complexity tasks whose analysis/plan doesn't fit — and say so in one line at the top of the doc if you do.

```
# Спецификация: <feature name>

**Статус:** черновик v1 · <date>
**Ветка:** `<feat|refactor|fix>/<slug>`

## 0. Что и зачем
<problem, motivation, one-line scope boundary>

## 1..N. <technical sections as needed>
<concrete, file/function-referenced, no filler>

## Тестовое покрытие
<new backend/frontend tests this spec requires — bullets>

## План коммитов/PR (10–20 lines)
<numbered roadmap, one line per commit, conventional-commit prefixed>

## Чек-лист реализации
<unchecked boxes mirroring the commit plan — /feature-workflow checks these off>

## Вне скоупа
<explicit exclusions, optional section>
```

Match the tone and terseness of existing `docs/*/spec.md` files — concise, technical, file-referenced, no marketing language. Do NOT add a "Статус выполнения" section — `/post-merge-sync` appends that after the branch merges.

## Step 6 — Place the file

New subfolder under `docs/`, kebab-case slug matching the branch name minus its prefix (e.g. `docs/<slug>/spec.md`). Derive the slug from the feature itself, not a copy-paste of the user's raw phrasing. File is always named `spec.md` — `/feature-workflow` globs for it.

`docs/` is gitignored (local working notes, not for the public repo) — just write the file to disk. Do NOT `git add`/commit it; it stays local-only, same as every other spec already there.

## Step 7 — Branch + CI

Skip this step only if the work is trivial enough for a direct commit to `main` — rare, since this skill exists for substantial tasks.

1. `git fetch origin && git checkout -b <feat|refactor|fix>/<slug> origin/main` — prefix matches the dominant conventional-commit type of the work.
2. Write the spec file (Step 6) — local only, not committed.
3. Add `<branch-name>` to `on.push.branches` in `.github/workflows/tests.yml`, `frontend-tests.yml`, and `e2e.yml`. Commit: `ci: добавить ветку <branch-name> в триггеры`.
4. `git push -u origin <branch-name>`.

## Step 8 — Report

State the spec path (local-only), branch name, and whether CI triggers were added. Do not start implementation — that's `/feature-workflow`.
