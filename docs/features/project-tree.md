---
title: Project and section tree
type: component
created: 2026-09-27
updated: 2026-10-26
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
  - components/ui/hooks/use-compact-viewport.tsx
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

Plugin startup starts by declaring the legacy agent settings and opening BB plugin storage. It sends the ordered tree, rules, journal, preference and execution migrations to `bb.storage.migrate`; a storage-open or migration error rejects the async plugin entry before runtime setup (`server.ts:682-776`). On success, startup proceeds to runtime settings and domain-service construction ([Plugin initialization](plugin-initialization.md), `server.ts:735-809`).

| Startup branch | Condition | Outcome or failure |
|---|---|---|
| Storage and migrations | BB storage opens and the migration call resolves | Continue to runtime settings and service setup (`server.ts:735-777`). |
| Storage failure | Opening storage or applying migrations throws | Plugin initialization rejects before later registration (`server.ts:735-776`, `server.ts:3579-3789`). |

1. The management UI calls `list` to load folder rows, project roots, workspace bindings, manual chat placements, errors and host state (`server.ts:287-307`, `server.ts:2477-2545`).
2. Creating a section resolves the selected project/parent and host folder, validates relative paths, then creates the directory through the host filesystem API and persists a row in `folders` (`server.ts:1576-1627`, `server.ts:650-667`, `server.ts:1774-1851`).
3. Folder rows store parent identity and sort order. Reparenting changes the tree parent and sibling order; it does not move files (`server.ts:266-273`, `server.ts:2320-2381`).
4. `group_create` stores a synthetic `@group/<id>` path and kind `group`; the path is not a filesystem location, and a section can be created beneath a group (`server.ts:2248-2275`, `server.ts:1774-1851`).
5. `rename` changes a section’s stored display name or the BB project name; it does not change a section path. `section_move` handles path changes: it moves/re-links distinct paths, while shared-source or occupied-destination sections update their path binding without moving files (`server.ts:2950-2981`, `server.ts:2383-2389`, `section-move.ts:238-252`, `section-move.ts:254-304`).
6. `reorder` saves the full project order or sibling-section order and publishes `changed`; the management app refreshes on that event (`server.ts:3249-3295`, `server.ts:1603`, `app.tsx:359`).
7. Project deletion checks and the `keep`/`archive` file modes are described in [Project and section removal](project-tree-lifecycle.md#project-deletion) (`project-delete.ts:27-124`).
8. Section deletion checks and the `archive`/`unbind`/`purge` modes are described in [Project and section removal](project-tree-lifecycle.md#section-removal) (`app.tsx:569-574`, `server.ts:366-375`, `section-remove.ts:48-239`).
9. Hide/show actions on project and section menus persist a `hidden` flag in item styles. Hidden nodes leave the sidebar tree unless “Show hidden” is enabled; their chats and work remain available (`app.tsx:2233-2245`, `app.tsx:2467-2471`, `app.tsx:2565-2574`). The management page reads the same item-style flag and exposes a matching hide/show action (`app.tsx:3101-3112`, `app.tsx:4226-4234`).
10. The sidebar derives shared row geometry from the saved indent: child guides center on the parent chevron, and chat rows reserve the chevron column so chat markers align with child-section markers and “Show all” (`tree-layout.ts:8-23`, `app.tsx:2472-2480`, `style.css:2057-2091`). Indent is clamped to 0–32 pixels; non-finite values use 8 pixels (`tree-layout.ts:8-12`).
11. Each project or section heading checks the compact viewport state. At widths up to 767 pixels, folder headings omit the repository link and inline New chat button; New chat becomes the first item in the overflow menu. Wider headings keep the link and inline button (`app.tsx:2093-2155`, `components/ui/hooks/use-compact-viewport.tsx:16-27`).

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

Hidden state is a presentation preference stored with the project or section’s item style. It filters the sidebar tree, not the underlying project, section, chats or work; the setting to show hidden items is part of [Chat list and activity](chat-list.md#modes) (`preferences.ts:59-64`, `app.tsx:2231-2245`, `app.tsx:2563-2574`).

## Failures

| Failure | Result |
|---|---|
| Project deletion precondition or archive failure | See [Project and section removal](project-tree-lifecycle.md#project-deletion) (`project-delete.ts:38-124`). |
| Section removal precondition or operation failure | See [Project and section removal](project-tree-lifecycle.md#section-removal) (`section-remove.ts:66-239`). |
| Relative section path escapes its parent or enters `.bb`/`.git` | Path resolution rejects it before directory creation (`server.ts:650-667`). |
| Requested host is disconnected or has no project/parent folder | The location response marks it unavailable; section creation cannot resolve a folder on that host (`server.ts:2895-2930`, `server.ts:1774-1851`). |
| Folder is registered/protected or not an empty directory | Host directory deletion is rejected (`folder-files.ts:22-38`). |

## Business rules

- Names and paths are validated before folder creation. Relative paths cannot traverse upward, enter `.bb` or `.git`, or resolve to the parent itself; an absolute path can select a folder elsewhere on the same device after external-path ownership checks (`server.ts:148-152`, `server.ts:650-667`, `server.ts:1690-1720`).
- Groups store an `@group/<id>` marker instead of a filesystem path, and section-environment validation rejects a group because it has no folder of its own (`server.ts:2255-2281`, `server.ts:3706-3714`).
- A new section environment must belong to the selected project and have a folder binding on the selected host; a busy move or archive blocks environment creation (`server.ts:3697-3733`).
- Section depth is for display/inheritance; groups do not increment it (`section-tree.ts:8-11`, `app.tsx:115-128`).
- The folder browser’s steps, states, host edits and failure results are described in [Folder browser](folder-browser.md) (`folder-browser.tsx:9-68`, `folder-files.ts:3-41`).
- Project and section deletion behavior is owned by [Project and section removal](project-tree-lifecycle.md) (`project-delete.ts:27-124`, `section-remove.ts:48-239`).
- After a successful archive, the RPC’s `archivePath` identifies the first source’s archive destination; later copy destinations use the same UUID under their own parent paths (`project-delete.ts:100-124`, `server.ts:338-347`).

Folder browser steps, states, host-side validation and failure outcomes are documented in [Folder browser](folder-browser.md) (`folder-browser.tsx:9-208`, `server.ts:2553-2599`, `folder-files.ts:3-41`).

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
- Renaming a section changes its display name. For a path change, use `section_move`; shared paths can change binding without a filesystem move (`server.ts:2829-2843`, `server.ts:2320-2326`, `section-move.ts:238-252`).
- Deleting a group is constrained to an empty group (`server.ts:2276-2288`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [API and commands](../api.md)
- [Architecture](../architecture.md)
- [Appearance and preferences](appearance-settings.md)
- [Section archive and restore](archive-and-restore.md)
- [Chat list and activity](chat-list.md)
- [Projects & Sections — Overview](../overview.md)
