---
title: Project and section tree
type: component
created: 2026-09-27
updated: 2026-09-28
status: active
confidence: low
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

TL;DR: The plugin records a project’s section hierarchy in BB storage while each folder section points to a real directory on one connected host; groups add hierarchy without owning a directory (`server.ts:686-718`, `server.ts:234-240`).

## Purpose

The tree organizes BB project chats by their working folder and supports nested sections, folderless groups, rename, reparent, ordering and multiple device copies (`server.ts:686-718`, `server.ts:234-261`, `server.ts:400-414`).

## How it works

1. The management UI calls `list` to load folder rows, project roots, workspace bindings, manual chat placements, errors and host state (`server.ts:280-300`, `server.ts:3214-3225`).
2. Creating a section validates its project/parent and relative path, then creates/selects the directory through the host filesystem API and persists a row in `folders` (`server.ts:612-629`, `server.ts:1640-1672`).
3. Folder rows store parent identity and sort order. Reparenting changes the tree parent and sibling order; it does not move files (`server.ts:255-262`, `server.ts:2215-2223`).
4. A group row is assigned an internal `@group/<id>` path and kind `group`; its descendants can contain real sections (`server.ts:234-240`, `server.ts:2100-2117`).
5. `rename` changes a section’s stored display name or the BB project name; it does not change a section path. `section_move` handles path changes: it moves/re-links distinct paths, while shared-source or occupied-destination sections update their path binding without moving files (`server.ts:2796-2810`, `server.ts:2287-2293`, `section-move.ts:227-241`, `section-move.ts:243-293`).
6. `reorder` saves project or sibling section ordering; the app reloads the tree after a `changed` event (`server.ts:400-414`, `server.ts:3214-3225`).
7. Project deletion rejects pending project moves or section archives, the personal inbox, and projects with active chats, queued work or activity. `keep` leaves files in place; `archive` requires exactly one local folder and moves it into the project archive before deleting the BB project and its plugin rows (`project-delete.ts:27-60`, `project-delete.ts:62-119`). See [Section archive and restore](archive-and-restore.md) for the dialog’s file-retention choices.

## Modes

| Node | Owns a directory | Can contain | Chat environment | Rules |
|---|---:|---|---:|---:|
| Project root | BB project source | Sections and groups | Yes | Project rule record |
| Folder section | Yes | Sections and groups | Yes, only on its host | Section rule record |
| Group | No | Sections and groups | No | No |

These distinctions are encoded in `Folder.kind` and section-environment checks (`server.ts:119-128`, `server.ts:3328-3388`).

## Failures

| Failure | Result |
|---|---|
| Project has pending moves/archives, active work, or is the personal inbox | Deletion is rejected before plugin rows or the BB project are removed (`project-delete.ts:38-60`). |
| Project file archive is selected with multiple/no local folders or another project/section sharing the path | Deletion is rejected; select keep-files or resolve the overlapping owner (`project-delete.ts:62-97`). |
| Invalid, absolute or escaping section path | Creation is rejected before persistence (`server.ts:612-629`). |
| Requested host is disconnected or lacks a project copy | Location is unavailable; section creation cannot proceed (`server.ts:2880-2940`, `server.ts:372-384`). |
| Folder is registered/protected or not an empty directory | Host directory deletion is rejected (`folder-files.ts:22-38`). |

## Business rules

- Names and paths are validated before folder creation; a section relative path cannot be absolute, traverse upward, enter `.bb` or `.git`, or resolve to its parent itself (`server.ts:612-629`, `server.ts:153-160`).
- Groups have no filesystem folder and cannot be selected as a chat environment (`server.ts:234-240`, `server.ts:3340-3348`).
- A new section environment must belong to the selected project and host; a busy project/section move or archive blocks environment creation (`server.ts:3340-3362`).
- Section depth is for display/inheritance; groups do not increment it (`section-tree.ts:8-11`, `app.tsx:115-128`).
- The folder browser lists child directories and the host folder editor refuses path traversal, symlinks and registered folders (`folder-browser.tsx:9-68`, `folder-files.ts:3-41`).
- Project deletion is irreversible from the plugin for BB chats; choose `keep` to leave the project directory or `archive` to move its single local folder before BB deletes the project (`app.tsx:948-985`, `project-delete.ts:99-119`).

### Folder browser behavior

1. The browser receives the selected host, current path, parent path, directory entries, loading state and navigation/refresh callbacks. It disables controls while loading or while a folder edit is in flight (`folder-browser.tsx:9-31`).
2. The toolbar navigates to the parent only when one exists and opens a new-folder form. Directory rows navigate into a child or open an empty-folder deletion confirmation (`folder-browser.tsx:41-68`, `folder-browser.tsx:132-174`).
3. Create submits a trimmed non-empty name on Enter or the check button; delete requires the confirmation button. Both call `folder_edit` with the current path as parent, then clear the form and refresh on success (`folder-browser.tsx:32-39`, `folder-browser.tsx:69-130`, `folder-browser.tsx:175-205`).

| Browser state | Inputs/condition | Outcome |
|---|---|---|
| Browsing | `loading=false`, no pending edit | Child directories are shown; empty results show “no nested folders” (`folder-browser.tsx:132-157`). |
| Creating | User opens new-folder form | Enter/check submits a non-empty trimmed name; Escape/cancel closes the form (`folder-browser.tsx:54-68`, `folder-browser.tsx:69-130`). |
| Confirming deletion | User selects a child’s trash action | User can cancel or request deletion; browser explains only empty folders can be removed (`folder-browser.tsx:158-204`). |
| Busy/error | RPC in progress or rejected | Inputs/actions are disabled while busy; RPC errors render as an alert; completion always clears busy state (`folder-browser.tsx:32-39`, `folder-browser.tsx:200-205`). |

The server forwards directory edits to the selected host; host validation can reject invalid names, protected/registered paths, symlinks, non-empty directories, or filesystem errors (`server.ts:371-384`, `folder-files.ts:3-41`).

## Public API

| RPC or command | Purpose | Evidence |
|---|---|---|
| `list`, `machines`, `project_browse`, `project_create`, `project_delete` | Load tree and hosts, browse/create/remove BB projects; `project_delete` accepts a keep/archive file choice (`server.ts:331-340`, `server.ts:2491`, `project-delete.ts:27-119`) |
| `create`, `group_create`, `group_delete`, `rename`, `reorder`, `section_reparent`, `folder_edit` | Change sections, groups, names, ordering and directories | `server.ts:234-310`, `server.ts:371-414` |
| `locations`, `browse` | Select host/path for a new section | `server.ts:372-394` |
| `sections_list` | Read-only section listing for other plugins; optional project filter | `server.ts:170-185`, `server.ts:3214-3228` |
| `bb project-folders list`, `create` | CLI tree listing and section creation | `server.ts:3433-3441`, `server.ts:3508-3519` |

## Gotchas

- A section can be on a different host or outside its parent’s folder, but it still requires the project to have a local folder on that host (`server.ts:2623-2644`).
- Renaming a section changes its display name. For a path change, use `section_move`; shared paths can change binding without a filesystem move (`server.ts:2796-2810`, `server.ts:2287-2293`, `section-move.ts:227-241`).
- Deleting a group is constrained to an empty group (`server.ts:2120-2131`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [API and commands](../api.md)
- [Architecture](../architecture.md)
- [Section archive and restore](archive-and-restore.md)
- [Projects & Sections — Overview](../overview.md)
