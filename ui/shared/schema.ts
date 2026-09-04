// State schemas for the DS co-pilot on-disk layout (spec §3.2 / §7 / §9).
//
// These zod schemas are the single validation gate for parsing `step.md` /
// `dataset.md` frontmatter, and the source of the exported TypeScript types.
// The read-seam (read-seam.ts) parses frontmatter with gray-matter and validates
// it here before it becomes a DAG node. No cache file is ever written — the graph
// is derived by scanning (ADR 0001).
import { z } from "zod";

// --- shared helpers ---------------------------------------------------------

// YAML (js-yaml, via gray-matter) parses `created: 2026-09-04` into a Date.
// Normalise to a `YYYY-MM-DD` string so consumers never juggle Date | string.
const DateString = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z.string().min(1),
);

// A field the data-grounding skill may record literally as `unknown`
// ("Unknown-but-relevant fields recorded as `unknown`, never omitted." — §7).
const NumberOrUnknown = z.union([z.number(), z.literal("unknown")]);

// --- status enums (§3.2) ----------------------------------------------------

// Step lifecycle: proposed → running → done | dead-end, plus proposed → abandoned.
export const STEP_STATUSES = [
  "proposed",
  "running",
  "done",
  "dead-end",
  "abandoned",
] as const;
export const StepStatusSchema = z.enum(STEP_STATUSES);
export type StepStatus = z.infer<typeof StepStatusSchema>;

// `abandoned` and `dead-end` are terminal and excluded from the frontier (§8).
export const TERMINAL_STATUSES: readonly StepStatus[] = ["abandoned", "dead-end"];

export const StepKindSchema = z.enum(["analysis", "experiment"]);
export type StepKind = z.infer<typeof StepKindSchema>;

// --- code_ref (§9) ----------------------------------------------------------

export const CodeRefSchema = z.object({
  entrypoint: z.string(),
  git_sha: z.string(),
  dslib_sha: z.string(),
  // → dataset(s) the run read; a single id or a list.
  data_ref: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  run_log: z.string(),
});
export type CodeRef = z.infer<typeof CodeRefSchema>;

// --- step.md frontmatter (§3.2) --------------------------------------------

export const StepFrontmatterSchema = z.object({
  id: z.string().min(1), // <ulid>-<slug>
  title: z.string(),
  kind: StepKindSchema,
  // builds-on parents; child-owned; empty for the root (§2, ADR 0001).
  builds_on: z.array(z.string()).default([]),
  status: StepStatusSchema,
  // a dataset id, a list of ids, or none.
  dataset_ref: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .default(null),
  code_ref: CodeRefSchema.nullable().default(null),
  created: DateString,
});
export type StepFrontmatter = z.infer<typeof StepFrontmatterSchema>;

// --- dataset.md frontmatter (§7) -------------------------------------------

export const DatasetStatusSchema = z.enum(["grounded", "partial"]);
export type DatasetStatus = z.infer<typeof DatasetStatusSchema>;

export const DatasetKindSchema = z.enum(["grounded", "derived"]);
export type DatasetKind = z.infer<typeof DatasetKindSchema>;

export const DatasetFrontmatterSchema = z.object({
  id: z.string().min(1), // <ulid>-<slug>
  kind: DatasetKindSchema,
  // derived-from parents; child-owned; empty for a grounded dataset (§7).
  derived_from: z.array(z.string()).default([]),
  grain: z.string(),
  keys: z.union([z.array(z.string()), z.literal("unknown")]),
  row_count: NumberOrUnknown,
  content_hash: z.string(),
  file_bytes: NumberOrUnknown,
  created: DateString,
  status: DatasetStatusSchema,
});
export type DatasetFrontmatter = z.infer<typeof DatasetFrontmatterSchema>;
