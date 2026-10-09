---
title: Device copies and moves
type: component
created: 2026-09-27
updated: 2026-10-09
status: active
confidence: medium
tags: [devices, moves, filesystem]
sources:
  - project-move.ts
  - section-move.ts
  - thread-move.ts
  - move-files.ts
  - move-contract.ts
  - host.ts
  - chat-list.ts
  - server.ts
  - dispatch-hook.ts
---
# Device copies and moves

TL;DR: A BB project can have local-path copies on connected hosts; project, section and chat moves validate ownership and activity, persist retry journals, perform host filesystem operations, and then update plugin metadata (`project-move.ts:47-80`, `section-move.ts:268-293`).

## Purpose

The feature keeps project and section paths aligned with BB metadata across devices and supports moving a chat’s dedicated `.bb/chats/<threadId>` storage alongside its working directory (`server.ts:2609-2690`, `project-move.ts:18-31`, `thread-move.ts:97-104`).

## How it works

1. `copy_add` normalizes an absolute path, requires a connected host and existing project, rejects a second copy on that host or a path already assigned to a project, creates the directory, adds a local-path source, then attempts to seed project rules (`server.ts:2609-2657`).
2. Project relocation validates the destination, records a move journal and asks the host entry to move files and preserve a compatibility link (`project-move.ts:18-31`, `project-move.ts:100-160`).
3. `makeSectionMoves` accepts a real section ID and destination on the same host, blocks concurrent moves, project relocation and pending archives, and requires retries to use the journaled destination. It rejects nested source/destination paths, conflicting section/project ownership and environments belonging to another project (`section-move.ts:28-80`, `section-move.ts:91-173`).
4. Before a distinct-path filesystem operation, it inventories active and archived chats using relevant environments, persists a move barrier, drains pending exports, then rechecks and stops those chats. It dispatches host `inspect`, `move` or `link`; shared source paths or a destination already assigned to a section update the binding and complete the journal without moving files (`section-move.ts:186-241`, `section-move.ts:243-293`).
5. After a move/re-link, a database transaction rebases descendant section paths, host-specific path bindings, history export paths and archive manifests, then marks the journal complete (`section-move.ts:294-346`).
6. A chat move accepts only an idle or error chat in the same project and on the same host, then journals both workspace and chat-storage paths (`thread-move.ts:66-120`).
7. If BB’s directory update works, the chat storage moves immediately. Otherwise the server files the chat in the destination and asks the chat agent to switch; the move settles after that turn (`thread-move.ts:138-185`, `thread-move.ts:216-269`).

### `makeSectionMoves`

1. The factory opens `section_moves`, creates a client for `moveHostContract`, exposes parsed journal rows through `list`, and reports a project busy while any journal for that project is incomplete. `move` takes a folder ID and destination; a process-local guard rejects parallel calls before the requested section is looked up (`section-move.ts:28-62`).
2. The move resolves the destination to an absolute path, rejects an unknown section, pending project move/archive, or a retry whose saved host/destination differs, then builds an in-memory journal for a new operation. An already-equal source and destination returns complete without writing a journal; nested source/destination paths reject (`section-move.ts:61-95`).
3. It identifies same-project descendants and tree ancestors, then checks source/destination ownership. Unrelated section overlap, project roots, other projects’ roots and foreign-project environments reject. A detached-section check can permit a destination outside the project root; otherwise the destination must stay within that root (`section-move.ts:96-185`).
4. For filesystem work it inventories live and archived hidden threads in batches of 200 for environments at source/destination. Active/starting/stopping/pending status, queued work or positive activity rejects. It checks without stopping, persists the journal and emits `changed`, drains exports, then rechecks and stops idle chats (`section-move.ts:186-225`, `section-move.ts:268-273`).
5. Path existence selects the host operation: source only invokes `inspect` then `move`; destination only invokes `link`; both are accepted only when inspection recognizes the old path as the compatibility link from a completed move. Neither existing path rejects (`section-move.ts:243-293`).
6. If the source is shared or destination already belongs to a section, it updates only this section’s path and host binding, completes the journal and returns. Otherwise it rebases descendant paths, host bindings, export paths and matching archive manifests in one transaction, then completes the journal (`section-move.ts:227-241`, `section-move.ts:294-346`).
7. Caught errors are rethrown; if a journal row exists, its error is stored and `changed` is emitted. The process-local guard clears in `finally` (`section-move.ts:347-356`).

| Initial move branch | Condition | Outcome or failure |
|---|---|---|
| Busy guard | Another `move` call is still running | Rejects immediately; `finally` clears the guard after the active attempt (`section-move.ts:53-58`, `section-move.ts:347-356`). |
| Section lookup | `folderId` does not identify a folder row | Rejects `Section not found` (`section-move.ts:59-62`). |
| Conflicting work | Project move or section archive is pending | Rejects before destination/path processing (`section-move.ts:63-70`). |
| Journal retry | Saved incomplete row exists | Only saved host and absolute destination can be retried; a different request rejects (`section-move.ts:71-90`). |
| No-op | Destination equals current path | Returns `{destination, complete:true}` without host I/O (`section-move.ts:91`). |
| Nested paths | Source contains destination or destination contains source | Rejects before ownership checks (`section-move.ts:92-95`). |

