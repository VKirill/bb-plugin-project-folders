---
title: Agent rules
type: component
created: 2026-09-27
updated: 2026-09-30
status: active
confidence: medium
tags: [agents-md, rules, templates]
sources:
  - agents-template.ts
  - agents-apply.tsx
  - server.ts
  - app.tsx
  - README.md
---
# Agent rules

TL;DR: Projects & Sections manages project and section rule templates, writes plugin-owned blocks into `AGENTS.md` and `CLAUDE.md`, or passes custom rules to BB-started sessions (`agents-template.ts:1-18`, `server.ts:3389-3405`).

## Purpose

The rules editor supports shared and per-place templates, an own-file mode, custom rule text and a one-shot instruction for the first message of a new chat (`server.ts:443-460`, `server.ts:541-568`).

## How it works

1. `rules_read` returns the current `AGENTS.md` and `CLAUDE.md` text, inferred or stored mode, project/section templates, custom text, destination, startup instruction and suggested templates (`server.ts:2818-2866`). The shared `RuleFields` UI uses tabs to select `inherit`, `custom` or `manual`; the manual tab shows the supplied file editor, the custom tab shows the editable templates, and the custom-rule destination picker is disabled in manual mode (`agents-apply.tsx:238-253`, `agents-apply.tsx:288-335`, `agents-apply.tsx:325-385`).
2. The plugin-wide `AgentsRulesEditor` separately loads `agents_config`; it edits automatic file creation, project and section templates, shared custom rules, the custom-rule target and startup text, then saves through `agents_config_save`. Read and save failures are shown in the editor (`agents-apply.tsx:55-106`, `agents-apply.tsx:108-145`, `server.ts:415-423`).
3. Saving file content passes the editor's expected SHA to `files.write`; a conflict throws a reopen-before-saving error (`server.ts:2868-2888`).
4. Saving settings writes a project or folder rule row; session-only custom rules are excluded from file writes, and manual mode returns before writing template blocks (`server.ts:2890-2929`).
5. `applyAgentsBlock` replaces only the managed block or appends it; `applyCustomBlock` similarly upserts/removes the custom block (`agents-template.ts:16-41`, `agents-template.ts:52-66`).
6. New project roots, added project copies and new sections attempt to seed applicable template blocks; failures are logged without undoing creation (`server.ts:1610-1655`, `server.ts:2478-2488`, `server.ts:2522-2538`, `server.ts:1657-1674`). `agents_apply` visits project roots and non-group sections, skips manual-mode records, counts unchanged blocks, writes changed blocks and reports per-folder failures (`server.ts:3137-3185`).
7. For a BB-created chat, session-targeted custom text is resolved from the nearest section, then project, then plugin settings and returned as BB agent instructions. Startup text resolves from the nearest section/project/global setting and is appended as an agent-only input to that chat’s first request (`server.ts:962-1003`, `server.ts:3389-3405`, `server.ts:3254-3273`).

### `AgentsRulesEditor`

1. The plugin-wide editor starts with no configuration and requests `agents_config` on mount. A live flag prevents a response from updating an unmounted component; a failed read stores an error and, while no configuration exists, renders that error (`agents-apply.tsx:55-88`).
2. Once loaded, field edits patch the configuration, set `dirty` and clear the saved marker. The auto-create checkbox controls whether project and section template editors are enabled (`agents-apply.tsx:103-107`, `agents-apply.tsx:108-140`).
3. Save disables the main controls, clears the previous error, submits the whole configuration to `agents_config_save`, replaces the draft with the returned canonical configuration and clears dirty state. Rejection leaves the draft, shows the error and always clears busy (`agents-apply.tsx:89-101`).

| Editor condition | Result |
|---|---|
| Read pending | Render no settings form until configuration arrives (`agents-apply.tsx:83-88`). |
| Read rejected | Render the error alert (`agents-apply.tsx:75-88`). |
| `autoCreate` false | Template fields are disabled; other configuration fields remain editable (`agents-apply.tsx:110-140`). |
| Saving | Save path returns the server response as the new configuration; rejection keeps the edited configuration and reports the error (`agents-apply.tsx:89-107`). |

### `RuleFields`

