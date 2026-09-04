// The read-seam: scan `steps/` and `datasets/`, parse each frontmatter with
// gray-matter, validate with zod, and build BOTH DAGs in memory.
//
// This is the only reader of on-disk state. There is no cache file: the graph is
// a projection rebuilt on every read (ADR 0001), which keeps parallel writers
// contention-free. builds_on / derived_from edges are owned by the child node.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import {
  StepFrontmatterSchema,
  DatasetFrontmatterSchema,
  type StepFrontmatter,
  type DatasetFrontmatter,
} from "./schema";
import {
  buildDag,
  type LogicDag,
  type LogicNode,
  type DatasetDag,
  type DatasetNode,
} from "./dag";

// --- pure parse (content → validated frontmatter + body) --------------------

export function parseStep(content: string): {
  frontmatter: StepFrontmatter;
  body: string;
} {
  const { data, content: body } = matter(content);
  return { frontmatter: StepFrontmatterSchema.parse(data), body: body.trim() };
}

export function parseDataset(content: string): {
  frontmatter: DatasetFrontmatter;
  body: string;
} {
  const { data, content: body } = matter(content);
  return { frontmatter: DatasetFrontmatterSchema.parse(data), body: body.trim() };
}

// --- fs scan (directory → DAG) ----------------------------------------------

function childDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(dir, e.name));
}

/** Scan a `steps/` directory into the Logic DAG (builds-on edges, child-owned). */
export function readLogicDag(stepsDir: string): LogicDag {
  const nodes: LogicNode[] = [];
  for (const stepPath of childDirs(stepsDir)) {
    const mdPath = join(stepPath, "step.md");
    if (!existsSync(mdPath)) continue;
    const { frontmatter, body } = parseStep(readFileSync(mdPath, "utf8"));
    nodes.push({ ...frontmatter, path: stepPath, goal: body });
  }
  return buildDag(nodes, (n) => n.builds_on);
}

/** Scan a `datasets/` directory into the Dataset lineage DAG (derived-from). */
export function readDatasetDag(datasetsDir: string): DatasetDag {
  const nodes: DatasetNode[] = [];
  for (const dsPath of childDirs(datasetsDir)) {
    const mdPath = join(dsPath, "dataset.md");
    if (!existsSync(mdPath)) continue;
    const { frontmatter, body } = parseDataset(readFileSync(mdPath, "utf8"));
    nodes.push({ ...frontmatter, path: dsPath, body });
  }
  return buildDag(nodes, (n) => n.derived_from);
}

// --- whole-project read -----------------------------------------------------

export interface ProjectState {
  logic: LogicDag;
  datasets: DatasetDag;
}

/** Read both DAGs from a project root containing `steps/` and `datasets/`. */
export function readState(projectRoot: string): ProjectState {
  return {
    logic: readLogicDag(join(projectRoot, "steps")),
    datasets: readDatasetDag(join(projectRoot, "datasets")),
  };
}
