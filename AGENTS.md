# DS Co-Pilot — agent guide

A **local, single-user data-science co-pilot** augmenting Claude Code in-IDE. Research is a
DAG of Logic Steps on disk, projected into a read-only browser UI. This file is the map to
the canonical docs plus the conventions no config confesses.

## Canonical references

- **The contract — [`docs/spec.md`](docs/spec.md).** Read before building anything: file
  schemas, per-skill/per-hook contracts, the brief/`code_ref`/`dataset.md` schemas, the `ui/`
  layout. Each section links the ticket holding its full rationale.
- **Glossary — [`CONTEXT.md`](CONTEXT.md).** The ubiquitous language (Logic Step, Decision,
  Dataset, Orchestrator/Worker/Code Maintainer, …). Use these terms; extend it via
  `/domain-modeling` when a new term appears.
- **Storage rationale — [`docs/adr/0001`](docs/adr/0001-per-step-storage-derived-graph.md).**
- **Build order — [`docs/implementation-plan.md`](docs/implementation-plan.md).** The build
  runs session by session; each session opens with a named skill and closes with
  `/code-review`. Check the Progress tracker before starting.

## Conventions (the gotchas config can't tell you)

- **The graph is derived, never stored.** Each writer touches only its own
  `steps/<id>/` (or `datasets/<id>/`) directory; the DAG is rebuilt by scanning `steps/`.
  This is what keeps parallel Workers contention-free (ADR 0001) — keep it that way.
- **Skills are the exclusive writers of state.** All writes to `steps/`/`datasets/` happen
  inside a skill-governed turn.
- **The browser UI is a read-only projection.** It reads and renders state; it never writes.
- **Running or instantiating a step is conversation-only** — there is no UI action path.
- **`dslib/` is written only by the Code Maintainer** (two-use rule, additive-forward).
  Workers import it freely; they never edit it.

## Tooling

- UI + tests: `ui/` (one npm package). Scripts live in [`ui/package.json`](ui/package.json)
  (`npm test` = Vitest). Shared types in `ui/shared`, imported as `@shared/*`.
- Python step code + shared lib: [`pyproject.toml`](pyproject.toml). Requires **Python 3.11+**
  (the bare-system `python3` may be older) — work in a venv: `python3.13 -m venv .venv && ./.venv/bin/python -m pip install -e .`.
