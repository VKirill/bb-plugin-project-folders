---
title: Section archive and restore
type: component
created: 2026-09-27
updated: 2026-09-27
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

TL;DR: Archiving a section journals the subtree, snapshots chats, archives eligible threads and moves owned files into the project archive; restore returns the files and tree records when the destination is free (`archive.ts:119-240`, `archive.ts:332-345`).

## Purpose

Archives provide a reversible way to remove a section subtree from the active tree while retaining files and chat records in an archive entry (`archive.ts:15-28`, `archive.ts:50-72`).

## How it works

1. The archive operation serializes through a queue and either resumes an existing `archiving` record or validates the requested section (`archive.ts:96-126`).
2. It inventories project threads and environments, rejects active work, external project overlap, child threads outside the subtree and sections that cross ownership boundaries (`archive.ts:128-218`).
3. It syncs selected chat histories, records archive paths, subtree members and thread IDs with state `archiving` (`archive.ts:219-240`).
4. After checking for late chats, it stops and archives eligible threads; internal section folders move under `<project>/.bb/archive/sections/<id>/folder`, while external folders stay in place (`archive.ts:242-331`).
5. It removes archived folder rows and marks the record `archived`; failures retain the journal and error for retry (`archive.ts:332-345`).
6. Restore checks the saved state and destination, moves owned files back, recreates tree rows, and restores threads listed in `restoreThreadIds` (`archive.ts:349-430`).

## Modes

| Archive state | Meaning |
|---|---|
| `archiving` | Operation journal exists; retry can continue |
| `archived` | Section is in archive; eligible for restore or matching |
| `restoring` | Restore operation journal exists |

The same dialog also removes projects. It offers `keep` or `archive`; archiving project files requires exactly one local-path source and moves that folder to a generated sibling `.bb/archive/projects/<uuid>/folder` path before BB deletes the project (`app.tsx:948-985`, `app.tsx:560-563`, `project-delete.ts:62-119`). Project deletion checks and ownership rules are documented in [Project and section tree](project-tree.md).

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
| Both source and archive paths exist | Operation stops without overwriting either folder and stores the error (`archive.ts:294-345`). |
| Restore destination is occupied | Restore refuses to overwrite it; archive remains available (`archive.ts:349-430`). |

## Business rules

- The operation rejects active, starting, stopping or pending chats, queued work and nonzero activity (`archive.ts:182-193`).
- It rejects folders containing another BB project or a ready environment from another project (`archive.ts:128-156`).
- Restore never overwrites an occupied destination; errors remain on the archive record for retry (`archive.ts:301-330`, `archive.ts:341-345`).
- Groups nested beneath archived members are stored and restored as part of the subtree (`archive.ts:30-48`).
- Archive does not permanently delete files (`archive.ts:349-430`).

## Public API

| RPC / command | Purpose | Evidence |
|---|---|---|
| `archive_list`, `archive_matches`, `archive`, `restore`, `forget` | List, match, archive, restore or use archive compatibility operation | `server.ts:361-399` |
| `bb project-folders archives`, `archive`, `restore`, `forget` | CLI archive operations | `server.ts:3418-3457`, `server.ts:3539-3545` |

## Gotchas

- An archive can be `archived` while its external directory stays at its original path (`archive.ts:26-27`, `archive.ts:294-331`).
- Running work or late chats can stop an operation after the journal was created; retry resumes through the persisted record (`archive.ts:119-126`, `archive.ts:242-283`, `archive.ts:341-345`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [Data model](../data-model.md)
- [Project and section tree](project-tree.md)
