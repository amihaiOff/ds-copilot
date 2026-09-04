"""Smoke tests for the day-one dslib seeds (spec §9).

Runs two ways, since the pinned DS stack (incl. pytest) is not required to be
installed for the seeds to be usable:

  * ``pytest dslib`` — each ``test_*`` is collected normally, or
  * ``python dslib/tests/test_dslib.py`` — the ``__main__`` block runs them all
    and exits non-zero on the first failure (the "simple __main__ smoke").

Pure-stdlib assertions only; no numpy/sklearn/pandas needed.
"""

from __future__ import annotations

import math

import dslib
from dslib import cross_validation as cv
from dslib import evaluation as ev


def test_package_exports() -> None:
    assert dslib.__version__ == "0.0.0"
    for name in ("accuracy", "roc_auc", "rmse", "train_test_split_indices"):
        assert hasattr(dslib, name), name


def test_classification_metrics() -> None:
    y_true = [1, 1, 0, 0, 1, 0]
    y_pred = [1, 0, 0, 0, 1, 1]
    assert math.isclose(ev.accuracy(y_true, y_pred), 4 / 6)
    # tp=2 fp=1 fn=1  -> precision 2/3, recall 2/3, f1 2/3
    assert math.isclose(ev.precision(y_true, y_pred), 2 / 3)
    assert math.isclose(ev.recall(y_true, y_pred), 2 / 3)
    assert math.isclose(ev.f1(y_true, y_pred), 2 / 3)


def test_roc_auc_perfect_and_ties() -> None:
    # Perfectly separable -> AUC 1.0
    assert math.isclose(ev.roc_auc([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9]), 1.0)
    # All-tied scores -> AUC 0.5 (no discrimination)
    assert math.isclose(ev.roc_auc([0, 1, 0, 1], [0.5, 0.5, 0.5, 0.5]), 0.5)


def test_regression_metrics() -> None:
    y_true = [3.0, -0.5, 2.0, 7.0]
    y_pred = [2.5, 0.0, 2.0, 8.0]
    assert math.isclose(ev.mae(y_true, y_pred), (0.5 + 0.5 + 0.0 + 1.0) / 4)
    assert math.isclose(ev.rmse(y_true, y_pred), math.sqrt(1.5 / 4))
    assert ev.r2(y_true, y_true) == 1.0


def test_train_test_split() -> None:
    train, test = cv.train_test_split_indices(10, test_size=0.2, seed=42)
    assert len(test) == 2 and len(train) == 8
    # A partition of range(10), disjoint, reproducible.
    assert sorted(train + test) == list(range(10))
    assert cv.train_test_split_indices(10, test_size=0.2, seed=42) == (train, test)


def test_kfold_covers_every_row_once() -> None:
    folds = cv.kfold_indices(10, k=3)
    seen: list[int] = []
    for train, test in folds:
        assert sorted(train + test) == list(range(10))
        assert not (set(train) & set(test))
        seen.extend(test)
    assert sorted(seen) == list(range(10))  # each row tested exactly once


def test_stratified_kfold_preserves_balance() -> None:
    labels = [0] * 6 + [1] * 6
    folds = cv.stratified_kfold_indices(labels, k=3)
    for _train, test in folds:
        classes = [labels[i] for i in test]
        assert classes.count(0) == 2 and classes.count(1) == 2


if __name__ == "__main__":
    import sys

    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"ok   {t.__name__}")
        except AssertionError as exc:  # noqa: PERF203 - smoke runner
            failed += 1
            print(f"FAIL {t.__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)
