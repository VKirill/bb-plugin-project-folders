---
title: API and commands
type: component
created: 2026-09-27
updated: 2026-10-01
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
  - github-remote.ts
  - session-inventory.ts
  - package.json
---
# API and commands

TL;DR: The plugin exposes typed BB plugin RPC, a read-only section-list RPC for other plugins, BB host operations and a `bb project-folders` CLI command group; it does not define standalone HTTP routes (`server.ts:187-621`, `server.ts:3359-3382`, `server.ts:3537-3632`).

## How it works

1. The server defines the main plugin methods in `rpcContract` and registers their handlers with BB. Its `list` operation returns the plugin’s tree, placement and machine state for plugin surfaces (`server.ts:284-297`, `server.ts:3359`). A different `sectionsContract` exposes section metadata through discoverable read-only `sections_list` for other plugins; it does not replace the plugin’s `list` result (`server.ts:170-190`, `server.ts:3360-3382`).
2. Plugin UI surfaces call those RPC operations through the BB SDK (`app.tsx:60-70`, `composer-chip.tsx:154-180`).
3. Cross-plugin integrations use the separate `sections_list` contract, which returns section metadata and accepts an optional project ID (`server.ts:170-185`, `server.ts:3360-3382`).
4. Server handlers and move coordinators dispatch device-specific filesystem, remote and inventory work through `moveHostContract`, with a target host ID in BB call options (`server.ts:878-880`, `server.ts:2439-2441`, `project-move.ts:172-175`, `session-policy-server.ts:221-224`, `host.ts:5-16`).
5. BB registers the CLI command group `project-folders`; its handler validates args and calls the same domain operations (`server.ts:3537-3632`, `server.ts:3633-3810`).

## Modes

| Surface | Method | Path/name | Caller | Auth |
|---|---|---|---|---|
| Plugin RPC | `BB RPC` | `<rpc-name>` | Plugin app, composer, settings and lifecycle handlers | BB plugin RPC boundary; no per-method user-auth check is defined in this plugin contract |
| Cross-plugin RPC | `BB RPC` | `sections_list` | Other BB plugins, including section-aware integrations | BB plugin RPC boundary; read-only contract |
| Host API | `BB host contract` | `<operation>` | Plugin server via the selected host ID | BB host dispatch to the connected device; no separate plugin credential in this contract |
| CLI | `BB CLI` | `bb project-folders <command>` | Local BB CLI user or agent | BB CLI/plugin command registration |

## Public API

### Plugin RPC operations

The path column names each operation in the registered plugin RPC contract; these are contract calls, not literal HTTP URL paths. This statement applies to the plugin RPC operations in this table. The cross-plugin section-list contract, host contract and CLI are separate surfaces below (`server.ts:170-190`, `server.ts:3360-3382`, `move-contract.ts:1-56`, `server.ts:3537-3632`).

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

Contract schemas: `server.ts:280-369`; project-copy checks and operations: `server.ts:2492-2579`.

`project_delete` accepts `files: "keep" | "archive"`; the handler delegates to `deleteProject`, which performs pending-work, chat-activity and filesystem-ownership checks before removing plugin rows and the BB project (`server.ts:331-340`, `server.ts:2491`, `project-delete.ts:27-124`). See [Project and section tree](features/project-tree.md) for the deletion rules.

### Moves, placements and archives

| Method | Path | Caller | Purpose | Auth |
|---|---|---|---|---|
| BB RPC | `project_move`, `pending_moves` | Project card/move dialog | Relocate project root and list pending relocations | BB plugin RPC |
| BB RPC | `section_move`, `pending_section_moves` | Section path dialog | Move/re-link section and list pending operations | BB plugin RPC |
| BB RPC | `thread_move` | Thread row/menu or drag/drop | Move chat workspace and dedicated storage | BB plugin RPC |
| BB RPC | `thread_place`, `thread_place_clear` | Thread menu or tree filing UI | Change tree filing without changing workspace | BB plugin RPC |
| BB RPC | `archive_list`, `archive_matches`, `archive`, `restore`, `forget` | Archive page and section menu | Find, archive and restore section subtrees | BB plugin RPC |

