Pick up a spec (ТЗ) drafted by `/tech-spec` that hasn't been implemented yet, and implement it end-to-end on its feature branch.

## Step 1 — Find the target spec

If invoked with an argument (slug, branch name, or path), use that spec directly.

Otherwise scan `docs/*/spec.md` for specs that are BOTH: missing a `## Статус выполнения` section, AND whose declared branch (the `**Ветка:**` line) still exists — local or `origin/` — and isn't merged into `main`. This two-signal check avoids false positives on old completed specs whose status section was never backfilled.

- Zero matches → report nothing pending, stop.
- One match → proceed with it.
- Multiple matches → ask the user which one (AskUserQuestion) — don't guess.

## Step 2 — Enter the branch

`git fetch origin`, then check out the spec's branch locally (create a local tracking branch from `origin/<branch>` if none exists yet). Confirm it's pushed to `origin` — push if it somehow isn't (normally `/tech-spec` Step 7 already did this; this is just a safety net for resuming in a fresh session).

## Step 3 — Build the task list

Read the spec's "План коммитов/PR" section and turn it into a task list in this conversation, one task per planned commit.

If the spec has no commit breakdown (only a final-PR description), split the work into commits yourself — one coherent, independently buildable unit of change per commit (natural seams: schema, backend, frontend, tests).

The task list must include dedicated test-coverage tasks for the new functionality (backend + frontend, per the spec's "Тестовое покрытие" section) — tests are commits like any other, not an afterthought.

## Step 4 — Implement

Work through the task list commit by commit: implement, run the relevant test/lint/typecheck commands for the layer touched (`CLAUDE.md` / `frontend/CLAUDE.md`), commit with a conventional-commit message, check off the matching box in the spec's "Чек-лист реализации". Don't batch unrelated work into one commit.

**Full-suite budget:** run the complete, unfiltered lint+typecheck+test suite (`ruff check`, `ruff format --check`, `mypy`, full `pytest` — and/or the frontend equivalents `lint`, `tsc --noEmit`, full `npm run test`) **at most once per commit**, immediately before that commit — plus one extra full run right before opening the PR (Step 5). Everywhere else *within* a commit's work-in-progress cycle (after each edit, while iterating on a fix), run only targeted/selective checks scoped to the files actually touched — a single test file, `ruff check <path>`, `tsc --noEmit` on demand is still whole-project by nature of the tool but don't pair it with a full test run each time. This keeps the iteration loop fast; the full sweep exists to catch cross-file regressions right before they get baked into a commit or a PR.

## Step 5 — Wrap up

Once all planned commits land: run the full-suite check one last time (the second and final use of the Step 4 budget for this feature), confirm everything passes, then push and open the PR (`gh pr create`) with a body summarizing the spec's goal/scope (§0) and a test-plan checklist — not a repo link to the spec file, since `docs/` is gitignored and won't be in the diff. Report the PR URL.

Do not merge the PR yourself, and do not run `/post-merge-sync` — those happen after human review, as a separate step.
