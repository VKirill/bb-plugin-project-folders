---
title: RPC and host contract behavior
type: component
created: 2026-10-09
updated: 2026-10-19
status: active
confidence: high
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
  - repo-remote.ts
  - project-move.ts
  - archive.ts
  - section-move.ts
  - auto-archive.ts
---
# RPC and host contract behavior

TL;DR: The plugin RPC contract validates calls at the BB boundary, the host contract dispatches typed filesystem and metadata operations to a selected machine, and `removeSection` coordinates section, chat and file removal (`server.ts:173-240`, `move-contract.ts:10-63`, `section-remove.ts:48-79`).

## Purpose

These contracts define the inputs and outputs shared by plugin surfaces, server handlers and connected-host handlers. The main RPC registers its contract with the server handler map. The host entry supplies `moveHostContract` as its schema and binds each declared operation to a host-local handler (`server.ts:3579`, `move-contract.ts:10-64`, `host.ts:8-19`).

## How it works

1. `rpcContract` declares each RPC name with Zod input and output schemas. BB registers this contract against the server handler object; a client invokes a named operation and receives its declared output or a rejected call when validation or the handler fails (`server.ts:173-240`, `server.ts:3579`).
2. BB keeps host selection outside the host payload: callers provide `{ hostId }` in call options while operation fields are validated against `moveHostContract`. The schema declares each operation's payload and output; `host.ts` separately binds those operation names to implementations (`move-contract.ts:10-64`, `host.ts:8-19`, `project-move.ts:172-175`).
3. `removeSection` resolves a real folder section, then refuses concurrent chat moves, an unfinished move for this section, or any pending section archive in its project. `archive` clears its GitHub cache entry and delegates to the archive coordinator; other modes calculate section members and eligible chats (`section-remove.ts:66-92`, `section-remove.ts:71-80`).
4. For `unbind` and `purge`, it rejects a child section outside the selected subtree. Purge additionally rejects a nested BB project, a path shared by another section, a section outside its project root, or a ready environment from another project (`section-remove.ts:93-150`).
5. It selects non-archived project chats by explicit placement in the subtree or by environment path. If the path is shared, environment matching only selects chats placed directly in the removed section. A selected chat with a child outside the set or active/queued work rejects removal (`section-remove.ts:151-197`).
6. It syncs selected timelines, waits for pending exports, then processes leaf chats first. Each chat is re-read and stopped; `purge` deletes it, while `unbind` archives it. Purge then recursively removes the section directory if it exists. Finally, it clears GitHub cache entries, drops subtree rows, publishes `changed` and returns the selected mode (`section-remove.ts:199-238`).

### RPC schema branches (`server.ts:173-240`)

