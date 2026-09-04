---
id: 01J9ZX4K7Q8N2P3R4S5T6V7W8X-target-leakage-check
title: Check for target leakage in the churn features
kind: analysis
builds_on: []
status: proposed
dataset_ref: null
code_ref: null
created: 2026-09-04
---

## Goal

Determine whether any feature encodes information unavailable at prediction time
(target leakage) that would inflate offline metrics — e.g. a `last_activity_date`
recorded after the churn label is assigned.

<!-- Example fixture step (S0 scaffold). `status: proposed` = defined-not-run, so it
carries only step.md: no brief.md / results.md / code until it is dispatched (§3.2,
§4.1). It is a DAG root (`builds_on: []`). Validates the §3.2 frontmatter schema for
the S1 read-seam to parse. -->
