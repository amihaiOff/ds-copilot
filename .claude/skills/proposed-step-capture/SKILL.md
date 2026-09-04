---
name: proposed-step-capture
description: Capture, edit, or abandon a proposed Logic Step. Use when the user says "capture" a step / proposal, wants to change a proposed step's fields or goal, or wants to abandon (drop) a proposed step that never ran.
---

# proposed-step-capture

The Orchestrator's writer for `proposed` Logic Steps. It mints a minimal node the
S1 read-seam can parse, and later edits or abandons it. **Every field is confirmed
with the user before any write** — a mis-set `builds_on` silently corrupts
child-owned lineage, so inference is a draft, never a commit.

Writes only under `steps/<id>/`. Never touches another step, never writes a
`brief.md` (that is `step-dispatch`'s job at run time), never deletes anything.

Three branches — pick by what the user asked:

## Capture (new proposed node)

1. **Infer a draft**, do not write yet:
   - `id` — `<ulid>-<slug>`: mint a ULID, then a kebab-case slug from the title.
     Mint the ULID with:
     `./.venv/bin/python -c "import os,time;a='0123456789ABCDEFGHJKMNPQRSTVWXYZ';n=int(time.time()*1000)<<80|int.from_bytes(os.urandom(10),'big');print(''.join(a[(n>>(5*(25-i)))&31] for i in range(26)))"`
   - `title` — a short noun phrase naming the move.
   - `kind` — `analysis` (output is understanding) or `experiment` (trains/evaluates against a metric).
   - `builds_on` — the parent step id(s) whose conclusions this builds on; `[]` for the Root Task.
   - `dataset_ref` — the dataset id(s) it reads, or `null` if not yet known.
   - `goal` — one paragraph: what the step sets out to conclude.
2. **Confirm every field with the user** (`AskUserQuestion`), presenting the draft
   for each of `title`, `kind`, `builds_on`, `dataset_ref`, and `goal`. Apply their
   corrections. Do not proceed until the user has confirmed the set.
3. **Write** `steps/<id>/step.md` — frontmatter plus a `## Goal` section, **no brief**:

   ```
   ---
   id: <ulid>-<slug>
   title: <title>
   kind: analysis
   builds_on:
     - <parent id>
   status: proposed
   dataset_ref: <id | [ids] | null>
   code_ref: null
   created: <YYYY-MM-DD>
   ---

   ## Goal

   <goal paragraph>
   ```

   For a step with no parent, write `builds_on: []`. Set `created` to today.

Capturing several proposals at once runs this branch once per node.

## Edit (change a proposed node)

Only `proposed` nodes are editable here — a `running` or terminal step is not.
Confirm each changed field with the user, then rewrite `steps/<id>/step.md` with the
new values. `id` and `created` never change; changing the title does **not** re-mint
the id (the folder and id are stable once written).

## Abandon (drop a proposed node)

Set `status: abandoned` in `steps/<id>/step.md` and leave everything else intact.
Abandon **never deletes** the folder — the node stays for provenance, terminal, and
excluded from the frontier. Abandon applies only to a `proposed` step (a step that
ran and failed is `dead-end`, recorded by `record-results`, not abandoned here).

## Done when

`steps/<id>/step.md` exists (or is updated) with valid frontmatter: `id`, `title`,
`kind`, `builds_on`, `status`, `dataset_ref`, `code_ref: null`, `created`, followed by
the `## Goal` body — and every field was confirmed by the user before the write.
