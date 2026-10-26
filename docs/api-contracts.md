---
title: RPC and host contract behavior
type: component
created: 2026-10-09
updated: 2026-10-26
status: active
confidence: medium
tags: [api, rpc, host, section-removal]
sources:
  - server.ts
  - section-remove.ts
  - move-contract.ts
  - host.ts
  - move-files.ts
  - folder-files.ts
  - session-inventory.ts
  - github-remote.ts
  - repo-remote.ts
  - project-move.ts
  - archive.ts
  - section-move.ts
  - auto-archive.ts
---
# RPC and host contract behavior

TL;DR: The plugin RPC contract validates server calls, while the separate host contract describes device operations; section removal coordinates section, chat and file changes (`server.ts:173-240`, `move-contract.ts:10-64`, `section-remove.ts:48-79`).

## Purpose

The RPC contract pairs server operations with their input and output schemas. The separate host contract declares device operations, and `host.ts` registers implementations for that contract (`server.ts:173-240`, `server.ts:3579`, `move-contract.ts:10-64`, `host.ts:7-19`).

## How it works

1. The RPC contract validates server operation inputs and outputs; its branch details and failure results are in [Contract and operation details](api-contracts-details.md#rpccontract) (`server.ts:173-630`, `server.ts:3579`).
2. The host contract validates device-operation payloads, while callers select a host in BB call options; dispatch and filesystem outcomes are in [Contract and operation details](api-contracts-details.md#movehostcontract) (`move-contract.ts:10-64`, `host.ts:7-19`).
3. Section removal's archive, unbind and purge paths, preconditions and partial failures are in [Contract and operation details](api-contracts-details.md#removesection) (`section-remove.ts:48-238`).

Detailed `rpcContract` validation branches and outcomes are documented in [Contract and operation details](api-contracts-details.md#rpccontract) (`server.ts:173-630`).

### `createAutoArchive` sweep lifecycle

1. The coordinator accepts the BB thread SDK, a live config getter, optional clock and interval functions, and an optional logger object. Missing clock/timer functions use the platform defaults; it keeps one shared in-flight promise (`auto-archive.ts:60-71`, `auto-archive.ts:113-118`).
2. Creating the coordinator immediately starts an initial sweep and installs an hourly interval. Both callers catch unexpected sweep rejection and log it; `dispose` clears the interval (`auto-archive.ts:175-190`).
3. Each sweep reads config at run time. Disabled config returns zero without listing. Enabled config pages unarchived threads by 200, deduplicates repeated IDs, and stops on a short page or a page that adds no new IDs (`auto-archive.ts:120-150`).
4. It captures one `now` value for the sweep, passes each thread/config/clock value to `isStale`, and sequentially archives eligible IDs. Successful archive calls increment the returned count; each rejected archive is debug-logged and the loop continues (`auto-archive.ts:142-164`). The predicate's decision sequence is documented in [Chat staleness predicate](api/chat-staleness.md) (`auto-archive.ts:92-110`).
5. `sweep()` joins an existing run; after it settles, `finally` clears the shared promise so a later call can start a fresh run (`auto-archive.ts:167-173`).

| Branch or failure | Outcome |
|---|---|
| Disabled at sweep time | Resolves `0`; no SDK list call (`auto-archive.ts:142-145`). |
| Thread listing rejects | Debug-logs and resolves `0`; no thread archive calls follow (`auto-archive.ts:145-151`). |
| A thread archive rejects | Debug-logs that thread and continues; its failure does not reject the sweep or increment the count (`auto-archive.ts:154-164`). |
| Unexpected run rejection | `sweep()` rejects to its caller after clearing the in-flight slot; initial startup converts the rejection to `0`, and the interval handler logs it (`auto-archive.ts:167-183`). |
| Concurrent sweep call | Receives the same promise and result as the active sweep (`auto-archive.ts:167-173`). |

The detailed operation schemas, host dispatch modes and filesystem outcomes are documented in [Contract and operation details](api-contracts-details.md#movehostcontract) (`move-contract.ts:10-64`, `host.ts:7-19`).

The project move journal and its preflight, retry, completion and failure branches are documented in [Contract and operation details](api-contracts-details.md#makeprojectmoves) (`project-move.ts:18-243`).

Section removal modes, preconditions, chat selection and partial-failure behavior are documented in [Contract and operation details](api-contracts-details.md#removesection) (`section-remove.ts:48-238`).

The host inventory collector's source-by-source results and failure behavior are documented in [Contract and operation details](api-contracts-details.md#sessioninventory) (`session-inventory.ts:26-124`).

## Business rules

- `folderId: null` means project-root placement; it does not mean “no placement” (`server.ts:228-236`).
- `moveHostContract` operation schemas omit `hostId`; server callers select the destination host through the BB host client's call options (`move-contract.ts:10-55`, `project-move.ts:135-139`, `project-move.ts:172-175`).
- Section removal preserves a shared directory for `unbind`; purge refuses a shared path (`section-remove.ts:119-150`, `section-remove.ts:222-233`).

## Public API

The plugin registers `rpcContract` on BB RPC; host operations use `moveHostContract` through BB’s host client (`server.ts:3579`, `move-contract.ts:10-63`). See [API and commands](api.md) for the operation inventory.

## Gotchas

- `thread_section` returns `pending: true` while a thread has no environment; once an environment exists, unresolved section data returns `pending: false` (`server.ts:2213-2220`).
- `move` and `link` can both return `moved: true`; callers use that result to finish metadata updates without repeating filesystem work (`move-files.ts:74-91`, `move-files.ts:94-118`).
- A failed `removeSection` call can follow successful per-chat archive/delete operations; those effects are not rolled back (`section-remove.ts:199-238`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [API and commands](api.md)
