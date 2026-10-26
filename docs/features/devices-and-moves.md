---
title: Device copies and moves
type: component
created: 2026-09-27
updated: 2026-10-26
status: active
confidence: high
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

TL;DR: A BB project can have local-path copies on connected hosts; project, section and chat moves validate ownership and activity, persist retry journals, perform host filesystem operations, and then update plugin metadata (`project-move.ts:47-80`, `section-move.ts:279-304`).

## Purpose

The feature keeps project and section paths aligned with BB metadata across devices and supports moving a chat’s dedicated `.bb/chats/<threadId>` storage alongside its working directory (`server.ts:2642-2723`, `project-move.ts:18-31`, `thread-move.ts:97-104`).

## How it works

1. `copy_add` normalizes an absolute path, requires a connected host and existing project, rejects a second copy on that host or a path already assigned to a project, creates the directory, adds a local-path source, then attempts to seed project rules (`server.ts:2642-2690`).
2. Project relocation validates the destination, records a move journal and asks the host entry to move files and preserve a compatibility link (`project-move.ts:18-31`, `project-move.ts:100-160`).
3. `makeSectionMoves` accepts a real section ID and destination on the same host, blocks concurrent moves, project relocation and pending archives, and requires retries to use the journaled destination. It rejects nested source/destination paths, conflicting section/project ownership and environments belonging to another project (`section-move.ts:28-80`, `section-move.ts:102-184`).
4. Before a distinct-path filesystem operation, it inventories active and archived chats using relevant environments, persists a move barrier, drains pending exports, then rechecks and stops those chats. It dispatches host `inspect`, `move` or `link`; shared source paths or a destination already assigned to a section update the binding and complete the journal without moving files (`section-move.ts:197-252`, `section-move.ts:254-304`).
5. After a move/re-link, a database transaction rebases descendant section paths, host-specific path bindings, history export paths and archive manifests, then marks the journal complete (`section-move.ts:305-357`).
6. A chat move accepts only an idle or error chat in the same project and on the same host, then journals both workspace and chat-storage paths (`thread-move.ts:66-120`).
7. If BB’s directory update works, the chat storage moves immediately. Otherwise the server files the chat in the destination and asks the chat agent to switch; the move settles after that turn (`thread-move.ts:138-185`, `thread-move.ts:216-269`).

### `makeSectionMoves`

1. The factory opens `section_moves`, creates a client for `moveHostContract`, exposes parsed journal rows through `list`, and reports a project busy while any journal for that project is incomplete. `move` takes a folder ID and destination; a process-local guard rejects parallel calls before the requested section is looked up, and `finally` clears that guard on success and failure (`section-move.ts:28-62`, `section-move.ts:358-367`).
2. The move resolves the destination to an absolute path, rejects an unknown section, pending project move/archive, or a retry whose saved host/destination differs, then builds an in-memory journal for a new operation. If the section path already equals the destination, a new request returns complete without writing a journal; a retry with a saved journal marks it complete, clears its error and emits `changed` before returning (`section-move.ts:61-100`). Nested source/destination paths reject (`section-move.ts:102-105`).
3. It identifies same-project descendants and tree ancestors, then checks source/destination ownership. Unrelated section overlap, project roots, other projects’ roots and foreign-project environments reject. A detached-section check can permit a destination outside the project root; otherwise the destination must stay within that root (`section-move.ts:107-196`).
4. For filesystem work it refreshes environments and inventories live and archived hidden chats in batches of 200 for relevant source/destination environments. Active/starting/stopping/pending status, queued work other than `none`, or positive activity rejects. It checks without stopping, persists the journal and emits `changed`, drains exports, then rechecks and stops idle chats (`section-move.ts:197-236`, `section-move.ts:279-284`).
5. Path existence selects the host operation: source only invokes `inspect` then `move`; destination only invokes `link`; both are accepted only when inspection recognizes the old path as the compatibility link from a completed move. If neither the section path nor destination exists, the handler rejects before writing the move journal (`section-move.ts:254-278`).
6. If the source is shared or destination already belongs to a section, it updates only this section’s path and host binding, completes the journal and returns. Otherwise it rebases descendant paths, host bindings, export paths and matching archive manifests in one transaction, then completes the journal (`section-move.ts:238-252`, `section-move.ts:305-357`).
7. Caught errors are rethrown; if a journal row exists, its error is stored and `changed` is emitted. The process-local guard clears in `finally` (`section-move.ts:358-367`).

