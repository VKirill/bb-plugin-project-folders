---
title: Agent rules
type: component
created: 2026-09-27
updated: 2026-09-28
status: active
confidence: low
tags: [agents-md, rules, templates]
sources:
  - agents-template.ts
  - agents-apply.tsx
  - server.ts
  - app.tsx
  - README.md
---
# Agent rules

TL;DR: Projects & Sections manages project and section rule templates, writes plugin-owned blocks into `AGENTS.md` and `CLAUDE.md`, or passes custom rules to BB-started sessions (`agents-template.ts:1-18`, `server.ts:3238-3261`).

## Purpose

The rules editor supports shared and per-place templates, an own-file mode, custom rule text and a one-shot instruction for the first message of a new chat (`server.ts:424-460`, `server.ts:541-568`).

## How it works

1. The editor reads the current file plus the stored mode, templates, custom text, target and startup instruction (`server.ts:424-439`, `server.ts:2694-2739`).
2. The plugin-wide `AgentsRulesEditor` separately loads `agents_config`; it edits automatic file creation, project and section templates, shared custom rules, the custom-rule target and startup text, then saves through `agents_config_save`. Read and save failures are shown in the editor (`agents-apply.tsx:55-106`, `agents-apply.tsx:108-145`, `server.ts:415-423`).
3. Saving file content writes with the SHA read by the editor; if the file changed since that read, the handler reports a conflict and asks the editor to reopen before saving (`server.ts:441-448`, `server.ts:2740-2756`).
4. Saving settings writes a project or folder rule row; session-only custom rules are not written to files, and manual mode leaves files untouched (`server.ts:449-460`, `server.ts:2760-2800`).
5. `applyAgentsBlock` replaces only the managed block or appends it; `applyCustomBlock` similarly upserts/removes the custom block (`agents-template.ts:16-41`, `agents-template.ts:52-66`).
6. New project roots, added project copies and new sections attempt to seed their applicable template blocks; failures are logged and do not undo creation. `agents_apply` separately walks project roots and non-group sections, skipping manual-mode records, and writes only changed eligible files (`server.ts:2410-2423`, `server.ts:2463-2472`, `server.ts:1657-1674`, `server.ts:3005-3053`).
7. For a BB-created chat, session-targeted custom text is resolved from the nearest section, then project, then plugin settings and returned as BB agent instructions. Startup text resolves from the nearest section/project/global setting and is appended as an agent-only input to that chat’s first request (`server.ts:962-1003`, `server.ts:3115-3161`, `server.ts:3238-3261`).

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
| File changed since editor read | The `rules_save` handler detects the expected-SHA conflict and throws a reopen-before-saving error (`server.ts:2740-2756`). |
| Group selected | Rules read and settings save reject group nodes through `rulesAllowed` (`server.ts:2694-2699`, `server.ts:2740-2763`). |
| A host file read/write fails | The read or write call rejects; no successful file-write result is returned (`server.ts:2700-2704`, `server.ts:2746-2756`, `server.ts:2817-2843`). |

## Business rules

- Managed content is delimited by exact plugin markers; text outside the managed block is retained (`agents-template.ts:1-18`, `agents-template.ts:52-66`).
- A handwritten rules file can be adopted as manual mode; the plugin avoids overwriting that file (`server.ts:2670-2729`).
- Rules are unavailable on groups (`server.ts:2694-2699`, `server.ts:2740-2763`).
- Saving file content with a stale expected SHA returns a conflict instead of overwriting concurrent edits (`server.ts:2740-2756`).
- Session-only custom rules clear their file block, while file/both modes write to files and can also contribute to BB sessions (`server.ts:2764-2800`, `server.ts:3238-3261`).

## Public API

| RPC / command | Purpose | Evidence |
|---|---|---|
| `rules_read`, `rules_save`, `rules_settings_save` | Read file and settings, save file or template settings | `server.ts:424-460` |
| `agents_config`, `agents_config_save`, `agents_apply` | Read global rule settings, save them and apply templates | `server.ts:415-423`, `server.ts:541-568` |
| `bb project-folders rules show|set ...` | CLI read/write equivalent of the rules card | `server.ts:3464-3468`, `server.ts:3552-3580` |

## Gotchas

- Editing a managed block manually does not update the plugin’s stored mode/template record; a later apply can replace it (`server.ts:3552-3558`).
- `CLAUDE.md` bridging is handled when the selected rule channel writes files; it is not a second independent template store (`server.ts:2760-2800`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [API and commands](../api.md)
- [Section archive and restore](archive-and-restore.md)
