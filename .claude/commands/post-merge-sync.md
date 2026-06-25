Sync project documentation and long-term memory after a successful PR merge into main.

Run `git log main --oneline -15` and `git diff HEAD~1 --stat` to understand what changed.
Then perform ALL of the following steps — in order, without skipping:

## Step 1 — Update CLAUDE.md (repo root)

Read the current `CLAUDE.md`. Update ONLY sections that are factually outdated based on the merged changes:
- New layers, files, or modules added to the backend
- Changes to commands, env vars, or CI structure
- New architectural constraints or "Do NOT" rules

Do NOT add micropatterns or implementation details — only architectural/infrastructure facts.
Keep the file under 90 lines.

## Step 2 — Update frontend/CLAUDE.md

Read the current `frontend/CLAUDE.md`. Update ONLY sections affected by the merge:
- Store responsibilities (if stores changed)
- New features or subsystems (add a concise paragraph — not code snippets)
- Test count (update the "Total frontend tests" line if tests were added)
- CI commands or job structure (if workflows changed)

Do NOT add testing micro-patterns, code samples, or implementation details — those belong in memory.
Keep the file under 80 lines.

## Step 3 — Update or create memory files

Read the current `MEMORY.md` index at the project memory path.
For each significant change in the merged PR, decide:

- **New subsystem or feature** → create `project_<feature>.md` (type: project)
- **Architectural decision with lasting consequences** → create or update `project_*.md`
- **Testing/tooling lesson learned** → create or update `feedback_*.md`
- **New external resource or reference** → create `reference_*.md`

Memory body structure: lead with the fact/rule, then **Why:** and **How to apply:** lines.
Update `MEMORY.md` index: add one line per new file, update description of changed files.

## Step 4 — Update spec/design docs (if applicable)

If the merge closes a feature branch with a spec in `docs/`, append a concise §"Статус выполнения" section (10–15 lines) stating: merge date, PR number, commit hashes, what was done, what remains out of scope.

## Step 5 — Commit documentation changes

Stage only documentation files (CLAUDE.md, frontend/CLAUDE.md, docs/**). Do NOT stage memory files (they live outside the repo). Commit with message:
`docs: обновить CLAUDE.md и документацию после мерджа <branch-name>`

Then report a short summary: what was updated and why.
