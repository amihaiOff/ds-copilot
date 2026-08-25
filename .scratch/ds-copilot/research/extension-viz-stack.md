# DS Co-Pilot: VS Code/Cursor Extension + DAG Viz Stack

Research ticket resolution. Investigated against primary sources (VS Code Extension API
docs, Cursor docs, graph-library docs). Date: 2026-08-25.

**Bottom line:** A VS Code/Cursor extension can host a fully custom companion UI in a
**webview panel**, react to agent-written state files via **`FileSystemWatcher`**, and
read/write the workspace via **`workspace.fs`**. For an interactive multi-parent DAG viewer
with node-detail panels and distinct node states, use **React Flow (`@xyflow/react`) +
elkjs for layout**.

---

## 1. Extension basics: webview panels, custom UI, message passing

A webview panel is the mechanism for rendering arbitrary custom HTML/CSS/JS inside the
editor (it is essentially a sandboxed iframe). This is the right primitive for a bespoke
DAG UI — the standard tree/list views (`TreeDataProvider`) cannot render a graph.

- **Create:** `vscode.window.createWebviewPanel(viewType, title, ViewColumn, { enableScripts: true })`.
  For a panel embedded in the sidebar/panel area instead of an editor tab, register a
  `WebviewViewProvider` via `window.registerWebviewViewProvider` (same webview API surface).
- **Render:** assign a full HTML document string to `panel.webview.html`. It must be a
  complete document, not a fragment; reassigning it resets all script state. You can load
  bundled JS/CSS by converting on-disk URIs with `webview.asWebviewUri(...)`.
- **Message passing (the core integration point):**
  - Extension host → webview: `panel.webview.postMessage({ ... })`
  - Webview → extension host: inside the webview call `const vscode = acquireVsCodeApi()`
    **once**, then `vscode.postMessage({ ... })`
  - Extension host receives via `panel.webview.onDidReceiveMessage(msg => { ... })`
  - Messages are structured-clone JSON-ish objects.
- **CSP:** webviews are locked down; add a `Content-Security-Policy` meta tag using
  `webview.cspSource` (e.g. `script-src ${webview.cspSource}; default-src 'none';`). Scripts
  won't run without `enableScripts: true` and a matching CSP.
- **State persistence (survive hide/show and reloads):**
  - `vscode.getState()` / `vscode.setState(obj)` inside the webview (preferred, lightweight).
  - `retainContextWhenHidden: true` panel option keeps the DOM/JS alive when hidden
    (higher memory; avoids re-render). Good for a heavy DAG canvas.
  - `WebviewPanelSerializer` to restore panels across a full editor restart.

Source: https://code.visualstudio.com/api/extension-guides/webview

---

## 2. Reacting to live file state (agent rewrites state files)

- **Watcher:** `vscode.workspace.createFileSystemWatcher(globPattern, ignoreCreate?,
  ignoreChange?, ignoreDelete?)` → events `onDidCreate`, `onDidChange`, `onDidDelete`.
- **Scope / outside-workspace caveat (important):**
  - With a **string** glob pattern, VS Code only reports paths **inside** the workspace;
    events outside the workspace are ignored (it relies on the built-in workspace watcher).
  - To watch a specific folder (incl. **outside** the workspace), pass a `RelativePattern`:
    `createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file('/abs/path'), '*.json'))`.
  - Recursive vs non-recursive: a pattern containing `**` or `/` on a folder becomes a
    recursive watch (ParcelWatcher); otherwise non-recursive (Node `fs.watch`).
  - The stable API only creates "uncorrelated" watchers and cannot specify custom exclude
    rules (correlated watchers + excludes are still proposed API).
- **Self-change / feedback-loop caveat (design-critical):** `FileSystemWatcher` observes the
  OS filesystem, so writes performed by the extension *itself* also fire `onDidChange`. If
  the extension both writes state files and watches them, guard against loops (e.g. debounce,
  ignore-next-write flag, or diff-before-apply). *(High confidence from watcher semantics;
  the VS Code wiki excerpt I fetched did not state it verbatim — flagged as the one point to
  confirm empirically.)*
