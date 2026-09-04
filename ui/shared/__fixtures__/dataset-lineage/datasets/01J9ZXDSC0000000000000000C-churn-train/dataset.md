---
id: 01J9ZXDSC0000000000000000C-churn-train
kind: derived
derived_from:
  - 01J9ZXDSA0000000000000000A-churn-base
  - 01J9ZXDSB0000000000000000B-churn-featured
grain: one row per customer
keys:
  - customer_id
row_count: unknown
content_hash: sha256:ccc333
file_bytes: unknown
created: 2026-09-03
status: partial
---

## Columns

Multi-parent lineage: joins the featured set back onto base columns for training.
`row_count` / `file_bytes` recorded as `unknown` (§7: never omitted).