| Initial move branch | Condition | Outcome or failure |
|---|---|---|
| Busy guard | Another `move` call is still running | Rejects immediately; `finally` clears the guard after the active attempt (`section-move.ts:53-58`, `section-move.ts:358-367`). |
| Section lookup | `folderId` does not identify a folder row | Rejects `Section not found` (`section-move.ts:59-62`). |
| Conflicting work | Project move or section archive is pending | Rejects before destination/path processing (`section-move.ts:63-70`). |
| Journal retry | Saved incomplete row exists | Only saved host and absolute destination can be retried; a different request rejects (`section-move.ts:71-90`). |
| Same-path result | Destination equals current path | A request without a saved journal returns complete without host I/O or journal writes; a retry completes the saved journal, clears its error and emits `changed` (`section-move.ts:91-100`). |
| Nested paths | Source contains destination or destination contains source | Rejects before ownership checks (`section-move.ts:103-106`). |

| Ownership preflight branch | Condition | Outcome or failure |
|---|---|---|
| Descendant rebase | Same-project, same-host section path is beneath the moved section | Include that folder ID in the move set so its path can be rebased with the parent (`section-move.ts:106-123`). |
| Destination already bound | Another real section on the same host uses the destination | Use the metadata-only binding branch; do not move the shared directory (`section-move.ts:124-137`, `section-move.ts:227-241`). |
| Shared source | Another real section on the same host uses the current path | Update only the selected section binding; keep the shared directory in place (`section-move.ts:131-137`, `section-move.ts:227-241`). |
| Section-tree overlap | Destination overlaps another unrelated section | Reject paths inside that section or containing its child sections (`section-move.ts:138-148`). |
| Project ownership | Destination escapes this project root without the detached-section allowance, overlaps another project root, or contains a foreign-project environment | Reject before filesystem work (`section-move.ts:149-183`). |

| Branch | Condition | Outcome |
|---|---|---|
| Metadata-only binding | Source shared by a section or destination already assigned to a real section | Repoint only the selected section record; no host filesystem call or descendant rebase (`section-move.ts:125-138`, `section-move.ts:238-252`). |
| Move files | Source exists and destination is absent | Host inspects then moves folder, leaving a compatibility link at the old path (`section-move.ts:262-304`, `move-files.ts:74-91`). |
| Re-link renamed folder | Source absent and destination exists | Host creates an old-path compatibility link to destination (`section-move.ts:262-304`, `move-files.ts:94-118`). |
| Resume completed filesystem step | Both paths exist and inspection reports `moved: true` | Continue metadata rebasing without moving files again (`section-move.ts:266-278`, `section-move.ts:285-304`). |
| Invalid or occupied filesystem state | Neither path exists, or both exist without recognized compatibility link | Reject; paths are not merged or overwritten (`section-move.ts:262-277`). |

The filesystem branch runs only after environment and chat preflight. It captures relevant environment IDs, rechecks the current environment list, pages active and archived threads in groups of 200, rejects busy/queued/activity state, and only then persists the move barrier (`section-move.ts:171-225`, `section-move.ts:268-284`).

| Outcome or failure point | State change and caller result |
|---|---|
| Same-path result | A new request returns complete without journal writes or host calls; a retry marks its saved journal complete, clears its error and emits `changed` (`section-move.ts:91-100`). |
| Shared-source/destination binding | Transaction updates only this section’s folder path and host binding, marks the move complete, emits `changed`, and returns complete (`section-move.ts:238-252`). |
| Filesystem move/re-link | After host success, a transaction rebases descendant folder rows, matching host paths, export paths and archive manifest paths, then marks the journal complete and emits `changed` (`section-move.ts:285-357`). |
| Failure before journal persistence | The caught error is rethrown; unless a journal row for the folder already exists, no new error journal is written (`section-move.ts:358-364`). |
| Failure after journal persistence | The error text is saved to the move row and `changed` is emitted; the caller still receives the rejection, and retry must use the same host and resolved destination (`section-move.ts:71-90`, `section-move.ts:358-364`). |

## Modes

