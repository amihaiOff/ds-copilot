# 1. Per-step storage with a derived graph (no central manifest)

Date: 2026-08-26
Status: Accepted
Ticket: [#2 Core domain & on-disk state model](https://github.com/amihaiOff/ds-copilot/issues/2)

## Context

The DS co-pilot tracks research logic as a DAG of Logic Steps on disk: the agent
(and parallel sub-agents) write it, the extension reads it. Research (#3) established
that Claude Code can run up to ~20 sub-agents concurrently, and that only
**independent** steps (no path between them in the DAG) should be worked in parallel.

The state must therefore survive **parallel writers** and stay cheap for the
extension to read and render.

Two shapes were considered:

- **Central manifest** — one `graph.json`/`yaml` holding the whole DAG and records.
  Cheapest for the extension to read, but a **single write hotspot**: concurrent
  sub-agents editing the same file collide and force merges.
- **Per-step storage, derived graph** — each step is its own directory owning its
  metadata and `parents[]`; the DAG is a *projection* the extension rebuilds by
  scanning `steps/`. No shared mutable structure file.

## Decision

Use **per-step storage with a derived graph**. There is **no central manifest**.

- Each step lives in `steps/<ulid>-<slug>/`, owning its own record.
- The `builds-on` edge is stored on the **child** (`parents: [ids]` in its
  frontmatter), so creating a step touches only that step's directory.
- The extension globs `steps/` and rebuilds the DAG in memory (trivial for hundreds
  of nodes).
- Asset and decision records are likewise homed inside their producing step's
  directory (`assets/`, `decisions/<id>.md`).

## Consequences

- **Contention-free parallel writes:** each writer touches only its own directory —
  no shared file to merge. This is the primary driver.
- **One source of truth per fact:** a fact lives in exactly one place; nothing is
  duplicated between a manifest and a detail file.
- **Read cost moves to the extension:** it must scan and rebuild the graph rather
  than read one file. Cheap at this scale; revisit only if step counts reach a point
  where a scan is noticeably slow (then an extension-owned *cache*, never a
  hand-authored manifest, would be the fix).
- **Cross-tree queries are globs:** "all decisions and their evidence" is a glob over
  `steps/*/decisions/*`, not a lookup in one index.
