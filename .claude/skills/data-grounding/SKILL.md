---
name: data-grounding
description: Create a dataset folder the research can read. Use when the user points at an external parquet not under datasets/ (Mode A ground), or a new dataset must be built from existing ones by a transform (Mode B derive). Produces datasets/<id>/ + dataset.md.
---

# data-grounding

The Orchestrator's dataset creator. **The Orchestrator creates all datasets**; Workers
only ever read them via `dataset_ref`, so this skill runs in the main conversation,
never inside a Worker. It produces a folder under `datasets/` plus a `dataset.md`
(§7 schema) the S1 read-seam can parse into the dataset lineage DAG.

Every dataset is a folder `datasets/<ulid>-<slug>/` holding the data **inside it** —
external data is copied in and grilled before use, never referenced in place. Layout:

```
datasets/<ulid>-<slug>/
├── data.parquet      # canonical copy — data always lives inside its folder
├── dataset.md        # §7 schema (frontmatter + body)
└── code/             # derived datasets ONLY: the transform that built data.parquet
```

Mint the id's ULID with:
`./.venv/bin/python -c "import os,time;a='0123456789ABCDEFGHJKMNPQRSTVWXYZ';n=int(time.time()*1000)<<80|int.from_bytes(os.urandom(10),'big');print(''.join(a[(n>>(5*(25-i)))&31] for i in range(26)))"`
then a kebab-case slug from what the data is.

Pick the mode by what the user brought:

## Mode A — ground (an external parquet a human brought in)

`kind: grounded`, no parent, no `code/`.

1. **Copy the parquet in** — copy the source file to
   `datasets/<id>/data.parquet`. Copy, do not move or symlink; the folder owns the
   canonical copy (copied-in parquet is effectively immutable → no staleness).
2. **Grill against the Columns checklist** — use `/grilling` to interrogate the user
   for every body field below: each column's meaning, null convention, and pitfalls;
   the grain and keys; the business meaning; known pitfalls; open questions. A field
   you cannot settle is recorded literally as `unknown` — never omitted.
3. **Fold new terms into `CONTEXT.md`** — run `/domain-modeling` for any domain term
   the grilling surfaced, so the glossary stays the ubiquitous language.
4. **Fingerprint and write `dataset.md`** — compute the fingerprint (below) and write
   the file with `kind: grounded`, `derived_from: []`.

## Mode B — derive (built from existing dataset(s) by a transform)

`kind: derived`, one or more parents, with the generating code saved in `code/`.

1. **Write the transform** into `datasets/<id>/code/` — a `.py` script that reads the
   parent dataset(s)' `data.parquet` and writes `datasets/<id>/data.parquet`.
2. **Run it** with the venv (`./.venv/bin/python datasets/<id>/code/<script>.py`) so
   `data.parquet` actually exists before you fingerprint it.
3. **Fingerprint and write `dataset.md`** — with `kind: derived`, `derived_from` set
   to the parent id(s) (the child owns the derived-from edge, §7), and the transform's
   rationale recorded under *Why created*.

## The fingerprint

After `data.parquet` exists, compute `content_hash`, `file_bytes`, and `row_count`.
`content_hash` and `file_bytes` need only stdlib; `row_count` needs a parquet reader
(`pyarrow`), which lands with the S8 dep seeding — until then it degrades to `unknown`
(a valid §7 value), never a guess:

```
./.venv/bin/python -c "import hashlib,os;p='datasets/<id>/data.parquet';print('content_hash: sha256:'+hashlib.sha256(open(p,'rb').read()).hexdigest());print('file_bytes:',os.path.getsize(p));\
import importlib.util as u;print('row_count:',(__import__('pyarrow.parquet',fromlist=['x']).ParquetFile(p).metadata.num_rows) if u.find_spec('pyarrow') else 'unknown')"
```

## `dataset.md` (§7 schema)

Frontmatter — every field present; unknown-but-relevant ones recorded as `unknown`,
never dropped. No `produced_by`: provenance *is* `code/` + `derived_from`.

```
---
id: <ulid>-<slug>
kind: grounded | derived
derived_from: []            # parent dataset id(s); [] for grounded
grain: <one row = one ...>
keys: [<key columns>]       # or: unknown
row_count: <int>            # or: unknown
content_hash: sha256:<hex>
file_bytes: <int>           # or: unknown
created: <YYYY-MM-DD>
status: grounded | partial  # grounded = fully described; partial = open unknowns remain
---

## Columns

| name | type | meaning | null convention | pitfalls |
|------|------|---------|-----------------|----------|
| ...  | ...  | ...     | ...             | ...      |

## Grain & keys

<what one row represents; the key column(s) that identify it>

## Business meaning

<what this data is, in the domain's terms>

## Why created / transform rationale

<grounded: why it was brought in. derived: the transform + why it produces this child>

## Known pitfalls

<traps a Worker reading this must know>

## Open questions

<anything still `unknown`; empty only when status is `grounded`>
```

Set `status: partial` whenever any field or open question is still `unknown`; use
`grounded` only when the datasheet is fully settled.

## Done when

`datasets/<id>/` holds `data.parquet` (and `code/` for a derived dataset), and
`dataset.md` parses against the §7 schema: every frontmatter field present (unknowns as
`unknown`), a real fingerprint, and all six body sections filled. For derived datasets
`derived_from` names the parent(s); for grounded it is `[]`.
