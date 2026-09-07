# DS Co-Pilot — User Manual

A local, single-user **data-science co-pilot** that augments Claude Code in your IDE. It
structures research as a **DAG of Logic Steps** on disk, tracks first-class **Decisions**
and **Datasets**, and projects all of it into a standalone, read-only **browser UI**.

This manual explains how to install, run, and drive the system. For the build contract see
[`spec.md`](spec.md); for the ubiquitous language see [`../CONTEXT.md`](../CONTEXT.md); for
repo conventions see [`../AGENTS.md`](../AGENTS.md).

## Table of contents

- [1. Overview](#1-overview)
- [2. Concepts and architecture](#2-concepts-and-architecture)
- [3. Installation](#3-installation)
- [4. Running the browser UI](#4-running-the-browser-ui)
- [5. The co-pilot workflow](#5-the-co-pilot-workflow)
  - [5.1 Ground a dataset](#51-ground-a-dataset)
  - [5.2 Capture proposed steps](#52-capture-proposed-steps)
  - [5.3 Dispatch a step](#53-dispatch-a-step)
  - [5.4 Record decisions](#54-record-decisions)
  - [5.5 Promote shared code](#55-promote-shared-code)
- [6. On-disk state layout](#6-on-disk-state-layout)
- [7. Skills reference](#7-skills-reference)
- [8. Agents reference](#8-agents-reference)
- [9. Hooks reference](#9-hooks-reference)
- [10. The shared library dslib](#10-the-shared-library-dslib)
- [11. Troubleshooting](#11-troubleshooting)
- [12. Glossary](#12-glossary)

## 1. Overview

The co-pilot has **four homes** for its moving parts, and keeping them separate is what makes
the system predictable:

- **Files** are the canonical state — the single source of truth, on disk under `steps/` and
  `datasets/`.
- **Skills** are the exclusive writers of that state.
- **Hooks** are hard enforcement — they stop an agent from breaking the rules.
- **The browser UI** is a strictly read-only projection — it renders the state and never
  writes it.

You *use* the co-pilot by holding a conversation with the **Orchestrator** (your main Claude
Code session) while the **browser UI** shows the research graph filling in live. Running or
instantiating a step is **conversation-only** — there is no button in the UI that changes
state.

v1 targets **tabular ML** (CatBoost/XGBoost, EDA, feature engineering) against **local
on-disk parquet** datasets.

## 2. Concepts and architecture

Research is a **Logic DAG**: a directed acyclic graph of **Logic Steps**, each one a single
conclusion-bearing analytical move (an *analysis* or an *experiment*). A step may build on
several parents, so the structure is a graph, not a tree. Alongside it, **Datasets** form
their own lineage DAG (which dataset was derived from which). Choices that steer the project
are recorded as first-class **Decisions**.

The pieces fit together like this:

- The **Orchestrator** (main conversation) is the only party that talks to you. It dispatches
  work, relays questions, records decisions, and creates datasets. It never runs analysis
  itself.
- A **Worker** is a headless sub-agent that executes exactly one step from a written brief. It
  cannot ask you questions directly — on any judgement call the brief does not settle, it
  **halts and escalates** to the Orchestrator, who asks you.
- The **Code Maintainer** is a sub-agent that promotes reusable code into the shared library
  after a step finishes.
- The **companion server** watches the files and pushes changes to the **browser UI** over
  SSE, so the graph updates live.

## 3. Installation

**Prerequisites**

- **Node** ≥ 18 (browser UI + companion server).
- **Python** ≥ 3.11 for `dslib/` and step code. The bare-system `python3` may be older, so
  use a virtual environment.

**Node / UI**

```bash
cd ui
npm install
```

**Python / dslib**

```bash
python3.13 -m venv .venv
./.venv/bin/python -m pip install -e .
```

## 4. Running the browser UI

The UI is a read-only projection of the on-disk state. In production it is **one process,
one port**: the companion server builds and serves the client and exposes the state API plus
live updates.

```bash
cd ui
npm start
```

`npm start` builds the React client, starts the server, serves the UI at
**http://localhost:4317**, and opens your default browser. Until you have done real work, the
graph shows only the example step shipped in `steps/`.

**Environment overrides** (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `DS_PORT` | `4317` | Port the server listens on. |
| `DS_HOST` | `127.0.0.1` | Bind host. |
| `DS_PROJECT_ROOT` | repo root | Project whose `steps/`/`datasets/` are projected. |
| `DS_OPEN` | (open) | Set to `0`/`false`/`no` to not open a browser. |

**Read-only server endpoints**

- `GET /api/state` — the parsed DAG model (Logic DAG + Dataset lineage DAG), re-derived from
  disk on every request (no cache).
- `GET /api/events` — Server-Sent Events; an `update` event fires whenever `steps/` or
  `datasets/` change.

**Development with hot reload:** run `npm run dev` (Vite client) and `npm run server` (API)
side by side; the dev server proxies `/api/*` to the companion server.

## 5. The co-pilot workflow

You drive the co-pilot from a Claude Code session in this repo, talking to the Orchestrator.
The loop below is the whole system in use. Keep the browser UI open on a second monitor to
watch each step land.

### 5.1 Ground a dataset

Point the Orchestrator at a parquet file. The **data-grounding** skill copies it into
`datasets/<id>/`, then grills you about its columns, grain, keys, business meaning, and
pitfalls, and writes a `dataset.md`. External data is always copied in and described before
use — never referenced in place. Datasets derived from other datasets carry their transform
code and a `derived_from` edge.

### 5.2 Capture proposed steps

Brainstorm hypotheses with the Orchestrator. When you say to capture them, the
**proposed-step-capture** skill infers each step's id, kind, and parents, **confirms every
field with you**, then writes a minimal `proposed` node. A proposed step is defined but not
yet run. You can edit or abandon proposed steps; abandoning sets a terminal `abandoned`
status and never deletes the node.

### 5.3 Dispatch a step

Tell the Orchestrator to run a step. The **step-dispatch** skill assembles an executable
**brief**, flips the step to `running`, and spawns a headless **Worker**. The Worker performs
the analysis, writes its results and assets, and sets a terminal status (`done` or
`dead-end`). If it meets a judgement call the brief did not pin down, it **halts** and the
Orchestrator relays the question to you, records any resulting decision, and resumes the
Worker.

### 5.4 Record decisions

A choice that steers the project (for example, "truncate renewals at 12 months") is a
first-class **Decision**. The **decision-logging** skill writes it as its own record with the
choice, rationale, and the steps and assets that support it. Decisions appear on the global
decisions rail in the UI; selecting one highlights its supporting steps in the graph.

### 5.5 Promote shared code

After a step completes, the Orchestrator may dispatch the **Code Maintainer**, which uses the
**code-promotion** skill to lift reusable helpers into the shared `dslib/` library on a
two-use rule (used once locally, promoted on the second use). It is the only writer of
`dslib/` and never edits already-committed steps.

## 6. On-disk state layout

Each step and dataset is its own directory that owns its record; the graph is **derived** by
scanning, never stored in a central manifest. This keeps parallel Workers from colliding.

```
steps/<ulid>-<slug>/
├── step.md            frontmatter + goal
├── brief.md           the Worker's executable brief (written at dispatch)
├── assumptions.md     assumptions logged during the run
├── logic_process.md   curated, human-facing reasoning trace
├── results.md         outputs + conclusion (+ asset citations)
├── assets/            plots/tables/artifacts + run-log
├── decisions/<id>.md  first-class Decision records
└── code/main.py       the step's Python entrypoint

datasets/<ulid>-<slug>/
├── data.parquet       the canonical copy (data lives inside its folder)
├── dataset.md         what it is, why, and what it is derived from
└── code/              derived datasets only: the transform script
```

**Step status** moves `proposed → running → done | dead-end`, plus `proposed → abandoned`.
A `dead-end` step ran but was unfruitful; an `abandoned` step was dropped before it ever ran.
Both are terminal and excluded from the working frontier.

## 7. Skills reference

Skills are the exclusive writers of state. All six live under `.claude/skills/`.

| Skill | Used by | What it does |
|---|---|---|
| proposed-step-capture | Orchestrator | Infer-then-confirm, then write / edit / abandon a `proposed` step node. |
| record-results | Worker | Write the Worker's own step tree: logic process, results, assets, terminal status. |
| decision-logging | Orchestrator | Write a first-class Decision record with rationale and supporting refs. |
| step-dispatch | Orchestrator | Assemble the brief, flip `proposed → running`, spawn the Worker. |
| data-grounding | Orchestrator | Ground an external parquet or derive a new dataset; write `dataset.md`. |
| code-promotion | Code Maintainer | Promote reusable helpers into `dslib/` on the two-use rule. |

The Orchestrator also reuses the general `grilling` and `domain-modeling` skills when it
interviews you, and `prototype` and `research` when a design question or an external fact
needs settling.

## 8. Agents reference

Three agent types live under `.claude/agents/`.

- **Orchestrator** — the main conversation and the sole human-facing seam. Default stance is
  factual-only; opinions are opt-in and labelled. It dispatches steps, relays escalations,
  records decisions, creates all datasets, and commits each completed step's folder.
- **Worker** — a headless sub-agent that executes exactly one step from its brief in an
  isolated context. It writes only its own step directory and halts on any judgement not
  fixed by the brief.
- **Code Maintainer** — a developer-oriented sub-agent, the sole writer of `dslib/`, run one
  at a time at a quiescent point.

## 9. Hooks reference

Hooks are hard enforcement, grouped by which agent they bind to. Handlers live under
`ui/hooks/`; main-session hooks are registered in `.claude/settings.json`, and Worker hooks
ride the Worker agent's frontmatter.

**On the Worker**

- **write-confine** — denies any write outside the Worker's own step directory.
- **gated-action** — asks before a consequential action (a training/eval run, an expensive
  read), unless the brief pre-approved it.
- **report-before-finish** — blocks finishing unless results and a terminal status were
  written, or an escalation is in flight.

**On the Orchestrator / main session**

- **report-decision-before-close** — blocks closing with a pending, unrecorded decision.
- **no-unilateral** — denies a state-steering write that skips the decision-record path.
- **session-catchup** — on session start, resume, or compaction, injects a read-only summary
  (structural index of every step, the latest logic of the current frontier, and every
  decision statement).

Working only independent steps in parallel is a **convention** the Orchestrator follows, not
a hard hook.

## 10. The shared library dslib

`dslib/` is the shared, editable Python library step code imports. It is seeded day-one with
pure-stdlib helpers, so it imports with no heavy DS stack:

- `dslib.evaluation` — `accuracy`, `precision`, `recall`, `f1`, `roc_auc`, `mae`, `mse`,
  `rmse`, `r2`.
- `dslib.cross_validation` — `train_test_split_indices`, `kfold_indices`,
  `stratified_kfold_indices` (index-returning, deterministic with a `seed`).

Smoke test:

```bash
./.venv/bin/python dslib/tests/test_dslib.py
```

Workers import `dslib/` freely; only the Code Maintainer writes it.

## 11. Troubleshooting

- **The UI shows only one step.** That is the shipped example. The graph fills in as you
  ground data and dispatch steps.
- **`pip install -e .` fails with a Python-version error.** The bare-system `python3` is
  likely 3.9. Use a 3.11+ venv (see [Installation](#3-installation)).
- **The browser did not open.** Open http://localhost:4317 manually, or check `DS_OPEN`.
- **Port already in use.** Set `DS_PORT` to a free port.
- **The graph is not updating live.** The UI subscribes to `GET /api/events`; confirm the
  server is running and reachable, and that your changes are under `steps/`/`datasets/`.
- **Run the tests** to confirm the install is healthy: `cd ui && npm test`.

## 12. Glossary

- **Logic Step** — the atomic unit of research: one conclusion-bearing analytical move.
  Either an *analysis* (output is understanding) or an *experiment* (trains/evaluates against
  a metric).
- **Logic DAG** — the directed acyclic graph of Logic Steps; multi-parent.
- **Builds-on edge** — a parent → child edge meaning the child builds on the parent's
  conclusion. Owned by the child.
- **Root Task** — the single root of the DAG: the goal, target metric, and dataset.
- **Dataset** — a first-class on-disk data unit (v1: parquet) with a `dataset.md`. Either
  *grounded* (an external file brought in and described) or *derived* (produced from other
  datasets by a transform).
- **Dataset lineage** — the derived-from DAG of datasets, separate from the Logic DAG.
- **Brief** — the goal of a step (in `step.md`). Distinct from the *executable brief*, the
  detailed instruction a Worker runs.
- **Decision** — a choice made on the basis of conclusions that steers the Root Task. A
  first-class record, enumerable across the whole tree; distinct from a step's conclusion.
- **Dead-end** — a step that ran but was abandoned as unfruitful. Kept for provenance.
- **Abandoned** — a proposed step dropped before it ever ran. Terminal, never deleted.
- **Frontier** — the active edge of the work: the running steps, or the DAG leaves if none
  are running. Terminal steps (dead-end, abandoned) are excluded.
- **Independent steps** — two steps with no path between them; the precondition for working
  them in parallel.
- **Orchestrator** — the main-conversation agent; the sole human-facing seam.
- **Worker** — a headless sub-agent that executes exactly one step from its brief.
- **Code Maintainer** — the sub-agent that promotes reusable code into `dslib/`; its sole
  writer.
- **Read-seam** — the module that scans `steps/`/`datasets/`, parses frontmatter, and builds
  both DAGs in memory (no cache).
- **Companion server** — the local Node process that serves the state API and pushes live
  updates to the browser UI.
- **SSE (Server-Sent Events)** — the one-way channel the server uses to push updates to the
  browser.
- **Skill** — a packaged instruction set; in this system, the exclusive writer of state.
- **Hook** — hard enforcement that stops an agent from breaking a rule.

---

*This manual is authored in `docs/manual.md`. Regenerate `docs/manual.html` after editing
with `node scripts/build-manual.mjs`.*
