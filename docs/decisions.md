---
title: Decisions
type: decisions
created: 2026-09-27
updated: 2026-10-26
status: active
confidence: low
tags: [decisions, architecture, project-folders]
sources:
  - thread-move.ts
  - host.ts
  - server.ts
  - export-queue.ts
---
# Decisions

TL;DR: The recorded choices below are supported by implementation details and Git history, and include the constraints each choice creates (`thread-move.ts:16-25`, `export-queue.ts:13-45`).

## 001. Ask a chat agent to change its own directory when core cannot (active)

**Context:** The implementation records that BB has no supported plugin API for repointing an existing chat’s working directory (`thread-move.ts:16-21`).

**Decision:** Try BB’s experimental thread directory update; if it does not switch the environment, persist an `asked` move and send the chat an agent-only instruction to call `update_environment_directory` (`thread-move.ts:138-168`, `thread-move.ts:194-214`).

**Status:** active

**Consequences:** The user’s tree placement changes immediately; file storage moves after the chat turn settles. Providers without the directory tool can leave the chat in the old environment (`thread-move.ts:216-269`).

**Sources:** `thread-move.ts:16-25`, `thread-move.ts:138-168`; commit `4dc01e0a0bdeb49d48a57aec65e50ca377af102b` (composer data passed through section chats).

## 002. Queue automatic chat exports and serialize exports (active)

**Context:** Automatic exports can be triggered by repeated events; the queue tracks pending work per thread and guards one active export (`export-queue.ts:8-14`).

**Decision:** Coalesce requests with a delay, enforce a cooldown per chat, and run one export at a time. The Git commit records the load-reduction intent (`export-queue.ts:13-14`, `export-queue.ts:16-45`; commit `5460b75578a40bf0d2269dcc5cc4f01c06dea499`).

**Status:** active

**Consequences:** Burst events collapse into queued work and retries wait at least a minute after failure; manual sync remains an explicit operation (`export-queue.ts:27-45`, `server.ts:1884-1912`).

**Sources:** `export-queue.ts:1-63`, `server.ts:1884-1916`; commit `5460b75578a40bf0d2269dcc5cc4f01c06dea499`.

## 003. Expose section metadata through a separate read-only RPC (active)

**Context:** Other plugins need to discover sections without gaining access to the project-folders mutation operations; the latest release commit describes this as a discoverable `sections_list` RPC (commit `812830d9d512a883d59c6281aca590e980fedc9`).

**Decision:** Register a separate contract with optional project filtering and return only section identity, hierarchy, label, path, host and kind (`server.ts:177-192`, `server.ts:3247-3261`).

**Status:** active

**Consequences:** Other plugins can enumerate the tree through a narrow read contract; changes remain in the main plugin RPC handlers (`server.ts:194-609`, `server.ts:3247-3261`).

**Sources:** `server.ts:177-192`, `server.ts:3247-3261`; commit `812830d9d512a883d59c6281aca590e980fed6c9`.

## 004. Write BB's remembered project defaults directly until core has a setter (active)

**Context:** A chat created without an explicit provider (`bb thread spawn` without `--provider`, a new chat outside a section) starts from BB's `project_execution_defaults` row. Core writes that row only for chats created in its own composer (`origin === "app"`); section chats go through `threads.spawn` with `origin: "plugin"`, so the plugin's choice never reached BB. Plugin SDK 0.6.80 and core `main` (2026-10-25) only read the row. On 2026-10-26 project `proj_9tzjyzsumb` kept `acp-antigravity`, a provider with no bridge, and every chat spawned there without a flag failed.

**Decision:** Saving the project scope writes the project's resolved setting (its own pins, else the plugin-wide default) into BB's row in `<experimental_dataDir>/bb.db`, through the server's own better-sqlite3 build: `busy_timeout` 5000, one `INSERT … ON CONFLICT(project_id) DO UPDATE` in a `BEGIN IMMEDIATE` transaction, same as core's `upsertProjectExecutionDefaults`. The write is refused when the table lacks a column core uses, when BB has no such project, or when the provider has no live bridge on the project's machine. Sections and the plugin-wide default never write (`bb-remembered.ts`, `server.ts`).

**Status:** active, temporary — to be replaced by a core setter (`experimental_vkSetProjectExecutionDefaults` or an upstream `projects.setDefaultExecutionOptions`) that calls `upsertProjectExecutionDefaults` itself.

**Consequences:** The plugin depends on BB's table layout; a changed layout makes the write fail with a visible message instead of writing a wrong row. BB's own composer may show the old choice until it reloads its project data.

**Sources:** `bb-remembered.ts`, `server.ts` (`rememberInBb`, `bbDefaultsFor`); core `apps/server/src/services/threads/project-execution-defaults.ts`.
