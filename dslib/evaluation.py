"""Evaluation metrics — day-one shared helpers (spec §9).

The two-use rule seeds ``dslib`` with the evaluation helpers step code reaches
for first: classification and regression scorers. Kept **pure stdlib** so a
Worker can import them in any freshly-provisioned venv without a heavy DS stack
(v1 target is tabular ML, but the metrics themselves are dependency-free).

All functions take plain sequences of Python numbers (``list``/``tuple`` or any
iterable that materialises to one). They validate that inputs are non-empty and
equal length, so a mis-aligned prediction fails loudly rather than silently
scoring garbage.
"""

from __future__ import annotations

from collections.abc import Sequence
from math import sqrt
from typing import Hashable

Number = float

__all__ = [
    "accuracy",
    "confusion_counts",
    "precision",
    "recall",
    "f1",
    "mae",
    "mse",
    "rmse",
    "r2",
    "roc_auc",
]


def _as_pair(y_true: Sequence[object], y_pred: Sequence[object]) -> tuple[list[object], list[object]]:
    yt = list(y_true)
    yp = list(y_pred)
    if not yt:
        raise ValueError("y_true is empty")
    if len(yt) != len(yp):
        raise ValueError(f"length mismatch: y_true={len(yt)} y_pred={len(yp)}")
    return yt, yp


# --- classification ---------------------------------------------------------


def accuracy(y_true: Sequence[Hashable], y_pred: Sequence[Hashable]) -> float:
    """Fraction of exactly-correct predictions."""
    yt, yp = _as_pair(y_true, y_pred)
    correct = sum(1 for a, b in zip(yt, yp) if a == b)
    return correct / len(yt)


def confusion_counts(
    y_true: Sequence[Hashable],
    y_pred: Sequence[Hashable],
    positive: Hashable = 1,
) -> tuple[int, int, int, int]:
    """Binary confusion counts ``(tp, fp, tn, fn)`` for ``positive`` as the 1-class."""
    yt, yp = _as_pair(y_true, y_pred)
    tp = fp = tn = fn = 0
    for a, p in zip(yt, yp):
        a_pos = a == positive
        p_pos = p == positive
        if p_pos and a_pos:
            tp += 1
        elif p_pos and not a_pos:
            fp += 1
        elif not p_pos and not a_pos:
            tn += 1
        else:
            fn += 1
    return tp, fp, tn, fn


def precision(y_true: Sequence[Hashable], y_pred: Sequence[Hashable], positive: Hashable = 1) -> float:
    """tp / (tp + fp); 0.0 when nothing was predicted positive."""
    tp, fp, _tn, _fn = confusion_counts(y_true, y_pred, positive)
    denom = tp + fp
    return tp / denom if denom else 0.0


def recall(y_true: Sequence[Hashable], y_pred: Sequence[Hashable], positive: Hashable = 1) -> float:
    """tp / (tp + fn); 0.0 when there are no actual positives."""
    tp, _fp, _tn, fn = confusion_counts(y_true, y_pred, positive)
    denom = tp + fn
    return tp / denom if denom else 0.0


def f1(y_true: Sequence[Hashable], y_pred: Sequence[Hashable], positive: Hashable = 1) -> float:
    """Harmonic mean of precision and recall; 0.0 when both are 0."""
    p = precision(y_true, y_pred, positive)
    r = recall(y_true, y_pred, positive)
    return 2 * p * r / (p + r) if (p + r) else 0.0


def roc_auc(y_true: Sequence[Hashable], y_score: Sequence[Number], positive: Hashable = 1) -> float:
    """Binary ROC AUC via the Mann–Whitney U statistic (tie-aware rank sum).

    ``y_score`` is a continuous score for the positive class. Requires both a
    positive and a negative present, else AUC is undefined.
    """
    yt, ys = _as_pair(y_true, y_score)
    scores = [float(s) for s in ys]
    labels = [1 if a == positive else 0 for a in yt]
    n_pos = sum(labels)
    n_neg = len(labels) - n_pos
    if n_pos == 0 or n_neg == 0:
        raise ValueError("roc_auc needs both a positive and a negative sample")

    # Average ranks (1-based), ties share the mean of their rank span.
    order = sorted(range(len(scores)), key=lambda i: scores[i])
    ranks = [0.0] * len(scores)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and scores[order[j + 1]] == scores[order[i]]:
            j += 1
        avg = (i + j) / 2 + 1  # mean of 1-based ranks i+1..j+1
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1

    sum_pos_ranks = sum(r for r, lbl in zip(ranks, labels) if lbl == 1)
    u = sum_pos_ranks - n_pos * (n_pos + 1) / 2
    return u / (n_pos * n_neg)


# --- regression -------------------------------------------------------------


def mae(y_true: Sequence[Number], y_pred: Sequence[Number]) -> float:
    """Mean absolute error."""
    yt, yp = _as_pair(y_true, y_pred)
    return sum(abs(float(a) - float(b)) for a, b in zip(yt, yp)) / len(yt)


def mse(y_true: Sequence[Number], y_pred: Sequence[Number]) -> float:
    """Mean squared error."""
    yt, yp = _as_pair(y_true, y_pred)
    return sum((float(a) - float(b)) ** 2 for a, b in zip(yt, yp)) / len(yt)


def rmse(y_true: Sequence[Number], y_pred: Sequence[Number]) -> float:
    """Root mean squared error."""
    return sqrt(mse(y_true, y_pred))


def r2(y_true: Sequence[Number], y_pred: Sequence[Number]) -> float:
    """Coefficient of determination (R²). 0.0 when the target has no variance."""
    yt, yp = _as_pair(y_true, y_pred)
    ys = [float(a) for a in yt]
    mean = sum(ys) / len(ys)
    ss_tot = sum((a - mean) ** 2 for a in ys)
    ss_res = sum((a - float(b)) ** 2 for a, b in zip(ys, yp))
    return 1 - ss_res / ss_tot if ss_tot else 0.0