| Operation | Input branch | Output and handler outcome | Failure branch |
|---|---|---|---|
| `thread_move` | A target plus non-empty `threadId` | Returns path and `asked` flag; false is the default when the handler omits it (`server.ts:174-181`). | Invalid target or empty thread ID fails schema validation; move preconditions can reject in the handler. |
| `thread_section` | A `threadId` string | Returns nullable section metadata and a `pending` flag, so a thread without an environment can be retried (`server.ts:182-199`). | Wrong input shape fails validation; unresolved section data is represented by the nullable result. |
| `project_move` | `projectId`, `hostId`, and non-empty destination | Returns destination and completion state (`server.ts:201-208`). | Missing fields or empty destination fail schema validation; move ownership, activity and filesystem checks can reject the handler. |
| `pending_moves` | `null` only | Returns project IDs, host, destination and nullable error for each journal (`server.ts:209-219`). | Non-null input fails schema validation. |
| `group_create` | Tree target and trimmed name of 1–120 characters | Returns a folder-shaped group record (`server.ts:220-223`, `server.ts:2248-2281`). | Blank/overlong name or invalid target fails validation; duplicate or invalid parent is rejected by the handler. |
| `group_delete` | Non-empty `folderId` | Returns `{ok:true}` after deleting an eligible empty group (`server.ts:224-227`, `server.ts:2283-2296`). | Missing ID, non-group ID or group with children rejects (`server.ts:2283-2290`). |
| `thread_place` | Non-empty thread/project IDs; `folderId` is a non-empty section ID or `null` for project root | Returns `{ok:true}` after checking the thread and section belong to the same project and the target is not a group (`server.ts:228-236`, `server.ts:2297-2320`). | Invalid IDs or a section from another project reject at validation/handler checks. |
| `thread_place_clear` | Non-empty `threadId` | Deletes a saved manual placement and returns `{ok:true}` (`server.ts:237-240`, `server.ts:2322-2326`). | Empty thread ID fails schema validation. |
| `auto_archive_get` | `null` | Returns the saved `{enabled, days}` configuration (`server.ts:636-639`, `server.ts:3569-3570`). | Non-null input fails schema validation; invalid persisted settings are normalized by the settings parser (`server.ts:636-639`, `auto-archive.ts:14-30`). |
| `auto_archive_save` | Auto-archive configuration schema | Parses, stores and returns the configuration (`server.ts:640-642`, `server.ts:3570-3575`). | Contract schema rejects invalid input; parser behavior and setting limits are documented in [Section archive and restore](features/archive-and-restore.md#automatic-chat-archiving) (`auto-archive.ts:3-30`). |
| `auto_archive_run` | `null` | Runs or joins the active sweep and returns `{archived:integer}` (`server.ts:644-647`, `server.ts:3577`, `auto-archive.ts:167-173`). | Per-thread list/archive failures are logged and counted as no successful archive for that call (`auto-archive.ts:146-164`). |

Schema failures reject the RPC call; output schemas constrain the values a handler can return. Handler failures remain operation-specific and are not converted to successful result objects unless the schema explicitly models that outcome (`server.ts:173-240`, `server.ts:3579`). The complete route inventory is in [API and commands](api.md).

### `createAutoArchive` sweep lifecycle

1. The coordinator accepts the BB thread SDK, a live config getter, optional clock and interval functions, and an optional logger object. Missing clock/timer functions use the platform defaults; it keeps one shared in-flight promise (`auto-archive.ts:60-71`, `auto-archive.ts:113-118`).
2. Creating the coordinator immediately starts an initial sweep and installs an hourly interval. Both callers catch unexpected sweep rejection and log it; `dispose` clears the interval (`auto-archive.ts:175-190`).
3. Each sweep reads config at run time. Disabled config returns zero without listing. Enabled config pages unarchived threads by 200, deduplicates repeated IDs, and stops on a short page or a page that adds no new IDs (`auto-archive.ts:120-150`).
4. It captures one `now` value for the sweep, passes each thread/config/clock value to `isStale`, and sequentially archives eligible IDs. Successful archive calls increment the returned count; each rejected archive is debug-logged and the loop continues (`auto-archive.ts:142-164`). The predicate's decision sequence is in [API and commands](api.md#isstale-eligibility) (`auto-archive.ts:92-110`).
5. `sweep()` joins an existing run; after it settles, `finally` clears the shared promise so a later call can start a fresh run (`auto-archive.ts:167-173`).

| Branch or failure | Outcome |
|---|---|
| Disabled at sweep time | Resolves `0`; no SDK list call (`auto-archive.ts:142-145`). |
| Thread listing rejects | Debug-logs and resolves `0`; no thread archive calls follow (`auto-archive.ts:145-151`). |
| A thread archive rejects | Debug-logs that thread and continues; its failure does not reject the sweep or increment the count (`auto-archive.ts:154-164`). |
| Unexpected run rejection | `sweep()` rejects to its caller after clearing the in-flight slot; initial startup converts the rejection to `0`, and the interval handler logs it (`auto-archive.ts:167-183`). |
| Concurrent sweep call | Receives the same promise and result as the active sweep (`auto-archive.ts:167-173`). |

### `moveHostContract` dispatch and branches

1. `moveHostContract` declares seven operation schemas. The selected device is supplied separately in BB call options, while operation payloads contain only the fields each handler needs (`move-contract.ts:10-64`, `project-move.ts:135-139`, `project-move.ts:172-175`).
2. The host entry supplies this contract and binds `folder_edit` to `editFolder`, `inspect` to `inspectMove`, `move` to `moveDirectory`, `link` to `linkDirectory`, and the remote/inventory names to their collectors (`host.ts:1-19`). Project relocation inspects and then moves; section relocation chooses inspect/move for existing source paths or link for a path renamed outside BB (`project-move.ts:135-139`, `project-move.ts:172-176`, `section-move.ts:243-293`).
3. Before handler work, the contract validates each input and output shape. `folder_edit` takes a non-empty parent, a 1–255 character name, `create|delete`, and optional protected paths. `inspect`, `move` and `link` require strict non-empty source/destination strings and return those paths with `moved`. Remote methods return one nullable URL per requested path; `repo_remotes` limits the input to 128 paths of 1–4096 characters. `session_inventory` uses its imported input/output schemas (`move-contract.ts:7-63`, `session-inventory.ts:6-22`).
4. Handler branches then apply operation-specific checks. Folder creation rejects an existing destination; deletion rejects protected paths, symlinks, non-directories and non-empty directories. `inspect` accepts a source already linked to the requested destination as `moved:true`; a new move requires a real source and free destination. `move` renames the source and creates a compatibility link, while `link` requires an absent source and an existing real destination (`folder-files.ts:3-41`, `move-files.ts:14-117`).
5. The remaining handlers collect remote URLs or session inventory. Missing/non-repository remote paths produce nullable URLs; inventory readers contribute available configured names, while unreadable or malformed files contribute no names (`github-remote.ts:1-30`, `repo-remote.ts:187-198`, `session-inventory.ts:26-124`).
6. A contract validation, host dispatch, filesystem or metadata-read error rejects the host call. The project and section move coordinators persist operation errors only if their journals have already been written; their surrounding server handlers receive the rejection (`host.ts:8-19`, `project-move.ts:234-243`, `section-move.ts:347-356`).

| Operation and branch | Condition | Outcome | Failure behavior |
|---|---|---|---|
| `folder_edit`: create | Parent and name pass validation; action is `create` | Creates one child directory and returns its path (`folder-files.ts:3-20`, `move-contract.ts:11-19`). | Invalid parent/name, existing target or filesystem failure rejects. |
| `folder_edit`: delete | Action is `delete`; the target is not protected and is an empty real directory | Removes the directory and returns its path (`folder-files.ts:21-40`). | Protected project/section paths, symlinks, non-directories, non-empty directories and filesystem errors reject. |
| `inspect`: already moved | Source is a symlink to the requested existing destination | Returns `moved:true`, allowing retry to finish metadata updates without moving files again (`move-files.ts:32-42`). | — |
| `inspect`: new move is eligible | Source is a real directory and destination does not exist | Returns normalized paths with `moved:false` after platform, path, ownership, same-volume and linked-worktree checks (`move-files.ts:18-72`). | Rejects Windows, relative/control-character or nested paths, symlink parents, missing/non-real source, protected roots, occupied destination, cross-volume moves and linked worktrees (`move-files.ts:18-71`). |
| `move`: already moved / new move | `inspect` reports moved / reports eligible | Returns the inspected result unchanged / renames the directory, creates an old-path compatibility link and returns `moved:true` (`move-files.ts:74-91`). | A failed link attempts to restore the rename only when the old source is still absent, then rejects with a recovery instruction (`move-files.ts:82-89`). |
| `link`: externally relocated section | Old source is absent; destination is a real directory with no symlink parent | Creates a compatibility symlink at the old path and returns `moved:true` (`section-move.ts:287-293`, `move-files.ts:94-117`). | Invalid or nested paths, occupied source, missing/non-real destination, symlink parents or symlink failure reject (`move-files.ts:100-116`). |
| `github_remotes` / `repo_remotes` | One of the remote metadata operations is requested | Returns one path and nullable URL per input path (`move-contract.ts:48-63`, `github-remote.ts:1-30`, `repo-remote.ts:187-198`). | Contract shape errors or host read errors reject; the tree caller catches refresh failures to keep listing available (`server.ts:975-1023`). |
| `session_inventory` | The editor requests host inventory | Returns configured MCP and native-plugin names under the declared output schema (`move-contract.ts:44-47`, `session-inventory.ts:26-97`). | Missing or malformed config contributes no names; handler or host dispatch errors reject (`session-inventory.ts:99-124`). |

`moveHostContract` has no shared catch or error-to-result conversion: a handler rejection is returned as a rejected host call. Filesystem recovery is operation-specific; for example, `moveDirectory` attempts to rename the destination back if compatibility-link creation fails, then rejects with a recovery message (`host.ts:8-19`, `move-files.ts:74-91`).

#### `linkDirectory` steps and outcomes

1. Resolve source and destination to absolute paths, then reject raw inputs that were not absolute or resolved paths containing control characters (`move-files.ts:100-107`).
2. Reject paths that contain one another, including identical paths (`move-files.ts:108-109`).
3. Require the old source path to be absent. Require destination to be an existing real directory, not a symlink, and require its `realpath` to equal its resolved path (`move-files.ts:110-115`).
4. Create a directory symlink from the old path to destination and return the normalized paths with `moved: true` (`move-files.ts:116-117`).

| Condition | Outcome |
|---|---|
| Inputs valid, source absent and destination a real directory | Creates the compatibility symlink and returns `{source, destination, moved:true}` (`move-files.ts:100-117`). |
| Relative paths, control characters, nested/equal paths, occupied source, missing/non-directory/symlink destination, or symlink parent | Throws before returning success (`move-files.ts:102-115`). |
| Symlink creation fails | `linkDirectory` does not catch the `symlink` rejection, so the host operation rejects (`move-files.ts:96-118`). |

#### `sessionInventory` collection and outcomes

1. Create separate name-to-source maps for MCP servers and native plugins. The optional `cwd` scopes project Claude settings; home-level configuration is read from the host running this handler (`session-inventory.ts:26-34`).
2. Collect Claude MCP names from `~/.claude.json`; when `cwd` is set, also collect its project entry and `.mcp.json`. Add enabled Claude plugin IDs and MCP names from their installed manifests (`session-inventory.ts:35-70`).
3. Read Codex section headers from `$CODEX_HOME/config.toml` or `~/.codex/config.toml`, then read MCP names from `opencode.json` and `opencode.jsonc` under `$XDG_CONFIG_HOME` or `~/.config` (`session-inventory.ts:72-90`).
4. Deduplicate names while accumulating source labels, sort labels and names, and return separate `mcpServers` and `nativePlugins` arrays. Output contains names and source labels only (`session-inventory.ts:6-22`, `session-inventory.ts:92-96`).

| Source branch | Conditions and result | Failure behavior |
|---|---|---|
| Claude | Reads global and optional project MCP definitions, enabled plugin IDs and their installed `.mcp.json` entries (`session-inventory.ts:35-70`). | Missing/unreadable files parse as empty objects; plugins not explicitly enabled are skipped (`session-inventory.ts:56-69`, `session-inventory.ts:99-109`). |
| Codex | Reads `[mcp_servers.<name>]` and `[plugins.<name>]` table headers from the selected config path (`session-inventory.ts:72-82`). | Missing/unreadable config is empty text; lines that do not match these headers contribute nothing (`session-inventory.ts:72-82`, `session-inventory.ts:99-105`). |
| OpenCode | Reads `mcp` keys from both JSON and JSONC config filenames in the selected config home (`session-inventory.ts:84-90`). | Missing, unreadable or invalid config contributes no names; JSON parsing retries after stripping comments and trailing commas (`session-inventory.ts:99-124`). |

### `makeProjectMoves` steps and outcomes

1. The factory reads and writes `project_moves`, reports unfinished moves through `list` and `busy`, and resolves paths through completed same-host move records. Path resolution checks at most 100 journal aliases and throws if every iteration finds another alias; the `move` method also rejects a concurrent call through its process-local `running` flag (`project-move.ts:18-53`).
2. A move resolves the BB project and its `local_path` source for the requested host. If an unfinished record exists, the retry must use its host and destination; otherwise the factory builds a journal in memory from the source and `path.resolve(destination)` (`project-move.ts:54-80`).
3. Preflight rejects another project whose source overlaps the move’s source or destination; another project’s environment inside the source; this project’s environment on the host outside the source; or an unfinished section archive. It then asks the selected host to inspect the paths (`project-move.ts:81-139`).
4. It inventories archived and unarchived threads, including hidden threads, in pages of 200. A thread in active, starting, stopping or pending status, with queued work, or with positive activity rejects the move (`project-move.ts:140-166`).
5. Once preflight passes, it persists the project journal as a barrier, publishes `changed`, waits for pending exports, repeats the thread check while stopping eligible threads, then calls host `move` (`project-move.ts:167-176`). The host move is idempotent when the old path already links to the destination; otherwise it renames the directory and creates that compatibility link (`move-files.ts:74-91`).
6. After the host succeeds, it updates the BB project source. It rebases archive manifests on the moved host, section paths and export paths, then marks the journal complete, clears its error, publishes `changed` and returns the journal (`project-move.ts:177-233`).
7. On failure, the call rejects. The catch saves the error only if the journal has already been persisted; a failure during earlier preflight leaves no retry record. The `finally` block clears the in-memory concurrency guard on both success and failure (`project-move.ts:234-243`).

| Branch | Condition | Outcome or failure |
|---|---|---|
| Canonical path | Completed journal matches the host and contains the requested path | Rebase through its destination; a chain longer than 100 records throws (`project-move.ts:34-43`). |
| New move | Project/source exists and no unfinished record exists | Build a journal in memory, then run ownership, environment, archive, host and thread preflight (`project-move.ts:54-80`, `project-move.ts:81-166`). |
| Retry | An unfinished record exists for the project | Continue only with its recorded host and destination; a mismatch rejects (`project-move.ts:62-69`). |
| Preflight rejection | Overlapping ownership, outside environment, unfinished archive, invalid host paths or busy thread | Reject before the journal barrier; no persisted project-move retry record is created (`project-move.ts:81-166`). |
| Post-barrier failure | Export wait, second thread check, host move, BB source update or metadata rebase fails | Reject and save the error in the persisted journal for retry; earlier host/filesystem effects are not rolled back by this coordinator (`project-move.ts:167-177`, `project-move.ts:199-243`). |
| Completed move | Host move and metadata finalization succeed | Persist `complete:true` and `error:null`; later canonical path requests follow this journal (`project-move.ts:206-233`, `project-move.ts:34-43`). |

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

- `folderId: null` means project-root placement; it does not mean “no placement” (`server.ts:228-236`).
- `moveHostContract` operation schemas omit `hostId`; server callers select the destination host through the BB host client's call options (`move-contract.ts:10-55`, `project-move.ts:135-139`, `project-move.ts:172-175`).
- Section removal preserves a shared directory for `unbind`; purge refuses a shared path (`section-remove.ts:119-150`, `section-remove.ts:222-233`).

## Public API

The plugin registers `rpcContract` on BB RPC; host operations use `moveHostContract` through BB’s host client (`server.ts:3579`, `move-contract.ts:10-63`). See [API and commands](api.md) for the operation inventory.

## Gotchas

- `thread_section` returns `pending: true` while a thread has no environment; once an environment exists, unresolved section data returns `pending: false` (`server.ts:2213-2220`).
- `move` and `link` can both return `moved: true`; callers use that result to finish metadata updates without repeating filesystem work (`move-files.ts:74-91`, `move-files.ts:94-118`).
- A failed `removeSection` call can follow successful per-chat archive/delete operations; those effects are not rolled back (`section-remove.ts:199-238`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [API and commands](api.md)
