---
title: API and commands
type: component
created: 2026-09-27
updated: 2026-10-19
status: active
confidence: medium
tags: [api, rpc, cli, host]
sources:
  - server.ts
  - app.tsx
  - composer-chip.tsx
  - host.ts
  - move-contract.ts
  - folder-files.ts
  - move-files.ts
  - project-move.ts
  - section-move.ts
  - project-delete.ts
  - execution.ts
  - session-policy-server.ts
  - section-remove.ts
  - cache-keepalive.ts
  - auto-archive.ts
  - backup.ts
  - github-remote.ts
  - repo-remote.ts
  - session-inventory.ts
  - package.json
---
# API and commands

TL;DR: The plugin exposes typed BB plugin RPC, a read-only section-list RPC for other plugins, BB host operations and a `bb project-folders` CLI command group; it does not define standalone HTTP routes (`server.ts:173-630`, `server.ts:3579-3602`, `server.ts:3783-4084`).

## How it works

1. The server defines the main plugin methods in `rpcContract` and registers their handlers with BB. Its `list` operation returns folders, project roots, environment bindings, manual placements, export errors and connected machine identities (`server.ts:2484-2544`). A separately registered, discoverable, read-only `sections_list` contract returns section metadata to other plugins and accepts an optional project ID (`server.ts:155-172`, `server.ts:3579-3602`).
2. Plugin UI surfaces call those RPC operations through the BB SDK (`app.tsx:60-70`, `composer-chip.tsx:154-180`).
3. Server handlers and move coordinators dispatch device-specific filesystem, remote and inventory work through `moveHostContract`, with a target host ID in BB call options (`server.ts:911-913`, `server.ts:2472-2474`, `project-move.ts:172-175`, `session-policy-server.ts:228-231`, `host.ts:5-16`).
4. BB registers the CLI command group `project-folders`; its handler validates args and calls the same domain operations (`server.ts:3783-3892`, `server.ts:3895-4084`).

## Modes

| Surface | Method | Path/name | Caller | Auth |
|---|---|---|---|---|
| Plugin RPC | `BB RPC` | `<rpc-name>` | Plugin app, composer, settings and lifecycle handlers | BB plugin RPC boundary; no per-method user-auth check is defined in this plugin contract |
| Cross-plugin RPC | `BB RPC` | `sections_list` | Other BB plugins, including section-aware integrations | BB plugin RPC boundary; read-only contract |
| Host API | `BB host contract` | `<operation>` | Plugin server via the selected host ID | BB host dispatch to the connected device; no separate plugin credential in this contract |
| CLI | `BB CLI` | `bb project-folders <command>` | Local BB CLI user or agent | BB CLI/plugin command registration |

## Public API

### Plugin RPC operations

The path column names each operation in the registered plugin RPC contract; these are contract calls, not literal HTTP URL paths. Contract branches and failures are detailed in [RPC and host contract behavior](api-contracts.md) (`server.ts:168-628`).

### Tree, projects and devices

| Method | Path | Caller | Purpose | Auth |
|---|---|---|---|---|
| BB RPC | `list` | Sidebar, management page, composer | Load folders, roots, bindings, placements, errors and hosts | BB plugin RPC |
| BB RPC | `machines` | Project/section pickers | List connected host identities | BB plugin RPC |
| BB RPC | `project_browse` | New project dialog | Browse directories on a host | BB plugin RPC |
| BB RPC | `project_create` | New project dialog | Create a BB project from host and path | BB plugin RPC |
| BB RPC | `project_delete` | Project management UI | Remove project, keeping or archiving files | BB plugin RPC |
| BB RPC | `create` | Section dialog | Create section folder and tree record | BB plugin RPC |
| BB RPC | `group_create`, `group_delete` | Tree management UI | Add or remove folderless tree group | BB plugin RPC |
| BB RPC | `folder_edit` | Folder browser | Create/delete an empty directory on host | BB plugin RPC |
| BB RPC | `locations`, `browse` | Section creation dialog | Select an available host and browse its folders | BB plugin RPC |
| BB RPC | `rename` | Tree menu/card | Rename a project or section label | BB plugin RPC |
| BB RPC | `reorder`, `section_reparent` | Management page | Reorder projects/sections or change tree parent | BB plugin RPC |
| BB RPC | `copy_add`, `copy_remove`, `copy_edit` | Project card and copies dialog | Add, remove or repath a project copy | BB plugin RPC |

