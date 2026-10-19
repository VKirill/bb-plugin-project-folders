---
title: Project and section tree
type: component
created: 2026-09-27
updated: 2026-10-19
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
  - section-remove.ts
  - preferences.ts
  - tree-layout.ts
  - style.css
---
# Project and section tree

TL;DR: The plugin records a project’s section hierarchy in BB storage while each folder section points to a real directory on one connected host; groups add hierarchy using synthetic paths (`server.ts:705-737`, `server.ts:2255-2281`).

## Purpose

The tree organizes BB project chats by their working folder and supports nested sections, folderless groups, rename, reparent, ordering and multiple device copies (`server.ts:705-737`, `server.ts:2185-2218`, `server.ts:2257-2317`, `server.ts:3122-3168`).

## How it works

### Plugin initialization

1. BB calls the exported async `plugin(bb)` entry. It first defines the pre-0.4.1 declarative rule settings for one-time migration, then opens plugin storage and applies the ordered SQL migrations. The migration sequence creates the initial folders, export, archive and move records, adds ordering/rules/preferences, then adds groups, manual chat placements, execution/session settings, per-host paths and keepalive records; it copies legacy folder paths and rebuilds `folders` with the new columns (`server.ts:682-776`). This phase has no local catch, so a storage/migration rejection rejects plugin initialization before the subsequent setup runs (`server.ts:735-776`).
2. It creates the keepalive store and lifecycle listeners, then defines the shared agents defaults and field schemas. `parseAgents` begins with defaults and replaces a field only when that field passes its own schema (`server.ts:777-833`, `server.ts:834-842`). If `preferences` contains an `agents` row, the parsed values become the in-memory settings. If the row is absent, it reads the legacy declarative settings, logs a rejected read, parses the values over defaults, then persists the migrated record (`server.ts:843-867`).
3. It builds folder and per-host path readers, bindings, path resolution and project-move canonicalization. It also creates the repository metadata cache. When `list` finds uncached paths on connected hosts, the refresh calls `repo_remotes`; successful results update cached URLs, while a failed host read is caught and leaves the list available with previous metadata retained (`server.ts:868-941`, `server.ts:942-1023`, `server.ts:1026-1038`, `server.ts:2484-2544`).
4. It constructs project-move, archive, chat-move and section-move coordinators, then assembles the RPC handlers and registers the section environment provider. These factory and registration calls have no local catch in the async plugin body; a synchronous throw rejects initialization (`server.ts:2069-2179`, `server.ts:3579-3603`, `server.ts:3732-3757`).
5. It registers the main typed RPC, the separate discoverable section-list RPC and BB’s agent-instruction callback, then registers the `project-folders` CLI group. The registration calls are direct calls in the async plugin body, with no local catch (`server.ts:3579-3604`, `server.ts:3604-3627`, `server.ts:3780-3790`).

| Initialization branch | Condition | Result or failure |
|---|---|---|
| Existing agents row | `preferences` contains key `agents` | Start from defaults; keep each stored field only when its own schema accepts it. The valid parsed value stays in memory (`server.ts:826-842`, `server.ts:849-855`). |
| Legacy settings migration | No `agents` row exists | Read the old declarative settings once. On read failure, log a warning and continue with defaults; valid legacy fields override defaults and the result is saved under `agents` (`server.ts:854-867`). |
| Storage migration | `bb.storage.migrate` completes or throws | Completion proceeds to keepalive/settings setup; an error escapes before those steps and before RPC, environment or CLI registration (`server.ts:735-776`, `server.ts:777-867`, `server.ts:3579-3602`, `server.ts:3732-3789`). |
| Legacy rule settings | No `agents` preference row; legacy settings read succeeds or rejects | On success, valid legacy values are parsed over defaults and saved to `preferences`; on read rejection, the warning is logged, defaults are parsed and saved. Once an `agents` row exists, it is parsed directly and legacy settings are not read (`server.ts:834-867`). |
| Repository metadata refresh | `list` has an uncached path on a connected host | `repo_remotes` values populate the cache; failures are caught, keep old URLs, and set the attempted timestamp to back off another immediate read (`server.ts:975-1023`, `server.ts:1026-1038`, `server.ts:2484-2544`). Disconnected hosts and groups are skipped (`server.ts:1026-1036`). |
| Registration | Initialization reaches the registration calls | The main and section-list RPCs, agent callback, section environment and CLI are registered directly. A thrown error rejects the async plugin function; environment validation and creation failures instead return refusal/failed results (`server.ts:3579-3604`, `server.ts:3732-3757`, `server.ts:3780-3790`). |

