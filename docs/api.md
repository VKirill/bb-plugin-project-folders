---
title: API and commands
type: component
created: 2026-09-27
updated: 2026-09-28
status: active
confidence: low
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
  - github-remote.ts
  - session-inventory.ts
  - package.json
---
# API and commands

TL;DR: The plugin exposes typed BB plugin RPC, a read-only section-list RPC for other plugins, BB host operations and a `bb project-folders` CLI command group; it does not define standalone HTTP routes (`server.ts:187-602`, `server.ts:3214-3228`, `server.ts:3390-3475`).

## How it works

1. The server defines request and response schemas with Zod-backed `defineRpcContract` and registers the handlers with BB (`server.ts:187-602`, `server.ts:3214-3225`).
2. Plugin UI surfaces call those RPC operations through the BB SDK (`app.tsx:60-70`, `composer-chip.tsx:154-180`).
3. Cross-plugin integrations use the separate `sections_list` contract, which returns section metadata and accepts an optional project ID (`server.ts:170-185`, `server.ts:3214-3228`).
4. The server dispatches device-specific filesystem and inventory work to the host entry under `moveHostContract` (`server.ts:1884-1890`, `host.ts:5-16`).
5. BB registers the CLI command group `project-folders`; its handler validates args and calls the same domain operations (`server.ts:3390-3475`, `server.ts:3476-3552`).

## Modes

| Surface | Method | Path/name | Caller | Auth |
|---|---|---|---|---|
| Plugin RPC | `BB RPC` | `<rpc-name>` | Plugin app, composer, settings and lifecycle handlers | BB plugin RPC boundary; no per-method user-auth check is defined in this plugin contract |
| Cross-plugin RPC | `BB RPC` | `sections_list` | Other BB plugins, including section-aware integrations | BB plugin RPC boundary; read-only contract |
| Host API | `BB host contract` | `<operation>` | Plugin server via the selected host ID | BB host dispatch to the connected device; no separate plugin credential in this contract |
| CLI | `BB CLI` | `bb project-folders <command>` | Local BB CLI user or agent | BB CLI/plugin command registration |

## Public API

### Plugin RPC operations

The path column names each operation in the registered BB RPC contract; these are contract calls, not literal HTTP URL paths. All use the BB plugin RPC boundary (`server.ts:187-602`, `server.ts:3214-3225`).

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

Contract schemas: `server.ts:280-414`; project-copy checks and operations: `server.ts:2426-2513`.

`project_delete` accepts `files: "keep" | "archive"`; the handler delegates to `deleteProject`, which performs pending-work, chat-activity and filesystem-ownership checks before removing plugin rows and the BB project (`server.ts:331-340`, `server.ts:2491`, `project-delete.ts:27-119`). See [Project and section tree](features/project-tree.md) for the deletion rules.

### Moves, placements and archives

| Method | Path | Caller | Purpose | Auth |
|---|---|---|---|---|
| BB RPC | `project_move`, `pending_moves` | Project card/move dialog | Relocate project root and list pending relocations | BB plugin RPC |
| BB RPC | `section_move`, `pending_section_moves` | Section path dialog | Move/re-link section and list pending operations | BB plugin RPC |
| BB RPC | `thread_move` | Thread row/menu or drag/drop | Move chat workspace and dedicated storage | BB plugin RPC |
| BB RPC | `thread_place`, `thread_place_clear` | Thread menu or tree filing UI | Change tree filing without changing workspace | BB plugin RPC |
| BB RPC | `archive_list`, `archive_matches`, `archive`, `restore`, `forget` | Archive page and section menu | Find, archive and restore section subtrees | BB plugin RPC |

Contract schemas: `server.ts:188-279`, `server.ts:361-399`; CLI equivalents call the same functions (`server.ts:3480-3507`, `server.ts:3539-3545`).

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

Contract schemas: `server.ts:415-573`; execution resolution: `execution.ts:97-129`; session policy registration: `session-policy-server.ts:144-150`.

### Preferences and history

| Method | Path | Caller | Purpose | Auth |
|---|---|---|---|---|
| BB RPC | `prefs_get`, `prefs_save` | Appearance and chat-list settings | Read/save shared preferences and optionally replace item styles | BB plugin RPC |
| BB RPC | `item_style_save` | Project/section appearance editor | Upsert/delete one item style | BB plugin RPC |
| BB RPC | `sync` | Thread actions/settings | Export one thread’s timeline to files | BB plugin RPC |

Contract schemas: `server.ts:574-601`.

## Cross-plugin section listing

| Method | Path | Caller | Purpose | Auth |
|---|---|---|---|---|
| BB RPC | `sections_list` | Other plugins | Return section ID, project ID, parent, name, path, host and kind; optional project filter | BB plugin RPC; read-only |

The separate contract is declared and registered in `server.ts:170-185`, `server.ts:3214-3228`.

## Host operations

