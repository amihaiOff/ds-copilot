---
id: 01J9ZXDDDDDDDDDDDDDDDDDDDD-model
title: CatBoost baseline
kind: experiment
builds_on:
  - 01J9ZXBBBBBBBBBBBBBBBBBBBB-eda
  - 01J9ZXCCCCCCCCCCCCCCCCCCCC-leakage
status: running
dataset_ref: 01J9ZXDSB0000000000000000B-churn-featured
code_ref:
  entrypoint: code/main.py
  git_sha: abc1234
  dslib_sha: def5678
  data_ref: 01J9ZXDSB0000000000000000B-churn-featured
  run_log: assets/run-log.txt
created: 2026-09-03
---

## Goal

Train a CatBoost baseline building on both EDA and the leakage check
(multi-parent: this step builds on two prior conclusions).