- **Reading/writing the workspace:** `vscode.workspace.fs` provides `readFile`,
  `writeFile`, `stat`, `readDirectory`, `createDirectory`, `delete`, `rename` (all
  `Uri`-based, `Uint8Array` payloads, async). This works across remote/virtual filesystems,
  unlike raw Node `fs`. For a **read-only viewer** you only need `readFile` + the watcher;
  for a **viewer that also writes state** use `workspace.fs.writeFile`.

Sources:
- https://code.visualstudio.com/api/references/vscode-api (workspace, FileSystemWatcher, FileSystem)
- https://github.com/microsoft/vscode/issues/136725 (outside-workspace via RelativePattern)
- https://github.com/microsoft/vscode/wiki/File-Watcher-Internals (recursive vs non-recursive)

---

## 3. Graph/DAG viz library comparison

Requirement: interactive multi-parent DAG, per-node detail panels, distinct node states
(colors/badges), running inside a webview.

| Library | Layout quality (multi-parent DAG) | Interactivity | React fit | Bundle | Effort | Notes |
|---|---|---|---|---|---|---|
| **React Flow (`@xyflow/react`)** | None built in — pair with a layout lib (dagre/elk/d3) | Excellent: pan/zoom/select/drag, custom nodes, handles, `<Panel>`/`<NodeToolbar>` | Native React | Medium (core is lean; adds React) | Low–Med | MIT. Purpose-built node UI; fully custom nodes = trivial node states + detail panels |
| **Cytoscape.js** | Good graph-theory layouts (incl. DAG via `dagre`/`elk` extensions); handles multigraphs/compound | Excellent, imperative canvas; very scalable to large graphs | Non-React (wrapper `react-cytoscapejs` exists) | Medium-large | Med | Best for large graphs/analysis; custom node HTML/detail panels are more work (canvas, not DOM) |
| **d3-dag** | **Layout only**, purpose-built for DAGs incl. multi-parent (Sugiyama/Zherebko/Grid); high-quality DAG layering | You render + wire interactivity yourself | — | Small (fraction of elkjs) | High (you build the renderer) | Great *layout engine* to feed React Flow; not a viewer |
| **elkjs** | **Layout only**, excellent for complex/multi-parent DAGs: layered layout, dynamic node sizes, sub-flows, edge routing | You render + wire yourself | — | Large (~500KB, transpiled Java) | Med (as layout for React Flow) | React Flow's own docs recommend ELK for complex/multi-parent layouts |
| **Mermaid** | Good auto-layout from text; renders static-ish diagrams | Minimal (click events only); not a true interactive canvas | Non-React | Large | Low (to render), High (to make interactive) | Best for docs/read-only diagrams; not suited to rich node-detail panels + live state |

