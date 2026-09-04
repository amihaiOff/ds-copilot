---
name: decision-logging
description: Record a first-class Decision. Use when the Orchestrator makes a choice that steers the Root Task (often after a Worker escalation) and it needs a durable record of the choice, its rationale, and the steps/assets it rests on.
---

# decision-logging

The Orchestrator's writer for first-class **Decisions** — a choice made on the basis
of conclusions that steers the Root Task (e.g. "truncate renewals at 12 months"). A
Decision is distinct from a step's conclusion (a finding): the conclusion is what the
data showed, the Decision is what we chose to do about it.

A Decision is **homed on the step** whose conclusion it most rests on, at
`steps/<home step id>/decisions/<id>.md`. The whole set is enumerable via the glob
`steps/*/decisions/*.md`. Write only that file — do not modify the home step's
`step.md` or any other step.

Do this:

1. **Mint the decision id** — `<ulid>-<slug>`, a ULID plus a kebab-case slug from the
   choice. Mint the ULID with:
   `./.venv/bin/python -c "import os,time;a='0123456789ABCDEFGHJKMNPQRSTVWXYZ';n=int(time.time()*1000)<<80|int.from_bytes(os.urandom(10),'big');print(''.join(a[(n>>(5*(25-i)))&31] for i in range(26)))"`
2. **Pick the home step** — the step whose conclusion the Decision most directly rests
   on. Its `decisions/` folder is where the record lands.
3. **Write** `steps/<home step id>/decisions/<id>.md`:

   ```
   ---
   id: <ulid>-<slug>
   choice: <the decision, one line — this is the enumerable statement>
   created: <YYYY-MM-DD>
   supports:
     - <step id or steps/<id>/assets/<file> this rests on>
   ---

   ## Rationale

   <why this choice was made, on the basis of which conclusions>

   ## Supporting evidence

   - <step id or asset path> — <what it contributes>
   ```

   List every supporting step and asset under both `supports` (frontmatter, for
   enumeration) and the Supporting evidence section (with a note on each). Set
   `created` to today.

## Done when

`steps/<home step id>/decisions/<id>.md` exists with `id`, a one-line `choice`,
`created`, and a non-empty `supports` list in frontmatter, plus the rationale and
supporting-evidence body — and it is reachable via `steps/*/decisions/*.md`.
