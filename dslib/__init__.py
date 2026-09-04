"""dslib — shared, editable helpers for DS co-pilot step code.

The single home for DRY hotspots across step code (spec §9). Workers import it
freely and in parallel; the Code Maintainer is its *only* writer (two-use rule,
additive-forward). Seeded with eval/CV helpers in S8.
"""

__version__ = "0.0.0"
