# ds-copilot

A local, single-user **data-science co-pilot** that augments Claude Code in-IDE.
Research is structured as a **DAG of Logic Steps** on disk (one folder per step),
with first-class **Decisions** and **Datasets**, and is projected into a
**standalone, read-only browser UI**. See [`docs/spec.md`](docs/spec.md) for the
build contract, [`CONTEXT.md`](CONTEXT.md) for the glossary, and
[`AGENTS.md`](AGENTS.md) for the conventions.

The four homes (spec §1): **files** = canonical state · **skills** = the exclusive
writer · **hooks** = hard enforcement · **browser UI** = read-only projection.
Running or instantiating a step is **conversation-only** — there is no UI action
path, and the UI never writes state.

## Prerequisites

- **Node** ≥ 18 (for the browser UI + companion server).
- **Python** ≥ 3.11 for `dslib/` and step code (the bare-system `python3` may be
  older — use a venv).
- Dependencies are installed once (`ui/` via npm, Python via a venv); see below.

## Run the browser UI (one command)

The browser UI is a read-only projection of the on-disk state under `steps/` and
`datasets/`. Production is **one process, one port**: the companion server builds
and serves the client and exposes the state API + live SSE updates.

```bash
cd ui
npm install        # first time only
npm start          # builds the client, starts the server, opens the browser
```

`npm start` runs `npm run build` (Vite build of the React client) then
`npm run server`, which serves the built client and the read-only state API at
**http://localhost:4317** and opens it in your default browser.

Environment overrides (all optional):

| Var | Default | Meaning |
|---|---|---|
| `DS_PORT` | `4317` | Port the server listens on. |
| `DS_HOST` | `127.0.0.1` | Bind host. |
| `DS_PROJECT_ROOT` | repo root | Project whose `steps/`/`datasets/` are projected. |
| `DS_OPEN` | (open) | Set to `0`/`false`/`no` to **not** open a browser (headless/dev). |

For UI development with hot reload, run the Vite dev server and the companion
server side by side instead: `npm run dev` (client) and `npm run server` (API);
the dev server proxies `/api/*` to the companion server.

### Server endpoints (read-only)

- `GET /api/state` — the parsed DAG model (Logic DAG + Dataset lineage DAG),
  re-derived from disk on every request (no cache; ADR 0001).
- `GET /api/events` — Server-Sent Events; an `update` event fires whenever
  `steps/`/`datasets/` change.

## Python shared library (`dslib/`)

`dslib/` is the shared, editable helper library step code imports (spec §9),
seeded day-one with **evaluation** and **cross-validation** helpers. It is
pure-stdlib, so it imports with no heavy DS stack:

```bash
python3.13 -m venv .venv
./.venv/bin/python -m pip install -e .        # editable install
./.venv/bin/python dslib/tests/test_dslib.py  # smoke test
```

- `dslib.evaluation` — `accuracy`, `precision`, `recall`, `f1`, `roc_auc`,
  `mae`, `mse`, `rmse`, `r2`.
- `dslib.cross_validation` — `train_test_split_indices`, `kfold_indices`,
  `stratified_kfold_indices` (index-returning, deterministic with a `seed`).

`dslib/` is written **only** by the Code Maintainer (two-use rule,
additive-forward); Workers import it freely but never edit it.

## Tests

```bash
cd ui && npm test        # Vitest: shared read-seam, server, client, hooks
```

## Status

Build phase — executing [`docs/implementation-plan.md`](docs/implementation-plan.md)
against [`docs/spec.md`](docs/spec.md). Research assets live in
`.scratch/ds-copilot/`.