| Branch | Condition | Outcome |
|---|---|---|
| Metadata-only binding | Source shared by a section or destination already assigned to a real section | Repoint only the selected section record; no host filesystem call or descendant rebase (`section-move.ts:114-127`, `section-move.ts:227-241`). |
| Move files | Source exists and destination is absent | Host inspects then moves folder, leaving a compatibility link at the old path (`section-move.ts:251-293`, `move-files.ts:74-91`). |
| Re-link renamed folder | Source absent and destination exists | Host creates an old-path compatibility link to destination (`section-move.ts:251-293`, `move-files.ts:94-118`). |
| Resume completed filesystem step | Both paths exist and inspection reports `moved: true` | Continue metadata rebasing without moving files again (`section-move.ts:255-267`, `section-move.ts:274-293`). |
| Invalid or occupied filesystem state | Neither path exists, or both exist without recognized compatibility link | Reject; paths are not merged or overwritten (`section-move.ts:251-266`). |

## Modes

| Operation | Scope | Filesystem effect | Retry state |
|---|---|---|---|
| Add/remove project copy | One project source on one host | Add/remove BB local-path source | BB project source state |
| Move project | Entire project root on one host | Move directory and leave compatibility link | `project_moves` |
| Move/re-link section | One section subtree on its host | Move folder or link an externally renamed path | `section_moves` |
| Move chat | One chat, same project and host | Repoint environment and move `.bb/chats/<id>` | `thread_moves` |
| Place chat | Tree placement only | No workspace/filesystem change | `thread_places` |

Project and section move journals are set before filesystem work (`project-move.ts:18-31`, `section-move.ts:268-293`); chat move conditions and journal are in `thread-move.ts:76-120`.

Section moves have two metadata-only branches: when the source is shared by another section or the destination is already assigned to one, only the selected section’s `folders.path` and `folder_paths` binding change; otherwise the host filesystem operation runs and descendant paths, exports and archive manifests are rebased (`section-move.ts:114-127`, `section-move.ts:227-241`, `section-move.ts:274-344`).

`copy_remove` requires an existing source, at least one other project source, and no section rows or environments for the project on that host; it deletes only the BB source record, not the directory (`server.ts:2658-2700`).

## Failures

| Failure | Result |
|---|---|
| Active chats or queued work | Move is refused before file operations (`project-move.ts:140-171`, `section-move.ts:170-209`). |
| Both source and destination exist without a recognized completed link | Move refuses to merge/overwrite (`section-move.ts:243-266`, `thread-move.ts:108-136`). |
| No source or destination directory exists, or both exist without a recognized compatibility link | The section move rejects the operation and retains an error on its journal when one has been written (`section-move.ts:243-266`, `section-move.ts:347-353`). |
| Host/metadata step fails after journaling | Error is recorded in the journal and surfaced for retry (`project-move.ts:234-240`, `section-move.ts:347-353`). |
| Chat’s agent does not switch directory | Chat remains listed at destination but its workspace stays unchanged (`thread-move.ts:228-246`). |
| Message arrives while a project/section/chat move or archive blocks the thread | Dispatch rejects with a retry/restore message; the relocation request carrying its marker can pass the thread-move barrier (`dispatch-hook.ts:36-75`). A bookkeeping exception logs a warning and proceeds (`dispatch-hook.ts:78-81`). |

## Business rules

- Project copies require connected hosts and a unique local path; the last copy cannot be removed, and copies with sections or chats must be cleared first (`server.ts:2609-2700`).
- Project and section moves reject active chats and occupied destinations; section folders are never merged or overwritten (`project-move.ts:100-160`, `section-move.ts:201-266`).
- A filesystem section move leaves the old path as a compatibility link; when both paths exist, the move accepts them only if the old path is the link from a completed move. Shared source paths and destinations already used by another section instead update one section’s binding without moving files (`section-move.ts:114-127`, `section-move.ts:227-266`, `section-move.ts:274-293`).
- Chat moves require an idle/error chat and a destination on the same host (`thread-move.ts:76-89`).
- Manual placement changes tree location without changing the folder where the chat works (`server.ts:242-253`, `chat-list.ts:251-263`).

## Public API

| RPC / command | Purpose | Evidence |
|---|---|---|
| `project_move`, `pending_moves` | Move project and list pending moves | `server.ts:215-232` |
| `section_move`, `pending_section_moves`, `thread_move` | Move/re-link section or move chat | `server.ts:188-195`, `server.ts:263-278` |
| `copy_add`, `copy_remove`, `copy_edit` | Add, remove or update a device copy | `server.ts:338-359` |
| `thread_place`, `thread_place_clear` | Change tree filing without moving workspace | `server.ts:242-253` |
| CLI `move-section`, `move-chat`, `copy-add`, `copy-remove` | Run matching operations through BB CLI | `server.ts:3757-3768`, `server.ts:3802-3812`, `server.ts:3869-3919` |

## Gotchas

- Project moves require the same device and disk volume, and reject unsupported roots or linked worktree cases (`project-move.ts:80-145`).
- A chat relocation fallback consumes an agent turn and depends on the active provider exposing `update_environment_directory` (`thread-move.ts:16-25`, `thread-move.ts:138-168`).
- A move error retains its journal; finish or retry pending moves before starting conflicting operations (`server.ts:215-232`, `section-move.ts:347-353`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [API and commands](../api.md)
- [Data model](../data-model.md)
