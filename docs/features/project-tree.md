---
title: Project and section tree
type: component
created: 2026-09-27
updated: 2026-10-01
status: active
confidence: medium
tags: [sections, projects, groups, feature]
sources:
  - server.ts
  - section-tree.ts
  - section-move.ts
  - folder-browser.tsx
  - folder-files.ts
  - app.tsx
  - README.md
  - project-delete.ts
---
# Project and section tree

TL;DR: The plugin records a project’s section hierarchy in BB storage while each folder section points to a real directory on one connected host; groups add hierarchy using synthetic paths (`server.ts:686-718`, `server.ts:2152-2178`).

## Purpose

The tree organizes BB project chats by their working folder and supports nested sections, folderless groups, rename, reparent, ordering and multiple device copies (`server.ts:686-718`, `server.ts:2152-2185`, `server.ts:2224-2284`, `server.ts:3089-3135`).

## How it works

### Plugin initialization

1. `plugin(bb)` defines the legacy rule-setting descriptors used only for migration, opens BB storage and passes the schema changes to `bb.storage.migrate`. The migrations create the folder, export, archive and move tables, add rule and preference state, then migrate folder kinds and host path bindings (`server.ts:650-743`). A storage migration error propagates and stops plugin initialization (`server.ts:703-743`).
2. It loads the shared `agents` record from `preferences`. If present, `parseAgents` starts from defaults and keeps only values that pass each field schema. If absent, it reads the legacy declarative settings once; a rejected read is logged, then valid values plus defaults are saved as the new record (`server.ts:744-801`).
3. It builds readers for folder rows and per-host paths, folder binding/resolution helpers, and an in-memory GitHub metadata cache. For connected hosts it requests remotes for selected folder paths; a failed host read is caught so the tree listing remains available (`server.ts:802-924`).
4. Initialization constructs the project/archive coordinators and other domain helpers, builds the handlers, registers the main plugin RPC and separate discoverable read-only section-list contract, configures BB agent instructions, then registers the CLI command group (`server.ts:1941-1952`, `server.ts:2005-2038`, `server.ts:3359-3407`, `server.ts:3537-3632`).

| Initialization branch | Condition | Result or failure |
|---|---|---|
| Existing preferences row | `preferences` contains key `agents` | Parse each known setting against its field schema and use defaults for invalid/missing fields (`server.ts:760-789`). |
| First settings migration | No `agents` row exists | Read legacy fields once; read rejection is logged, then defaults/valid legacy fields are persisted (`server.ts:790-801`). |
| GitHub refresh | Connected host and section paths are selected | Host remote lookup refreshes metadata; read errors are caught so tree listing stays available (`server.ts:875-924`). |
| Storage migration | `bb.storage.migrate` rejects | Initialization rejects before preference loading and handler registration (`server.ts:703-743`). |
| Registration | Initialization reaches registration calls | Register the main typed RPC and separate cross-plugin section listing, configure BB’s agent hook, then register CLI commands (`server.ts:3359-3407`, `server.ts:3537-3632`). |

Database migration and ordinary initialization errors propagate to the plugin loader; only the legacy settings read and GitHub metadata refresh have local recovery paths in these steps (`server.ts:703-743`, `server.ts:790-801`, `server.ts:875-924`).

1. The management UI calls `list` to load folder rows, project roots, workspace bindings, manual chat placements, errors and host state (`server.ts:280-300`, `server.ts:2328-2387`).
2. Creating a section resolves the selected project/parent and host folder, validates relative paths, then creates the directory through the host filesystem API and persists a row in `folders` (`server.ts:1506-1517`, `server.ts:631-648`, `server.ts:1657-1729`).
3. Folder rows store parent identity and sort order. Reparenting changes the tree parent and sibling order; it does not move files (`server.ts:259-266`, `server.ts:2224-2284`).
4. `group_create` stores a synthetic `@group/<id>` path and kind `group`; the path is not a filesystem location, and a section can be created beneath a group (`server.ts:2152-2178`, `server.ts:1657-1674`).
5. `rename` changes a section’s stored display name or the BB project name; it does not change a section path. `section_move` handles path changes: it moves/re-links distinct paths, while shared-source or occupied-destination sections update their path binding without moving files (`server.ts:2796-2810`, `server.ts:2287-2293`, `section-move.ts:227-241`, `section-move.ts:243-293`).
6. `reorder` saves the full project order or sibling-section order and publishes `changed`; the management app refreshes on that event (`server.ts:3089-3135`, `server.ts:1570`, `app.tsx:359`).
7. Project deletion rejects pending project moves or section archives, the personal inbox, and projects with active chats, queued work or activity. `keep` leaves all local copies in place; `archive` moves every local-path source into a sibling project archive on its host. All copies in that deletion share one archive UUID. The plugin then removes its project rows and deletes the BB project (`project-delete.ts:27-60`, `project-delete.ts:62-124`). See [Section archive and restore](archive-and-restore.md) for the dialog’s file-retention choices.

## Modes

| Node | Owns a directory | Can contain | Chat environment | Rules |
|---|---:|---|---:|---:|
| Project root | BB project source | Sections and groups | Yes | Project rule record |
| Folder section | Yes | Sections and groups | Yes, only on its host | Section rule record |
| Group | No | Sections and groups | No | No |

These distinctions are encoded in `Folder.kind` and section-environment checks (`server.ts:119-128`, `server.ts:3485-3535`).

## Failures

