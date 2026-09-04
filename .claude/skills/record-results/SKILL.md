---
name: record-results
description: The Worker's writer for a finished Logic Step. Use at the end of a run to write logic_process.md, results.md, and assets, and to flip the step to its terminal status (done or dead-end).
---

# record-results

The Worker's finish-writer. It records the run and flips the step to a **terminal
status**, so the S1 read-seam and the session catch-up see an accurate node. Asset
registration is folded in here — there is no separate asset surface.

Write **only inside your own `steps/<id>/` tree** (write-confinement, §6). Never touch
another step, `dslib/`, or `datasets/`. This is the finish path: take it when the run
completed. If a judgement call not fixed by the brief is still open, emit
`BLOCKED — needs decision` and halt instead — do not record results over an
unresolved halt.

Do all four, in order:

## 1. Land the assets

Write every plot / table / artifact the run produced into `steps/<id>/assets/`. Write
the raw mechanical tool/transcript log to `steps/<id>/assets/run-log.<ext>` — the
forensic trace, **linked from `results.md`, never pasted into it**.

## 2. Write `logic_process.md`

The curated, human-facing reasoning trace — the analytical moves made, the assumptions
taken, and any escalations raised. This is what the next session reads; keep it a
readable narrative, not a transcript dump (the dump is `run-log`).

## 3. Write `results.md`

The outputs and the **conclusion** — the finding this step reached. Cite each
supporting asset by its `assets/<file>` path (this is the asset registration). A
conclusion with no supporting citation is incomplete.

## 4. Flip the terminal status

Edit `steps/<id>/step.md` frontmatter, changing `status: running` to:

- `done` — the step ran and reached a conclusion.
- `dead-end` — the step ran but was unfruitful; kept for provenance.

Change no other frontmatter field. Leave `code_ref: null` — the Orchestrator finalizes
`code_ref` and `git_sha` when it commits the step folder (§9).

## Done when

`steps/<id>/assets/` holds the run's artifacts and `run-log`; `logic_process.md` and
`results.md` exist, with `results.md` stating the conclusion and citing its assets; and
`step.md` reads `status: done` or `status: dead-end` (never left `running`).
