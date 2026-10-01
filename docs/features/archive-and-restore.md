---
title: Section archive and restore
type: component
created: 2026-09-27
updated: 2026-10-01
status: active
confidence: medium
tags: [archive, restore, sections]
sources:
  - archive.ts
  - server.ts
  - app.tsx
  - thread-move.ts
  - project-delete.ts
  - README.md
---
# Section archive and restore

TL;DR: Archiving a section journals the subtree, snapshots chats, archives eligible threads and moves owned files into the project archive; restore returns the files and tree records when the destination is free (`archive.ts:119-240`, `archive.ts:360-375`).

## Purpose

Archives provide a reversible way to remove a section subtree from the active tree while retaining files and chat records in an archive entry (`archive.ts:15-28`, `archive.ts:50-72`).

## How it works

1. The archive operation serializes through a queue and either resumes an existing `archiving` record or validates the requested section (`archive.ts:96-126`).
2. It inventories project threads and environments, rejects active work, external project overlap, child threads outside the subtree and sections that cross ownership boundaries (`archive.ts:128-218`).
3. It syncs selected chat histories, records archive paths, subtree members and thread IDs with state `archiving` (`archive.ts:219-240`).
4. After checking for late chats, it stops and archives eligible threads; internal section folders move under `<project>/.bb/archive/sections/<id>/folder`, while external folders stay in place (`archive.ts:242-331`).
5. In one database transaction, it removes each archived member’s folder and path rows, sets the journal state to `archived` and clears its prior error (`archive.ts:360-368`). The change notification follows the transaction (`archive.ts:369`); a caught failure stores its error, notifies listeners and rethrows (`archive.ts:371-375`).
6. Restore checks the saved state and destination, moves owned files back, recreates tree rows, and restores threads listed in `restoreThreadIds` (`archive.ts:349-430`).

### `makeArchives` coordinator

1. The factory binds the database to archive reads and writes and receives callbacks for folders, canonical paths, project moves, project roots, history sync, pending exports and change notifications. `list` reads newest-first and parses each JSON record with `archiveSchema`; malformed JSON or an invalid record rejects the read (`archive.ts:50-72`).
2. Its lookup predicates have separate scopes: `matches` finds completed archives for the same project and host by normalized name or basename; `blocked` checks whether any archive record contains a thread ID; `moving` checks whether a canonicalized path is under a non-completed archive path (`archive.ts:73-95`).
3. Archive and restore calls run through one promise queue. The caller receives a rejected operation, while the queue absorbs that rejection internally so its next operation can run. Thread inventory reads hidden and visible threads in both archived states, in pages of 200 (`archive.ts:96-117`).
4. For a new archive, the coordinator resolves the section and project root, rejects a nested BB project or a ready foreign-project environment, and selects threads whose environments lie under the section. When another section shares the same host path, only threads manually placed in the selected section are included. A selected thread with a child outside the selection, busy status, queued work or positive activity rejects the request; so does a child section outside the archived subtree. Selected histories are synced before the `archiving` record is written (`archive.ts:119-240`, `archive.ts:241-268`).
5. An existing record for the same folder in `archiving` state resumes with its saved members and thread IDs. After journaling, the coordinator drains pending exports, rescans for late chats, rejects late busy work, records eligible late threads, and stops/archives threads that were not already archived. An internal unshared directory moves under the project archive with a manifest; an external or shared directory stays in place. Both source and destination existing, or neither existing, rejects without replacing a folder (`archive.ts:119-126`, `archive.ts:250-268`, `archive.ts:270-358`).
6. Finalization runs in a database transaction: it removes each member’s folder-path and folder rows, sets `state` to `archived` and clears the journal error (`archive.ts:360-368`). The change notification follows the transaction (`archive.ts:369`). Failures before the journal is written reject without an archive retry record; failures caught after journaling save the error and notify listeners, leaving an `archiving` record for retry (`archive.ts:238-268`, `archive.ts:371-377`).

| Branch | Condition | Outcome |
|---|---|---|
| Resume archive | Existing record has the same folder and `archiving` state | Reuse its saved members, thread IDs and paths; continue at pending-work checks (`archive.ts:119-126`). |
| New archive | No unfinished archive record for the folder | Recompute ownership, chats and members, sync histories, then persist a new journal (`archive.ts:119-240`, `archive.ts:241-268`). |
| Shared folder path | Another real section uses the same host and path | Select only threads manually placed in this section; leave the shared directory in place (`archive.ts:176-189`, `archive.ts:241-259`). |
| Internal folder | Folder lies under the project root and is not shared | Move it into the project’s section archive tree (`archive.ts:294-331`). |
| External/shared folder | Folder is outside the root or shares a path with another section | Keep files at their current path; archive the tree membership and chats (`archive.ts:294-311`, `archive.ts:322-324`). |
| Preflight or history-sync failure | Ownership, thread boundaries, activity checks or a history sync fails before the journal write | Reject without creating an archive retry record (`archive.ts:128-240`, `archive.ts:251-268`). |
| Post-journal failure | Pending export drain, late-chat check, thread archive, path check or filesystem operation fails | Save the error on the `archiving` record; a later archive call can resume it (`archive.ts:270-377`). |

