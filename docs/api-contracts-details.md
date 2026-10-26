---
title: Contract and operation details
type: component
created: 2026-10-26
updated: 2026-10-26
status: active
confidence: medium
tags: [api, rpc, host, moves]
sources:
  - server.ts
  - move-contract.ts
  - host.ts
  - project-move.ts
  - move-files.ts
  - section-move.ts
  - section-remove.ts
  - auto-archive.ts
  - session-inventory.ts
  - archive.ts
  - folder-files.ts
  - github-remote.ts
  - repo-remote.ts
---
# Contract and operation details

TL;DR: This page traces the RPC and host contracts plus the move, removal, inventory and staleness functions that implement their less obvious branches.

## Purpose

The RPC and host contracts validate calls between plugin surfaces, the server and connected hosts; the coordinators turn those calls into persisted state and filesystem or chat operations (`server.ts:173-630`, `move-contract.ts:10-64`, `host.ts:7-19`).

## How it works

### `rpcContract`

1. `rpcContract` declares a Zod input and output schema per RPC operation. BB registers that contract with the server's handler map; contract validation and handler rejection propagate through the RPC call (`server.ts:173-240`, `server.ts:3579`).
2. The first operations model chat relocation and labels, project relocation, pending project moves, groups and manual chat placement. For example, `thread_move` requires a target plus nonempty thread ID and returns a path with `asked`; `thread_section` returns nullable section metadata with `pending`; `project_move` takes project, host and destination; `pending_moves` returns unfinished journal fields (`server.ts:174-240`).
3. The remaining contract declares tree, folder, archive, rules, execution, session-policy, preference, export and backup RPC inputs and outputs (`server.ts:241-647`).

| Schema branch | Input and result | Failure |
|---|---|---|
| Schema-valid call | Handler receives parsed input and its return value is checked against the output schema (`server.ts:173-240`, `server.ts:3579`). | Input or output validation rejects the call. |
| Modeled alternative | A schema explicitly permits a nullable field, default, or union branch, such as `thread_section.section` and `thread_move.asked` (`server.ts:174-199`). | Values outside that schema reject instead of becoming a success-shaped fallback. |
| Handler failure | Handler throws or rejects after schema validation (`server.ts:3579`). | RPC call rejects with the handler error; handlers only return a failure object where their output schema models one. |

### `moveHostContract`

1. `moveHostContract` declares seven device-side methods. The host ID is supplied in BB call options, separate from each validated payload (`move-contract.ts:10-64`, `host.ts:7-19`).
2. `host.ts` binds `folder_edit`, `inspect`, `move`, `link`, remote lookups and session inventory to handlers on the selected host (`host.ts:7-19`). Project moves inspect then move; section moves choose inspect/move for a still-present source or link for an externally renamed directory (`project-move.ts:135-139`, `project-move.ts:172-176`, `section-move.ts:254-304`).
3. Each handler validates its filesystem or metadata state, then returns the schema's paths, `moved` flag, resulting folder path, nullable remote URLs, or inventory names (`move-contract.ts:10-64`, `folder-files.ts:3-41`, `move-files.ts:14-118`, `session-inventory.ts:6-22`).

| Method branch | Condition | Result | Failure |
|---|---|---|---|
| `folder_edit:create` | Parent and name validate; destination is free | Create one child directory and return its path (`folder-files.ts:3-20`). | Invalid parent/name, existing destination or filesystem error rejects. |
| `folder_edit:delete` | Target is not protected and is an empty real directory | Remove it and return its path (`folder-files.ts:21-40`). | Protected path, symlink, non-directory, nonempty directory or filesystem error rejects. |
| `inspect` | Source is already a compatibility symlink, or a real source can move to an absent destination | Return `moved:true` for completed work or `moved:false` for eligible work (`move-files.ts:14-73`). | Invalid, nested, protected, cross-volume, occupied, linked-worktree or unsupported-platform paths reject (`move-files.ts:18-72`). |
| `move` | `inspect` reports already moved or eligible | Return the existing result, or rename the directory and create the compatibility link (`move-files.ts:74-91`). | If link creation fails, try to restore the rename when the source remains absent, then reject (`move-files.ts:82-89`). |
| `link` | Old path is absent; destination is a real directory without symlink parents | Create a compatibility symlink and return `moved:true` (`move-files.ts:96-118`). | Invalid/equal/nested paths, occupied source, invalid destination or symlink failure rejects. |
| Remote lookup | GitHub or supported-repository metadata is requested | Return one URL or `null` per path (`github-remote.ts:1-30`, `repo-remote.ts:187-198`). | Host read errors reject; the tree caller catches refresh failures (`server.ts:975-1023`). |
| `session_inventory` | Host receives nullable `cwd` | Return configured MCP/native-plugin names and source labels (`session-inventory.ts:6-22`). | Missing and malformed local files contribute no names (`session-inventory.ts:99-124`). |