Contract schemas: `server.ts:188-279`, `server.ts:361-399`; CLI equivalents call the same functions (`server.ts:3715-3722`, `server.ts:3565-3577`).

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

`makeSessionPolicies` maps scopes to keys (`g`, `p:<projectId>`, `f:<folderId>`), reads and validates stored JSON, normalizes writes and deletes empty policies. When the experimental core hook exists, it registers a resolver that maps the thread workspace to its deepest real section and resolves section, ancestor, project and global layers; without the hook it still exposes read, save and inventory operations with `available: false` (`session-policy-server.ts:57-86`, `session-policy-server.ts:88-150`).

| Operation | Branch and outcome | Failure behavior |
|---|---|---|
| Read | Resolve scope placement, load own value, compute inherited/effective policy and report the user-instructions file path/existence (`session-policy-server.ts:152-172`). | Invalid JSON or schema data becomes an empty policy (`session-policy-server.ts:76-86`). |
| Save | Validate scope placement and store normalized value; empty values delete the key (`session-policy-server.ts:88-95`, `session-policy-server.ts:174-177`). | Placement/database failures reject the save (`session-policy-server.ts:174-177`). |
| Inventory | Gather plugin contributions, BB plugins, project skills and host MCP/CLI names for non-global scopes (`session-policy-server.ts:178-241`). | Optional plugin, skill and host sources fail independently to empty results (`session-policy-server.ts:194-224`). |
| Core enforcement | Register `experimental_vkSessionPolicy` only when present, resolving each thread against its matching project, host and deepest section (`session-policy-server.ts:130-150`). | Without the extension, `available` is false and no resolver is registered (`session-policy-server.ts:67-68`, `session-policy-server.ts:144-150`). |

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

The separate contract is declared and registered in `server.ts:170-185`, `server.ts:3360-3382`.

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

1. A server handler or move coordinator creates a client from `moveHostContract`. The contract payload carries operation inputs; callers select the target machine separately through BB’s `{ hostId }` call options (`server.ts:878-880`, `server.ts:2439-2441`, `project-move.ts:45-50`, `project-move.ts:172-175`).
2. BB dispatches each typed contract key through `host.ts` to its host-side handler. The contract validates operation input and output shapes; host IDs are not fields in the operation payload (`move-contract.ts:10-56`, `host.ts:7-16`).
3. The selected key determines the branch: `folder_edit` creates or deletes a directory, `inspect` checks a path move, `move` relocates it and creates a compatibility link, `link` links a directory moved outside BB, `session_inventory` reads local CLI configuration names, and `github_remotes` resolves GitHub remotes for supplied paths (`folder-files.ts:3-41`, `move-files.ts:14-118`, `session-inventory.ts:26-96`, `github-remote.ts:1-30`).

| Operation branch | Conditions and result | Failures |
|---|---|---|
| `folder_edit` create/delete | Action selects creation or empty-directory deletion under `parent`; output returns the path (`move-contract.ts:11-18`, `folder-files.ts:3-41`). | Invalid/protected paths, registered paths, symlinks, non-empty deletion targets and filesystem errors reject (`folder-files.ts:3-41`). |
| `inspect` | Returns normalized source/destination and whether a compatible link proves the move is already complete (`move-contract.ts:20-26`, `move-files.ts:14-73`). | Rejects unsupported OS, non-absolute/control-character paths, nested paths, symbolic-link parents, absent/non-real source, protected roots, occupied destination, cross-volume destination and linked worktrees (`move-files.ts:14-73`). |
| `move` | Runs the same inspection; already-moved plans return without another rename. Otherwise it renames source, then creates a compatibility link (`move-files.ts:74-95`). | If linking fails it attempts to roll the rename back only if the original path remains absent; then returns an inspection instruction as error (`move-files.ts:82-93`). |
| `link` | Requires an absent old path and existing real destination, then creates the compatibility symlink (`move-files.ts:96-118`). | Rejects invalid/nested paths, occupied source, non-real destination or symbolic-link parents (`move-files.ts:102-118`). |
| `session_inventory`, `github_remotes` | Inventory returns MCP server and native-plugin names with their configured CLI source labels; remote lookup returns each input path and nullable URL (`session-inventory.ts:6-22`, `session-inventory.ts:26-96`, `github-remote.ts:1-30`). | Missing or unreadable inventory files are treated as empty text and contribute no names; handler or host-call errors reject (`session-inventory.ts:99-124`, `host.ts:7-16`). |

