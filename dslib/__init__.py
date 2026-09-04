"""dslib — shared, editable helpers for DS co-pilot step code.

The single home for DRY hotspots across step code (spec §9). Workers import it
freely and in parallel; the Code Maintainer is its *only* writer (two-use rule,
additive-forward). Seeded day-one with the evaluation + cross-validation helpers
step code reaches for first (spec §9).
"""

from __future__ import annotations

from . import cross_validation, evaluation
from .cross_validation import (
    kfold_indices,
    stratified_kfold_indices,
    train_test_split_indices,
)
from .evaluation import (
    accuracy,
    confusion_counts,
    f1,
    mae,
    mse,
    precision,
    r2,
    recall,
    rmse,
    roc_auc,
)

__version__ = "0.0.0"

__all__ = [
    "evaluation",
    "cross_validation",
    # evaluation
    "accuracy",
    "confusion_counts",
    "precision",
    "recall",
    "f1",
    "roc_auc",
    "mae",
    "mse",
    "rmse",
    "r2",
    # cross-validation
    "train_test_split_indices",
    "kfold_indices",
    "stratified_kfold_indices",
]