Contract schemas: `server.ts:287-376`; project-copy checks and operations: `server.ts:2642-2722`.

`project_delete` accepts `files: "keep" | "archive"`; the handler delegates to `deleteProject`, which performs pending-work, chat-activity and filesystem-ownership checks before removing plugin rows and the BB project (`server.ts:308-317`, `server.ts:2641`, `project-delete.ts:27-124`). See [Project and section tree](features/project-tree.md) for the deletion rules.

### Moves, placements and archives

| Method | Path | Caller | Purpose | Auth |
|---|---|---|---|---|
| BB RPC | `project_move`, `pending_moves` | Project card/move dialog | Relocate project root and list pending relocations | BB plugin RPC |
| BB RPC | `section_move`, `pending_section_moves` | Section path dialog | Move/re-link section and list pending operations | BB plugin RPC |
| BB RPC | `thread_move` | Thread row/menu or drag/drop | Move chat workspace and dedicated storage | BB plugin RPC |
| BB RPC | `thread_place`, `thread_place_clear` | Thread menu or tree filing UI | Change tree filing without changing workspace | BB plugin RPC |
| BB RPC | `archive_list`, `archive_matches`, `archive`, `restore`, `forget` | Archive page and section menu | Find, archive and restore section subtrees | BB plugin RPC |
| BB RPC | `section_remove` | Section delete dialog | Archive, unbind or purge a section | BB plugin RPC |

Contract schemas: `server.ts:195-286`, `server.ts:357-406`; CLI equivalents call the same functions (`server.ts:3982-3998`, `server.ts:3783-3892`).

### Rules, execution and session context

| Method | Path | Caller | Purpose | Auth |
|---|---|---|---|---|
| BB RPC | `agents_apply` | Rules settings | Apply managed templates to eligible folders | BB plugin RPC |
| BB RPC | `rules_read`, `rules_save`, `rules_settings_save` | Project/section rules editor | Read/write rule files and settings | BB plugin RPC |
| BB RPC | `agents_config`, `agents_config_save` | Plugin-wide rules settings | Read/write shared templates and custom rule settings | BB plugin RPC |
| BB RPC | `execution_read`, `execution_save` | Provider/agent settings card | Read/save execution pins and their effective inheritance | BB plugin RPC |
| BB RPC | `execution_agents` | Execution editor | List native agents for a provider | BB plugin RPC |
| BB RPC | `session_policy_capability`, `session_policy_read`, `session_policy_save`, `session_policy_inventory` | Session-context editor and BB experimental hook | Report support, read/write rules and inventory names | BB plugin RPC |
| BB RPC | `section_pick` | BB composer environment picker | Remember the selected section for the composer | BB plugin RPC |
| BB RPC | `spawn` | Plugin new-chat composer | Start a thread with resolved project/section and composer values | BB plugin RPC |
| BB RPC | `thread_section` | Thread section label | Resolve section label and path for a thread | BB plugin RPC |

Contract schemas: `server.ts:422-580`; execution resolution: `execution.ts:97-129`; session policy registration: `session-policy-server.ts:151-157`.

`makeSessionPolicies` maps scopes to keys (`g`, `p:<projectId>`, `f:<folderId>`), reads and validates stored JSON, normalizes writes and deletes empty policies. When the experimental core hook exists, it registers a resolver that maps the thread workspace to its deepest real section and resolves section, ancestor, project and global layers; without the hook it still exposes read, save and inventory operations with `available: false` (`session-policy-server.ts:57-93`, `session-policy-server.ts:95-157`).