| Method | Path | Caller | Purpose | Auth | Evidence |
|---|---|---|---|---|---|
| BB host contract | `folder_edit` | Server folder browser RPC | Create/delete an empty directory | BB host dispatch to connected device | `host.ts:7-16`, `folder-files.ts:3-41` |
| BB host contract | `inspect` | Project/section move modules | Inspect paths and detect completed move/link | BB host dispatch to connected device | `host.ts:7-16`, `move-files.ts:14-73` |
| BB host contract | `move` | Project/section move modules | Move a directory and create compatibility path | BB host dispatch to connected device | `host.ts:7-16`, `move-files.ts:74-95` |
| BB host contract | `link` | Section move module | Link a folder renamed outside BB | BB host dispatch to connected device | `host.ts:7-16`, `move-files.ts:96-118` |
| BB host contract | `github_remotes` | Project tree metadata refresh | Resolve GitHub remote and visibility | BB host dispatch to connected device | `host.ts:7-16`, `github-remote.ts:1-30` |
| BB host contract | `session_inventory` | Session policy editor | List host MCP servers and native CLI plugins | BB host dispatch to connected device | `host.ts:7-16`, `session-inventory.ts:1-45` |

The host contract operations are typed in `move-contract.ts:1-56`.

### `moveHostContract` dispatch

1. The server creates a host client with `moveHostContract` and dispatches an operation to the selected host ID; `host.ts` maps each contract key to its host-side handler (`project-move.ts:45-46`, `host.ts:5-16`).
2. Zod validates each operation’s input and output: `folder_edit` carries optional protected paths, parent, name and create/delete action; `inspect`, `move` and `link` use absolute-path strings at the contract boundary; `session_inventory` validates a nullable cwd; `github_remotes` accepts path strings (`move-contract.ts:7-55`).
3. `folder_edit` creates or deletes a directory; `inspect` only plans/checks; `move` relocates a directory and leaves a compatibility link; `link` creates a compatibility link when the directory was moved outside BB. Inventory and remote calls return names/or URLs and their source metadata (`host.ts:7-16`, `folder-files.ts:3-41`, `move-files.ts:14-118`, `session-inventory.ts:26-97`, `github-remote.ts:1-30`).

| Operation branch | Conditions and result | Failures |
|---|---|---|
| `folder_edit` create/delete | Action selects creation or empty-directory deletion under `parent`; output returns the path (`move-contract.ts:11-18`, `folder-files.ts:3-41`). | Invalid/protected paths, registered paths, symlinks, non-empty deletion targets and filesystem errors reject (`folder-files.ts:3-41`). |
| `inspect` | Returns normalized source/destination and whether a compatible link proves the move is already complete (`move-contract.ts:20-26`, `move-files.ts:14-73`). | Rejects unsupported OS, non-absolute/control-character paths, nested paths, symbolic-link parents, absent/non-real source, protected roots, occupied destination, cross-volume destination and linked worktrees (`move-files.ts:14-73`). |
| `move` | Runs the same inspection; already-moved plans return without another rename. Otherwise it renames source, then creates a compatibility link (`move-files.ts:74-95`). | If linking fails it attempts to roll the rename back only if the original path remains absent; then returns an inspection instruction as error (`move-files.ts:82-93`). |
| `link` | Requires an absent old path and existing real destination, then creates the compatibility symlink (`move-files.ts:96-118`). | Rejects invalid/nested paths, occupied source, non-real destination or symbolic-link parents (`move-files.ts:102-118`). |
| `session_inventory`, `github_remotes` | Inventory gathers configured names by CLI source; remote lookup returns each path and nullable URL (`session-inventory.ts:26-97`, `github-remote.ts:1-30`). | Missing/unreadable inventory files contribute no names; host dispatch or remote resolution errors propagate (`session-inventory.ts:99-109`, `host.ts:7-16`). |

### `rpcContract` validation and outputs

`rpcContract` declares the input and output schema for each RPC name, and `bb.rpc.register` binds that contract to the matching handler object (`server.ts:187-250`, `server.ts:3214-3225`). Its branches in this range are:

| Operation | Input branch | Output / failure behavior |
|---|---|---|
| `thread_move` | Target schema plus non-empty thread ID | Path and optional `asked=false`; invalid target/thread ID is rejected (`server.ts:188-194`). |
| `thread_section` | Thread ID | Nullable section labels/path/project name plus pending flag, allowing unresolved workspace to be retried (`server.ts:196-213`). |
| `project_move` | Project ID, host ID and non-empty destination | Destination and completion flag; handler/host errors propagate through RPC (`server.ts:215-222`). |
| `pending_moves` | `null` only | Array of project, host, destination and nullable error records (`server.ts:223-233`). |
| `group_create` | Target schema and trimmed name of 1–120 characters | Created folder schema; schema or handler rejects invalid targets (`server.ts:234-237`). |
| `group_delete` | Non-empty folder ID | Literal `{ok:true}` after deletion (`server.ts:238-240`). |
| `thread_place` | Non-empty thread/project IDs and nullable folder ID | Literal `{ok:true}` after placement (`server.ts:242-250`). |

