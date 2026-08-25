# Claude Code Primitives for a DS Co-Pilot Design

Research ticket: establish the factual capabilities of Claude Code (running in-IDE,
VS Code / Cursor) that a data-science co-pilot design can lean on.

- **Date compiled:** 2026-08-25
- **Primary sources:** official Claude Code docs (`code.claude.com/docs`, formerly
  `docs.claude.com/en/docs/claude-code`, which now 301-redirects to `code.claude.com`)
  and the Claude Agent SDK docs. Individual page links are cited inline and collected
  at the end.
- **Confidence:** High for documented mechanisms. Anything inferred or unverified is
  flagged explicitly under "Uncertainties" in each section.

---

## 1. Task Sub-agents

Source: [Create custom subagents](https://code.claude.com/docs/en/sub-agents)

### How they are spawned / invoked
Three escalating levels of control:
1. **Automatic delegation** — Claude matches the task to a subagent's `description`
   field and delegates on its own (e.g. "Use the code-improver agent to suggest
   improvements").
2. **Explicit natural-language / @-mention** — naming the subagent in natural language
   lets Claude decide; an `@"name (agent)"` mention *guarantees* it runs.
3. **Session-wide default** — the `--agent <name>` CLI flag or the `agent` setting
   makes a named agent the default for the whole session.

Under the hood the model calls the **`Agent` tool** to spawn a subagent. Skills can
also spawn a subagent via `context: fork` (see §2).

### Background vs. parallel execution
- **Foreground** subagents block the main conversation until they finish; permission
  prompts pass straight through to you.
- **Background** subagents (the default in interactive sessions when fork mode is on)
  run **concurrently** with the main conversation. Their permission prompts surface in
  the main session, labelled by subagent; you can approve or Esc-deny each one.
- Background subagents run with a **smaller built-in tool set** than foreground ones
  (except conversation forks).
- **Parallelism is a first-class pattern**: you can fan out independent subtasks
  ("research the auth, database, and API modules in parallel") and Claude synthesises
  the results. Wall-clock time is that of the slowest, not the sum.
- **Concurrency cap:** max **20 subagents running simultaneously**, configurable via
  `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`. Exceeding it returns "Concurrent subagent
  limit reached".
- **Nesting:** subagents *can* spawn their own subagents, up to **3 layers deep** by
  default (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`). At the depth limit the `Agent` tool
  is withheld. You can also restrict which agent types a parent may spawn:
  `tools: Agent(worker, researcher), ...`.

### How a detailed brief / prompt is passed in
Each **non-fork** subagent starts with a **fresh, isolated context window** containing:
- **System prompt** = the subagent definition's markdown body.
- **Task message** = the delegation prompt Claude writes (this is where the detailed
  brief goes). This is the primary channel for passing a brief.
- **CLAUDE.md** files from every hierarchy level (Explore/Plan agents skip this).
- **Preloaded skills** — full content of any skill named in the definition's `skills`
  field is injected at startup.
- A **git-status snapshot** from parent session start; and a **sibling roster** of
  named agents for the `SendMessage` tool (v2.1.206+).

Key constraint: a subagent **does not see the main conversation history** — it only
gets what you pass in the delegation task (plus the above). Exception: a **fork**
inherits the entire parent conversation, system prompt, tools, and model.

### How results / assets / decisions return to the caller
- **Foreground:** the `Agent` tool returns the subagent's full output to Claude
  immediately.
- **Background:** results return as a **completion notification in a later turn**;
  Claude waits for it before reporting.
- **Assets** (files, edits) are written to the shared working tree, so file outputs
  persist regardless of foreground/background. (Caveat: a *backgrounded forked skill*
  applies edits outside session checkpoints, so `/rewind` won't undo them — use git.)
- **Resumption / continued dialogue:** completed subagents retain full history and can
  be resumed. Claude uses the **`SendMessage`** tool with the agent's ID/name; a
  completed subagent that receives a `SendMessage` **auto-resumes in the background**.
- **Safety:** subagent output is **scanned for instruction-like patterns** before
  Claude reads it. Subagents **cannot** change permission settings or CLAUDE.md, and
  **cannot** use `AskUserQuestion` (they can't prompt the user directly).

### Custom agent types
Defined as **Markdown files with YAML frontmatter**. Location determines scope/priority
(highest → lowest): managed settings (org) → `--agents` CLI flag → `.claude/agents/`
(project) → `~/.claude/agents/` (user) → plugin `agents/` dir.

Required frontmatter: `name`, `description`. Optional (selected):
`tools` (allowlist) / `disallowedTools` (denylist), `model`
(`sonnet|opus|haiku|fable|inherit`), `permissionMode`, `maxTurns`, `skills` (preload),
`memory` (`user|project|local` — persistent cross-session agent memory via a
`MEMORY.md`), `background`, `isolation: worktree` (run in an isolated git worktree),
`effort`, `mcpServers`, and per-agent `hooks`.

Tools auto-removed from all subagents: `AskUserQuestion`, `EndConversation`,
`EnterPlanMode`/`ExitPlanMode`, `ScheduleWakeup`, `TaskOutput`, `WaitForMcpServers`,
`Workflow`, and `Agent` at the depth limit.

Programmatic alternative: the Agent SDK accepts subagents via an `agents` option in
`query()` instead of files
([SDK subagents](https://docs.claude.com/en/docs/agent-sdk/subagents)).

### DS co-pilot relevance
- A "planner" main agent can dispatch specialised workers (EDA, feature-eng,
  model-eval) in parallel, each tool-restricted, each with tailored system prompts.
- `isolation: worktree` lets a subagent try an approach on an isolated copy of the repo.
- Per-agent `memory` gives a worker persistent learnings across sessions.
- Decisions come back either as the `Agent` tool result or via `SendMessage` follow-ups;
  there is no separate structured "decision log" primitive — enforce that with a hook or
  a required output convention (see §3).

---

## 2. Skills

Source: [Extend Claude with skills](https://code.claude.com/docs/en/skills)

### How defined
A skill is a directory containing a **`SKILL.md`** (YAML frontmatter + markdown body),
optionally plus supporting files (reference docs, scripts). Only `description` is
"recommended"; all fields are optional. The body loads **only when the skill is used**,
so long reference material is nearly free until needed (progressive disclosure).
Skills follow the open [Agent Skills](https://agentskills.io) standard, with
Claude-Code-specific extensions.

Note: custom slash commands have been **merged into skills** —
`.claude/commands/deploy.md` and `.claude/skills/deploy/SKILL.md` both create `/deploy`.

### Where they live (scope)
| Location   | Path                                     | Applies to        |
|------------|------------------------------------------|-------------------|
| Enterprise | managed-settings `.claude/skills/`       | whole org         |
| Personal   | `~/.claude/skills/<name>/SKILL.md`       | all your projects |
| Project    | `.claude/skills/<name>/SKILL.md`         | this project      |
| Plugin     | `<plugin>/skills/<name>/SKILL.md`        | where plugin enabled |

Conflict resolution: enterprise > personal > project; any level overrides a bundled
skill of the same name; plugin skills are namespaced `plugin:skill`.

### How invoked
- **User-invoked:** type `/skill-name` (also works in headless `-p` mode — Claude Code
  expands the `/name` before running).
- **Model-invoked:** Claude loads a skill automatically when the prompt matches its
  `description`. In a normal session, skill *descriptions* are always in context;
  full body loads on invocation.
- Invocation control fields: `disable-model-invocation: true` (only the user can
  trigger — good for side-effectful actions like deploy), `user-invocable: false`
  (only Claude can trigger — background knowledge), `paths:` globs (auto-load only when
  working on matching files).
- Arguments: `$ARGUMENTS`, `$ARGUMENTS[N]` / `$N`, named `arguments`. You can **stack**
  up to ~6 skills at the start of one message.

### Directory-scoped / nested skills (confirmed)
Skills also load from **nested `.claude/skills/` directories** below the working dir.
They are **not** loaded at startup — a nested skill becomes available the first time
Claude reads/edits a file in that subdirectory (then stays available for the session).
Project skills from the start dir **up to the repo root** load at startup; a subdir
skill loads on demand.

When a nested skill's name clashes with a root one, **both stay available**: the nested
one gets a directory-qualified name (e.g. `apps/web:deploy`), its description says which
directory it applies to, and Claude picks the variant matching the files it's working
on. Invoking the **unqualified** name loads the root skill and appends a list of the
qualified variants with an instruction to also invoke any whose directory holds the
files in play — so a nested skill still applies to work in its directory. Explicit:
`/apps/web:deploy`.

### Driving a multi-step workflow
Several mechanisms make a skill a workflow engine:
- **Task content**: the body is step-by-step instructions ("1. run tests, 2. build,
  3. deploy…"). Content persists in context for the rest of the session (skill content
  lifecycle), acting as standing instructions.
- **Bundled scripts / supporting files**: `scripts/helper.py` etc. are *executed, not
  loaded*; extra `.md` files load only when referenced. Keeps `SKILL.md` lean.
- **Dynamic context injection**: `` !`command` `` (inline) or ` ```! ` fenced blocks
  run shell commands *before* the skill reaches Claude and inline their output, so the
  prompt arrives grounded in live data (e.g. `!`git diff HEAD``). Can be disabled with
  `disableSkillShellExecution`.
- **`context: fork`**: run the whole skill in its **own subagent context** (skill body
  becomes the subagent's prompt). Optional `agent:` picks the agent type (`Explore`,
  `Plan`, `general-purpose`, or a custom one). Runs in the background by default;
  `background: false` waits inline (and always waits in `-p`/SDK mode).
- **Pre-approved tools**: `allowed-tools` grants specified tools without prompting for
  the invoking turn (grant clears on your next message); `disallowed-tools` removes
  tools while active.
- **Registering hooks**: a skill's `hooks` frontmatter can register hooks that persist
  for the rest of the session — lets a skill install enforcement when invoked (see §3).
- Substitutions like `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PROJECT_DIR}`,
  `${CLAUDE_SESSION_ID}` help scripts resolve paths and log per session.

### DS co-pilot relevance
A DS workflow ("load data → profile → clean → feature-eng → train → evaluate → report")
maps cleanly to a task skill with bundled Python scripts, `!` injection to pull live
dataset stats into the prompt, and `context: fork` to offload heavy steps to a subagent.
Directory-scoped skills let a monorepo (e.g. per-dataset or per-model package) carry its
own conventions.

---

## 3. Hooks

Source: [Hooks reference](https://code.claude.com/docs/en/hooks) and
[Automate actions with hooks](https://code.claude.com/docs/en/hooks-guide)

### Hook events (what fires when, and whether it can block)
| Event | Fires | Can block? |
|-------|-------|-----------|
| **PreToolUse** | before a tool call | **Yes** — deny/ask, or exit 2; can modify tool input (`updatedInput`) |
| **PostToolUse** | after a tool succeeds | No (tool already ran); can inject context |
| **PostToolUseFailure** | after a tool fails | No; can suggest remediation |
| **PermissionRequest** | when a call needs a permission decision | via `decision` allow/deny (exit 2 not honoured) |
| **PermissionDenied** | when auto mode denies a call | can set `retry: true` |
| **UserPromptSubmit** | on prompt submit, before processing | **Yes** (exit 2 erases prompt); can inject `additionalContext`/`systemMessage` |
| **UserPromptExpansion** | when a `/command` expands | **Yes** — can block/modify expansion |
| **Stop** | when Claude finishes responding | **Yes** — exit 2 *prevents stopping* and continues the conversation |
| **SubagentStop** | when a subagent finishes | **Yes** — prevents subagent stopping |
| **SessionStart** | session begins/resumes (matchers: startup/resume/clear/compact/fork) | No |
| **SessionEnd** | session terminates | No |
| **Notification** | when Claude Code notifies (permission_prompt, idle, agent_needs_input, …) | No |
| **PreCompact** / **PostCompact** | before/after context compaction | PreCompact can block |
| **TaskCreated** / **TaskCompleted** | task lifecycle | Yes — can block creation / prevent premature completion |
| **InstructionsLoaded** | (referenced) logs which instruction files loaded | — |

Note: `PreToolUse`/`PostToolUse` fire on **every** tool call in the agentic loop.
`Stop` fires whenever Claude finishes responding (not only at task completion) and does
**not** fire on user interrupts.

### How a hook blocks / steers
- **Command hooks** read event JSON on stdin, and: **exit 2** to block (stderr is fed
  back to Claude); exit 0 to proceed; or print structured JSON.
- **JSON decision output** (`hookSpecificOutput`): `permissionDecision`
  (`allow|deny|ask`) + `permissionDecisionReason` (PreToolUse); `decision`
  (PermissionRequest); `additionalContext` (extra info Claude reads); `systemMessage`
  (message shown to user); `updatedInput` (rewrite tool input).
- Hook handlers can be **shell commands, HTTP endpoints, LLM prompts, or agents**;
  `"async": true` runs them non-blocking.
- Config lives in `settings.json` under `hooks` with a `matcher` (e.g. `"Bash"`).
  Managed/org hooks can't be disabled by `disableAllHooks`.

### Can a hook enforce policy like "must report decisions / don't decide unilaterally"?
**Partially, and this is the important nuance.** Docs are explicit that CLAUDE.md/memory
are *context, not enforced configuration* — "To block an action regardless of what
Claude decides, use a PreToolUse hook instead." So:
- **Hard prevention** is reliable: a `PreToolUse` hook can **deny** categories of action
  (e.g. block running a training job, block a `DROP TABLE`, block writing outside a dir)
  and feed the reason back — this deterministically stops Claude from acting
  unilaterally on gated actions.
- **"Must report decisions"** can be *nudged/gated* but not perfectly guaranteed by
  hooks alone:
  - A `Stop` hook can inspect Claude's `last_assistant_message` and, if it doesn't
    contain a required decision summary, **exit 2 to prevent stopping** and push Claude
    to continue (effectively "you're not done until you've reported").
  - A `PreToolUse` hook can deny a consequential tool until a prior "log decision" step
    ran (you'd track state yourself).
  - `UserPromptSubmit` / `PostToolUse` `additionalContext` can inject reminders to keep
    the conversation focused, but injected context is guidance, not enforcement.
- **Keeping a conversation focused**: `UserPromptSubmit` can inject guardrail context or
  even block/erase off-scope prompts (exit 2). This is the most direct focus lever.

Bottom line for the co-pilot: use **PreToolUse deny** for "don't decide unilaterally"
on specific irreversible actions, and **Stop / SubagentStop exit-2** to enforce a
"report before finishing" gate. Full free-form policy ("always explain your reasoning")
is best-effort via injected context, not hard-enforceable.

---

## 4. Headless / Programmatic Invocation, and the IDE Extension

### Headless / programmatic (CLI + Agent SDK)
Source: [Run Claude Code programmatically](https://code.claude.com/docs/en/headless),
[Agent SDK overview](https://docs.claude.com/en/api/agent-sdk/overview)

- **`claude -p "<prompt>"` (`--print`)** runs non-interactively. Same agent loop, tools,
  and context management as interactive Claude Code.
- **Output formats:** `--output-format text|json|stream-json`. `json` includes
  `session_id`, usage, and `total_cost_usd`. **`--json-schema`** yields validated
  structured output in a `structured_output` field. `stream-json` (with `--verbose`
  `--include-partial-messages`) streams NDJSON events, ending with a `result` message.
- **Subagent visibility in stream:** subagent messages carry `parent_tool_use_id`;
  `--forward-subagent-text` / `CLAUDE_CODE_FORWARD_SUBAGENT_TEXT` also forwards subagent
  text/thinking at every nesting depth.
- **Session continuity:** `--continue` (most recent) and `--resume <session_id>`
  (specific). Session IDs are findable across directories/projects on the machine.
- **Permissioning for automation:** `--allowedTools "Bash,Read,Edit"` (permission-rule
  syntax, prefix matching), and permission modes `--permission-mode
  auto|dontAsk|acceptEdits|plan`. Default starting mode for `-p` is Manual.
- **System prompt injection:** `--append-system-prompt` / `--system-prompt`.
- **`--bare`** skips auto-discovery (hooks, skills, subagents, plugins, MCP, memory,
  CLAUDE.md) for reproducible CI; recommended for scripted/SDK calls and will become the
  `-p` default. In bare mode set `ANTHROPIC_API_KEY` (no OAuth/keychain).
- **Input:** reads stdin (pipe data in; 10 MB cap). Background subagents/workflows are
  awaited (cap 10 min by default, `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS`).
- **Skills/commands work in `-p`**: include `/skill-name` in the prompt string.
- **SDKs:** Python and TypeScript packages give full programmatic control (structured
  outputs, tool-approval callbacks, native message objects, `interrupt()`). Usable in
  GitHub Actions / GitLab CI.

### VS Code / Cursor extension — can it trigger actions, or is it read-only?
Source: [Use Claude Code in VS Code](https://code.claude.com/docs/en/vs-code)

**It is a full interactive interface that CAN trigger and perform actions — NOT
read-only over files.** The VS Code extension provides a native GUI for Claude Code
that:
- Makes **inline edits / code changes** shown as inline diffs in the editor.
- Supports **permission modes** switched from the prompt box (Auto = classifier reviews
  most actions; Manual = ask before edits/most shell commands; Plan = describe-then-
  approve). On Pro/Max/Team, Auto is the default starting mode.
- Supports **checkpoints / rewind / fork** of conversations and code state.
- Supports `@`-mentions of files with line ranges, plan review before accepting,
  auto-accept edits, conversation history, and multiple conversation tabs/windows.
- The CLI **auto-integrates with the IDE** for diff viewing and diagnostic sharing.

So the extension can run Claude Code actions end-to-end (edits, shell, tools), governed
by the permission system — exactly what a co-pilot needs. It is not restricted to
read-only file access.

**Cursor:** Cursor is a VS Code-compatible fork. Anthropic documents "IDE integrations"
generally and the VS Code extension specifically; the same extension model targets
VS Code-based editors. *Uncertain:* I did not fetch a Cursor-specific page to confirm
the exact current install path/feature parity — flag for verification if Cursor is a
hard requirement.

---

## 5. Context / Session / Memory (session hand-off)

Source: [How Claude remembers your project](https://code.claude.com/docs/en/memory),
[Sessions](https://docs.claude.com/en/docs/agent-sdk/sessions)

Every session starts with a **fresh context window**. Two persistence mechanisms carry
knowledge across sessions, **both loaded at the start of every conversation, and both
treated as context, NOT enforced configuration** (to hard-enforce, use a hook — §3).

### CLAUDE.md (author-written instructions)
- **Hierarchy (broad → specific, later overrides in ordering):** managed policy
  (`/Library/Application Support/ClaudeCode/CLAUDE.md`, `/etc/claude-code/CLAUDE.md`,
  `C:\Program Files\ClaudeCode\CLAUDE.md`) → user (`~/.claude/CLAUDE.md`) → project
  (`./CLAUDE.md` or `./.claude/CLAUDE.md`) → local (`./CLAUDE.local.md`, gitignored).
- All discovered files are **concatenated** (root-down ordering); subdirectory
  CLAUDE.md files load **on demand** when Claude reads files there.
- **Imports:** `@path/to/file` syntax, relative or absolute, recursive up to 4 hops;
  external imports prompt an approval dialog.
- **`.claude/rules/`**: modular rule files, optionally **path-scoped** via `paths:`
  frontmatter globs (load only when matching files are touched) — a way to keep DS
  conventions scoped to e.g. `notebooks/**` or `src/models/**`.
- Guidance: keep under ~200 lines; >4 MiB is skipped. `/init` generates a starter.
- Managed `claudeMd` key and `claudeMdExcludes` for org control / monorepo hygiene.
- CLAUDE.md is delivered as a **user message after the system prompt** — no strict
  compliance guarantee. Project-root CLAUDE.md **survives `/compact`** (re-read from
  disk); nested/path-scoped rules reload when relevant files are next read.
- Claude Code reads **CLAUDE.md, not AGENTS.md** — import or symlink AGENTS.md if needed.

### Auto memory (Claude-written learnings)
- On by default (`autoMemoryEnabled`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` to disable).
- Stores four note types in frontmatter `type`: `user` (role/preferences), `feedback`
  (corrections you gave), `project` (ongoing work, deadlines, decisions not derivable
  from code/git), `reference` (where to find external info). Skips anything derivable
  from the codebase or already in CLAUDE.md.
- **Storage:** `~/.claude/projects/<project>/memory/` with a `MEMORY.md` index + one
  topic file per memory. Keyed off the git repo, so all worktrees/subdirs share it.
  Machine-local; not synced across machines/cloud. `autoMemoryDirectory` overrides path.
- **Loaded per session:** first **200 lines / 25 KB of `MEMORY.md`** only; topic files
  read on demand. Excluded from the transcript retention sweep.
- Subagents do **not** inherit the main conversation's auto memory (except forks);
  subagents can have their **own** memory via the `memory` field (§1).

### Session state / hand-off between sessions
- Sessions are **written to disk automatically**; each contains the prompt, every tool
  call, every tool result, and every response.
- **Resume:** `--continue` (latest) or `--resume <session_id>` (specific); the SDK
  supports resuming by session ID with full context. Findable across directories on the
  same machine.
- `/context` shows what actually loaded (Memory files, skills, etc.); `/memory` browses
  and edits memory/CLAUDE.md files.
- **Compaction:** auto-compaction summarises when context fills; invoked skills are
  re-attached within a token budget (first 5 KB each, 25 KB combined). `PreCompact` /
  `PostCompact` hooks available.

### DS co-pilot relevance / hand-off pattern
For handing off a DS investigation between sessions there is **no single dedicated
"state file" primitive** beyond these — the practical toolkit is:
1. **CLAUDE.md / `.claude/rules/`** for durable, author-controlled conventions and the
   project's "always do X" rules (path-scoped rules for notebook vs. pipeline code).
2. **Auto memory** for accumulated decisions/preferences the model records itself
   (note: it's a *summary index*, not a full experiment log; and it's machine-local).
3. **Session resume** (`--resume`/`--continue`) to literally continue a prior
   conversation with full context.
4. For a **structured, git-shareable decision/experiment log** (which the primitives do
   NOT provide out of the box), the design should define its own convention — e.g. a
   committed `DECISIONS.md` / run artifacts — and use a **skill** to append to it and a
   **hook** (Stop/PreToolUse) to enforce that it's updated before finishing. This is the
   recommended way to get "handoff state" reliability given memory is context-only.

---

## Cross-cutting caveats for the design
- **Context ≠ enforcement.** CLAUDE.md and memory guide but don't guarantee behavior.
  Anything that MUST happen (report a decision, never run X unilaterally, stay in scope)
  belongs in a **PreToolUse / Stop / UserPromptSubmit hook**, not just prose.
- **Subagents are isolated.** They don't see prior main-conversation history; pass the
  full brief in the delegation task or via preloaded skills. Results return via the
  Agent tool result or `SendMessage`.
- **Background work returns asynchronously** (later-turn notification); assets land in
  the working tree; forked-skill background edits bypass `/rewind`.
- **Structured outputs** for programmatic callers via `--output-format json
  --json-schema` — useful if the IDE extension host wants machine-readable results.

## Uncertainties / not fully confirmed
- **Cursor specifics:** confirmed the VS Code extension is action-capable (not read-only);
  did not fetch a Cursor-dedicated page for exact parity/install path. Verify if Cursor
  is a hard target.
- **"Must report decisions" enforcement** via `Stop` hook is inferred from documented
  `Stop` exit-2 "prevent stopping" behavior + `last_assistant_message` inspection; the
  docs show the mechanism but not this exact use case. Reliable for gating completion,
  but content-quality checks would need your own logic.
- Exact behavior of some very recent version-gated features (v2.1.2xx) may drift; version
  numbers are quoted from the docs as of the compile date.

## Sources
- Subagents: https://code.claude.com/docs/en/sub-agents
- SDK subagents: https://docs.claude.com/en/docs/agent-sdk/subagents
- Skills: https://code.claude.com/docs/en/skills ; standard: https://agentskills.io
- Hooks reference: https://code.claude.com/docs/en/hooks
- Hooks guide: https://code.claude.com/docs/en/hooks-guide
- Headless / programmatic: https://code.claude.com/docs/en/headless
- Agent SDK overview: https://docs.claude.com/en/api/agent-sdk/overview
- CLI reference: https://code.claude.com/docs/en/cli-reference
- VS Code / IDE: https://code.claude.com/docs/en/vs-code
- Memory & CLAUDE.md: https://code.claude.com/docs/en/memory
- Sessions: https://docs.claude.com/en/docs/agent-sdk/sessions
