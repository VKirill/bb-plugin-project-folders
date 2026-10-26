---
title: Data model
type: data-model
created: 2026-09-27
updated: 2026-10-26
status: active
confidence: medium
tags: [data-model, sqlite, persistence]
sources:
  - server.ts
  - archive.ts
  - project-move.ts
  - section-move.ts
  - thread-move.ts
  - session-policy-server.ts
  - preferences.ts
  - execution.ts
  - session-policy.ts
  - appearance.tsx
  - chat-list.ts
  - export-queue.ts
  - cache-keepalive.ts
  - backup.ts
  - section-remove.ts
  - auto-archive.ts
---
# Data model

TL;DR: The plugin stores a normalized section tree plus JSON settings and operation journals in BB’s SQLite plugin database; BB remains the owner of projects, threads, environments and canonical chat history (`server.ts:730-771`, `server.ts:1947-1962`).

## Schema overview

The lines below show logical relations encoded by IDs and JSON payloads. The migration creates primary keys and a uniqueness constraint on section paths, but declares no SQL foreign-key constraints (`server.ts:730-771`).

```mermaid
erDiagram
  folders ||--o{ folder_rules : has
  folders ||--o{ section_moves : moves
  folders ||--o{ item_styles : style_key
  folders ||--o{ thread_places : listed_at
  threads ||--o| exports : exported
  threads ||--o| thread_moves : moves
  threads ||--o| thread_places : listed
  threads ||--o| pending_exports : queued
  threads ||--o| thread_keepalive : keepalive
  folders ||--o{ folder_archives : archived_as
  projects ||--o{ project_moves : moves
  folders {
    TEXT id PK
    TEXT projectId
    TEXT hostId
    TEXT parentId
    TEXT name
    TEXT path
    INTEGER sort
    TEXT kind
  }
  folder_rules {
    TEXT folderId PK
    TEXT mode
    TEXT template
    TEXT custom
    TEXT customTarget
    TEXT startup
  }
  project_rules {
    TEXT projectId PK
    TEXT mode
    TEXT projectTemplate
    TEXT sectionTemplate
    TEXT custom
    TEXT customTarget
    TEXT startup
  }
  project_order {
    TEXT projectId PK
    INTEGER sort
  }
  preferences {
    TEXT key PK
    TEXT data
  }
  item_styles {
    TEXT key PK
    TEXT data
  }
  thread_places {
    TEXT threadId PK
    TEXT projectId
    TEXT folderId
  }
  execution_defaults {
    TEXT key PK
    TEXT data
  }
  session_policies {
    TEXT key PK
    TEXT data
  }
  folder_archives {
    TEXT id PK
    INTEGER createdAt
    TEXT data
  }
  project_moves {
    TEXT id PK
    TEXT data
  }
  section_moves {
    TEXT folderId PK
    TEXT data
  }
  thread_moves {
    TEXT threadId PK
    TEXT data
  }
  exports {
    TEXT threadId PK
    TEXT path
    TEXT error
    INTEGER updatedAt
  }
  pending_exports {
    TEXT threadId PK
  }
  thread_keepalive {
    TEXT threadId PK
    INTEGER idleAt
    INTEGER wakes
    INTEGER updatedAt
    INTEGER lastPingAt
  }
```

The plugin migrations create the tables documented here. Their `projectId` and `threadId` values store BB SDK entity IDs, which move and placement handlers resolve through BB's project and thread APIs (`server.ts:735-771`, `project-move.ts:54-63`, `server.ts:2297-2305`).

## Archive store coordinator

`makeArchives` owns reads and writes for `folder_archives`, serializes archive/restore operations, and provides predicates used by other features. Archive manifests are JSON stored in the row’s `data`; the public archive and restore sequence is described in [Section archive and restore](features/archive-and-restore.md) (`archive.ts:50-72`, `archive.ts:96-118`).

1. Construction captures the database and callbacks for current folders, canonical paths, project-move checks, project roots, export sync/drain and change notifications (`archive.ts:50-62`).
2. `list` reads records newest-first, parses JSON and validates each manifest; `put` inserts or replaces a record by ID and creation timestamp (`archive.ts:63-72`).
3. `matches` searches only completed archived records for the same project/host, comparing the saved name or path basename after trimming and Unicode NFC/case normalization. `blocked` checks whether a chat ID is listed in any archive; `moving` checks paths under an archive not yet in `archived` state after optional canonicalization (`archive.ts:73-95`).
4. `serial` runs each asynchronous archive operation after the preceding one. A rejected operation rejects its caller, while the internal queue catches the rejection so later operations still run (`archive.ts:96-101`). Thread inventory separately pages both archived states in batches of 200 until a short page is returned (`archive.ts:102-117`).