Key facts from sources:
- React Flow ships **no layout engine**; its docs point to Dagre, D3-Hierarchy, D3-Force,
  and ELK. **Dagre** is near drop-in but has an open bug with sub-flows whose nodes connect
  outside the sub-flow. **D3-Hierarchy** requires a single root → cannot do multi-parent
  DAGs. **ELK** is explicitly recommended for complex graphs (dynamic sizes, sub-flows,
  edge routing). (https://reactflow.dev/learn/layouting/layouting)
- **d3-dag** is a dedicated multi-parent DAG layout lib, much smaller than elkjs, but is
  layout-only. (https://erikbrinkman.github.io/d3-dag/)
- Cytoscape.js is a graph-theory/analysis lib supporting directed/mixed/compound graphs and
  multigraphs; strongest when the graph is large or you need graph algorithms.

### Recommendation: React Flow (`@xyflow/react`) + elkjs

Reasoning:
1. **Custom nodes are first-class** → distinct node states (colors, icons, progress badges)
   and per-node detail panels are just React components; click a node → open a side panel via
   `postMessage` or local React state. This is the hardest part in Cytoscape/Mermaid.
2. **Interactivity out of the box** (pan/zoom/select/drag, multi-handle edges for
   multi-parent DAGs, `<Panel>`, `<MiniMap>`, `<Controls>`).
3. **Multi-parent DAG layout** solved by delegating to **elkjs** — the combination React
   Flow's own docs recommend for exactly this case. Compute ELK layout → set node positions.
4. MIT licensed, actively maintained, React-native (fits a modern webview bundle).

**Alternative:** if the DAG can grow to thousands of nodes or you need graph algorithms,
prefer **Cytoscape.js** (better raw-scale rendering) and accept more effort for detail
panels. If detail panels/interactivity are minimal and read-only, **Mermaid** is the
cheapest but is a dead end for rich state UI. Use **d3-dag** instead of elkjs only if bundle
size is critical (it's much smaller and DAG-specialized, at the cost of fewer features like
edge routing/sub-flows).

---

## 4. Cursor specifics

- Cursor is a **VS Code fork**, so it exposes the **same core extension API surface** — a
  webview + FileSystemWatcher + `workspace.fs` extension built for VS Code runs in Cursor.
- **Extension registry divergence:** as of ~June 2025 Cursor uses **Open VSX** (not the MS
  Marketplace, whose terms restrict it to Microsoft products). ~90% of popular extensions are
  cross-published; Microsoft's proprietary extensions are **not** on Open VSX, and the same
  `publisher.extension` id can resolve to a different publisher/code on Open VSX. Cursor runs
  a marketplace proxy with malware/supply-chain scanning; enterprise admins can restrict
  publishers, require signatures, and set install cooldowns.
- **Distribution implication for us:** publish the co-pilot extension to **Open VSX** (and
  optionally the VS Code Marketplace) or side-load via **VSIX**. VSIX install is the common
  fallback in Cursor. (Cursor's help page didn't explicitly document VSIX; widely reported to
  work — flagged as minor uncertainty.)
- **Proposed/private APIs:** Cursor tracks upstream VS Code, but *proposed* (unstable) APIs
  are only usable in dev and may lag or diverge. **Avoid depending on proposed API**
  (e.g. correlated file watchers with custom excludes) for the co-pilot; stick to stable API.
  *(Uncertain: exact VS Code version Cursor pins and which proposed APIs it enables — confirm
  against the target Cursor build.)*

Sources:
- https://cursor.com/help/customization/extensions
- https://www.devclass.com/development/2025/04/08/vs-code-extension-marketplace-wars-cursor-users-hit-roadblocks/
- https://news.ycombinator.com/item?id=44186246

---

## 5. Should the extension trigger agent actions, or stay a viewer + file-writer?

Both are technically possible. Nothing in the API prevents the extension from launching
processes or invoking an agent:

- The extension host is a full Node.js environment, so it *can* trigger agent steps —
  e.g. `child_process`/tasks (`vscode.tasks`), calling a CLI, or hitting an API. A webview
  button → `vscode.postMessage` → `onDidReceiveMessage` → run the step is a clean path.

**Recommendation: default to viewer + file-writer, with a thin, explicit "action" bridge.**

- Keep the DAG UI a **projection of file-based state**: the agent owns state files, the
  extension watches + renders them (single source of truth, no dual-write races).
- For triggering steps, prefer **file-based intents over direct execution**: the extension
  writes a small command/intent file (e.g. `runs/step-42.request.json`) that the agent
  process watches and acts on. This keeps the extension decoupled from the agent runtime,
  works identically in VS Code and Cursor, and avoids embedding agent orchestration in the
  UI.
- Only add **direct execution** (spawning the agent) if there is no long-running agent
  process to hand off to. If you do, guard the write/watch loop (§2) and surface progress via
  the same state files.

This keeps the extension simple, testable, and portable, while still allowing "run this step"
from the UI.

---

## Uncertainties to confirm
1. FileSystemWatcher firing on the extension's *own* writes — treat as true (OS-level watch)
   and design against loops; confirm empirically in the target editor.
2. VSIX side-loading in current Cursor builds (widely reported working; not in the help doc).
3. Exact Cursor↔VS Code API/version parity and which proposed APIs Cursor enables — pin to
   stable APIs to be safe.