The host contract is declared once and consumed by central-server callers and the host entry. A caller supplies the target `hostId` in BB call options; the host entry maps the typed operation key to its handler, and BB validates the payload against the contract (`move-contract.ts:1-56`, `host.ts:5-16`, `server.ts:2439-2441`). The modes and handler outcomes are listed above.

| Step | Behavior and branch | Failure or result |
|---|---|---|
| 1 | A server or move coordinator chooses a contract key and supplies the target host in BB call options; the host entry routes that key to its mapped handler (`server.ts:878-880`, `server.ts:2439-2441`, `project-move.ts:172-175`, `host.ts:7-16`). | Disconnected-host and dispatch failures reject the call to the invoking code (`server.ts:2439-2441`, `project-move.ts:172-176`). |
| 2 | `folder_edit` validates parent, name, action and optional protected paths, then creates a directory or deletes an empty one (`move-contract.ts:10-18`, `folder-files.ts:3-41`). | Protected, registered, symlink or non-empty paths reject; filesystem errors propagate (`folder-files.ts:10-41`). |
| 3 | `inspect` resolves absolute source/destination paths and determines whether the destination already represents a completed move (`move-files.ts:14-73`). | Unsupported OS, invalid/nested paths, symlink parents, missing/non-directory source, protected roots, existing destination, cross-volume paths and linked worktrees reject (`move-files.ts:14-72`). |
| 4 | `move` reuses inspection; an already-complete result returns directly. Otherwise it renames the source and creates a compatibility link at the old path (`move-files.ts:74-91`). | If link creation fails, it restores the rename only when the old path is still absent, then rejects with a recovery instruction (`move-files.ts:82-89`). |
| 5 | `link` handles an already-relocated folder: the old path must be absent and the destination must be an existing real directory; it creates the compatibility symlink (`move-files.ts:94-118`). | Invalid/nested paths, occupied old path, non-directory or symlink destination, symlink parents and link errors reject (`move-files.ts:100-117`). |
| 6 | `session_inventory` and `github_remotes` read host-local configured names and resolve remote metadata for supplied paths (`session-inventory.ts:26-96`, `github-remote.ts:1-30`). | Missing inventory files contribute no names; handler or host-call errors reject the call (`session-inventory.ts:99-124`, `host.ts:7-16`). |

### `makeProjectMoves`

1. The factory opens the project-move journal, exposes `list`, `busy` and canonical-path resolution, and creates a host client. A move has a process-local single-operation guard (`project-move.ts:18-45`).
2. It finds the requested project and its local-path source on the requested host. An unfinished journal may only be retried with its saved host and destination; otherwise it creates a journal in memory with the current source and resolved destination (`project-move.ts:46-77`).
3. Before filesystem work it rejects overlapping project source trees, other-project environments inside the source, same-project environments outside the source, and non-archived section archive records. It asks the host to inspect the move and inventories all hidden, archived and unarchived project threads in pages of 200 (`project-move.ts:78-139`).
4. The preflight rejects active/starting/stopping/pending threads, queued work and positive activity. It then writes the journal as a barrier, emits `changed`, drains pending exports, repeats the thread check while stopping idle threads, and asks the host to move the directory (`project-move.ts:140-177`).
5. After the host move it updates the BB project source path. It rebases archive manifests, section paths and export paths in the plugin database, marks the journal complete, clears its error, emits `changed` and returns the journal (`project-move.ts:178-227`).
6. Any failure is rethrown. The catch stores the error only when the journal is already present in persistent storage; the `finally` block always clears the in-memory running guard. Since the journal is first persisted after preflight, a failure before that write leaves no retry record (`project-move.ts:70-80`, `project-move.ts:166-169`, `project-move.ts:234-243`).