| Branch/helper | Condition | Result or failure |
|---|---|---|
| Manifest listing | Any stored row | JSON parse or schema validation can fail; valid records return in descending `createdAt` order (`archive.ts:63-68`). |
| Name matching | Project and host match and record is `archived` | Returns name/basename matches using trimmed NFC, locale-lowercase comparison (`archive.ts:75-86`). |
| Chat blocking | Chat ID occurs in an archive manifest’s `threadIds` | Returns true regardless of archive state (`archive.ts:87-88`). |
| Path blocking | Record is not in `archived` state and canonicalized path is under its folder path | Returns true; completed archives do not block (`archive.ts:89-95`). |
| Serialized operation | Previous queue operation succeeded or failed | Runs the new operation; its own error is returned to caller, but does not poison later queue entries (`archive.ts:96-101`). |

The coordinator receives no cleanup policy for completed rows here; restore/delete lifecycle is owned by the archive operations page (`archive.ts:360-375`, `archive.ts:439-463`).

## Tables

All table declarations and primary keys are in the plugin migration (`server.ts:730-771`). `data` columns contain JSON described by the owning domain types.

### `folders`

Purpose: Section and group tree nodes for BB projects.

| Field | Meaning | Key / constraint |
|---|---|---|
| `id` | Plugin UUID for this node | Primary key |
| `projectId` | Owning BB project ID | Logical project reference |
| `hostId` | Connected BB host where the folder exists | Logical host reference |
| `parentId` | Parent section/group; `NULL` for project root child | Logical self-reference |
| `name` | Tree label | — |
| `path` | Absolute host path for folder; synthetic `@group/<id>` for group | Unique with `projectId`, `hostId` |
| `sort` | Sibling ordering integer | Default `0` |
| `kind` | `folder` or `group` | Default `folder` |

Writers: section creation, group creation, move/repath, archive restore and reorder handlers (`server.ts:1774-1851`, `server.ts:2248-2275`, `section-move.ts:305-320`, `archive.ts:439-453`, `server.ts:3249-3295`). Readers: tree/list, section environment validation, move/archive logic and appearance rules (`server.ts:859-883`, `server.ts:3697-3757`, `archive.ts:63-95`).

### `folder_rules`

Purpose: Per-section rules mode and template configuration.

| Field | Meaning | Key / allowed values |
|---|---|---|
| `folderId` | Section node owning rules | Primary key / logical `folders.id` |
| `mode` | File handling mode | `manual`, `inherit`, `custom` |
| `template` | Section template text | UTF-8 text, max 20,000 at RPC |
| `custom` | Individual rules text | UTF-8 text |
| `customTarget` | Where custom text goes | `file`, `session`, `both`; default `file` |
| `startup` | One-time first-message text | UTF-8 text, max 4,000 at RPC |

Writers/readers: rules settings handlers store/read by `folderId`; apply/startup paths read the row (`server.ts:1003-1008`, `server.ts:2851-2899`, `server.ts:2923-2962`, `server.ts:3170-3193`).

Mode lifecycle (the same transition behavior applies to `project_rules.mode`):

| From | To | Function and condition |
|---|---|---|
| absent or any saved mode | `manual` | `rules_settings_save` stores the selected rule row and returns before file writes (`server.ts:3051-3090`) |
| absent or any saved mode | `inherit` | Saves the selected mode, then updates/removes custom file blocks; effective templates resolve from the nearest custom section or project template (`server.ts:3051-3062`, `server.ts:3110-3114`, `server.ts:1105-1128`) |
| absent or any saved mode | `custom` | Saves the selected mode and writes the selected template; custom text goes to files only when `customTarget` includes `file` (`server.ts:3051-3085`, `server.ts:3057-3062`, `server.ts:3097-3109`) |

### `project_rules`

Purpose: Project-root rules plus project and section template defaults.