There is no shared host-contract catch that converts errors to results. A rejected host handler rejects the call; filesystem recovery belongs to the specific handler (`host.ts:7-19`, `move-files.ts:74-91`).

### `makeProjectMoves`

1. The factory reads and replaces JSON records in `project_moves`. `list` exposes them, `busy` checks for an unfinished project record, and `canonical` follows completed same-host aliases for at most 100 steps (`project-move.ts:18-53`).
2. `move` rejects a concurrent call, resolves the BB project and its local-path source for the requested host, and either reuses an unfinished journal with the same host and destination or builds a candidate with the resolved destination (`project-move.ts:45-80`).
3. Preflight checks project-source overlaps, environments outside the source, pending section archives, then asks the host to inspect the paths (`project-move.ts:81-139`).
4. It pages hidden and visible threads in archived and unarchived states, 200 at a time. Active/starting/stopping/pending status, queued work or positive activity rejects before the move barrier (`project-move.ts:140-166`).
5. After preflight it persists the journal and publishes `changed`, drains pending exports, repeats the thread check while stopping eligible chats, then calls host `move` (`project-move.ts:167-176`).
6. On host success it updates the BB project source, rebases archive manifests, section paths and export paths, marks the record complete with no error, publishes `changed` and returns the journal (`project-move.ts:177-233`).
7. The catch rethrows; it stores an error only when the journal had been persisted. `finally` always clears the process-local concurrency guard (`project-move.ts:234-243`).

| Branch | Condition | Outcome or failure |
|---|---|---|
| Canonical alias | Completed journal matches host and source path | Return its destination; exceeding 100 alias steps throws (`project-move.ts:34-43`). |
| New move | No unfinished project journal | Build candidate and run ownership, environment, archive, host and chat preflight (`project-move.ts:54-166`). |
| Retry | Unfinished journal exists | Resume only with its recorded host and destination; mismatch rejects (`project-move.ts:62-80`). |
| Preflight rejection | Ownership, environment, archive, host inspection or chat check fails | Reject before inserting a new journal; if this is a retry, the catch records the failure on its existing journal (`project-move.ts:81-166`, `project-move.ts:234-240`). |
| Post-barrier failure | Export drain, thread recheck/stop, host move or metadata rebase fails | Reject and retain error for retry; earlier external effects are not rolled back (`project-move.ts:167-243`). |
| Completion | Host move and metadata update succeed | Persist `complete:true`, `error:null` and return the record (`project-move.ts:206-233`). |

### `removeSection`

1. Resolve a real section and reject a missing/group node, chat move, unfinished move for that section or pending project archive (`section-remove.ts:66-80`).
2. `archive` clears its GitHub cache entry, calls the archive coordinator and returns `{ok:true, mode:"archive"}`; this branch does not run the unbind/purge selection logic (`section-remove.ts:76-80`).
3. `unbind` and `purge` collect the section subtree and reject children outside that set. Purge also refuses nested projects, shared paths, a path outside the project root and a ready foreign-project environment (`section-remove.ts:82-150`).
4. Select non-archived chats by manual placement or matching environment. Shared paths require direct placement on the selected section. Reject selected parents with unselected children, busy status, queued work or positive activity (`section-remove.ts:151-197`).
5. Sync selected chat histories, drain pending exports, then process leaf chats first: re-read status, stop, and archive for `unbind` or delete for `purge` (`section-remove.ts:199-220`).
6. Purge removes the selected directory if present. Both non-archive modes then clear path metadata, drop subtree rows, publish `changed` and return the selected mode (`section-remove.ts:222-238`).

