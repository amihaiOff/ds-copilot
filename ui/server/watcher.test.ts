import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { watchProject, type StateWatcher } from "./watcher";

// A minimal valid step.md so the tree mirrors real on-disk state.
const STEP_MD = [
  "---",
  "id: 01J9ZXAAAAAAAAAAAAAAAAAAAA-root",
  "title: Root",
  "kind: analysis",
  "status: proposed",
  "created: 2026-09-04",
  "---",
  "Goal.",
  "",
].join("\n");

describe("watchProject — filesystem change signalling", () => {
  let root: string;
  let watcher: StateWatcher;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ds-watch-"));
    mkdirSync(join(root, "steps"), { recursive: true });
    mkdirSync(join(root, "datasets"), { recursive: true });
  });

  afterEach(async () => {
    await watcher.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("emits a change event when a step.md appears under steps/", async () => {
    watcher = watchProject(root);
    await once(watcher.emitter, "ready");

    // Create the step dir first (fires addDir), then wait for the step.md write.
    const stepDir = join(root, "steps", "01J9ZXAAAAAAAAAAAAAAAAAAAA-root");
    mkdirSync(stepDir, { recursive: true });
    await once(watcher.emitter, "change"); // the addDir

    const fileChange = once(watcher.emitter, "change");
    writeFileSync(join(stepDir, "step.md"), STEP_MD);

    const [event] = await fileChange;
    expect(event.path).toContain("step.md");
    expect(["add", "change"]).toContain(event.kind);
  });

  it("emits a change event on a mutation under datasets/", async () => {
    watcher = watchProject(root);
    await once(watcher.emitter, "ready");

    const dsDir = join(root, "datasets", "01J9ZXDSA0000000000000000A-churn");
    mkdirSync(dsDir, { recursive: true });
    await once(watcher.emitter, "change"); // the addDir

    const fileChange = once(watcher.emitter, "change");
    writeFileSync(join(dsDir, "dataset.md"), "x");

    const [event] = await fileChange;
    expect(event.path).toContain("dataset.md");
  });
});
