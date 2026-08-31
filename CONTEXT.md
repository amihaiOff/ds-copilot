# CONTEXT — ds-copilot glossary

The ubiquitous language for the DS co-pilot. Glossary only — no implementation
details (those live in the relevant GitHub ticket or an ADR).

## Logic Step

The atomic unit of the research logic. **One conclusion-bearing analytical move** —
a hypothesis or question that yields a finding or decision (e.g. "does truncating
renewals help?", "is there target leakage?"). It is the unit a human reasons about,
*not* a code cell or a whole notebook. Code executions and assets **attach** to a
step; they are not themselves steps.

A step is either an **Analysis** or an **Experiment** (its *kind*).

- **Analysis** — an investigative move whose output is understanding (EDA, a leakage
  check, a distribution comparison).
- **Experiment** — a move that trains/evaluates a model or a concrete intervention
  and is judged against a metric.

## Root Task

The single root of the DAG: the project framing every step ultimately descends from —
the goal, target metric, and dataset ("the task at hand"). There is exactly one.

## Dataset

A first-class, **on-disk** unit of data the research operates on. Each dataset is a
folder holding the data file(s) (v1: **parquet**) plus a **`dataset.md`** that explains
*what* is in it, *why* it was created, and *what it is derived from*. A dataset is the
grain a Logic Step reads or produces; steps reference one via `dataset_ref`. (v1 is
local parquet only — external/warehouse sources are deferred.)

A dataset is either **grounded** — an external file a human brought in, copied into its
folder and described in a data-grounding session — or **derived** — created from other
datasets by a transform. **The Orchestrator creates all datasets** (via a dataset skill,
grilling the user as needed); Workers never write outside their own step folder, so they
read datasets via `dataset_ref` but never create them. A derived dataset saves the code
that produced it in a `code/` folder inside the dataset folder.

## Dataset lineage (derived-from)

Datasets form their own DAG, separate from the Logic DAG. A **derived-from** edge means
"this dataset was produced from that one by a transform" — e.g. a base churn population,
then a child that *adds feature X* to test a metric lift, then a child that *filters to a
user subset*. Recorded in the child's `dataset.md` (the edge is owned by the child, as
with builds-on). A grounded dataset has no parent; a derived one names its parent(s) and
the transform's rationale.

## Logic DAG

The directed acyclic graph of Logic Steps. Multi-parent (hence a graph, not a tree):
a step may build on the conclusions of several prior steps.

## Builds-on edge

A parent → child edge meaning **"the child builds on / is informed by the parent's
conclusion."** The edge is **owned by the child** (a step declares its own parents).

## Brief

The **goal of a step** — the framing of what the step sets out to do. Lives in the
step's `step.md`. Distinct from the *executable sub-agent brief* (the detailed
instruction a worker runs), whose format is owned separately by the orchestration
protocol.

## Assumptions

The assumptions made in or for a step (e.g. "renewals are monthly", "nulls mean
churned"). Recorded per step.

## Logic Process

The logical process actually performed within a step — the reasoning/analysis trace,
if any. Recorded per step. Empty for a step that hasn't been run.

## Results

The outputs and **conclusion** of a step: the finding, and citations to the assets
that support it. A step's conclusion is a *finding*; a Decision is a *choice made on
the basis of findings* (see below) — they are different things.

## Decision

A **choice made on the basis of conclusions** that steers the Root Task (e.g. "we
will truncate renewals at 12 months"). Not every step yields one; one decision may
rest on several steps and assets. A first-class record with its own identity,
enumerable across the whole tree, distinct from a step's conclusion.

## Dead-end

A Logic Step that was explored and abandoned (`status: dead-end`). Kept in the DAG
for provenance; has no required children.

## Independent steps

Two steps with **no path between them** in the DAG (neither is an ancestor of the
other). Independence is the precondition for working steps **in parallel** — only
independent steps may be worked concurrently. (Enforcement is an orchestration
concern; the DAG is what *defines* independence.)

## Orchestrator

The main-conversation agent that drives the work: it dispatches steps to Workers,
relays their escalations to the human, records Decisions, and owns the human-facing
seam. The **only** party that talks to the human. It never executes a step itself —
running a step means dispatching a Worker.

## Worker

A sub-agent that executes **exactly one** Logic Step from its executable brief, in an
isolated context. Headless: it cannot prompt the human, so on any judgement call not
fixed by its brief it **halts and escalates** to the Orchestrator rather than deciding.
Writes its own step's state; sees no other step.

## Code Maintainer

A developer-oriented sub-agent dispatched by the Orchestrator **after a step completes**
whose job is DRY upkeep of the shared code: it compares the finished step's code against
the shared library and promotes reusable helpers into it. The **only** writer to the
shared library, run one-at-a-time at a quiescent point (never while sibling Workers are
executing). Additive-forward: it never rewrites already-committed steps. Distinct from a
Worker — it reasons about code interfaces, not the research analysis.
