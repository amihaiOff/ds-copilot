# DS Co-Pilot — Implementation Plan (multi-session)

The build phase for the spec in [`docs/spec.md`](spec.md). This is a **fresh effort** —
wayfinding (the map at [#1](https://github.com/amihaiOff/ds-copilot/issues/1)) produced the
spec; this plan executes it. There is no single "implement" skill in the Matt Pocock set;
each session opens with the right skill and closes with `code-review`.

## How to run one session

1. **Read** [`docs/spec.md`](spec.md) (the named sections), [`CONTEXT.md`](../CONTEXT.md)
   (glossary), and [ADR 0001](adr/0001-per-step-storage-derived-graph.md).
2. **Open** with the session's listed skill(s).
3. **Build** only that session's slice — resist scope creep into the next.
4. **Close** with `/code-review` (Standards + Spec axes) against the diff.
5. **Commit** the slice (reference the spec section); tick its box in the Progress tracker.
6. Use `/research` on demand for unknowns, `/diagnosing-bugs` when stuck.

**Dependency order** follows spec §11: state substrate → skills → hooks → agents → UI.
Sessions are ordered; a session's Prereqs list which earlier sessions must be done first.

## Progress tracker

- [x] **S0** — Repo scaffold & tooling
- [x] **S1** — State schema + read-seam (the substrate)
- [x] **S2** — Skills batch A: state writers (capture / record-results / decision-logging)
- [x] **S3** — Skills batch B: dispatch / data-grounding / code-promotion
- [x] **S4** — Hooks (incl. the deterministic session-catch-up handler)
- [x] **S5** — Agent types + orchestration wiring
- [x] **S6** — Browser UI: server (Fastify + chokidar + SSE)
- [x] **S7** — Browser UI: client (React Flow + elkjs, three-pane)
- [x] **S8** — Integration, `dslib` seeds, run model

---

## S0 — Repo scaffold & tooling

- **Skills:** `codebase-design` (light — the `ui/` seam is already fixed in spec §10), `writing-for-agents`.
- **Prereqs:** none.
- **Spec refs:** §3.1 (repo layout), §10 (`ui/` package), §1 (four homes).
- **Deliverables:**
  - Dir skeleton: `steps/` (+ one example fixture step), `datasets/`, `dslib/` + root `pyproject.toml` (editable install + pinned deps), `ui/{client,server,shared}` as one npm package, Vitest config.
  - Seed `AGENTS.md` / `CLAUDE.md` pointing at `docs/spec.md` + `CONTEXT.md` as the canonical references.
- **Done-check:** `npm test` runs (0 tests OK); `pip install -e .` succeeds; the example fixture step matches the §3.2 frontmatter schema.

## S1 — State schema + read-seam (the substrate)

- **Skills:** `codebase-design` (fix the read-seam interface), `tdd`.
- **Prereqs:** S0.
- **Spec refs:** §3 (state layout + schemas), §2 (domain model), ADR 0001.
- **Deliverables:**
  - `ui/shared` TypeScript types: `step.md` / `dataset.md` frontmatter, the status enum (`proposed → running → done | dead-end`, `abandoned`), Logic-DAG and Dataset-lineage-DAG model types.
  - Read module: scan `steps/` + `datasets/`, parse frontmatter (`gray-matter`), build both DAGs in memory (no cache — derived per ADR 0001).
- **Done-check (tests green):** `parse steps/ → correct DAG model`, including multi-parent edges (child-owned `builds_on`), and `abandoned`/`dead-end` excluded from the frontier.

## S2 — Skills batch A: state writers

- **Skills:** `writing-for-agents`, `tdd` (for deterministic pieces: id/slug generation, frontmatter emission).
- **Prereqs:** S1 (writers must emit what the read-seam parses).
- **Spec refs:** §5 (skills), §3.2/§3.3 (schemas), §4.2/§4.3.
- **Deliverables:** author `proposed-step capture` (infer-then-**confirm every field**; edit/abandon), `record-results` (writes `logic_process.md` / `results.md` / `assets/`, incl. asset registration, terminal status), `decision-logging` (first-class Decision record).
- **Done-check:** a dry-run of each skill produces a tree the S1 read-seam parses without error (round-trip: write → parse → matches).

## S3 — Skills batch B: dispatch / data-grounding / code-promotion

- **Skills:** `writing-for-agents`, `tdd` (brief assembly, dataset fingerprinting).
- **Prereqs:** S1, S2.
- **Spec refs:** §5, §4.1 (brief schema), §7 (data grounding), §9 (code_ref).
- **Deliverables:** `step-dispatch` (assemble `brief.md` per §4.1, flip `proposed→running`, spawn Worker), `data-grounding` (Mode A ground / Mode B derive, `dataset.md` schema §7), `code-promotion` (two-use rule, sole `dslib` writer).
- **Done-check:** dispatch assembles a valid 9-section `brief.md` from a step + refs; data-grounding produces a valid `datasets/<id>/` folder + `dataset.md`.

## S4 — Hooks

- **Skills:** `writing-for-agents`, `tdd` (the session-catch-up handler is real deterministic code).
- **Prereqs:** S1 (catch-up handler reuses the parser).
- **Spec refs:** §6 (hooks), §8 (session handoff), §4.2 (no-unilateral).
- **Deliverables:** the 6 hooks per §6 (event + matcher + action), grouped by binding target; the SessionStart **catch-up handler** (structural index + latest-logic inline + decision statements) as deterministic code; the parallelism convention note.
- **Done-check:** catch-up handler unit-tested (fixture tree → correct injected context: frontier = `running` else leaves; terminals excluded); each other hook authored with a stated event/matcher/action.

## S5 — Agent types + orchestration wiring

- **Skills:** `writing-for-agents`.
- **Prereqs:** S2, S3, S4 (agents load these skills; Worker carries S4 hooks in frontmatter).
- **Spec refs:** §4 (agents, brief, no-unilateral protocol), §9 (per-step commit), §11.
- **Deliverables:** Orchestrator (stance §4: factual-only, opt-in opinions; escalation relay via `AskUserQuestion`; per-step commit), Worker (headless, `hooks:` frontmatter = S4 hooks 1–3, `skills:` = record-results), Code Maintainer (dev prompt, sole `dslib` writer).
- **Done-check:** conceptual end-to-end dry-run — dispatch a trivial step → Worker writes its tree via `record-results` → S1 read-seam parses it → a Decision is logged.

## S6 — Browser UI: server

- **Skills:** `codebase-design` (client/server seam), `tdd`.
- **Prereqs:** S1 (reuse the read-seam server-side).
- **Spec refs:** §10 (server: Fastify + chokidar + SSE), §3 (read seam).
- **Deliverables:** `ui/server` — serve state API from the read-seam, watch `steps/`/`datasets/` (chokidar), push updates over SSE. Guard against self-write loops is moot (read-only).
- **Done-check (tests green):** `file change → correct SSE event`; state endpoint returns the parsed DAG model.

## S7 — Browser UI: client

- **Skills:** `codebase-design`, `tdd` (client logic, not pixels).
- **Prereqs:** S6.
- **Spec refs:** §10 (frontend + UX), [#5](https://github.com/amihaiOff/ds-copilot/issues/5) (validated UX).
- **Deliverables:** `ui/client` React SPA — React Flow + elkjs DAG canvas, three-pane layout (decisions rail │ canvas │ inspector: Overview/Data/Code/Assets/Decisions), Plotly + highlight.js in the inspector, SSE subscription for live updates, `proposed` nodes rendered with **no action**.
- **Done-check:** renders the DAG from live server state; updates on SSE; strictly read-only (no write path anywhere).

## S8 — Integration, `dslib` seeds, run model

- **Skills:** `tdd`, `code-review` (final pass over the whole build).
- **Prereqs:** all.
- **Spec refs:** §9 (dslib seeds: eval/CV day one), §10 (run model), §11.
- **Deliverables:** one-command launch (server serves the built client + opens `localhost:<port>`); seed `dslib/` with eval/CV helpers; end-to-end smoke test on a real example tree.
- **Done-check:** `npm run <launch>` boots the server and shows a real tree in the browser; a full walkthrough (capture → dispatch → results → decision → UI reflects it) works.

---

## Cross-cutting (every session)

- **`code-review`** at the end of each session (Standards + Spec).
- **`research`** on demand — likely candidates: exact hook frontmatter format, `SubagentStop` exit-2 semantics, React Flow + elkjs layout wiring.
- **`diagnosing-bugs`** whenever behaviour is wrong or a test won't go green.

## Deferred to after the build (spec §11 fog — do NOT block on these)

Asset search & indexing UX · dataset-lineage rendering in the UI · concrete DS execution
skills (`run-catboost-experiment`, `eda-profile`) · packaging/install flow. Sharpen these
during or after implementation, as their own slices.