| Failure | Result |
|---|---|
| Project has pending moves/archives, active work, or is the personal inbox | Deletion is rejected before plugin rows or the BB project are removed (`project-delete.ts:38-60`). |
| Project file archive is selected with no local folders or another project/section sharing a path | Deletion is rejected; select keep-files or resolve the overlapping owner (`project-delete.ts:62-99`). |
| Creating an archive directory or moving one of several project copies fails | The RPC rejects before project rows or the BB project are deleted. Copies moved earlier in the loop stay in the archive; deletion has no rollback for those moves (`project-delete.ts:100-124`). |
| Relative section path escapes its parent or enters `.bb`/`.git` | Path resolution rejects it before directory creation (`server.ts:631-648`). |
| Requested host is disconnected or has no project/parent folder | The location response marks it unavailable; section creation cannot resolve a folder on that host (`server.ts:2741-2775`, `server.ts:1657-1668`). |
| Folder is registered/protected or not an empty directory | Host directory deletion is rejected (`folder-files.ts:22-38`). |

## Business rules

- Names and paths are validated before folder creation. Relative paths cannot traverse upward, enter `.bb` or `.git`, or resolve to the parent itself; an absolute path can select a folder elsewhere on the same device after external-path ownership checks (`server.ts:141-145`, `server.ts:631-648`, `server.ts:1657-1687`).
- Groups use a synthetic path rather than a filesystem folder and cannot be selected as a chat environment (`server.ts:2152-2178`, `server.ts:3485-3509`).
- A new section environment must belong to the selected project and have a folder binding on the selected host; a busy move or archive blocks environment creation (`server.ts:3485-3509`).
- Section depth is for display/inheritance; groups do not increment it (`section-tree.ts:8-11`, `app.tsx:115-128`).
- The folder browser lists child directories and the host folder editor refuses path traversal, symlinks and registered folders (`folder-browser.tsx:9-68`, `folder-files.ts:3-41`).
- Project deletion is irreversible from the plugin for BB chats; choose `keep` to leave all project directories or `archive` to move every local-path source before BB deletes the project. The archive option requires at least one local source and uses a shared UUID for the project’s copies (`app.tsx:948-985`, `project-delete.ts:62-124`).
- After a successful archive, the RPC’s `archivePath` identifies the first source’s archive destination; later copy destinations use the same UUID under their own parent paths (`project-delete.ts:100-124`, `server.ts:331-340`).

### Folder browser behavior

1. The browser receives the selected host, current path, parent path, directory entries, loading state and navigation/refresh callbacks. It disables controls while loading or while a folder edit is in flight (`folder-browser.tsx:9-31`).
2. The toolbar navigates to the parent only when one exists and opens a new-folder form. Directory rows navigate into a child or open an empty-folder deletion confirmation (`folder-browser.tsx:41-68`, `folder-browser.tsx:132-174`).
3. Create opens an inline form; Enter or the check button calls `edit("create", trimmedName)`. Delete opens a confirmation; its destructive button calls `edit("delete", selectedName)`. The shared `edit` function sends `folder_edit` with the component’s `hostId` and current `path` as `parent`; on success it closes both forms, clears the name and refreshes the directory list (`folder-browser.tsx:73-84`, `folder-browser.tsx:100-120`, `folder-browser.tsx:183-199`, `folder-browser.tsx:40-49`).

| Browser state | Inputs/condition | Outcome |
|---|---|---|
| Browsing | `loading=false`, no pending edit | Child directories are shown; empty results show “no nested folders” (`folder-browser.tsx:132-157`). |
| Creating | User opens new-folder form | Enter/check submits a non-empty trimmed name; Escape/cancel closes the form (`folder-browser.tsx:54-68`, `folder-browser.tsx:69-130`). |
| Confirming deletion | User selects a child’s trash action | User can cancel or request deletion; browser explains only empty folders can be removed (`folder-browser.tsx:158-204`). |
| Busy/error | RPC in progress or rejected | Inputs/actions are disabled while busy; RPC errors render as an alert; completion always clears busy state (`folder-browser.tsx:32-39`, `folder-browser.tsx:200-205`). |

The server forwards directory edits to the selected connected host; host validation can reject invalid names, protected/registered paths, symlinks, non-empty directories, or filesystem errors (`server.ts:2396-2442`, `folder-files.ts:3-41`).

## Public API

| RPC or command | Purpose | Evidence |
|---|---|---|
| `list`, `machines`, `project_browse`, `project_create`, `project_delete` | Load tree and hosts, browse/create/remove BB projects; `project_delete` accepts a keep/archive file choice (`server.ts:331-340`, `server.ts:2491`, `project-delete.ts:27-124`) |
| `create`, `group_create`, `group_delete`, `rename`, `reorder`, `section_reparent`, `folder_edit` | Change sections, groups, names, ordering and directories | `server.ts:234-310`, `server.ts:371-414` |
| `locations`, `browse` | Select host/path for a new section | `server.ts:372-394` |
| `sections_list` | Read-only section listing for other plugins; optional project filter | `server.ts:170-185`, `server.ts:3359-3382` |
| `bb project-folders list`, `create` | CLI tree listing and section creation | `server.ts:3580-3588`, `server.ts:3665-3676` |

## Gotchas

- A section can be on a different host or outside its parent’s folder; creating it on another host uses that host’s project copy, and an external path is checked against project ownership (`server.ts:1510-1517`, `server.ts:1535-1568`).
- Renaming a section changes its display name. For a path change, use `section_move`; shared paths can change binding without a filesystem move (`server.ts:2796-2810`, `server.ts:2287-2293`, `section-move.ts:227-241`).
- Deleting a group is constrained to an empty group (`server.ts:2180-2192`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [API and commands](../api.md)
- [Architecture](../architecture.md)
- [Section archive and restore](archive-and-restore.md)
- [Projects & Sections — Overview](../overview.md)
