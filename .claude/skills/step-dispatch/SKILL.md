---
name: step-dispatch
description: Assemble a Worker's executable brief and dispatch the step. Use when the Orchestrator is told to run / dispatch / execute a proposed step — it builds brief.md, flips the step proposed→running, and spawns the Worker.
---

# step-dispatch

The Orchestrator's dispatcher. It turns a `proposed` step into a `running` one by
assembling the **executable brief** (`steps/<id>/brief.md`, §4.1), flipping the
status, and spawning a Worker whose Task message *is* that brief. The Orchestrator
never executes the step itself — dispatching a Worker is what "running a step" means.

Dispatch only a `proposed` step. Writes only under `steps/<id>/` — `brief.md` and the
one status line in `step.md`. Before dispatch, the `dataset_ref` targets must already
exist under `datasets/` (§7 seam): if any are missing, ground them with
`/data-grounding` first, then dispatch.

The brief is the autonomy lever. **Every choice pinned in section 5 is class-1 by
construction and runs without a halt**; everything left unpinned halts and escalates.
Pin the choices you want the Worker to make unattended; leave genuinely open ones out.
Section 5 is also read by the Worker's PreToolUse gate (§6 hook 2) as the dispatch-time
pre-approval — a train/eval call whose signature matches a pinned choice silent-passes,
so pin choices as concrete params (e.g. `test_size=0.2`), not prose.

Do these in order:

## 1. Gather the inputs

- Read `steps/<id>/step.md` for `kind`, `builds_on`, `dataset_ref`, and the `## Goal`.
- Read each parent's `results.md` (the conclusion + cited assets) so the brief can
  carry what the child builds on — parents are the ids in `builds_on`.
- Resolve `code_ref` inputs (§9): the `dataset_ref` → dataset folder(s), and the
  `dslib/` the Worker imports. The Worker's own `code_ref` is finalized by the
  Orchestrator at commit, not here.
- With the user, settle **Method**, **Pre-specified choices**, and **Expected assets**
  for this step (grill as needed). These are the parts the brief cannot infer.

## 2. Write `steps/<id>/brief.md` — exactly these nine sections

```
---
step_id: <ulid>-<slug>
kind: analysis | experiment
builds_on:
  - <parent id>
status: running
dispatched_at: <ISO-8601 timestamp>
---

## 1. Goal / hypothesis

<the step's goal/brief, from step.md — what it sets out to conclude>

## 2. Inputs

- **dataset_ref:** <dataset id(s)> → `datasets/<id>/data.parquet` (read-only)
- **Builds on:** <for each parent: its conclusion + the asset paths to reuse>
- **code_ref:** import `dslib` freely (never write it); entrypoint is `code/main.py`

## 3. Method

<the exact analytical steps to perform, in order>

## 4. Pre-specified choices

<each choice fixed up front, as a concrete param — split / imputation / metric /
model family. Everything listed here is class-1: proceed without halting.>

## 5. Expected assets

<the plots / tables / artifacts to produce; all land in `steps/<id>/assets/`>

## 6. Autonomy boundary

Class-1 (proceed): the pinned choices above, plus mechanical parse, standard 80/20
split, mean/median imputation. Class-2 (halt): every other analytical judgement —
dropping a feature, model family, eval metric, target definition. On any class-2
call, halt and escalate; do not decide it yourself.

## 7. Escalation format

When you halt, emit exactly:

    BLOCKED — needs decision
    Question: <the judgement call>
    Options: <the choices you see>
    Recommendation: <your pick + one-line why>

Then stop and wait — you cannot reach the human; the Orchestrator relays and resumes you.

## 8. Reporting contract

On finish, invoke `record-results`: write `logic_process.md`, `results.md` (conclusion
+ asset citations), land assets and `assets/run-log.*`, and flip status to `done` or
`dead-end`. Do not finish `running`.
```

The frontmatter section counts as section 1 of the nine (§4.1); the eight `##`
headings above are sections 2–9. Fill every one — a brief with a hollow section is not
dispatchable.

## 3. Flip the status

Edit `steps/<id>/step.md` frontmatter: `status: proposed` → `status: running`. Change
nothing else — `code_ref` stays `null` until commit. An abandoned run stays visibly
`running` (never silently `done`); only `record-results` writes a terminal status.

## 4. Dispatch the Worker

Spawn a Worker with the `Task` tool, passing the **full text of `brief.md` verbatim**
as the Task message — the brief is the Worker's entire instruction set. Dispatch only
independent steps concurrently (no DAG path between them); dependent steps run in
sequence.

## Done when

`steps/<id>/brief.md` exists with all nine §4.1 sections filled, `step.md` reads
`status: running`, and a Worker has been dispatched with the brief as its message.