| Operation | Branch and outcome | Failure behavior |
|---|---|---|
| Read | Resolve scope placement, load own value, compute inherited/effective policy and report the user-instructions file path/existence (`session-policy-server.ts:159-179`). | Invalid JSON or schema data becomes an empty policy (`session-policy-server.ts:83-93`). |
| Save | Validate scope placement and store normalized value; empty values delete the key (`session-policy-server.ts:95-102`, `session-policy-server.ts:181-184`). | Placement/database failures reject the save (`session-policy-server.ts:181-184`). |
| Inventory | Gather plugin contributions, BB plugins, project skills and host MCP/CLI names for non-global scopes (`session-policy-server.ts:185-241`). | Optional plugin, skill and host sources fail independently to empty results (`session-policy-server.ts:201-231`). |
| Core enforcement | Register `experimental_vkSessionPolicy` only when present, resolving each thread against its matching project, host and deepest section (`session-policy-server.ts:137-157`). | Without the extension, `available` is false and no resolver is registered (`session-policy-server.ts:74-75`, `session-policy-server.ts:151-157`). |

### Preferences and history

| Method | Path | Caller | Purpose | Auth |
|---|---|---|---|---|
| BB RPC | `prefs_get`, `prefs_save` | Appearance and chat-list settings | Read/save shared preferences and optionally replace item styles | BB plugin RPC |
| BB RPC | `item_style_save` | Project/section appearance editor | Upsert/delete one item style | BB plugin RPC |
| BB RPC | `sync` | Thread actions/settings | Export one thread’s timeline to files | BB plugin RPC |
| BB RPC | `backup_export`, `backup_import` | Transfer settings and CLI | Export/import durable plugin tables as JSON | BB plugin RPC |
| BB RPC | `cache_keepalive_get`, `cache_keepalive_save` | Cache settings | Read/save cache keepalive configuration | BB plugin RPC |
| BB RPC | `auto_archive_get`, `auto_archive_save`, `auto_archive_run` | Auto-archive settings | Read/save inactive-chat threshold and run a sweep | BB plugin RPC |

