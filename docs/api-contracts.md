---
title: RPC and host contract behavior
type: component
created: 2026-10-09
updated: 2026-10-09
status: active
confidence: medium
tags: [api, rpc, host, section-removal]
sources:
  - server.ts
  - section-remove.ts
  - move-contract.ts
  - host.ts
  - move-files.ts
  - folder-files.ts
  - session-inventory.ts
  - github-remote.ts
  - project-move.ts
  - archive.ts
---
# RPC and host contract behavior

TL;DR: The plugin RPC contract validates calls at the BB boundary, the host contract dispatches typed filesystem and metadata operations to a selected machine, and `removeSection` coordinates section, chat and file removal (`server.ts:161-220`, `move-contract.ts:10-56`, `section-remove.ts:48-79`).

## Purpose

These contracts define the inputs and outputs shared by plugin surfaces, server handlers and connected-host handlers. The main RPC registers its contract with the handler map; the host entry registers the host contract with host-local implementations (`server.ts:3540`, `host.ts:7-17`).

## How it works

1. `rpcContract` declares each RPC name with Zod input and output schemas. BB registers this contract against the server handler object; a client invokes a named operation and receives its declared output or a rejected call when validation or the handler fails (`server.ts:161-220`, `server.ts:3539-3540`).
2. BB keeps host selection outside the host payload: callers provide `{ hostId }` in call options while operation fields are validated against `moveHostContract`. The host entry maps each contract operation to one local handler (`move-contract.ts:7-10`, `host.ts:7-17`).
3. `removeSection` resolves a real folder section, then refuses concurrent chat moves, an unfinished move for this section, or any pending section archive in its project. `archive` clears its GitHub cache entry and delegates to the archive coordinator; other modes calculate section members and eligible chats (`section-remove.ts:66-92`, `section-remove.ts:71-80`).
4. For `unbind` and `purge`, it rejects a child section outside the selected subtree. Purge additionally rejects a nested BB project, a path shared by another section, a section outside its project root, or a ready environment from another project (`section-remove.ts:93-150`).
5. It selects non-archived project chats by explicit placement in the subtree or by environment path. If the path is shared, environment matching only selects chats placed directly in the removed section. A selected chat with a child outside the set or active/queued work rejects removal (`section-remove.ts:151-197`).
6. It syncs selected timelines, waits for pending exports, then processes leaf chats first. Each chat is re-read and stopped; `purge` deletes it, while `unbind` archives it. Purge then recursively removes the section directory if it exists. Finally, it clears GitHub cache entries, drops subtree rows, publishes `changed` and returns the selected mode (`section-remove.ts:199-238`).

### RPC schema branches (`server.ts:161-220`)

| Operation | Input branch | Output and handler outcome | Failure branch |
|---|---|---|---|
| `thread_move` | A target plus non-empty `threadId` | Returns path and `asked` flag; false is the default when the handler omits it (`server.ts:162-169`). | Invalid target or empty thread ID fails schema validation; move preconditions can reject in the handler. |
| `thread_section` | A `threadId` string | Returns nullable section metadata and a `pending` flag, so a thread without an environment can be retried (`server.ts:170-187`). | Wrong input shape fails validation; unresolved section data is represented by the nullable result. |
| `project_move` | `projectId`, `hostId`, and non-empty destination | Returns destination and completion state (`server.ts:189-196`). | Missing fields or empty destination fail schema validation; move ownership, activity and filesystem checks can reject the handler. |
| `pending_moves` | `null` only | Returns project IDs, host, destination and nullable error for each journal (`server.ts:197-207`). | Non-null input fails schema validation. |
| `group_create` | Tree target and trimmed name of 1–120 characters | Returns a folder-shaped group record (`server.ts:208-211`). | Blank/overlong name or invalid target fails validation; duplicate or invalid parent is rejected by the handler. |
| `group_delete` | Non-empty `folderId` | Returns `{ok:true}` after deleting an eligible empty group (`server.ts:212-215`). | Missing group, non-group ID or group with children rejects (`server.ts:2180-2192`). |
| `thread_place` | Non-empty thread/project IDs; `folderId` is a non-empty section ID or `null` for project root | Returns `{ok:true}` after saving manual tree placement (`server.ts:216-224`). | Invalid IDs or a section from another project reject at validation/handler checks. |

Schema failures reject the RPC call; output schemas constrain the values a handler can return. Handler failures remain operation-specific and are not converted to successful result objects unless the schema explicitly models that outcome (`server.ts:161-220`, `server.ts:3539-3540`). The complete route inventory is in [API and commands](api.md).

### `moveHostContract` dispatch and branches

1. A caller creates a contract client and selects a host through BB call options. The host entry receives the operation key and dispatches it to the mapped handler (`server.ts:878-880`, `project-move.ts:172-175`, `host.ts:7-17`).
2. `folder_edit` takes a parent, name, create/delete action and optional protected paths; `inspect`, `move` and `link` share absolute source/destination input and return normalized paths plus whether a move is complete (`move-contract.ts:11-42`).
3. `session_inventory` accepts its inventory query and returns configured names; `github_remotes` accepts paths and returns one path/nullable URL record per remote query (`move-contract.ts:44-55`).

