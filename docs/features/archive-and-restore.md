---
title: Section archive and restore
type: component
created: 2026-09-27
updated: 2026-10-09
status: active
confidence: medium
tags: [archive, restore, sections]
sources:
  - archive.ts
  - server.ts
  - app.tsx
  - thread-move.ts
  - project-delete.ts
  - section-remove.ts
  - README.md
---
# Section archive and restore

TL;DR: Section removal offers archive, unbind or purge; archive journals and retains a restorable subtree, unbind keeps its files while archiving its chats, and purge deletes eligible files and chats (`section-remove.ts:48-79`, `section-remove.ts:199-238`).

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

1. The factory binds the database and callbacks for folder lookup, canonical paths, project moves, project roots, history sync, pending exports and change notifications. `list` reads newest-first and parses each JSON record with `archiveSchema`; invalid JSON or record shape rejects the read (`archive.ts:50-72`).
2. The lookup functions answer three questions: `matches` searches completed archives for the same project and host by NFC-normalized lowercase section name or path basename; `blocked` checks whether any archive contains a thread ID; `moving` checks whether a canonicalized path is inside a same-host archive whose state is not `archived` (`archive.ts:73-95`).
3. Archive and restore calls share one promise queue. Each caller receives its operation result or rejection; the stored queue tail catches rejection so the next queued operation still runs. Thread inventory covers visible and hidden chats across both archived states and pages in batches of 200 (`archive.ts:96-117`).
4. For a new archive, the coordinator resolves the section and project root, rejects a nested BB project or a ready foreign-project environment, and selects threads whose environments lie under the section. When another section shares the same host path, only threads manually placed in the selected section are included. A selected thread with a child outside the selection, busy status, queued work or positive activity rejects the request; so does a child section outside the archived subtree. Selected histories are synced before the `archiving` record is written (`archive.ts:119-240`, `archive.ts:241-268`).
5. An existing record for the same folder in `archiving` state resumes with its saved members and thread IDs. After journaling, the coordinator drains pending exports, rescans for late chats, rejects late busy work, records eligible late threads, and stops/archives threads that were not already archived. An internal unshared directory moves under the project archive with a manifest; an external or shared directory stays in place. Both source and destination existing, or neither existing, rejects without replacing a folder (`archive.ts:119-126`, `archive.ts:250-268`, `archive.ts:270-358`).
6. Finalization runs in a database transaction: it removes each member’s folder-path and folder rows, sets `state` to `archived` and clears the journal error (`archive.ts:360-368`). The change notification follows the transaction (`archive.ts:369`). Failures before the journal is written reject without an archive retry record; failures caught after journaling save the error and notify listeners, leaving an `archiving` record for retry (`archive.ts:238-268`, `archive.ts:371-377`).

| Archive state | Entry and next action | Failure behavior |
|---|---|---|
| No record | Validate ownership, environments, members and chats; sync histories, then persist an `archiving` record (`archive.ts:119-268`). | Pre-journal errors reject without a retry record (`archive.ts:128-240`). |
| `archiving` | Reuse the saved paths, members and chat IDs; drain pending exports, rescan for late chats and continue (`archive.ts:121-126`, `archive.ts:270-321`). | Post-journal errors are stored for a later retry (`archive.ts:371-375`). |
| `archived` | The subtree is absent from active folder rows; matching and restore can find the record (`archive.ts:73-82`, `archive.ts:379-430`). | Restore rejects during a project move, if its parent is absent, or if the original path is occupied (`archive.ts:381-406`). |
| `restoring` | Persisted before recreating rows and unarchiving saved chats (`archive.ts:407-430`). | A restore error is saved on the archive record (`archive.ts:462-466`). |

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

| Section removal mode | Files and tree | Chats | Evidence |
|---|---|---|---|
| `archive` | Archives the section subtree through the archive coordinator; files inside the project move into its archive and the archive record supports restore | The archive coordinator archives eligible chats | `section-remove.ts:76-79`, `archive.ts:294-331` |
| `unbind` | Removes the selected section and its nested members from the plugin tree; leaves directories in place | Syncs selected chat histories, then stops and archives chats in BB | `section-remove.ts:82-102`, `section-remove.ts:199-238` |
| `purge` | Same tree removal, then recursively removes the selected folder | Syncs histories, then stops and deletes selected chats in BB | `section-remove.ts:199-238` |