The contract continues with the remaining RPC operations in the route tables above; handler registration binds the full contract as one typed surface (`server.ts:187-602`, `server.ts:3214-3215`).

### `linkDirectory` filesystem branch

1. Resolve the supplied source and destination strings to absolute paths, then reject inputs that were not absolute, contain control characters, or contain one another (`move-files.ts:96-108`).
2. Require the old source path to be absent and destination to be an existing real directory, not a symlink; require `realpath(destination)` to equal the path so no parent component is a symlink (`move-files.ts:109-117`).
3. Create a directory symlink from the old source path to the destination and return both normalized paths with `moved: true` (`move-files.ts:116-118`).

There is no fallback branch: validation errors or a symlink creation error reject the host call, and the caller’s move journal retains its error for retry (`move-files.ts:102-118`, `section-move.ts:347-353`).

### `sessionInventory` collection

1. Start with empty maps for MCP server names and native plugin names. A `cwd` adds Claude project config and `.mcp.json` sources; global Claude config is always read (`session-inventory.ts:29-45`).
2. Add only enabled Claude plugins and their shipped MCP entries, then parse Codex config-table headers under `CODEX_HOME` or `~/.codex` (`session-inventory.ts:46-82`).
3. Read OpenCode `opencode.json` and `opencode.jsonc` under `XDG_CONFIG_HOME` or `~/.config`, merge names by source, sort source labels and names, and return separate MCP and native-plugin lists (`session-inventory.ts:84-97`).

| Source branch | Input | Collected values |
|---|---|---|
| Claude | Global/project `.claude.json`, cwd `.mcp.json`, enabled plugins settings and installed plugin manifests | MCP names and enabled native plugin IDs (`session-inventory.ts:35-70`). |
| Codex | `config.toml` section headers | Names from `[mcp_servers.<name>]` and `[plugins.<name>]` (`session-inventory.ts:72-82`). |
| OpenCode | `opencode.json` and `.jsonc` config files | Keys under `mcp` (`session-inventory.ts:84-90`). |

Missing or unreadable files become empty input; JSON parsing accepts line comments and trailing commas. The output contains configured names and source labels, not commands, URLs or secrets (`session-inventory.ts:99-124`).

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
| BB CLI | `bb project-folders restore <archive-id>` | Restore archive |
| BB CLI | `bb project-folders copy-add <project-id> <host-id> <path>` | Add working copy |
| BB CLI | `bb project-folders copy-remove <project-id> <host-id>` | Remove working copy |
| BB CLI | `bb project-folders forget <folder-id>` | Compatibility alias for `archive` |
| BB CLI | `bb project-folders delete-project <project-id> keep\|archive` | Delete project record and select file behavior |
| BB CLI | `bb project-folders rules show\|set <project-id> <folder-id-or-dash> [options]` | Read/save rules |
| BB CLI | `bb project-folders sync <thread-id>` | Export chat history |

Command definitions and argument parsing: `server.ts:3390-3475`, `server.ts:3476-3552`.

## Failures

- Zod validation rejects invalid RPC and CLI inputs before their handlers run (`server.ts:187-200`, `server.ts:3476-3552`).
- BB and host SDK errors return through RPC/CLI error handling; filesystem moves preserve journals for retry (`section-move.ts:347-353`, `project-move.ts:228-246`).
- Session-context settings can be stored even if the BB extension is unavailable, but no enforcement hook is installed (`session-policy-server.ts:52-68`).

## Business rules

- Every RPC operation is registered against a typed input/output contract (`server.ts:187-602`, `server.ts:3214-3225`).
- `sections_list` is separate and read-only; its optional `projectId` filters the result (`server.ts:170-185`, `server.ts:3214-3228`).
- CLI commands validate required arguments and call the domain handlers; `--json` is removed from the argument list before parsing (`server.ts:3476-3552`).
- Host-specific commands require a host ID and are dispatched through the host contract (`move-contract.ts:10-56`, `host.ts:7-16`).

## Gotchas

- RPC operation names are contract names, not stable HTTP paths; the BB plugin RPC transport owns the wire route (`server.ts:187-602`, `server.ts:3214-3225`).
- The `forget` CLI/RPC compatibility name archives a section; it does not permanently delete it (`server.ts:399`, `server.ts:3454-3457`, `server.ts:3539-3545`).

## Related pages

- [Project and section tree](features/project-tree.md)
- [Devices and moves](features/devices-and-moves.md)
- [Agent rules](features/agent-rules.md)
- [Session context](features/session-context.md)
- [Chat history export](features/chat-history-export.md)

<!-- lane-pilot:backlinks -->
## Referenced by

- [Architecture](architecture.md)
- [Deployment](deployment.md)
- [Projects & Sections — Overview](overview.md)
