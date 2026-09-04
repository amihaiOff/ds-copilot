# DS Co-Pilot — Build-Ready Specification

**Status:** build-ready (assembled 2026-09-04, ticket [Skills inventory & build-ready spec assembly #12](https://github.com/amihaiOff/ds-copilot/issues/12)).
**Source of truth for terms:** [`CONTEXT.md`](../CONTEXT.md) (glossary). **Storage rationale:** [ADR 0001](adr/0001-per-step-storage-derived-graph.md).
This document consolidates the decisions made across the wayfinding map ([Map: DS Co-Pilot spec #1](https://github.com/amihaiOff/ds-copilot/issues/1)) into one buildable read. Each section links the ticket that owns the decision's full rationale; this spec restates the *contract*, not the deliberation.

---

## 1. Overview & goals

A **local, single-user data-science co-pilot** that augments **Claude Code running in-IDE**. It structures research as a **DAG of Logic Steps**, tracks first-class **Decisions**, grounds **Datasets**, manages step **code**, and projects all of it into a **standalone browser UI**.

- **v1 target:** tabular ML (CatBoost/XGBoost, EDA, feature engineering) against **local on-disk parquet** datasets.
- **Delivered as:** a standalone browser UI + Claude Code skills + hooks + supporting Python code (`dslib/`).
- **Four homes** (from [#6](https://github.com/amihaiOff/ds-copilot/issues/6)): **files** = canonical state (single source of truth) · **skills** = the exclusive writer · **hooks** = hard enforcement · **browser UI** = strictly read-only projection.
- **Non-negotiables:** running/instantiating steps is **conversation-only** (no UI action path); the UI never writes state; writes happen only inside skill-governed turns.

**Build the pieces in this order** (dependencies-first): domain/state layout (§3) → skills that write it (§5) → hooks that enforce it (§6) → orchestration protocol (§4, §7, §9) → data grounding (§8) → session handoff hook (§6) → browser UI (§10).

---

## 2. Domain model

Full definitions live in [`CONTEXT.md`](../CONTEXT.md). Key entities and their relationships:

- **Root Task** — the single DAG root (goal + target metric + dataset).
- **Logic Step** — one conclusion-bearing analytical move; `kind ∈ {analysis, experiment}`. The atomic unit.
- **Logic DAG** — multi-parent DAG of steps; **builds-on** edge owned by the child.
- **Dataset** — first-class on-disk data unit; `kind ∈ {grounded, derived}`; forms its own **lineage DAG** (derived-from, child-owned), separate from the Logic DAG.
- **Decision** — a first-class choice made on the basis of conclusions; steers the Root Task; enumerable across the whole tree. Distinct from a step's *conclusion* (a finding).
- **Assets** — plots/tables/artifacts that **attach** to a step (not steps themselves).
- **Agents** — **Orchestrator** (sole human seam), **Worker** (per-step executor), **Code Maintainer** (dslib upkeep).

Owner: [Core domain & on-disk state model #2](https://github.com/amihaiOff/ds-copilot/issues/2), [Data-grounding #10](https://github.com/amihaiOff/ds-copilot/issues/10).

---

## 3. On-disk state layout

**Principle (ADR 0001):** per-step storage, **no central manifest**. Every writer touches only its own directory; the DAG is a projection rebuilt by scanning. Contention-free under parallel Workers.

### 3.1 Repo layout

```
<project-root>/
├── steps/                       # Logic DAG — one dir per step
│   └── <ulid>-<slug>/
│       ├── step.md              # frontmatter + goal/brief
│       ├── brief.md             # executable sub-agent brief (written at dispatch)
│       ├── assumptions.md       # assumptions logged during the run
│       ├── logic_process.md     # curated, human-facing reasoning trace
│       ├── results.md           # outputs + conclusion (+ asset citations)
│       ├── assets/              # plots/tables/artifacts + run-log.*
│       ├── decisions/<id>.md    # first-class Decision records homed on their step
│       └── code/main.py         # the step's .py entrypoint (no notebooks)
├── datasets/                    # Dataset lineage DAG — one dir per dataset
│   └── <ulid>-<slug>/
│       ├── data.parquet         # canonical copy (data always lives inside its folder)
│       ├── dataset.md           # what/why/derived-from
│       └── code/                # derived datasets only: the transform script
├── dslib/                       # shared editable Python package (pip install -e .)
├── pyproject.toml               # pinned deps + dslib package definition
└── ui/                          # standalone browser UI (see §10)
```

### 3.2 `step.md` frontmatter

`id` (`<ulid>-<slug>`) · `title` · `kind` (`analysis|experiment`) · `builds_on` (parent step ids; empty for the root) · `status` · `dataset_ref` (dataset id or list) · `code_ref` (see §9) · `created`.

**Status enum:** `proposed → running → done | dead-end`, plus `proposed → abandoned`.
- `proposed` — defined, not run.
- `running` — dispatched (Orchestrator flips at dispatch); an abandoned halt stays visibly `running`, never silently `done`.
- `done` — ran, has results/conclusion.
- `dead-end` — ran, unfruitful; kept for provenance.
- `abandoned` — proposed then dropped, never ran (≠ `dead-end`). Terminal; excluded from the frontier.

### 3.3 Records

- **Decision record** (`steps/<id>/decisions/<id>.md`): the choice, its rationale, and citations to the supporting steps/assets. Enumerable via glob `steps/*/decisions/*`.
- **Asset**: file under `steps/<id>/assets/`; registered as part of `record-results` (§5). `assets/run-log.*` is the raw forensic run log (linked, not pasted).

Owner: [#2](https://github.com/amihaiOff/ds-copilot/issues/2), ADR 0001, ripples from [#11](https://github.com/amihaiOff/ds-copilot/issues/11) (status enum).

---

## 4. Orchestration: agents

Owner: [Sub-agent brief + no-unilateral-decisions #7](https://github.com/amihaiOff/ds-copilot/issues/7), [Main conversation #11](https://github.com/amihaiOff/ds-copilot/issues/11).

| Agent | Runs in | Role | Writes |
|---|---|---|---|
| **Orchestrator** | main conversation | Sole human-facing seam. Dispatches steps, relays Worker escalations to the human, records Decisions, creates all datasets, commits step folders. Never executes a step itself. | Decisions, datasets, `proposed` nodes, per-step commits |
| **Worker** | Task sub-agent (headless) | Executes exactly one step from its `brief.md`, in an isolated context. Cannot prompt the human → halts + escalates on any judgement not fixed by the brief. | Its own `steps/<id>/` tree only |
| **Code Maintainer** | Task sub-agent (dev-oriented) | DRY upkeep of `dslib/`. Compares a finished step's code against the library, promotes reusable helpers. Sole `dslib` writer; runs one-at-a-time at a quiescent point. Additive-forward — never edits committed steps. | `dslib/` only |

**Orchestrator conversational stance ([#11](https://github.com/amihaiOff/ds-copilot/issues/11)):** factual-only by default; opinions/recommendations opt-in (volunteered only when asked, labelled as opinion). May recap already-discussed branches but introduces no new hypotheses unasked. Enforced by instruction (a stance section in its governing skill/`CONTEXT.md`), **not a hook** — hooks can't judge prose.

### 4.1 The executable brief (`steps/<id>/brief.md`)

Assembled by `step-dispatch` (§5), persisted, then passed verbatim as the Worker's Task message. Sections:

1. **Frontmatter** — `step_id`, `kind`, `builds_on`, `status`, `dispatched_at`.
2. **Goal / hypothesis** — the step's brief from `step.md`.
3. **Inputs** — `dataset_ref` (§8), parent conclusions/assets to build on, `code_ref` (§9).
4. **Method** — the exact analytical steps.
5. **Pre-specified choices** — split / imputation / metric / model family fixed up front. *Every choice pinned here is class-1 by construction and runs without a halt (the autonomy lever).*
6. **Expected assets** — what to produce (lands in `assets/`).
7. **Autonomy boundary** — the class-1 allowlist + the halt rule.
8. **Escalation format** — the `BLOCKED — needs decision` payload shape.
9. **Reporting contract** — what to write on finish.

### 4.2 No-unilateral-decisions protocol

- **Trigger:** *any analytical judgement not fixed by the brief → halt.* Both Assumptions and Decisions halt; the split is **recording-time only** (Assumption → `assumptions.md`, steers nothing; Decision → first-class record, steers the Root Task).
- **Class-1 (proceed, tunable starter allowlist):** mechanical parse (obvious datetime format), standard train/test split (80/20), mean/median imputation.
- **Class-2 (halt):** everything else — dropping a feature, model family, eval metric, target definition.
- **Escalation path:** Worker emits structured `BLOCKED — needs decision` (question + options + its recommendation) → Orchestrator relays via `AskUserQuestion` → records any first-class Decision → resumes the Worker via `SendMessage`. The Worker never talks to the human directly.
- **Honest limit:** hard enforcement keys on **tool signatures** (write paths, train/SQL commands, completion), not the abstract "assumption." Pure-reasoning judgement calls fall to the brief's autonomy-boundary instruction, backstopped by the completion gate (§6, hook 3).

### 4.3 Visibility (two tiers)

- `logic_process.md` — curated human-facing trace (moves, assumptions, escalations). What the next session reads.
- `assets/run-log.*` — raw mechanical tool/transcript log. Forensic; consulted when the curated trace is doubted.

---

## 5. Skills inventory

Skills are the **exclusive writers** of state ([#6](https://github.com/amihaiOff/ds-copilot/issues/6)): writes happen only inside skill-governed turns. **6 new skills**; general mattpocock skills are reused, not rebuilt.

| Skill | Used by | Trigger | Inputs → Outputs | New/reuse |
|---|---|---|---|---|
| **step-dispatch** | Orchestrator | NL "run/dispatch step X" | step id → assembles `brief.md`, flips `proposed→running`, spawns the Worker | new |
| **record-results** | Worker | end of a run (or per-asset during) | run outputs → writes `logic_process.md`, `results.md`, `assets/` (incl. asset registration), terminal status | new |
| **proposed-step capture** | Orchestrator | user says "capture these" | user-selected proposals → minimal `proposed` node(s) (`step.md`: frontmatter + goal, **no brief**); also **edit / abandon** proposed nodes | new |
| **data-grounding** | Orchestrator | user points at a parquet not under `datasets/`, or a derive is needed | Mode A *ground* / Mode B *derive* → `datasets/<id>/` folder + `dataset.md` (see §8) | new |
| **code-promotion** | Code Maintainer | Orchestrator dispatches post-step at a quiescent point | finished step's `code/` + `dslib/` → promoted helpers in `dslib/` (two-use rule) | new |
| **decision-logging** | Orchestrator | a first-class Decision is made (often post-escalation) | choice + rationale + supporting step/asset refs → `steps/<id>/decisions/<id>.md` | new |

**Reused mattpocock skills:** `/grilling` and `/domain-modeling` (every deliberation; `data-grounding` wraps them), `/prototype` (design questions), `/research` (facts outside the working dir).

**Notes:**
- `asset-registration` is **folded into `record-results`** — the Worker writes assets as part of writing its step tree; no separate surface.
- `proposed-step capture` is **infer-then-confirm**: the skill infers id/slug/`kind`/`builds_on` but **confirms every field with the user before writing** (a mis-set parent silently corrupts child-owned lineage). Abandon sets terminal status `abandoned`, never deletes.
- No `DAG-update` skill: the graph is derived by scanning `steps/` (ADR 0001), never hand-maintained.

Owners: [#7](https://github.com/amihaiOff/ds-copilot/issues/7) (dispatch, record-results), [#9](https://github.com/amihaiOff/ds-copilot/issues/9) (code-promotion), [#10](https://github.com/amihaiOff/ds-copilot/issues/10) (data-grounding), [#11](https://github.com/amihaiOff/ds-copilot/issues/11) (capture, stance).

---

## 6. Hooks inventory

Hard enforcement ([#6](https://github.com/amihaiOff/ds-copilot/issues/6), [#7](https://github.com/amihaiOff/ds-copilot/issues/7), [#8](https://github.com/amihaiOff/ds-copilot/issues/8)). **Grouped by binding target** — the only grouping that makes them buildable. Each is a Claude Code hook on the relevant agent type's `hooks:` frontmatter (Worker) or the main session config (Orchestrator).

### On the Worker agent type

| # | Event | Matcher/condition | Action |
|---|---|---|---|
| 1 | **PreToolUse** | Write/Edit outside `steps/<id>/` | **deny** — write confinement to own step dir |
| 2 | **PreToolUse** | gated consequential action (train/eval run, warehouse write/DDL, expensive read) | **ask** — *silent-pass when the call signature matches a brief pre-approval* (hook reads dispatch-time approved params from the step dir); else `ask`, reason string carries question + Worker's recommendation. Prompt surfaces in the main session, labelled by subagent. |
| 3 | **SubagentStop** | finishing without (`results.md` conclusion + terminal status) **and** no `BLOCKED` halt in flight | **exit-2** — report-before-finish; "you haven't recorded results or escalated." |

### On the Orchestrator / main session

| # | Event | Matcher/condition | Action |
|---|---|---|---|
| 4 | **Stop** | closing without recording a pending decision | **exit-2** — report-decision-before-close |
| 5 | **PreToolUse** | a unilateral state-steering write that skips the decision-record path | **deny** — no-unilateral-decisions |
| 6 | **SessionStart** | matchers `startup, resume, compact` | **read-only catch-up injection** (see §11) — deterministic code, no agent in the hot path |

### Best-effort / convention (not a hard hook)

- **independent-steps-only-in-parallel** — hard enforcement keys on tool signatures, which can't see step independence; this is an **Orchestrator instruction + convention**, not a hook ([#7](https://github.com/amihaiOff/ds-copilot/issues/7) honest limit).

---

## 7. Data grounding

Owner: [Data-grounding protocol & datasheet #10](https://github.com/amihaiOff/ds-copilot/issues/10). v1 = **local parquet only**; external/warehouse sources are out of scope (§12).

- **Grounded dataset** — external parquet a human brought in, **copied into** its folder, described via HITL grilling. No `code/`.
- **Derived dataset** — created from other dataset(s) by a transform; carries `derived_from` + the generating code in `code/`.
- **The Orchestrator creates all datasets.** Workers only ever *read* via `dataset_ref` (write-confinement, §6).

**`dataset.md` schema** — frontmatter: `id` · `kind: grounded|derived` · `derived_from: [ids]` (empty for grounded) · `grain` · `keys` · `row_count` · `content_hash` · `file_bytes` · `created` · `status: grounded|partial`. Body: Columns (name·type·meaning·null convention·pitfalls) · Grain & keys · Business meaning · Why created / transform rationale · Known pitfalls · Open questions. Unknown-but-relevant fields recorded as `unknown`, never omitted. No `produced_by` — provenance *is* `code/` + `derived_from`.

**`/data-grounding` skill** — Mode A *ground* (copy parquet in → grill against the Columns checklist → fold new terms into `CONTEXT.md` via `/domain-modeling` → write `dataset.md` + fingerprint). Mode B *derive* (write transform into `code/` → run → write `dataset.md` with `derived_from` + rationale). Re-trigger is conversation-driven, grounded-only: external data is copied in and grilled before use, never referenced in place.

**Seam with §4:** the Orchestrator ensures `dataset_ref` targets exist **before dispatch**; a Worker that discovers missing data hits the `BLOCKED` halt → Orchestrator creates the dataset → resumes. Integrity via `content_hash`/`row_count` (copied-in parquet is effectively immutable → no staleness).

---

## 8. Session handoff

Owner: [Session handoff / state-pointer design #8](https://github.com/amihaiOff/ds-copilot/issues/8). **Fully derived — no stored artifact** (no handoff file, no cursor). Freshness is automatic (derived can't go stale).

Catch-up is the **SessionStart hook** (§6, hook 6; matchers `startup, resume, compact` → one mechanism for cold-start *and* post-compaction re-grounding). Handler is **deterministic code, not an agent** (no distillation in the hot path). It injects:

1. **Whole-tree structural index** — one header line per step (id / title / kind / status / parents / path).
2. **Latest logic inlined** — full `logic_process.md` + `results.md` of the active frontier only (`running` steps, or DAG leaves if none open).
3. **All decision statements** — one line each (no rationale/supports).

Everything else is pulled on demand. Only precondition: accurate `status` (owned by the dispatch/record-results/capture skills). Deliberated-but-uncaptured context is **not** carried across sessions — promote to `proposed` or lose it.

---

## 9. Code management & provenance

Owner: [Code management & provenance #9](https://github.com/amihaiOff/ds-copilot/issues/9).

- **Step code:** `.py` only (no notebooks — headless Worker runs a script), at `steps/<id>/code/main.py` (inside the step dir → keeps ADR 0001 contention-freedom).
- **Shared library:** `dslib/` at repo root, editable (`pip install -e .`); root `pyproject.toml` homes both the package and pinned deps. Workers **import it freely in parallel, write it never**.
- **Promotion:** owned by the **Code Maintainer** (§4) via the `code-promotion` skill on the **two-use rule** (first use local, second promoted; eval/CV seed `dslib` day one). Additive-forward — never edits committed steps.
- **`code_ref`** (step frontmatter): `{ entrypoint, git_sha, dslib_sha, data_ref (→dataset), run_log }`. The **Orchestrator commits each step's folder on completion** (path-scoped, serial → no `.git/index` race); `git_sha` = that per-step commit.
- **Env:** pinned via committed `pyproject.toml`. (A lockfile is Packaging fog, §12.)

---

## 10. Browser UI tech stack

Owner: [Standalone browser UI tech-stack finalization #13](https://github.com/amihaiOff/ds-copilot/issues/13). **Pivoted from a VS Code/Cursor extension to a standalone browser app** — the read-only-projection *principle* ([#6](https://github.com/amihaiOff/ds-copilot/issues/6)) is intact; only the access *mechanism* changed.

- **Access:** a sandboxed browser tab can't read disk, so a **local companion server** owns file access — reads `steps/`/`datasets/`, watches for changes, **pushes** updates. The browser is a **pure read-only client** (never writes; running steps is conversation-only).
- **Frontend:** **Vite + React + TypeScript** SPA. Rendering stack (prototype-validated, [#5](https://github.com/amihaiOff/ds-copilot/issues/5)): **React Flow + elkjs** (multi-parent DAG), **Plotly** (interactive plots), **highlight.js** (code viewer). Winning UX ([#5](https://github.com/amihaiOff/ds-copilot/issues/5)): three-pane — global decisions rail │ DAG canvas │ docked inspector (Overview/Data/Code/Assets/Decisions tabs); selecting a decision highlights its supporting steps.
- **Server:** **Node + TypeScript** (Fastify) + **chokidar** (watch) + **gray-matter** (frontmatter parse) + **SSE** one-way push (fits read-only; auto-reconnecting, no extra lib).
- **Layout:** one `ui/` npm package — `ui/client/` (Vite React), `ui/server/` (Node), `ui/shared/` (shared TS types = state-tree/frontmatter schema, imported by both). **Production = one process, one port** (server serves the built client + the state API/SSE); dev = Vite dev server alongside.
- **Run model:** one command (npm script / tiny CLI) boots the server → serves the built UI → opens `localhost:<port>`.
- **Testing:** **Vitest**, kept light — valuable tests are on projection logic (parse `steps/` → correct DAG model; file change → correct SSE event), not UI pixels.
- **Read seam:** parses frontmatter directly, no `step.json`/`graph.json` cache (keeps ADR 0001 contention-free). Renders `proposed` nodes with **no action**.

Rejected: File System Access API (no native watch, Chromium-only, per-session gesture), static export (no liveness), Python server (zero DS work → no affinity gain).

---

## 11. Build sequencing & open fog

**Build order:** §3 state layout → §5 skills → §6 hooks → §4/§7/§9 orchestration & code → §8 handoff hook → §10 browser UI. The state files are the substrate everything else reads/writes; skills and hooks come before the agents that rely on them; the UI is last (pure projection of the rest).

**Deferred (in scope, not yet sharp — see the map's *Not yet specified*):**
- **Asset search & indexing UX** — finding a plot/table done long ago (naming, tags, full-text, thumbnails).
- **Dataset-lineage rendering in the browser UI** — how the Dataset DAG + `dataset_ref` provenance render alongside the Logic DAG (a viewer-UX detail).
- **Concrete DS execution skills** — e.g. `run-catboost-experiment`, `eda-profile` (built atop this inventory once the system exists).
- **Packaging / install flow** — bundling the browser UI (client + local server) + skills for distribution.

**Out of scope** (fixed by the destination): multi-user/team/hosting; production build & distribution of the co-pilot; non-tabular surfaces (DL/NLP/embeddings/GPU); external/warehouse data-source connections.

---

*This spec is the destination of the wayfinding map. Each decision's full deliberation lives in its linked ticket; the glossary in `CONTEXT.md` and ADR 0001 are the other two canonical references. Hand this, plus those two files, to a builder.*
