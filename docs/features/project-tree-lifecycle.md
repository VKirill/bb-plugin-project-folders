---
title: Project and section removal
type: component
created: 2026-10-25
updated: 2026-10-25
status: active
confidence: medium
tags: [projects, sections, archive, deletion]
sources:
  - project-delete.ts
  - section-remove.ts
  - server.ts
  - app.tsx
---
# Project and section removal

TL;DR: Project deletion chooses whether local project folders stay or move to an archive; section removal chooses archive, unbind or purge (`project-delete.ts:27-124`, `section-remove.ts:48-239`).

## Purpose

These operations remove a BB project or a folder section while checking active work and shared filesystem ownership. The app collects the requested file/mode choice and dispatches the matching RPC (`app.tsx:948-985`, `app.tsx:569-574`, `server.ts:313-323`, `server.ts:371-380`).

## How it works

### Project deletion

1. `deleteProject` refuses a project with an in-progress relocation or section archive, then looks up the BB project and refuses missing projects and the personal inbox (`project-delete.ts:27-49`).
2. It lists all visible, hidden and archived project chats in pages of 200. Any chat that is active, starting, stopping or pending, has queued work, or reports activity prevents deletion (`project-delete.ts:9-25`, `project-delete.ts:50-61`).
3. It gathers the project’s local-path sources. With `keep`, it skips filesystem moves. With `archive`, it requires at least one local source and rejects a source containing another BB project or exactly shared as another project’s section (`project-delete.ts:62-99`).
4. For archive mode, it generates one UUID for all local copies and moves each source into a sibling `.bb/archive/projects/<uuid>/folder` path on its host. The first destination becomes `archivePath` (`project-delete.ts:100-119`).
5. After the file choice completes, it drops plugin rows, deletes the BB project, publishes `changed` and returns the chosen mode and archive path (`project-delete.ts:121-124`, `server.ts:2081-2132`).

| File mode | Input/condition | Outcome |
|---|---|---|
| `keep` | Selected by the caller | Local folders stay at their current paths; plugin rows and the BB project are deleted (`project-delete.ts:62-64`, `project-delete.ts:121-124`). |
| `archive` | At least one local source; no overlapping project or another project’s section | Each local source is moved using the same archive UUID before project deletion (`project-delete.ts:64-119`). |

### Section removal

1. `removeSection` loads the folder row and rejects missing IDs and groups. It also rejects pending chat moves, a move for this section, or unfinished section archives in the project (`section-remove.ts:48-75`).
2. `archive` invalidates cached repository metadata, delegates to the archive coordinator and returns. `unbind` and `purge` instead find the folder subtree on the same project and host, including descendant groups; they reject child sections outside the selected subtree (`section-remove.ts:76-101`).
3. For `purge`, it checks that no other BB project is nested inside the path, no other section shares the exact path, the path is inside the project root, and no ready environment from another project uses it. These ownership checks do not block `unbind` (`section-remove.ts:103-150`).
4. It collects environments whose canonical paths lie in the section path, then inventories archived and unarchived chats. Selection includes chats explicitly filed in the subtree or chats using those environments; shared paths narrow environment selection to chats explicitly filed in the removed section. Archived chats are excluded (`section-remove.ts:151-177`).
5. It refuses selected parent chats with child chats outside the selection and refuses chats that are running, queued or active. It syncs each selected chat export and waits for pending sync work (`section-remove.ts:178-200`).
6. It removes selected chats from leaf to root. Before each stop it rechecks live status; a newly running chat aborts the operation. `purge` deletes the chat; `unbind` archives it (`section-remove.ts:201-220`).
7. `purge` recursively removes the section directory if it still exists. Both non-archive modes then forget repository metadata for member folders, drop the selected tree members and publish `changed` (`section-remove.ts:222-238`).

| Section mode | Filesystem result | Chat result | Tree result |
|---|---|---|---|
| `archive` | Archive coordinator owns the archive operation | Delegated to archive coordinator | Returns after archive succeeds (`section-remove.ts:76-80`). |
| `unbind` | Keeps folder files | Archives selected, non-archived chats | Drops selected section subtree records (`section-remove.ts:82-101`, `section-remove.ts:199-220`, `section-remove.ts:235-238`). |
| `purge` | Recursively deletes the selected folder after ownership checks | Deletes selected chats | Drops selected section subtree records (`section-remove.ts:114-150`, `section-remove.ts:213-238`). |

## Failures and compensation

| Failure | Result |
|---|---|
| Project move/archive pending, project missing/personal, active chat or queued work | Project deletion throws before project rows or BB project deletion (`project-delete.ts:38-61`). |
| Archive mode has no local folder or overlapping BB project/section | Project deletion throws before moving that source (`project-delete.ts:64-99`). |
| A later source move fails in project archive mode | The operation rejects before plugin rows/BB project deletion; earlier source moves are not rolled back (`project-delete.ts:100-124`). |
| Section missing/group, concurrent move/archive, foreign child section, foreign project/environment ownership | Section removal throws before chat processing or file deletion (`section-remove.ts:66-150`). |
| Selected chat has outside child, active work, or becomes active during removal | Section removal throws; chats already processed in the leaf-first loop are not restored (`section-remove.ts:178-219`). |
| Chat sync, stop, archive/delete, or recursive file removal rejects | The error escapes; the implementation has no transaction or compensation for prior chat/file changes (`section-remove.ts:199-238`). |

## Business rules

- Project deletion treats BB chat activity and queued work as a hard precondition for both file modes (`project-delete.ts:50-61`).
- `keep` preserves local source directories; `archive` uses one archive identifier across all local copies (`project-delete.ts:62-119`).
- `unbind` is the section mode that removes section records while retaining its directory; `purge` is allowed only for a path owned inside the project and without conflicting ownership (`section-remove.ts:103-150`, `section-remove.ts:222-238`).

## Public API or commands

| RPC | Input | Evidence |
|---|---|---|
| `project_delete` | Project ID and `keep` or `archive` file choice (`server.ts:313-323`). |
| `section_remove` | Folder ID and `archive`, `unbind` or `purge` mode (`server.ts:371-380`). |

## Gotchas

- Project archives move source folders before BB project deletion; a failure on a later host leaves earlier moves in the archive (`project-delete.ts:100-124`).
- Section removal syncs exports before changing chat state. A failure later in the operation does not roll back completed syncs or earlier chat actions (`section-remove.ts:199-238`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [Project and section tree](project-tree.md)