| Field | Meaning | Key / allowed values |
|---|---|---|
| `projectId` | Owning BB project | Primary key |
| `mode` | File handling mode | `manual`, `inherit`, `custom` |
| `projectTemplate` | Project-root template text | UTF-8 text, max 20,000 |
| `sectionTemplate` | Default section template | UTF-8 text, max 20,000 |
| `custom` | Project-specific rules | UTF-8 text |
| `customTarget` | Where custom text goes | `file`, `session`, `both`; default `file` |
| `startup` | One-time first-message text | UTF-8 text, max 4,000 |

Writers/readers: project rules settings handlers and inherited template/rule resolvers (`server.ts:933-945`, `server.ts:2793-2833`, `server.ts:1663-1773`).

### `project_order`

Purpose: Persist ordering of project rows.

| Field | Meaning | Key / allowed values |
|---|---|---|
| `projectId` | BB project ID | Primary key |
| `sort` | Zero-based display order | Integer |

Writers: `reorder` handler; readers: project tree loader (`server.ts:3249-3295`, `server.ts:1543-1572`).

### `preferences`

Purpose: Shared UI preferences, migrated global agent settings, cache keepalive configuration and automatic chat-archive settings.

| Field | Meaning | Key / allowed values |
|---|---|---|
| `key` | Record family | `ui` for current UI preferences; `agents` for migrated shared agent settings; `cache_keepalive` for Claude prompt-cache keepalive settings; `auto_archive` for automatic chat-archive settings |
| `data` | JSON preference payload | Parsed/validated by the relevant schema |