| Operation | Branch result | Failure behavior |
|---|---|---|
| `folder_edit` | Create a child directory or remove an empty directory; return the resulting path (`move-contract.ts:11-19`, `folder-files.ts:3-41`). | Invalid/protected/registered paths, symlinks, non-empty deletion targets and filesystem failures reject. |
| `inspect` | Normalize source/destination and report `moved: true` when the old path is already a compatible link to destination (`move-files.ts:14-42`). | Reject unsupported OS, invalid or nested paths, symlink parents, missing/non-real source, protected roots, existing destination, cross-volume moves and linked worktrees (`move-files.ts:18-72`). |
| `move` | Re-run inspection; return immediately if already moved, otherwise rename then create an old-path compatibility link (`move-files.ts:74-91`). | If link creation fails, restore the rename only if the source path is still absent, then reject with a recovery instruction (`move-files.ts:82-89`). |
| `link` | For a folder moved outside BB, require an absent old path and existing real destination, then create a compatibility link (`move-files.ts:94-118`). | Invalid/nested paths, occupied source, non-real destination, symlink parents or symlink failure reject. |
| `session_inventory` | Return configured MCP/native plugin names from supported host configuration sources (`move-contract.ts:44-47`, `session-inventory.ts:26-97`). | Unreadable local files are treated as empty input; dispatch/handler failures reject (`session-inventory.ts:99-124`, `host.ts:7-17`). |
| `github_remotes` | Return each queried path and nullable GitHub URL (`move-contract.ts:48-55`, `github-remote.ts:1-30`). | Host dispatch or remote inspection errors reject; callers may catch them to preserve their own feature availability. |

### `removeSection` modes and failures

| Mode | Chats | Files and tree state | Result |
|---|---|---|---|
| `archive` | Delegates chat selection and archive handling to `makeArchives` | Archive coordinator journals the subtree; internal files move to project archive, external/shared files stay put; tree rows are removed at archive finalization | Returns `{ok:true, mode:"archive"}` once coordinator succeeds (`section-remove.ts:76-80`, `archive.ts:119-126`, `archive.ts:322-370`). |
| `unbind` | Syncs, stops and archives selected non-archived chats | Leaves directories in place and drops selected subtree records | Returns `{ok:true, mode:"unbind"}` (`section-remove.ts:82-102`, `section-remove.ts:199-238`). |
| `purge` | Syncs, stops and deletes selected chats | After chat deletion, recursively removes the selected section directory if present, then drops subtree records | Returns `{ok:true, mode:"purge"}` (`section-remove.ts:199-238`). |

All modes reject a missing section, group node, pending chat move, unfinished move for the section, or pending archive in the project. For non-archive modes, an out-of-subtree child section rejects. Purge also rejects nested-project ownership, shared section paths, paths outside the project root and ready foreign-project environments; unbind permits those ownership cases because it leaves files in place (`section-remove.ts:66-150`).

Selected chats include explicit placements into the member subtree or chats whose environment path lies beneath the section. Archived chats are excluded; when another section shares the path, environment matches count only if manually placed in the selected section. A child chat outside the selected set, busy status, queued work or positive activity stops the operation (`section-remove.ts:151-197`).

A sync/export, late status check, stop/delete/archive, or filesystem failure rejects the call. The function does not compensate for chat work already completed before a later failure; subtree rows are dropped only after chat processing and any purge file removal succeed (`section-remove.ts:199-238`). See [Section archive and restore](features/archive-and-restore.md) for archive record lifecycle and restore behavior.

## Business rules

- `folderId: null` means project-root placement; it does not mean “no placement” (`server.ts:216-224`).
- Host identity is selected in BB call options and is not duplicated in the `moveHostContract` operation payload (`move-contract.ts:10-55`, `host.ts:7-17`).
- Section removal preserves a shared directory for `unbind`; purge refuses a shared path (`section-remove.ts:119-150`, `section-remove.ts:222-233`).

## Public API

The plugin registers `rpcContract` on BB RPC; host operations use `moveHostContract` through BB’s host client (`server.ts:3540`, `move-contract.ts:10-56`). See [API and commands](api.md) for the operation inventory.

## Gotchas

- `thread_section` can return `pending: true` while a newly handed-off chat has no workspace yet; callers should retry instead of using a bare project label (`server.ts:181-186`).
- `move` and `link` can both return `moved: true`; callers use that result to finish metadata updates without repeating filesystem work (`move-files.ts:74-91`, `move-files.ts:94-118`).
- A failed `removeSection` call can follow successful per-chat archive/delete operations; those effects are not rolled back (`section-remove.ts:199-238`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [API and commands](api.md)