| Branch | Condition | Outcome |
|---|---|---|
| Completed path alias | A prior completed move maps the supplied path through its journal chain | Canonical path is returned; more than 100 chained links throws (`project-move.ts:29-39`). |
| Retry | An unfinished project journal exists | Only its original host and destination are accepted (`project-move.ts:55-77`). |
| Host filesystem move | Source exists and preflight succeeds | Host renames the folder and creates the old-path compatibility link (`project-move.ts:140-177`, `move-files.ts:74-91`). |
| Metadata finalization | Host move succeeds | BB source, folder paths, archive manifests and export paths are rebased and the journal is completed (`project-move.ts:178-227`). |

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

`rpcContract` declares the input and output schema for each RPC name, and `bb.rpc.register` binds that contract to the matching handler object (`server.ts:187-250`, `server.ts:3359-3360`). Its branches in this range are:

| Operation | Input branch | Output / failure behavior |
|---|---|---|
| `thread_move` | Target schema plus non-empty thread ID | Path and optional `asked=false`; invalid target/thread ID is rejected (`server.ts:188-194`). |
| `thread_section` | Thread ID | Nullable section labels/path/project name plus pending flag, allowing unresolved workspace to be retried (`server.ts:196-213`). |
| `project_move` | Project ID, host ID and non-empty destination | Destination and completion flag; handler/host errors propagate through RPC (`server.ts:215-222`). |
| `pending_moves` | `null` only | Array of project, host, destination and nullable error records (`server.ts:223-233`). |
| `group_create` | Target schema and trimmed name of 1–120 characters | Created folder schema; schema or handler rejects invalid targets (`server.ts:234-237`). |
| `group_delete` | Non-empty folder ID | Returns `{ok:true}` after deleting an empty group; rejects a missing/non-group ID or a group with children (`server.ts:242-245`, `server.ts:2180-2192`). |
| `thread_place` | Non-empty thread/project IDs and nullable folder ID | Literal `{ok:true}` after placement (`server.ts:242-250`). |

The contract continues with the remaining RPC operations in the route tables above; handler registration binds the full contract as one typed surface (`server.ts:187-621`, `server.ts:3359-3360`).

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
| BB CLI | `bb project-folders restore <archive-id>` | Restore archive |
| BB CLI | `bb project-folders copy-add <project-id> <host-id> <path>` | Add working copy |
| BB CLI | `bb project-folders copy-remove <project-id> <host-id>` | Remove working copy |
| BB CLI | `bb project-folders forget <folder-id>` | Compatibility alias for `archive` |
| BB CLI | `bb project-folders delete-project <project-id> keep\|archive` | Delete project record and select file behavior |
| BB CLI | `bb project-folders rules show\|set <project-id> <folder-id-or-dash> [options]` | Read/save rules |
| BB CLI | `bb project-folders sync <thread-id>` | Export chat history |

Command definitions and argument parsing: `server.ts:3537-3632`, `server.ts:3633-3810`.

## Failures

- Zod validation rejects invalid RPC and CLI inputs before their handlers run (`server.ts:187-200`, `server.ts:3633-3810`).
- BB and host SDK errors return through RPC/CLI error handling; filesystem moves preserve journals for retry (`section-move.ts:347-353`, `project-move.ts:228-246`).
- Session-context settings can be stored even if the BB extension is unavailable, but no enforcement hook is installed (`session-policy-server.ts:52-68`).

## Business rules

- Every RPC operation is registered against a typed input/output contract (`server.ts:187-621`, `server.ts:3359-3360`).
- `sections_list` is separate and read-only; its optional `projectId` filters the result (`server.ts:170-185`, `server.ts:3360-3382`).
- CLI commands validate required arguments and call the domain handlers; `--json` is removed from the argument list before parsing (`server.ts:3633-3810`).
- Host operations target a host through BB call options; the host ID is not part of the `moveHostContract` operation payload (`project-move.ts:172-175`, `server.ts:2439-2441`, `move-contract.ts:10-56`).

## Gotchas

- RPC operation names are contract names, not stable HTTP paths; the BB plugin RPC transport owns the wire route (`server.ts:187-621`, `server.ts:3359-3360`).
- The `forget` CLI/RPC compatibility name archives a section; it does not permanently delete it (`server.ts:399`, `server.ts:3565-3573`, `server.ts:3715-3720`).

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
