// Shared TypeScript types + read-seam — the state-tree / frontmatter schema and
// the DAG projection imported by both client and server (spec §10, S1 slice).
//
// - schema.ts    : zod schemas + types for step.md / dataset.md frontmatter,
//                  the status enum, code_ref (§3.2 / §7 / §9).
// - dag.ts       : Logic-DAG + Dataset-lineage-DAG node/edge model + frontier (§8).
// - read-seam.ts : scan steps/ + datasets/, parse (gray-matter) + validate (zod),
//                  build both DAGs in memory. No cache file (ADR 0001).
export * from "./schema";
export * from "./dag";
export * from "./read-seam";