For `unbind` and `purge`, the selected set consists of the real section and real descendant folders on the same project and host whose paths lie inside it, plus nested groups. A child section outside that set blocks removal. Chat inventory includes hidden and archived BB threads in pages of 200, then excludes chats already archived; a live manual placement into the removed subtree selects the chat, otherwise its environment path selects it. If another section shares the selected path, only chats explicitly placed in the selected section are included (`section-remove.ts:15-45`, `section-remove.ts:82-102`, `section-remove.ts:151-177`).

| Archive state | Meaning |
|---|---|
| `archiving` | Operation journal exists; retry can continue |
| `archived` | Section is in archive; eligible for restore or matching |
| `restoring` | Restore operation journal exists |

The same dialog also removes projects. It offers `keep` or `archive`; `keep` leaves every project copy in place, while `archive` moves each local-path source to a sibling `.bb/archive/projects/<uuid>/folder` path on its host, using one UUID across copies, before deleting the BB project (`app.tsx:948-985`, `app.tsx:560-563`, `project-delete.ts:62-124`). Project deletion checks and ownership rules are documented in [Project and section tree](project-tree.md).

### Folder dialog entry points

1. When its action or target changes, `FolderDialog` resets name/path selection, archive matches, rules drafts, project file mode and section-removal mode. Section creation loads available locations; project-level rules load machine choices, while section rules read immediately and project rules wait for a selected host (`app.tsx:429-500`).
2. The location selector chooses a device. The browser calls `project_browse` on that host; selecting a result stores it relative to the project location when inside it, otherwise keeps the picked path absolute (`app.tsx:508-539`, `app.tsx:680-755`).
3. Create first calls `archive_matches` unless the user explicitly continues with fresh creation. An archive match can be restored; otherwise `create` receives the host, name and path. Group, rename, section removal, project removal and rule editing dispatch through their matching RPC branch (`app.tsx:540-616`, `app.tsx:618-629`).
4. The section-removal radio group selects `unbind`, `archive` or `purge`; project removal selects keep-files or archive-files. Submit sends the chosen mode to `section_remove` or `project_delete` (`app.tsx:952-1005`, `app.tsx:1008-1048`, `app.tsx:569-579`).
5. Success refreshes the caller and closes the dialog. RPC errors remain visible; save and restore clear busy state in `finally`, and close is ignored while a request is busy (`app.tsx:540-629`, `app.tsx:645-659`).

| Dialog branch | Inputs and result | Failure or alternate outcome |
|---|---|---|
| Create with archive match | Name, host and relative/absolute folder choice; matching archive entries appear before creation (`app.tsx:540-564`, `app.tsx:764-791`). | Restore returns the saved subtree and chats; restore errors remain in the dialog (`app.tsx:618-629`, `app.tsx:779-789`). |
| Fresh create | Explicit fresh choice or no match; calls `create` (`app.tsx:545-564`). | Location, browse or create RPC errors render in the dialog (`app.tsx:439-450`, `app.tsx:508-531`, `app.tsx:611-615`). |
| Remove section | One of `unbind`, `archive` or `purge`; calls `section_remove` (`app.tsx:952-1005`, `app.tsx:569-574`). | Server refusal is shown and the dialog stays open (`app.tsx:611-615`, `app.tsx:657-660`). |
| Remove project | `keep` or `archive`; calls `project_delete` (`app.tsx:1008-1048`, `app.tsx:575-579`). | Server refusal is shown; success refreshes and closes (`app.tsx:609-615`). |

| Folder location | Archive behavior |
|---|---|
| Inside project root | Move the folder under `.bb/archive/sections/<id>/folder` |
| Outside project root | Keep the directory in place; archive tree record and chats |