Writers: preference save, legacy migration, cache keepalive settings save and auto-archive settings save; readers: preferences, rule configuration, keepalive configuration and auto-archive configuration loaders (`server.ts:796-809`, `server.ts:3562-3577`). Auto-archive data is `{enabled, days}`; field constraints and defaults are documented in [Section archive and restore](features/archive-and-restore.md#automatic-chat-archiving) (`auto-archive.ts:3-12`).

### `thread_keepalive`

Purpose: Persist each thread’s idle timestamp and wake counter for cache keepalive scheduling.

| Field | Meaning | Key / allowed values |
|---|---|---|
| `threadId` | BB thread whose keepalive state is tracked | Primary key; BB thread ID |
| `idleAt` | Millisecond timestamp that starts the current idle spell | Integer timestamp; `0` is the initial sentinel |
| `wakes` | Keepalive turns sent during the idle spell | Non-negative integer; reset to zero on a real idle event |
| `updatedAt` | Millisecond timestamp of the last keepalive-state write | Integer timestamp |
| `lastPingAt` | Time the coordinator last attempted to send a keepalive ping | Nullable integer timestamp in milliseconds; written before `threads.send`, and read by `getLastPingAt` (`server.ts:775`, `cache-keepalive.ts:125-135`, `cache-keepalive.ts:365-382`) |

Lifecycle: a real `thread.idle` event sets `idleAt` and resets `wakes`; an idle event following a keepalive ping updates `idleAt` and preserves `wakes`; each attempted ping updates `lastPingAt`; `thread.archived` and `thread.deleted` remove the row (`cache-keepalive.ts:211-229`, `cache-keepalive.ts:365-382`, `server.ts:793-795`). Writers are the SQLite keepalive store; the sweep reads idle time and wake count, and the store exposes `lastPingAt` through `getLastPingAt` (`cache-keepalive.ts:93-135`, `cache-keepalive.ts:258-363`).

### `item_styles`

Purpose: Per-project and per-section appearance, tree visibility, sort and chat-limit overrides.

| Field | Meaning | Key / allowed values |
|---|---|---|
| `key` | Item identity | `p:<projectId>` or `f:<folderId>` |
| `data` | JSON style object | Icon, color, fill, cascade, hidden flag, sort, limit |

Writers: `prefs_save` bulk replacement and `item_style_save`; readers: app appearance resolver (`server.ts:3512-3538`, `preferences.ts:53-64`, `appearance.tsx:439-447`).

### `thread_places`

Purpose: Manual tree filing for a chat when its working directory differs from the desired list location.

| Field | Meaning | Key / allowed values |
|---|---|---|
| `threadId` | BB thread ID | Primary key |
| `projectId` | BB project containing the thread | Logical reference |
| `folderId` | Section ID; `NULL` means project root | Logical `folders.id` |

Writers: `thread_place` and `thread_place_clear`; readers: the list response and chat tree association (`server.ts:2279-2307`, `server.ts:2495-2499`, `chat-list.ts:251-263`). During list assembly, a row whose non-null `folderId` no longer exists in `folders` is deleted before placements are read (`server.ts:2490-2499`).

### `execution_defaults`

Purpose: Per-scope new-chat defaults for model, permission mode and native agent.

| Field | Meaning | Key / allowed values |
|---|---|---|
| `key` | Scope key | `g`, `p:<projectId>`, `f:<folderId>` |
| `data` | JSON `Execution` payload | Provider/model, reasoning, service tier, permissions, agent pin |

Writers/readers: execution save/read functions; project/folder cleanup removes matching keys (`server.ts:1166-1182`, `server.ts:2074-2091`). Payload constraints and enum values: `execution.ts:14-70`.

### `session_policies`

Purpose: Per-scope filters and switches for agent session context.

| Field | Meaning | Key / allowed values |
|---|---|---|
| `key` | Scope key | `g`, `p:<projectId>`, `f:<folderId>` |
| `data` | JSON session policy | Four filters and three optional switches; filters `all`, `allow`, `deny` |

Writers: session policy save deletes empty payloads or upserts normalized JSON; readers: editor and per-thread core resolver (`session-policy-server.ts:77-102`, `session-policy-server.ts:109-157`). Schema and limits: `session-policy.ts:16-30`, `session-policy.ts:62-79`.

### `folder_archives`

Purpose: Archive manifests for section subtrees and chat IDs.

| Field | Meaning | Key / allowed values |
|---|---|---|
| `id` | Archive UUID | Primary key |
| `createdAt` | Creation time in Unix milliseconds | Integer |
| `data` | JSON archive manifest | Folder, members, original/archive paths, thread IDs, state, error, external flag |

State lifecycle:

| From | To | Function and condition |
|---|---|---|
| absent | `archiving` | `archive` saves the journal after preflight and chat sync (`archive.ts:219-240`) |
| `archiving` | `archived` | Files/chats complete, folder/path rows are removed and the error is cleared (`archive.ts:360-370`) |
| `archiving` | `archiving` + error | Any operation failure stores its message and publishes a change for retry (`archive.ts:371-375`) |
| `archived` | `restoring` | `restore` begins a restore operation (`archive.ts:349-391`) |
| `restoring` | removed | Restore has recreated tree/path rows and unarchived the saved chats, then deletes the archive row (`archive.ts:439-457`) |
| `restoring` | `restoring` + error | Failed restore stores the error and leaves the journal retryable (`archive.ts:459-463`) |

Writers/readers: `makeArchives` writes and parses manifests; project/section moves rebase paths; project deletion removes owned manifests (`archive.ts:63-72`, `project-move.ts:123-145`, `server.ts:2092-2095`).

### `project_moves`

Purpose: Retry journal for project-root relocation.

| Field | Meaning | Key / allowed values |
|---|---|---|
| `id` | Move journal ID | Primary key |
| `data` | JSON project move | Project/host, source/destination, completion and error details |

State-like lifecycle: journal absent → persisted incomplete move → complete on metadata rebase; failures retain the journal and error (`project-move.ts:18-31`, `project-move.ts:200-240`, `project-move.ts:228-246`). Writers/readers: project move module; project deletion removes matching journals (`server.ts:2096-2103`).

### `section_moves`

Purpose: Retry journal for section folder moves and relinks.

| Field | Meaning | Key / allowed values |
|---|---|---|
| `folderId` | Section being moved | Primary key / logical `folders.id` |
| `data` | JSON move record | Source/destination, completion and error details |

State-like lifecycle: a metadata-only shared-path update writes a completed journal with the path binding; a filesystem move writes an incomplete journal before draining exports, then marks it complete after descendant paths, exports and archive manifests are rebased. A failure after journal creation stores an error for retry. If a retry finds the section path already equals its saved destination, it marks that journal complete and clears its error (`section-move.ts:238-252`, `section-move.ts:279-284`, `section-move.ts:305-364`, `section-move.ts:91-100`). Writers/readers: `makeSectionMoves` reads rows for its journal list and writes move updates; project cleanup reads rows to identify and delete journals owned by the removed project (`section-move.ts:24-50`, `server.ts:2094-2101`).

### `thread_moves`

Purpose: Chat environment and dedicated storage relocation journal.

| Field | Meaning | Key / allowed values |
|---|---|---|
| `threadId` | BB chat being moved | Primary key |
| `data` | JSON chat move job | Source/destination, host, project and optional `asked` timestamp in Unix milliseconds |

State-like lifecycle:

| From | To | Function and condition |
|---|---|---|
| absent | journal without `asked` | `move` persists before changing environment/files (`thread-move.ts:108-121`) |
| journal without `asked` | deleted | Core switches directory and storage move completes (`thread-move.ts:138-185`) |
| journal without `asked` | journal with `asked` | Core update fails; agent request is sent (`thread-move.ts:144-168`) |
| journal with `asked` | deleted, moved | `finish` sees destination environment after the request turn and moves chat storage (`thread-move.ts:228-269`) |
| journal with `asked` | deleted, kept | Agent turn ends without the destination environment (`thread-move.ts:243-246`) |

Writers/readers: thread move module; thread dispatch barriers and project/section move checks also inspect it (`thread-move.ts:48-64`, `thread-move.ts:118-168`, `server.ts:2126-2181`).

### `exports`

Purpose: Last chat export path or persisted error.

| Field | Meaning | Key / allowed values |
|---|---|---|
| `threadId` | BB thread ID | Primary key |
| `path` | Current export directory | Absolute host path or `NULL` on error |
| `error` | Last export error | `NULL` on success, error text on failure |
| `updatedAt` | Last state update, Unix milliseconds | Integer |

State lifecycle: success stores a path and `error=NULL`; a non-transient export error stores `path=NULL` and an error; deleted threads remove the row; error rows older than one hour are pruned during `list` (`server.ts:2018-2022`, `server.ts:2044-2058`, `server.ts:2497-2500`). Writers/readers: export pipeline and move modules that rebase paths (`server.ts:1852-2022`, `section-move.ts:321-328`).

### `pending_exports`

Purpose: Durable queue of chat IDs awaiting automatic export after a plugin reload.

| Field | Meaning | Key / allowed values |
|---|---|---|
| `threadId` | BB thread awaiting export | Primary key |

Writers: lifecycle enqueue inserts an ID; queue settlement deletes it. Startup reads and resumes rows (`server.ts:3658-3673`). Readers: server startup queue restoration (`server.ts:3658-3673`).

## Invariants

- Folder uniqueness is `(projectId, hostId, path)`; group paths are synthetic and must not be treated as disk paths (`server.ts:737`, `server.ts:2248-2275`).
- There are no SQL foreign-key constraints; handlers clean dependent records when projects, folders or threads are removed (`server.ts:730-771`, `server.ts:2074-2112`, `server.ts:2497-2510`).
- Execution and session policy use global, project and folder scope keys (`g`, `p:<projectId>`, `f:<folderId>`) (`server.ts:1178-1183`, `session-policy-server.ts:70-75`).
- BB owns canonical thread history; the export tables track file snapshots and outcomes only (`server.ts:1947-1962`, `server.ts:2018-2022`).

## Retention and cleanup

- Export errors older than the configured threshold are deleted; thread placements whose folder no longer exists are removed (`server.ts:2497-2510`).
- Project deletion removes its folders, ordering, placements, rules, item style, execution defaults, matching archives and move journals (`server.ts:2074-2112`).
- Automatic export pending IDs persist so the server can restore queued work on startup; successful/settled work removes the pending row (`server.ts:3658-3673`).
- Completed archive records remain available for restore until that restore deletes the record (`archive.ts:360-370`, `archive.ts:439-463`).
- Keepalive state is removed on thread archive or deletion; the feature does not prune rows for other causes (`server.ts:793-795`, `cache-keepalive.ts:197-200`).
- Full backup includes the `preferences` row holding keepalive configuration, but excludes the separate per-thread `thread_keepalive` table along with transient exports and move journals (`backup.ts:7-28`).

## Related pages

- [Section archive and restore](features/archive-and-restore.md)
- [Device copies and moves](features/devices-and-moves.md)
- [Chat history export](features/chat-history-export.md)
- [Execution defaults](features/execution-settings.md)
- [Session context](features/session-context.md)
- [Prompt cache keepalive](features/cache-keepalive.md)
- [Appearance and preferences](features/appearance-settings.md)

<!-- lane-pilot:backlinks -->
## Referenced by

- [Projects & Sections — Overview](overview.md)