| Operation | Scope | Filesystem effect | Retry state |
|---|---|---|---|
| Add/remove project copy | One project source on one host | Add/remove BB local-path source | BB project source state |
| Move project | Entire project root on one host | Move directory and leave compatibility link | `project_moves` |
| Move/re-link section | One section subtree on its host | Move folder or link an externally renamed path | `section_moves` |
| Move chat | One chat, same project and host | Repoint environment and move `.bb/chats/<id>` | `thread_moves` |
| Place chat | Tree placement only | No workspace/filesystem change | `thread_places` |

Project and section move journals are set before filesystem work (`project-move.ts:18-31`, `section-move.ts:279-304`); chat move conditions and journal are in `thread-move.ts:76-120`.

Section moves have two metadata-only branches: when the source is shared by another section or the destination is already assigned to one, only the selected section’s `folders.path` and `folder_paths` binding change; otherwise the host filesystem operation runs and descendant paths, exports and archive manifests are rebased (`section-move.ts:125-138`, `section-move.ts:238-252`, `section-move.ts:285-355`).

`copy_remove` requires an existing source, at least one other project source, and no section rows or environments for the project on that host; it deletes only the BB source record, not the directory (`server.ts:2691-2733`).

## Failures

| Failure | Result |
|---|---|
| Active chats or queued work | Move is refused before file operations (`project-move.ts:140-171`, `section-move.ts:181-220`). |
| Both source and destination exist without a recognized completed link | Move refuses to merge/overwrite (`section-move.ts:254-277`, `thread-move.ts:108-136`). |
| No source or destination directory exists, or both exist without a recognized compatibility link | The section move rejects the operation and retains an error on its journal when one has been written (`section-move.ts:254-277`, `section-move.ts:358-364`). |
| Host/metadata step fails after journaling | Error is recorded in the journal and surfaced for retry (`project-move.ts:234-240`, `section-move.ts:358-364`). |
| Chat’s agent does not switch directory | Chat remains listed at destination but its workspace stays unchanged (`thread-move.ts:228-246`). |
| Message arrives while a project/section/chat move or archive blocks the thread | Dispatch rejects with a retry/restore message; the relocation request carrying its marker can pass the thread-move barrier (`dispatch-hook.ts:36-75`). A bookkeeping exception logs a warning and proceeds (`dispatch-hook.ts:78-81`). |

## Business rules

- Project copies require connected hosts and a unique local path; the last copy cannot be removed, and copies with sections or chats must be cleared first (`server.ts:2642-2733`).
- Project and section moves reject active chats and occupied destinations; section folders are never merged or overwritten (`project-move.ts:100-160`, `section-move.ts:212-277`).
- A filesystem section move leaves the old path as a compatibility link; when both paths exist, the move accepts them only if the old path is the link from a completed move. Shared source paths and destinations already used by another section instead update one section’s binding without moving files (`section-move.ts:125-138`, `section-move.ts:238-277`, `section-move.ts:285-304`).
- Chat moves require an idle/error chat and a destination on the same host (`thread-move.ts:76-89`).
- Manual placement changes tree location without changing the folder where the chat works (`server.ts:249-260`, `chat-list.ts:251-263`).

## Public API

| RPC / command | Purpose | Evidence |
|---|---|---|
| `project_move`, `pending_moves` | Move project and list pending moves | `server.ts:196-214` |
| `section_move`, `pending_section_moves`, `thread_move` | Move/re-link section or move chat | `server.ts:169-176`, `server.ts:244-260` |
| `copy_add`, `copy_remove`, `copy_edit` | Add, remove or update a device copy | `server.ts:319-341` |
| `thread_place`, `thread_place_clear` | Change tree filing without moving workspace | `server.ts:223-235` |
| CLI `move-section`, `move-chat`, `copy-add`, `copy-remove` | Run matching operations through BB CLI | `server.ts:3799-3810`, `server.ts:3844-3854`, `server.ts:3911-3961` |

## Gotchas

- Project moves require the same device and disk volume, and reject unsupported roots or linked worktree cases (`project-move.ts:80-145`).
- A chat relocation fallback consumes an agent turn and depends on the active provider exposing `update_environment_directory` (`thread-move.ts:16-25`, `thread-move.ts:138-168`).
- A move error retains its journal; finish or retry pending moves before starting conflicting operations (`server.ts:222-239`, `section-move.ts:358-364`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [API and commands](../api.md)
- [Data model](../data-model.md)
