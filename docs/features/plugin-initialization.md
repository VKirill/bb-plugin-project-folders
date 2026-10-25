---
title: Plugin initialization
type: component
created: 2026-10-25
updated: 2026-10-25
status: active
confidence: medium
tags: [plugin, initialization, runtime]
sources:
  - server.ts
  - cache-keepalive.ts
  - auto-archive.ts
  - session-policy-server.ts
---
# Plugin initialization

TL;DR: `plugin(bb)` migrates storage, loads runtime settings, builds domain services, then registers RPC, agent, environment and CLI integrations (`server.ts:682-776`, `server.ts:3579-3789`).

## Purpose

The async plugin entry prepares persistent state and its in-memory collaborators before exposing the plugin’s RPC contracts and BB integrations (`server.ts:682-776`, `server.ts:2069-2185`, `server.ts:3579-3789`).

## How it works

1. It declares the legacy agent-settings descriptors for one-time migration, opens BB plugin storage, then applies the ordered schema migrations (`server.ts:682-776`).
2. It loads cache keepalive and auto-archive configuration from `preferences`, falls back to their defaults when absent, creates both coordinators, registers disposal handlers and wires idle/archive/delete events for keepalive (`server.ts:777-809`, `auto-archive.ts:9-30`, `cache-keepalive.ts:93-135`).
3. It defines the shared agent defaults and field schemas. `parseAgents` starts with defaults and accepts only known values that pass their field schema. If `preferences['agents']` exists, that record seeds the in-memory `shared` settings. If absent, the entry reads the old declarative BB settings once; a rejected read logs a warning, then parsed defaults/valid legacy values are stored in `preferences['agents']`. Synchronous agent callbacks use this in-memory object (`server.ts:810-867`, `server.ts:1104-1175`).
4. It creates folder/path readers and bindings, project move canonicalization, and the repository metadata cache. `list` schedules repository reads only for uncached paths on connected hosts; rejected host reads are caught, preserve prior URLs and update the attempt time (`server.ts:868-941`, `server.ts:942-1038`, `server.ts:2484-2544`).
5. It builds move, archive, chat-move and section-move coordinators, then assembles the RPC handler map (`server.ts:2069-2185`, `server.ts:3313-3578`).
6. It registers the main typed RPC and discoverable section-list RPC, then configures agent instructions and the section environment provider. Environment validation returns refusal for an invalid selection; creation returns a failed result instead of throwing that refusal (`server.ts:3579-3757`).
7. It registers the `project-folders` CLI command group (`server.ts:3758-3789`).

| Branch | Condition | Outcome or failure |
|---|---|---|
| Existing agent settings | `preferences` has key `agents` | Parse known fields over defaults into in-memory `shared`; the legacy setting block is not read (`server.ts:834-855`). |
| Legacy agent migration | No `agents` row | Read legacy settings once; on read rejection log a warning, parse defaults, and save the shared record (`server.ts:849-867`). |
| Repository refresh | Listing includes uncached folder paths on connected hosts | Query `repo_remotes`; failures are caught and keep the listing usable with prior metadata (`server.ts:975-1038`). |
| Experimental session policy | BB exposes `experimental_vkSessionPolicy` | Install the policy hook; without it, the setting remains reportable but is not enforced (`session-policy-server.ts:52-75`, `session-policy-server.ts:151-157`). |
| Section environment | Selected section is valid or invalid on the requested project/host | Accept/create with the bound path, or refuse/return a failed result when it is missing, a group, unbound, moving or archiving (`server.ts:3697-3757`). |
| Storage migration | Migration succeeds or throws | Success proceeds; an exception escapes before the later stores and registrations are created (`server.ts:735-776`). |

## Failures

| Failure | Result |
|---|---|
| Storage open or migration throws | The async entry rejects before coordinator setup and RPC/environment/CLI registration (`server.ts:735-776`, `server.ts:3579-3789`). |
| Legacy settings read rejects | Warning is logged; defaults and any valid parsed values are saved to the `agents` preference (`server.ts:854-867`). |
| Host repository lookup rejects | Error is caught; prior URL/private metadata remains and the attempt timestamp delays another immediate read (`server.ts:975-1023`). |
| Environment selection fails validation | BB receives a refusal message; a create-time failure returns `status: failed` (`server.ts:3697-3757`). |

## Business rules

- Runtime agent settings are one shared in-memory object seeded from the persisted `agents` record or from the one-time legacy migration (`server.ts:849-867`).
- Environment hooks require a real section belonging to the requested project and a path binding on the selected host; groups and busy moves/archives are rejected (`server.ts:3697-3757`).
- Keepalive and auto-archive coordinators register disposal handlers so their timers and listeners are stopped with the plugin (`server.ts:792-809`, `cache-keepalive.ts:293-307`, `auto-archive.ts:175-189`).

## Public API or commands

| Registration | Purpose | Evidence |
|---|---|---|
| Main RPC contract | Registers the full handler map (`server.ts:3579`). |
| `sections_list` contract | Exposes a discoverable read-only project section list (`server.ts:3580-3603`). |
| BB section environment | Registers validation/create/remove callbacks (`server.ts:3732-3757`). |
| `project-folders` CLI | Registers project and section commands (`server.ts:3780-3789`). |

## Gotchas

- Agent settings read by synchronous BB callbacks are cached in memory; successful settings writes and backup imports also replace that in-memory value (`server.ts:852-867`, `server.ts:3225-3234`, `server.ts:3547-3554`).
- A settings-read warning is a migration fallback, while a storage migration error rejects plugin startup (`server.ts:735-776`, `server.ts:854-867`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [Project and section tree](project-tree.md)
