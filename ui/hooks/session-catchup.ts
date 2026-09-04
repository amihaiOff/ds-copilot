// Hook 6 — SessionStart session-catch-up handler (spec §6 hook 6, §8).
//
// Deterministic code, no agent in the hot path: one mechanism re-grounds a
// fresh session (`startup`), a resumed one (`resume`), and a post-compaction
// one (`compact`). It is a pure projection of on-disk state (ADR 0001) — there
// is no stored handoff file; freshness is automatic. It injects exactly three
// things (§8):
//   1. a whole-tree structural index — one line per step;
//   2. the full logic_process.md + results.md of the FRONTIER only
//      (running steps, else the DAG leaves);
//   3. every Decision as a one-line statement (no rationale/supports).
// Everything else is pulled on demand.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import matter from "gray-matter";
import {
  readState,
  computeFrontier,
  type LogicDag,
  type LogicNode,
} from "@shared/index";
import { emitSessionContext, isMain, projectRoot } from "./hook-io";

// --- section 1: whole-tree structural index ---------------------------------

/** One header line per step: id | title | kind | status | parents | path. */
export function buildStructuralIndex(dag: LogicDag, root: string): string {
  const ordered = [...dag.nodes].sort((a, b) =>
    a.created === b.created
      ? a.id.localeCompare(b.id)
      : a.created.localeCompare(b.created),
  );
  return ordered
    .map((n) => {
      const parents = n.builds_on.length > 0 ? n.builds_on.join(", ") : "—";
      const path = relative(root, n.path) || n.path;
      return `- ${n.id} | ${n.title} | ${n.kind} | ${n.status} | parents: ${parents} | ${path}`;
    })
    .join("\n");
}

// --- section 2: latest logic of the frontier only ---------------------------

function readIfExists(path: string): string | null {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8").trim();
  return text.length > 0 ? text : null;
}

/** Full logic_process.md + results.md for each frontier step, inlined. */
export function buildFrontierInline(frontier: readonly LogicNode[]): string {
  return frontier
    .map((n) => {
      const logic = readIfExists(join(n.path, "logic_process.md"));
      const results = readIfExists(join(n.path, "results.md"));
      return [
        `### ${n.id} — ${n.title} (${n.status})`,
        "",
        "#### logic_process.md",
        logic ?? "_(not written yet)_",
        "",
        "#### results.md",
        results ?? "_(not written yet)_",
      ].join("\n");
    })
    .join("\n\n");
}

// --- section 3: every decision, one line each -------------------------------

/**
 * Reduce a Decision record to its one-line statement. Prefers an explicit
 * frontmatter field (the decision-logging skill, S2, is expected to emit
 * `statement:`); falls back to the first heading, then the first body line.
 */
export function extractDecisionStatement(
  content: string,
  fallbackId: string,
): { id: string; statement: string } {
  const { data, content: body } = matter(content);
  const fm = data as Record<string, unknown>;

  const id =
    typeof fm.id === "string" && fm.id.trim() !== "" ? fm.id.trim() : fallbackId;

  const fromFrontmatter = (["statement", "choice", "decision", "title"] as const)
    .map((key) => fm[key])
    .find((v): v is string => typeof v === "string" && v.trim() !== "");

  let statement = fromFrontmatter?.trim();
  if (!statement) {
    const lines = body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const heading = lines.find((l) => l.startsWith("#"));
    statement = heading ? heading.replace(/^#+\s*/, "") : lines[0];
  }

  return {
    id,
    statement: (statement ?? "(no statement)").replace(/\s+/g, " ").trim(),
  };
}

/** Enumerate every decision record (steps/<id>/decisions/*) as `- <id>: <statement>`. */
export function collectDecisionStatements(dag: LogicDag, _root: string): string {
  const lines: string[] = [];
  for (const node of dag.nodes) {
    const decDir = join(node.path, "decisions");
    if (!existsSync(decDir)) continue;
    const files = readdirSync(decDir)
      .filter((f) => f.endsWith(".md"))
      .sort();
    for (const file of files) {
      const { id, statement } = extractDecisionStatement(
        readFileSync(join(decDir, file), "utf8"),
        file.replace(/\.md$/, ""),
      );
      lines.push(`- ${id}: ${statement}`);
    }
  }
  return lines.join("\n");
}

// --- assembly ---------------------------------------------------------------

/** Build the full catch-up context injected at SessionStart (pure; testable). */
export function buildCatchup(root: string): string {
  const { logic } = readState(root);
  const frontier = computeFrontier(logic);

  const index = buildStructuralIndex(logic, root);
  const inline = buildFrontierInline(frontier);
  const decisions = collectDecisionStatements(logic, root);

  return [
    "# Session catch-up (derived at SessionStart — no stored handoff)",
    "",
    "## Structural index — whole tree (id | title | kind | status | parents | path)",
    index || "_(no steps yet)_",
    "",
    `## Frontier logic — ${frontier.length} step(s) (running, else DAG leaves; terminals excluded)`,
    inline || "_(no active frontier)_",
    "",
    "## Decisions — every statement across the tree",
    decisions || "_(none recorded)_",
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  // SessionStart passes an event on stdin but the projection is env/cwd-driven.
  emitSessionContext(buildCatchup(projectRoot()));
}

if (isMain(import.meta.url)) {
  void main();
}