| Mode or failure | Outcome |
|---|---|
| `archive` | Delegates the subtree to the archive journal; archive success returns its mode (`section-remove.ts:76-80`, `archive.ts:119-126`). |
| `unbind` | Archive selected chats but leave section folders in place, then remove tree members (`section-remove.ts:199-238`). |
| `purge` | Delete selected chats and recursively remove the section directory before dropping tree members (`section-remove.ts:199-238`). |
| Busy/misowned subtree | Reject before chat processing (`section-remove.ts:71-75`, `section-remove.ts:93-150`, `section-remove.ts:179-197`). |
| Late chat or I/O failure | Reject; already-completed chat operations are not compensated and tree rows remain until finalization (`section-remove.ts:199-238`). |

### `isStale`

1. Reject archived/deleted, pinned, child, non-quiet, pending-interaction, queued or active threads before age calculation (`auto-archive.ts:97-107`).
2. Find the greatest activity time among `updatedAt`, `latestAttentionAt` and `createdAt`; absent/falsy values become zero (`auto-archive.ts:73-85`).
3. A missing activity time returns false. Otherwise return whether the captured `now` minus the last activity is at least `days * DAY_MS` (`auto-archive.ts:108-110`).

| Predicate mode | Condition | Result |
|---|---|---|
| Excluded state | Archived/deleted, pinned, child, non-idle/error thread or runtime state, pending interaction, queued work other than `none`, or positive activity | `false` (`auto-archive.ts:97-107`). |
| No timestamp | All activity timestamps resolve to zero | `false` (`auto-archive.ts:78-85`, `auto-archive.ts:108-109`). |
| Old quiet thread | Latest activity is at least the configured number of days old | `true` (`auto-archive.ts:108-110`). |
| Recent quiet thread | Latest activity is newer than the threshold | `false` (`auto-archive.ts:108-110`). |

The predicate itself does not list or archive threads. The sweep handles those calls and catches per-thread archive failures (`auto-archive.ts:142-164`).

### `sessionInventory`

1. Validate nullable `cwd`; initialize name-to-source maps for MCP servers and native plugins (`session-inventory.ts:12-28`).
2. Read global Claude MCP config and, when `cwd` exists, project Claude entries and `.mcp.json`. Add enabled Claude plugin IDs and MCP names from installed plugin manifests (`session-inventory.ts:35-70`).
3. Read Codex table headers from `$CODEX_HOME/config.toml` or the home default, then OpenCode `mcp` keys from both JSON and JSONC files in the XDG config home or its default (`session-inventory.ts:72-90`).
4. Merge duplicate names by source, sort source labels and names, and return only `mcpServers` and `nativePlugins` (`session-inventory.ts:92-96`).

| Source mode | Values collected | Failure behavior |
|---|---|---|
| Claude | Global/project MCP names and enabled plugin names plus their shipped MCP entries (`session-inventory.ts:35-70`). | Missing/unreadable files parse as empty; disabled plugins are skipped (`session-inventory.ts:56-69`, `session-inventory.ts:99-109`). |
| Codex | Names from `[mcp_servers.<name>]` and `[plugins.<name>]` headers (`session-inventory.ts:72-82`). | Missing/unreadable config is empty; non-matching lines are ignored (`session-inventory.ts:72-82`, `session-inventory.ts:99-105`). |
| OpenCode | Names under `mcp` in either config filename (`session-inventory.ts:84-90`). | Missing files are empty; invalid JSON is retried after comments and trailing commas are stripped, then treated as empty if still invalid (`session-inventory.ts:99-124`). |

## Business rules

- Host selection is supplied in BB host call options and is not part of `moveHostContract` operation payloads (`move-contract.ts:10-64`, `project-move.ts:135-139`, `project-move.ts:172-175`).
- `removeSection` keeps files for `unbind`; `purge` refuses shared paths before deleting files (`section-remove.ts:119-150`, `section-remove.ts:222-233`).
- Session inventory sends names and source labels, not local commands, URLs or secrets (`session-inventory.ts:6-22`, `session-inventory.ts:92-96`).

## Public API

The plugin registers `rpcContract` with BB RPC; the host registers `moveHostContract` methods with BB's host API (`server.ts:3579`, `host.ts:7-19`).

## Gotchas

- A project move can have successful filesystem and per-chat effects before a later failure; retry journals record errors but do not roll those effects back (`project-move.ts:167-243`).
- Section removal has the same partial-progress property when a later chat or filesystem operation rejects (`section-remove.ts:199-238`).
- `sessionInventory` is best-effort by source: one unavailable configuration file contributes no values while other sources continue (`session-inventory.ts:99-124`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [RPC and host contract behavior](api-contracts.md)