| `FolderDialog` action | RPC path and result |
|---|---|
| Create | `archive_matches` first; then restore an archive match or call `create`, unless fresh creation is explicitly selected (`app.tsx:528-552`, `app.tsx:601-613`). |
| Remove section | Calls `section_remove` with the selected `archive`, `unbind` or `purge` mode (`app.tsx:569-574`, `app.tsx:952-985`). |
| Remove project | Calls `project_delete` with `keep` or `archive` file behavior (`app.tsx:560-563`, `app.tsx:948-985`). |
| Group, rename or rules | Calls the matching tree/rules RPC; details live on [Project and section tree](project-tree.md) and [Agent rules](agent-rules.md) (`app.tsx:553-590`). |

The dialog catches RPC failures, displays the error, and clears its busy state in `finally` (`app.tsx:528-600`, `app.tsx:601-613`).

State and location fields: `archive.ts:15-28`, `archive.ts:219-240`, `archive.ts:294-331`.

## Failures

| Failure | Result |
|---|---|
| Active chats, queued work, cross-project environment or invalid subtree | Preflight rejects archive before its move completes (`archive.ts:128-218`). |
| Section has running chats, queued work, a pending move/archive, or is a group | Removal rejects before deleting or unbinding it (`section-remove.ts:66-75`, `section-remove.ts:187-197`). |
| `purge` target is outside its project, shared by another section, contains another project/environment, or has a child section outside the removed subtree | Purge rejects and preserves the files/tree (`section-remove.ts:82-150`). |
| A selected chat becomes active after preflight | Removal rejects that chat and stops before processing it (`section-remove.ts:199-212`). |
| Chat operation fails partway through | Already synced or archived/deleted chats are not rolled back; plugin tree rows are dropped only after the selected chat loop and any purge file removal complete (`section-remove.ts:199-238`). |
| New chat starts after journal creation | Archive records/merges eligible late chats; active late work stops and leaves an error journal (`archive.ts:242-283`). |
| Both source and archive paths exist | Operation stops without overwriting either folder and stores the error (`archive.ts:324-335`, `archive.ts:371-375`). |
| Restore destination is occupied | Restore refuses to overwrite it; archive remains available (`archive.ts:349-430`). |

## Business rules

- The operation rejects selected chats whose status is active, starting, stopping or pending, or that have queued work or positive activity (`archive.ts:185-211`).
- It rejects folders containing another BB project or a ready environment from another project (`archive.ts:128-156`).
- Restore never overwrites an occupied destination; errors remain on the archive record for retry (`archive.ts:392-406`, `archive.ts:462-466`).
- Groups nested beneath archived members are stored and restored as part of the subtree (`archive.ts:30-48`).
- Archive does not permanently delete files (`archive.ts:349-430`).
- `unbind` leaves section directories in place; `purge` is limited to a folder within the project and refuses shared paths and nested project/environment ownership (`section-remove.ts:114-150`, `section-remove.ts:222-233`).
- Section removal syncs each selected chat before waiting for pending sync work, then archives chats for `unbind` or deletes them for `purge` (`section-remove.ts:199-218`).
- For a shared section path, `unbind` and `purge` process chats manually filed in the selected section, not all chats whose environment uses that path (`section-remove.ts:119-128`, `section-remove.ts:171-177`).

## Public API

| RPC / command | Purpose | Evidence |
|---|---|---|
| `archive_list`, `archive_matches`, `archive`, `restore`, `forget` | List, match, archive, restore or use archive compatibility operation | `server.ts:361-399` |
| `section_remove` | Remove a section using `archive`, `unbind` or `purge` | `server.ts:359-368`, `server.ts:2385-2437`, `section-remove.ts:48-79` |
| `bb project-folders remove-section <folder-id> archive\|unbind\|purge` | CLI section-removal operation | `server.ts:3827-3832`, `server.ts:3943-3947` |
| `bb project-folders archives`, `archive`, `restore`, `forget` | CLI archive operations | `server.ts:3565-3577`, `server.ts:3715-3722` |

## Gotchas

- An archive can be `archived` while its external directory stays at its original path (`archive.ts:26-27`, `archive.ts:322-324`).
- Running work or late chats can stop an operation after the journal was created; retry resumes through the persisted record (`archive.ts:119-126`, `archive.ts:242-283`, `archive.ts:371-375`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [RPC and host contract behavior](../api-contracts.md)
- [Data model](../data-model.md)
- [Project and section tree](project-tree.md)
