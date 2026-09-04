"""Cross-validation & splitting — day-one shared helpers (spec §9).

The split helpers a step reaches for first: a reproducible train/test split
(the class-1 "standard train/test split (80/20)" autonomy lever, spec §4.2) and
K-fold / stratified K-fold index generators. Kept **pure stdlib** — they return
*index* lists so the caller applies them to whatever row container it holds
(list, DataFrame, parquet-backed frame), keeping ``dslib`` free of a heavy DS
dependency.

Determinism: every function takes an optional integer ``seed``. With a seed the
split is reproducible run-to-run (important for provenance — a step's result
must be re-derivable from its committed code).
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from random import Random
from typing import Hashable

__all__ = [
    "train_test_split_indices",
    "kfold_indices",
    "stratified_kfold_indices",
]


def _shuffled(n: int, seed: int | None) -> list[int]:
    idx = list(range(n))
    if seed is not None:
        Random(seed).shuffle(idx)
    return idx


def train_test_split_indices(
    n: int,
    test_size: float = 0.2,
    seed: int | None = None,
) -> tuple[list[int], list[int]]:
    """Split ``range(n)`` into ``(train_idx, test_idx)``.

    ``test_size`` is a fraction in (0, 1). With ``seed`` the assignment is a
    reproducible shuffle; without one it is a deterministic tail split. The test
    set gets ``round(n * test_size)`` rows, clamped so both sides are non-empty
    when ``n >= 2``.
    """
    if n < 0:
        raise ValueError("n must be non-negative")
    if not 0.0 < test_size < 1.0:
        raise ValueError("test_size must be in (0, 1)")
    n_test = round(n * test_size)
    if n >= 2:
        n_test = max(1, min(n - 1, n_test))
    idx = _shuffled(n, seed)
    test_idx = sorted(idx[:n_test])
    train_idx = sorted(idx[n_test:])
    return train_idx, test_idx


def kfold_indices(
    n: int,
    k: int = 5,
    shuffle: bool = False,
    seed: int | None = None,
) -> list[tuple[list[int], list[int]]]:
    """K contiguous (or shuffled) folds over ``range(n)``.

    Returns a list of ``(train_idx, test_idx)`` pairs, one per fold. The first
    ``n % k`` folds get one extra row so every row is a test row exactly once
    (matching scikit-learn's KFold fold sizing).
    """
    if k < 2:
        raise ValueError("k must be >= 2")
    if n < k:
        raise ValueError(f"n={n} must be >= k={k}")
    idx = _shuffled(n, seed) if shuffle else list(range(n))

    base, extra = divmod(n, k)
    folds: list[list[int]] = []
    start = 0
    for f in range(k):
        size = base + (1 if f < extra else 0)
        folds.append(idx[start : start + size])
        start += size

    out: list[tuple[list[int], list[int]]] = []
    for f in range(k):
        test = sorted(folds[f])
        train = sorted(i for g in range(k) if g != f for i in folds[g])
        out.append((train, test))
    return out


def stratified_kfold_indices(
    labels: Sequence[Hashable],
    k: int = 5,
    shuffle: bool = False,
    seed: int | None = None,
) -> list[tuple[list[int], list[int]]]:
    """Stratified K-fold: each fold preserves the class balance of ``labels``.

    Rows of each class are distributed round-robin across folds, so every fold's
    class proportions track the whole. Returns ``(train_idx, test_idx)`` pairs.
    """
    if k < 2:
        raise ValueError("k must be >= 2")
    n = len(labels)
    if n < k:
        raise ValueError(f"n={n} must be >= k={k}")

    by_class: dict[Hashable, list[int]] = defaultdict(list)
    for i, lbl in enumerate(labels):
        by_class[lbl].append(i)

    rng = Random(seed) if (shuffle and seed is not None) else None
    fold_members: list[list[int]] = [[] for _ in range(k)]
    for _cls, members in sorted(by_class.items(), key=lambda kv: repr(kv[0])):
        rows = list(members)
        if shuffle:
            (rng or Random()).shuffle(rows)
        for offset, row in enumerate(rows):
            fold_members[offset % k].append(row)

    smallest = min(len(m) for m in by_class.values())
    if smallest < k:
        raise ValueError(
            f"least-populated class has {smallest} rows, fewer than k={k}"
        )

    out: list[tuple[list[int], list[int]]] = []
    for f in range(k):
        test = sorted(fold_members[f])
        train = sorted(i for g in range(k) if g != f for i in fold_members[g])
        out.append((train, test))
    return out
