# `ui/hooks/` — DS co-pilot hook handlers (spec §6, §8)

Deterministic TypeScript handlers for the Claude Code hooks that give the co-pilot
its **hard enforcement** (§6) and its **session catch-up** (§8). No agent is ever in
the hot path — every handler is plain code run via `tsx`. They read the on-disk
state through the S1 read-seam (`@shared`), never a cache (ADR 0001).

Handlers speak the Claude Code hook protocol: the event arrives as JSON on stdin;
a verdict goes back as stdout JSON (PreToolUse `deny`/`ask`, SessionStart
`additionalContext`) or as **exit code 2 + stderr** (Stop / SubagentStop blocks).

## Hook table — grouped by binding target

Grouping by *what the hook binds to* is the only grouping that makes them buildable:
Worker hooks ride the Worker **agent frontmatter** (`hooks:`), wired by S5; main-session
hooks are registered in [`.claude/settings.json`](../../.claude/settings.json).

### On the Worker agent type (wired into the Worker frontmatter — S5)

| # | Event | Matcher / condition | Action | Handler |
|---|---|---|---|---|
| 1 | `PreToolUse` | `Write`/`Edit`/`MultiEdit`/`NotebookEdit` targeting a path outside `steps/<id>/` | **deny** — write confinement to the Worker's own step dir | `write-confine.ts` |
| 2 | `PreToolUse` | `Bash` running a gated consequential action (train/eval, warehouse write/DDL, expensive read) | **ask** — silent-pass when the command matches a brief pre-approval, else `ask` with question + recommendation | `gated-action.ts` |
| 3 | `SubagentStop` | finishing without (`results.md` conclusion + terminal status) **and** no `BLOCKED` halt in flight | **exit-2** — report-before-finish | `report-before-finish.ts` |

### On the Orchestrator / main session (registered in `.claude/settings.json`)

| # | Event | Matcher / condition | Action | Handler |
|---|---|---|---|---|
| 4 | `Stop` | closing while a decided-but-unrecorded Decision is pending | **exit-2** — report-decision-before-close | `report-decision-before-close.ts` |
| 5 | `PreToolUse` | a `Write`/`Edit` to a `steps/<id>/decisions/<id>.md` record outside the decision-logging skill turn | **deny** — no-unilateral-decisions | `no-unilateral.ts` |
| 6 | `SessionStart` | matchers `startup, resume, compact` | **read-only catch-up injection** (§8) — deterministic, no agent | `session-catchup.ts` |

### Best-effort / convention (NOT a hard hook)

- **independent-steps-only-in-parallel** — only independent steps (no DAG path between
  them) may be worked concurrently. Hard enforcement keys on tool signatures, which
  cannot see step independence, so this is an **Orchestrator instruction + convention**,
  not a hook (§6, [#7](https://github.com/amihaiOff/ds-copilot/issues/7) honest limit).
  It is deliberately absent from this directory and from `.claude/settings.json`.

## The session-catch-up handler (hook 6, §8)

`session-catchup.ts` is the one real piece of logic here. It is a **pure projection**
of on-disk state — there is no stored handoff file or cursor, so it can never go
stale. One mechanism serves cold start (`startup`), resume (`resume`), and
post-compaction re-grounding (`compact`). It injects exactly three things:

1. **Whole-tree structural index** — one line per step: `id | title | kind | status | parents | path`.
2. **Latest logic inlined** — the full `logic_process.md` + `results.md` of the
   **active frontier only** (the `running` steps; the DAG leaves if none are running).
   Terminal steps (`abandoned`, `dead-end`) are excluded from the frontier.
3. **Every Decision** — one line each (`- <id>: <statement>`), no rationale/supports.

Everything else is pulled on demand. Its only precondition is accurate `status`, owned
by the dispatch / record-results / capture skills.

## Binding seams (how the handlers learn their context)

These handlers are pure and stateless; the surrounding slices supply their context:

- **Worker step dir** (hooks 1, 2, 3): env `DS_STEP_DIR` (absolute) or `DS_STEP_ID`
  (resolved under `<project>/steps/<id>`), exported by `step-dispatch` (S3) when the
  Worker is spawned (S5). Hooks 1 and 3 fail **closed** / no-op with neither set.
- **Gate pre-approvals** (hook 2): `steps/<id>/gated-approvals.json` — a JSON array of
  command fragments written at dispatch. A command that `includes` any fragment
  silent-passes; otherwise it asks. This is the class-1 autonomy lever of §4.1/§4.2.
- **Decision-logging turn** (hook 5): the decision-logging skill (S2) exports
  `DS_DECISION_SKILL=1` for its turn; the hook treats that as authorisation to write a
  Decision record.
- **Pending decision** (hook 4): a marker file `<project>/.ds/pending-decision`, dropped
  when a Decision is agreed and removed by the decision-logging skill once recorded.
- **Project root** (all): env `CLAUDE_PROJECT_DIR` (set by Claude Code for hook
  commands), else the event `cwd`, else the nearest ancestor holding `steps/`/`datasets/`.

## Running

- **As a hook:** the commands in `.claude/settings.json` invoke the local `tsx` binary
  with `TSX_TSCONFIG_PATH` pointed at `ui/tsconfig.json` (so the `@shared/*` alias
  resolves) and absolute script paths, e.g.
  `TSX_TSCONFIG_PATH="$CLAUDE_PROJECT_DIR/ui/tsconfig.json" "$CLAUDE_PROJECT_DIR/ui/node_modules/.bin/tsx" "$CLAUDE_PROJECT_DIR/ui/hooks/session-catchup.ts"`.
- **By hand (dev):** from `ui/`, `npm run catchup` (i.e. `tsx hooks/session-catchup.ts`)
  — run from `ui/` so `tsx` finds `tsconfig.json` and the `@shared` alias resolves; the
  project root is auto-detected by walking up to the dir holding `steps/`.
- **Bare from the repo root:** `npx tsx ui/hooks/session-catchup.ts` works. `tsx` resolves
  its `tsconfig.json` from the current working directory, and the repo-root `tsconfig.json`
  carries the `@shared/*` -> `ui/shared/*` path mapping (with `moduleResolution: Bundler`),
  so the alias loads. You can also run it **from `ui/`** (`npm run catchup`), or point `tsx`
  at a config explicitly from anywhere:
  `TSX_TSCONFIG_PATH="$PWD/ui/tsconfig.json" npx tsx ui/hooks/session-catchup.ts`.
  The `.claude/settings.json` hook command sets `TSX_TSCONFIG_PATH` at `ui/tsconfig.json`, so
  the wired SessionStart hook works regardless of cwd.
- **Tests:** `npm test` (runs the repo suite + these hooks) or `npm run test:hooks`.

## Honest limits

- **Expensive-read gating (hook 2) is deferred.** Spec §6 hook 2 lists "expensive read"
  alongside train/eval and warehouse DDL as a gated consequential action, but
  `DEFAULT_GATED_PATTERNS` in `gated-action.ts` covers only train/eval and SQL DML/DDL.
  An expensive read has no reliable command signature — `SELECT` spans `SELECT 1` to a
  full-table warehouse scan — and cost is a property of the data/engine, not the shell
  string a tool-signature hook can inspect. Gating every read would flood the Worker with
  `ask` prompts for cheap queries. So this is left as a **spec honest-limit** (same class
  as the parallelism convention above), to be revisited if the warehouse client exposes a
  pre-flight cost/bytes-scanned estimate the hook can key on ([#8](https://github.com/amihaiOff/ds-copilot/issues/8)).