## Modes

| Archive state | Meaning |
|---|---|
| `archiving` | Operation journal exists; retry can continue |
| `archived` | Section is in archive; eligible for restore or matching |
| `restoring` | Restore operation journal exists |

The same dialog also removes projects. It offers `keep` or `archive`; `keep` leaves every project copy in place, while `archive` moves each local-path source to a sibling `.bb/archive/projects/<uuid>/folder` path on its host, using one UUID across copies, before deleting the BB project (`app.tsx:948-985`, `app.tsx:560-563`, `project-delete.ts:62-124`). Project deletion checks and ownership rules are documented in [Project and section tree](project-tree.md).

### Folder dialog entry points

`FolderDialog` resets its fields when the action or target changes. Section creation loads available locations; project-level rules load device choices and read rules for the selected copy (`app.tsx:418-488`). Its folder browser lists directories on the selected host and represents a picked folder as a relative path inside the project or as an absolute path outside it (`app.tsx:496-527`, `app.tsx:695-739`).

| Folder location | Archive behavior |
|---|---|
| Inside project root | Move the folder under `.bb/archive/sections/<id>/folder` |
| Outside project root | Keep the directory in place; archive tree record and chats |

| `FolderDialog` action | RPC path and result |
|---|---|
| Create | `archive_matches` first; then restore an archive match or call `create`, unless fresh creation is explicitly selected (`app.tsx:528-552`, `app.tsx:601-613`). |
| Archive section | Calls `forget`, which archives the selected section (`app.tsx:557-559`, `app.tsx:938-946`). |
| Remove project | Calls `project_delete` with `keep` or `archive` file behavior (`app.tsx:560-563`, `app.tsx:948-985`). |
| Group, rename or rules | Calls the matching tree/rules RPC; details live on [Project and section tree](project-tree.md) and [Agent rules](agent-rules.md) (`app.tsx:553-590`). |

The dialog catches RPC failures, displays the error, and clears its busy state in `finally` (`app.tsx:528-600`, `app.tsx:601-613`).

State and location fields: `archive.ts:15-28`, `archive.ts:219-240`, `archive.ts:294-331`.

## Failures

| Failure | Result |
|---|---|
| Active chats, queued work, cross-project environment or invalid subtree | Preflight rejects archive before its move completes (`archive.ts:128-218`). |
| New chat starts after journal creation | Archive records/merges eligible late chats; active late work stops and leaves an error journal (`archive.ts:242-283`). |
| Both source and archive paths exist | Operation stops without overwriting either folder and stores the error (`archive.ts:324-335`, `archive.ts:371-375`). |
| Restore destination is occupied | Restore refuses to overwrite it; archive remains available (`archive.ts:349-430`). |

## Business rules

- The operation rejects selected chats whose status is active, starting, stopping or pending, or that have queued work or positive activity (`archive.ts:185-211`).
- It rejects folders containing another BB project or a ready environment from another project (`archive.ts:128-156`).
- Restore never overwrites an occupied destination; errors remain on the archive record for retry (`archive.ts:392-406`, `archive.ts:462-466`).
- Groups nested beneath archived members are stored and restored as part of the subtree (`archive.ts:30-48`).
- Archive does not permanently delete files (`archive.ts:349-430`).

## Public API

| RPC / command | Purpose | Evidence |
|---|---|---|
| `archive_list`, `archive_matches`, `archive`, `restore`, `forget` | List, match, archive, restore or use archive compatibility operation | `server.ts:361-399` |
| `bb project-folders archives`, `archive`, `restore`, `forget` | CLI archive operations | `server.ts:3565-3577`, `server.ts:3715-3722` |

## Gotchas

- An archive can be `archived` while its external directory stays at its original path (`archive.ts:26-27`, `archive.ts:322-324`).
- Running work or late chats can stop an operation after the journal was created; retry resumes through the persisted record (`archive.ts:119-126`, `archive.ts:242-283`, `archive.ts:371-375`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [Data model](../data-model.md)
- [Project and section tree](project-tree.md)