1. The component receives a `RuleDraft`, patch callback, project-template visibility flag, tab ID prefix and optional file-editor/custom-note slots. Selecting one of its three tabs patches only `mode` (`agents-apply.tsx:238-267`).
2. `manual` shows the no-write hint and supplied file editor. `inherit` states that templates come from plugin settings. `custom` shows the note, optional project template when `showProject` is true, and the section template field (`agents-apply.tsx:325-382`).
3. All modes render shared custom-rule text and startup text fields. Their edits patch `custom` and `startup`; the target selector patches `customTarget` but is disabled in manual mode, where its displayed value is forced to `session` (`agents-apply.tsx:268-322`).

| RuleFields mode | Inputs shown | Effect of changing it |
|---|---|---|
| `inherit` | Shared rules, target, startup instruction | Uses shared templates; mode patch selects inheritance (`agents-apply.tsx:255-267`, `agents-apply.tsx:347-353`). |
| `custom` | Shared fields plus section template and, when enabled, project template | Draft template text is editable; each field emits a partial draft patch (`agents-apply.tsx:354-380`). |
| `manual` | Shared rules, startup instruction and supplied file editor | Shows a no-write hint; target selector is disabled and displays `session` (`agents-apply.tsx:288-297`, `agents-apply.tsx:337-345`). |

`RuleFields` itself has no request or error state: its parent owns persistence and displays save/read failures. A mode switch only changes the draft until the parent saves settings (`agents-apply.tsx:238-267`, `agents-apply.tsx:325-385`).

## Modes

| Rule mode | File behavior | Rule source |
|---|---|---|
| `manual` | Plugin does not write the template blocks | Existing user-owned file |
| `inherit` | Uses applicable project/shared template | Project then section defaults |
| `custom` | Uses the place’s custom template | Project or section record |

Custom rules target `file`, `session` or `both`; startup text is separate and limited to 4,000 characters (`server.ts:449-460`, `server.ts:552-560`).

## Failures

| Failure | Result |
|---|---|
| File changed since editor read | The `rules_save` handler detects the expected-SHA conflict and throws a reopen-before-saving error (`server.ts:2868-2888`). |
| Group selected | Rules read, file save and settings save reject group nodes (`server.ts:2818-2827`, `server.ts:2868-2877`, `server.ts:2890-2895`). |
| A host file read/write fails | Missing files read as `null`; other read errors and file-write errors propagate, so the handler returns no successful result (`server.ts:1575-1588`, `server.ts:1600-1609`, `server.ts:2878-2888`). |

## Business rules

- Managed content is delimited by exact plugin markers; text outside the managed block is retained (`agents-template.ts:1-18`, `agents-template.ts:52-66`).
- Without a saved mode, an existing file without a managed block resolves to `manual`; new-folder seeding leaves an existing `AGENTS.md` untouched (`server.ts:1391-1414`, `server.ts:1610-1625`).
- Rules are unavailable on groups (`server.ts:2818-2827`, `server.ts:2890-2895`).
- Saving file content with a stale expected SHA throws a conflict instead of overwriting concurrent edits (`server.ts:2868-2888`).
- Session-only custom rules remove the plugin's custom file block; `file` and `both` retain it. BB sessions receive custom rules unless the target is `file` only (`server.ts:2896-2901`, `server.ts:2966-2975`, `server.ts:3389-3405`).

## Public API

| RPC / command | Purpose | Evidence |
|---|---|---|
| `rules_read`, `rules_save`, `rules_settings_save` | Read file and settings, save file or template settings | `server.ts:443-480`, `server.ts:2818-2975` |
| `agents_config`, `agents_config_save`, `agents_apply` | Read global rule settings, save them and apply templates | `server.ts:415-423`, `server.ts:541-568` |
| `bb project-folders rules show|set ...` | CLI read/write equivalent of the rules card | `server.ts:3621-3626`, `server.ts:3728-3804` |

## Gotchas

- Editing a managed block manually does not update the plugin’s stored mode/template record; a later apply can replace it (`server.ts:1391-1414`, `server.ts:3137-3185`).
- `CLAUDE.md` bridging is handled when the selected rule channel writes files; it is not a second independent template store (`server.ts:2890-2965`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [API and commands](../api.md)
- [Section archive and restore](archive-and-restore.md)
