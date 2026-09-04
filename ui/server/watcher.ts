// Watches the on-disk state tree (`steps/` + `datasets/`) and emits a "change"
// event on any filesystem mutation. This is the push half of the read-only
// projection (spec §10): the browser never polls, the server watches and pushes.
//
// The watcher owns no state model of its own — it only signals *that* something
// changed. Consumers (the SSE endpoint) re-read via the S1 read-seam, since the
// DAG is always derived, never cached (ADR 0001).
import { EventEmitter } from "node:events";
import { join } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";

/** What a watcher reports on each filesystem change. */
export interface ChangeEvent {
  /** chokidar event kind: add | change | unlink | addDir | unlinkDir. */
  kind: string;
  /** Absolute path of the file/dir that changed. */
  path: string;
}

export interface StateWatcher {
  /** Emits `"change"` (payload: {@link ChangeEvent}) and `"ready"` (no payload). */
  readonly emitter: EventEmitter;
  /** Stop watching and release resources. */
  close(): Promise<void>;
}

/**
 * Watch `<projectRoot>/steps` and `<projectRoot>/datasets` for any change.
 *
 * `ignoreInitial` is on: we only signal genuine post-startup mutations, not the
 * initial crawl. The directories need not exist yet — chokidar tolerates absent
 * paths and will pick them up once created.
 */
export function watchProject(projectRoot: string): StateWatcher {
  const emitter = new EventEmitter();
  // Many SSE clients may subscribe to one watcher; lift the default cap.
  emitter.setMaxListeners(0);

  const watcher: FSWatcher = chokidar.watch(
    [join(projectRoot, "steps"), join(projectRoot, "datasets")],
    { ignoreInitial: true, persistent: true },
  );

  const signal = (kind: ChangeEvent["kind"]) => (path: string) => {
    emitter.emit("change", { kind, path } satisfies ChangeEvent);
  };
  watcher
    .on("add", signal("add"))
    .on("change", signal("change"))
    .on("unlink", signal("unlink"))
    .on("addDir", signal("addDir"))
    .on("unlinkDir", signal("unlinkDir"))
    .on("ready", () => emitter.emit("ready"));

  return {
    emitter,
    close: () => watcher.close(),
  };
}
