---
name: code-promotion
description: The Code Maintainer's DRY upkeep of dslib/. Use when the Orchestrator dispatches this after a step completes, at a quiescent point, to compare the finished step's code against the shared library and promote reusable helpers into dslib/ on the two-use rule.
---

# code-promotion

The Code Maintainer's skill. It keeps `dslib/` DRY by comparing a **finished step's**
`code/` against the shared library and promoting the helpers that have now earned a
shared home. The Code Maintainer reasons about code interfaces, not the research
analysis — that is what makes it a distinct agent from a Worker.

`dslib/` is written **only here**. Workers import it freely and never touch it; this
skill is the sole writer. Run **one at a time, at a quiescent point** — never while
sibling Workers are executing (they import `dslib` live, and a concurrent write races
them). The Orchestrator dispatches this after a step completes and its folder is
committed.

## The two-use rule

A helper earns promotion on its **second** use, not its first:

- **First use** — the helper stays local, in that step's `code/`. One occurrence is not
  yet a shared concern.
- **Second use** — a later step needs the same thing → **promote it to `dslib/`** and
  have the *current* step import it from there.
- **Seeds** — eval and cross-validation helpers seed `dslib/` from day one; they are
  shared by definition and need not wait for a second use.

## Additive-forward

Promotion is **additive-forward**: it adds to `dslib/` and points the *current* step at
the new helper. It **never rewrites an already-committed step** — the first step keeps
its local copy untouched, even though an identical helper now lives in `dslib/`. Editing
committed history is out of bounds; the shared version simply exists going forward. The
duplication between the old local copy and the new `dslib/` helper is intended, not a
defect to reconcile.

Do this:

## 1. Scan the finished step's code

Read the just-completed step's `code/main.py`. List the helpers it defines or the
logic-blocks it repeats — candidates for sharing.

## 2. Compare against `dslib/` and prior steps

For each candidate, decide its use-count against what already exists:

- Already in `dslib/` (same intent) → the step should import it; note if it reimplemented
  something instead of importing (a DRY miss to fix in the *current* step only).
- Appears in a prior committed step but **not** in `dslib/` → this is its **second use**
  → promote.
- Genuinely new and single-use → leave it local; revisit when a second use appears.

## 3. Promote

For each helper clearing the two-use bar:

- Add it to `dslib/` under a clear module/name, with a docstring stating its contract.
- Repoint the **current** step's `code/main.py` to import from `dslib/` (this step is not
  yet committed, so editing it is in bounds; committed steps are not).
- Keep the interface general enough for both call sites but do not over-abstract — promote
  what is shared, nothing speculative.

## 4. Verify the library still imports

Run the venv to confirm `dslib/` is importable after the change:
`./.venv/bin/python -c "import dslib"` (and import each promoted module). A broken
`dslib/` breaks every future Worker.

## Done when

Every helper that reached its second use lives in `dslib/` with a documented contract;
the current step imports the promoted helpers rather than duplicating them; no committed
step was edited; and `dslib/` imports cleanly.