Contract schemas: `server.ts:574-647`. Auto-archive behavior and eligibility rules are documented in [Section archive and restore](features/archive-and-restore.md#automatic-chat-archiving) (`auto-archive.ts:92-172`).

### `isStale` eligibility

The sweep passes each listed thread, the current parsed configuration and one captured clock value to `isStale`. The predicate short-circuits on excluded state before calculating age: archived/deleted, pinned, child, non-quiet thread status, non-quiet runtime display status, pending interaction, queued work other than `none`, or any positive activity counter returns `false` (`auto-archive.ts:92-107`).

For an otherwise quiet thread, the comparison timestamp is the greatest of `updatedAt`, `latestAttentionAt` and `createdAt`, with missing/falsy values treated as zero. A zero timestamp is not stale; otherwise it qualifies at the inclusive boundary `now - last >= days * 24 hours` (`auto-archive.ts:73-85`, `auto-archive.ts:108-110`).

| Predicate branch | Condition | Result |
|---|---|---|
| Excluded lifecycle/state | Already archived/deleted, pinned, has a parent, or status is not `idle`/`error` | `false` without an age check (`auto-archive.ts:97-101`). |
| Runtime or pending work | A present runtime display status is not `idle`/`error`, interaction is pending, queued work is a non-empty value other than `none`, or an activity counter is positive | `false` (`auto-archive.ts:102-107`). |
| No recorded time | All three activity timestamps are missing/falsy | `false` (`auto-archive.ts:78-85`, `auto-archive.ts:108-109`). |
| Quiet and old enough | Latest activity exists and is at least the configured number of 24-hour days old | `true`; the sweep requests BB to archive the thread (`auto-archive.ts:108-110`, `auto-archive.ts:154-158`). |
| Quiet but recent | Latest activity is newer than the threshold | `false` (`auto-archive.ts:108-110`). |

The config range, default, sweep cadence and failure handling are owned by [Section archive and restore](features/archive-and-restore.md#automatic-chat-archiving) (`auto-archive.ts:3-12`, `auto-archive.ts:142-189`).

## Cross-plugin section listing

| Method | Path | Caller | Purpose | Auth |
|---|---|---|---|---|
| BB RPC | `sections_list` | Other plugins | Return section ID, project ID, parent, name, path, host and kind; optional project filter | BB plugin RPC; read-only |

The separate contract is declared and registered in `server.ts:155-172`, `server.ts:3579-3602`.

## Host operations

| Method | Path | Caller | Purpose | Auth | Evidence |
|---|---|---|---|---|---|
| BB host contract | `folder_edit` | Server folder browser RPC | Create/delete an empty directory | BB host dispatch to connected device | `host.ts:7-16`, `folder-files.ts:3-41` |
| BB host contract | `inspect` | Project/section move modules | Inspect paths and detect completed move/link | BB host dispatch to connected device | `host.ts:7-16`, `move-files.ts:14-73` |
| BB host contract | `move` | Project/section move modules | Move a directory and create compatibility path | BB host dispatch to connected device | `host.ts:8-18`, `move-files.ts:74-95` |
| BB host contract | `link` | Section move module | Link a folder renamed outside BB | BB host dispatch to connected device | `host.ts:8-18`, `section-move.ts:287-293`, `move-files.ts:96-118` |
| BB host contract | `github_remotes` | Project tree metadata refresh | Resolve GitHub remote metadata for compatibility | BB host dispatch to connected device | `host.ts:8-18`, `github-remote.ts:1-30` |
| BB host contract | `repo_remotes` | Project tree metadata refresh | Resolve supported repository remote metadata | BB host dispatch to connected device | `host.ts:8-18`, `repo-remote.ts:187-198` |
| BB host contract | `session_inventory` | Session policy editor | List host MCP servers and native CLI plugins | BB host dispatch to connected device | `host.ts:7-16`, `session-inventory.ts:1-45` |

The host contract operations are typed in `move-contract.ts:10-63`.

### Contract behavior details

[RPC and host contract behavior](api-contracts.md) covers `rpcContract`, `moveHostContract` and `removeSection`, including their branches and failures.

Project relocation’s call sequence, preflight branches, journal outcomes and failures are documented under [`makeProjectMoves`](api-contracts.md#makeprojectmoves-steps-and-outcomes).

### `deleteProject`

1. It rejects a pending project move or section archive, fetches the project, and refuses a missing project or BB personal inbox (`project-delete.ts:27-48`).
2. It lists hidden plus visible threads for archived and unarchived states in 200-item pages. Any active/starting/stopping/pending thread, queued work or positive activity stops deletion (`project-delete.ts:1-25`, `project-delete.ts:49-61`).
3. With `files: "keep"`, it leaves all local folders in place. With `files: "archive"`, at least one local-path source is required; it rejects a source containing another BB project or a path also used as another project’s section (`project-delete.ts:62-105`).
4. The archive branch makes one UUID for all local copies and moves each source to a sibling `.bb/archive/projects/<id>/folder`, retaining the first destination as `archivePath`. It then drops plugin rows, deletes the BB project, emits `changed` and returns `{ok, files, archivePath}` (`project-delete.ts:106-124`).

| Mode or failure | Result |
|---|---|
| `keep` | Remove the BB project and plugin rows while leaving its directories in place (`project-delete.ts:62-63`, `project-delete.ts:120-124`). |
| `archive` | Move every local source into the project archive tree before deleting the project; return the first moved destination (`project-delete.ts:64-118`). |
| Busy move/archive or active chat | Reject before removing project rows (`project-delete.ts:37-61`). |
| No local source or path ownership conflict | Reject before any archive move (`project-delete.ts:64-105`). |
| Filesystem or BB delete failure | Propagate the error. Archive moves are sequential and precede plugin-row/project deletion; this function contains no compensation for an earlier successful move (`project-delete.ts:106-124`). |

### `rpcContract` validation and outputs

`rpcContract` declares the input and output schema for each RPC name, and `bb.rpc.register` binds that contract to the matching handler object (`server.ts:194-257`, `server.ts:3392-3393`). Its branches in this range are:

| Operation | Input branch | Output / failure behavior |
|---|---|---|
| `thread_move` | Target schema plus non-empty thread ID | Path and `asked` flag, defaulting to `false` (`server.ts:174-181`). |
| `thread_section` | Thread ID string | Nullable section metadata and a `pending` flag (`server.ts:182-199`). |
| `project_move` | Project ID, host ID and non-empty destination | Destination and completion flag (`server.ts:201-208`). |
| `pending_moves` | `null` only | Array of project, host, destination and nullable error records (`server.ts:209-219`). |
| `group_delete` | Non-empty folder ID | Returns `{ok:true}` after deleting a childless group; missing or non-group IDs and groups with children reject (`server.ts:224-227`, `server.ts:2283-2296`). |
| `thread_place` | Non-empty thread/project IDs and nullable section ID | Returns `{ok:true}` after validating the thread and section belong to the same project and the target is not a group (`server.ts:228-236`, `server.ts:2297-2320`). |
| `thread_place_clear` | Non-empty thread ID | Deletes the saved manual placement and returns `{ok:true}` (`server.ts:237-240`, `server.ts:2322-2326`). |

The contract continues with the remaining RPC operations in the route tables above; handler registration binds the full contract as one typed surface (`server.ts:173-630`, `server.ts:3579`).

### `linkDirectory` filesystem branch

1. Resolve the supplied source and destination strings to absolute paths, then reject inputs that were not absolute, contain control characters, or contain one another (`move-files.ts:96-108`).
2. Require the old source path to be absent and destination to be an existing real directory, not a symlink; require `realpath(destination)` to equal the path so no parent component is a symlink (`move-files.ts:109-117`).
3. Create a directory symlink from the old source path to the destination and return both normalized paths with `moved: true` (`move-files.ts:116-118`).

There is no fallback branch: validation errors or a symlink creation error reject the host call, and the caller’s move journal retains its error for retry (`move-files.ts:102-118`, `section-move.ts:347-353`).

### `sessionInventory` collection

1. Start with empty maps for MCP server names and native plugin names. A `cwd` adds Claude project config and `.mcp.json` sources; global Claude config is always read (`session-inventory.ts:29-45`).
2. Add only enabled Claude plugins and their shipped MCP entries, then parse Codex config-table headers under `CODEX_HOME` or `~/.codex` (`session-inventory.ts:46-82`).
3. Read OpenCode `opencode.json` and `opencode.jsonc` under `XDG_CONFIG_HOME` or `~/.config`, merge names by source, sort source labels and names, and return separate MCP and native-plugin lists (`session-inventory.ts:84-97`). The output contains configured names and source labels, not commands, URLs or secrets (`session-inventory.ts:6-22`, `session-inventory.ts:92-97`).

| Source branch | Input | Collected values |
|---|---|---|
| Claude | Global/project `.claude.json`, cwd `.mcp.json`, enabled plugins settings and installed plugin manifests | MCP names and enabled native plugin IDs (`session-inventory.ts:35-70`). |
| Codex | `config.toml` section headers | Names from `[mcp_servers.<name>]` and `[plugins.<name>]` (`session-inventory.ts:72-82`). |
| OpenCode | `opencode.json` and `.jsonc` config files | Keys under `mcp` (`session-inventory.ts:84-90`). |

Missing or unreadable files become empty input, and JSON parsing accepts line comments and trailing commas (`session-inventory.ts:99-124`). The output schema contains only configured names and source labels, not commands, URLs or secrets (`session-inventory.ts:6-22`, `session-inventory.ts:92-96`).

## CLI commands

| Method | Path | Purpose |
|---|---|---|
| BB CLI | `bb project-folders list` | List sections |
| BB CLI | `bb project-folders create <project-id> <parent-id-or-dash> <name> <relative-path> [host-id]` | Create section |
| BB CLI | `bb project-folders place-chat <thread-id> <project-id> <folder-id-or-dash>` | File chat in tree |
| BB CLI | `bb project-folders unplace-chat <thread-id>` | Remove manual placement |
| BB CLI | `bb project-folders move-chat <thread-id> <project-id> <folder-id-or-dash> <host-id>` | Move chat and storage |
| BB CLI | `bb project-folders move-section <folder-id> <absolute-path>` | Move or re-link section |
| BB CLI | `bb project-folders archives` | List archive records |
| BB CLI | `bb project-folders archive <folder-id>` | Archive section subtree |
| BB CLI | `bb project-folders remove-section <folder-id> archive\|unbind\|purge` | Remove a section with the selected retention mode (`server.ts:3866-3870`, `server.ts:3982-3986`) |
| BB CLI | `bb project-folders backup [--out file]` | Export plugin data as JSON, printing it or writing it to the `--out` path (`server.ts:3825-3827`, `server.ts:3996-4004`) |
| BB CLI | `bb project-folders restore <archive-id\|file> [--merge]` | Restore a section archive or import a backup file (`server.ts:3818-3822`, `server.ts:3987-3995`) |
| BB CLI | `bb project-folders copy-add <project-id> <host-id> <path>` | Add working copy |
| BB CLI | `bb project-folders copy-remove <project-id> <host-id>` | Remove working copy |
| BB CLI | `bb project-folders forget <folder-id>` | Compatibility alias for `archive` |
| BB CLI | `bb project-folders delete-project <project-id> keep\|archive` | Delete project record and select file behavior |
| BB CLI | `bb project-folders rules show\|set <project-id> <folder-id-or-dash> [options]` | Read/save rules |
| BB CLI | `bb project-folders sync <thread-id>` | Export chat history |

Command definitions and argument parsing: `server.ts:3783-3892`, `server.ts:3895-4084`.

## Failures

- Zod validation rejects invalid RPC and CLI inputs before their handlers run (`server.ts:194-207`, `server.ts:3895-4084`).
- BB and host SDK errors return through RPC/CLI error handling; filesystem moves preserve journals for retry (`section-move.ts:347-353`, `project-move.ts:228-246`).
- Session-context settings can be stored even if the BB extension is unavailable, but no enforcement hook is installed (`session-policy-server.ts:52-75`).

## Business rules

- Every RPC operation is registered against a typed input/output contract (`server.ts:173-630`, `server.ts:3579`).
- `sections_list` is separate and read-only; its optional `projectId` filters the result (`server.ts:155-172`, `server.ts:3579-3602`).
- CLI commands validate required arguments and call the domain handlers; `--json` is removed from the argument list before parsing (`server.ts:3895-4084`).
- Section removal rejects active chats, queued work, pending chat moves, pending section moves or archives; `purge` also refuses shared paths and project/environment ownership conflicts (`section-remove.ts:66-150`, `section-remove.ts:187-197`).
- Backup import defaults to `replace`; `merge` inserts rows without replacing local rows, and both modes reject while a move or archive is in progress (`server.ts:3547-3560`, `backup.ts:127-165`, `backup.ts:179-190`).
- Host operations target a host through BB call options; the host ID is not part of the `moveHostContract` operation payload (`project-move.ts:172-175`, `server.ts:2472-2474`, `move-contract.ts:10-56`).

## Gotchas

- RPC operation names are contract names, not stable HTTP paths; the BB plugin RPC transport owns the wire route (`server.ts:173-630`, `server.ts:3579`).
- The `forget` RPC and CLI compatibility names archive a section; they do not permanently delete it (`server.ts:410`, `server.ts:2973-2978`, `server.ts:3860-3864`, `server.ts:3978-3981`).

## Related pages

- [Project and section tree](features/project-tree.md)
- [Devices and moves](features/devices-and-moves.md)
- [Agent rules](features/agent-rules.md)
- [Session context](features/session-context.md)
- [Cache keepalive](features/cache-keepalive.md)
- [Chat history export](features/chat-history-export.md)

<!-- lane-pilot:backlinks -->
## Referenced by

- [RPC and host contract behavior](api-contracts.md)
- [Architecture](architecture.md)
- [Deployment](deployment.md)
- [Projects & Sections — Overview](overview.md)