1. The management UI calls `list` to load folder rows, project roots, workspace bindings, manual chat placements, errors and host state (`server.ts:287-307`, `server.ts:2477-2545`).
2. Creating a section resolves the selected project/parent and host folder, validates relative paths, then creates the directory through the host filesystem API and persists a row in `folders` (`server.ts:1576-1627`, `server.ts:650-667`, `server.ts:1774-1851`).
3. Folder rows store parent identity and sort order. Reparenting changes the tree parent and sibling order; it does not move files (`server.ts:266-273`, `server.ts:2320-2381`).
4. `group_create` stores a synthetic `@group/<id>` path and kind `group`; the path is not a filesystem location, and a section can be created beneath a group (`server.ts:2248-2275`, `server.ts:1774-1851`).
5. `rename` changes a section’s stored display name or the BB project name; it does not change a section path. `section_move` handles path changes: it moves/re-links distinct paths, while shared-source or occupied-destination sections update their path binding without moving files (`server.ts:2950-2981`, `server.ts:2383-2389`, `section-move.ts:227-241`, `section-move.ts:243-293`).
6. `reorder` saves the full project order or sibling-section order and publishes `changed`; the management app refreshes on that event (`server.ts:3249-3295`, `server.ts:1603`, `app.tsx:359`).
7. Project deletion rejects pending project moves or section archives, the personal inbox, and projects with active chats, queued work or activity. `keep` leaves all local copies in place; `archive` moves every local-path source into a sibling project archive on its host. All copies in that deletion share one archive UUID. The plugin then removes its project rows and deletes the BB project (`project-delete.ts:27-60`, `project-delete.ts:62-124`). See [Section archive and restore](archive-and-restore.md) for the dialog’s file-retention choices.
8. Section deletion calls `section_remove`, which supports archive, unbind and purge modes; its chat selection, path ownership checks and refusal cases are documented in [Section archive and restore](archive-and-restore.md#modes) (`app.tsx:569-574`, `server.ts:366-375`, `section-remove.ts:48-79`).
9. Hide/show actions on project and section menus persist a `hidden` flag in item styles. Hidden nodes leave the sidebar tree unless “Show hidden” is enabled; their chats and work remain available (`app.tsx:2221-2233`, `app.tsx:2455-2459`, `app.tsx:2553-2562`). The management page reads the same item-style flag and exposes a matching hide/show action (`app.tsx:3089-3100`, `app.tsx:4214-4222`).
10. The sidebar derives shared row geometry from the saved indent: child guides center on the parent chevron, and chat rows reserve the chevron column so chat markers align with child-section markers and “Show all” (`tree-layout.ts:8-23`, `app.tsx:2460-2468`, `style.css:2057-2091`). Indent is clamped to 0–32 pixels; non-finite values use 8 pixels (`tree-layout.ts:8-12`).

## Modes

### New-project starting folder

In plugin settings, **Projects → New project starting folder** accepts an absolute directory path, saved when the field loses focus or Enter is pressed. It is shared across devices through `prefs.projects.startingFolder` in the existing server preferences. Blank keeps the selected device's home directory. Older saved preferences and imports also default to blank (`preferences.ts`, `plugin-settings.tsx`).

The New project dialog in both the sidebar and management page starts its folder browser at this directory and suggests `<starting-folder>/<project-name>`. Manually entering or selecting a folder overrides that suggestion. The setting is read when the dialog opens or the selected device changes; updates do not replace a choice already being edited (`app.tsx`, `prefs-store.tsx`).

If the configured directory is unavailable, the dialog warns and uses the home directory on the same selected device. If that device cannot be browsed, the error remains visible and creation is disabled. The setting does not create the starting directory. Other folder pickers continue to use their existing starting locations (`app.tsx`, `server.ts`).

| Node | Owns a directory | Can contain | Chat environment | Rules |
|---|---:|---|---:|---:|
| Project root | BB project source | Sections and groups | Yes | Project rule record |
| Folder section | Yes | Sections and groups | Yes, only on its host | Section rule record |
| Group | No | Sections and groups | No | No |

These distinctions are encoded in `Folder.kind` and section-environment checks (`server.ts:126-135`, `server.ts:3697-3757`).

Hidden state is a presentation preference stored with the project or section’s item style. It filters the sidebar tree, not the underlying project, section, chats or work; the setting to show hidden items is part of [Chat list and activity](chat-list.md#modes) (`preferences.ts:59-64`, `app.tsx:2155-2167`).

## Failures

| Failure | Result |
|---|---|
| Project has pending moves/archives, active work, or is the personal inbox | Deletion is rejected before plugin rows or the BB project are removed (`project-delete.ts:38-60`). |
| Project file archive is selected with no local folders or another project/section sharing a path | Deletion is rejected; select keep-files or resolve the overlapping owner (`project-delete.ts:62-99`). |
| Creating an archive directory or moving one of several project copies fails | The RPC rejects before project rows or the BB project are deleted. Copies moved earlier in the loop stay in the archive; deletion has no rollback for those moves (`project-delete.ts:100-124`). |
| Relative section path escapes its parent or enters `.bb`/`.git` | Path resolution rejects it before directory creation (`server.ts:650-667`). |
| Requested host is disconnected or has no project/parent folder | The location response marks it unavailable; section creation cannot resolve a folder on that host (`server.ts:2895-2930`, `server.ts:1774-1851`). |
| Folder is registered/protected or not an empty directory | Host directory deletion is rejected (`folder-files.ts:22-38`). |

## Business rules

- Names and paths are validated before folder creation. Relative paths cannot traverse upward, enter `.bb` or `.git`, or resolve to the parent itself; an absolute path can select a folder elsewhere on the same device after external-path ownership checks (`server.ts:148-152`, `server.ts:650-667`, `server.ts:1690-1720`).
- Groups store an `@group/<id>` marker instead of a filesystem path, and section-environment validation rejects a group because it has no folder of its own (`server.ts:2255-2281`, `server.ts:3706-3714`).
- A new section environment must belong to the selected project and have a folder binding on the selected host; a busy move or archive blocks environment creation (`server.ts:3697-3733`).
- Section depth is for display/inheritance; groups do not increment it (`section-tree.ts:8-11`, `app.tsx:115-128`).
- The folder browser lists child directories and the host folder editor refuses path traversal, symlinks and registered folders (`folder-browser.tsx:9-68`, `folder-files.ts:3-41`).
- Project deletion is irreversible from the plugin for BB chats; choose `keep` to leave all project directories or `archive` to move every local-path source before BB deletes the project. The archive option requires at least one local source and uses a shared UUID for the project’s copies (`app.tsx:948-985`, `project-delete.ts:62-124`).
- After a successful archive, the RPC’s `archivePath` identifies the first source’s archive destination; later copy destinations use the same UUID under their own parent paths (`project-delete.ts:100-124`, `server.ts:338-347`).

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

The server forwards directory edits to the selected connected host; host validation can reject invalid names, protected/registered paths, symlinks, non-empty directories, or filesystem errors (`server.ts:2546-2592`, `folder-files.ts:3-41`).

## Public API

| RPC or command | Purpose | Evidence |
|---|---|---|
| `list`, `machines`, `project_browse`, `project_create`, `project_delete` | Load tree and hosts, browse/create/remove BB projects; `project_delete` accepts a keep/archive file choice (`server.ts:275-317`, `server.ts:2641`, `project-delete.ts:27-124`) |
| `create`, `group_create`, `group_delete`, `rename`, `reorder`, `section_reparent`, `folder_edit` | Change sections, groups, names, ordering and directories | `server.ts:241-317`, `server.ts:378-421` |
| `locations`, `browse` | Select host/path for a new section | `server.ts:379-401` |
| `sections_list` | Read-only section listing for other plugins; optional project filter | `server.ts:155-172`, `server.ts:3579-3602` |
| `section_remove` | Archive, unbind or purge a section and its selected chats | `server.ts:366-375`, `section-remove.ts:48-79` |
| `bb project-folders list`, `create` | CLI tree listing and section creation | `server.ts:3622-3630`, `server.ts:3707-3718` |

## Gotchas

- Section creation can choose another connected host’s project copy even when its tree parent is elsewhere; an absolute path outside that project folder is checked against project ownership on the selected host (`server.ts:1594-1639`, `server.ts:1645-1652`, `server.ts:1654-1703`, `server.ts:1781-1792`).
- Renaming a section changes its display name. For a path change, use `section_move`; shared paths can change binding without a filesystem move (`server.ts:2829-2843`, `server.ts:2320-2326`, `section-move.ts:227-241`).
- Deleting a group is constrained to an empty group (`server.ts:2276-2288`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [API and commands](../api.md)
- [Architecture](../architecture.md)
- [Appearance and preferences](appearance-settings.md)
- [Section archive and restore](archive-and-restore.md)
- [Chat list and activity](chat-list.md)
- [Projects & Sections — Overview](../overview.md)
