---
title: Chat history export
type: component
created: 2026-09-27
updated: 2026-10-09
status: active
confidence: high
tags: [history, export, snapshots]
sources:
  - server.ts
  - export-queue.ts
  - archive.ts
  - thread-move.ts
  - README.md
---
# Chat history export

TL;DR: The plugin exports BB chat timelines as paginated JSON snapshots beneath the section’s `.bb/chats/<threadId>` directory; BB remains the canonical chat store (`server.ts:1870-1878`, `server.ts:1914-1929`).

## Purpose

Exports provide files for project workflows while BB retains canonical thread data (`server.ts:1914-1929`, `server.ts:1974-1984`).

## How it works

1. A manual `sync` or automatic lifecycle event enters the sync function; active moves and archives suppress export (`server.ts:1996-2027`).
2. The exporter resolves the chat’s section and environment, reads the first timeline page and can skip an unchanged automatic export when the digest and snapshot match (`server.ts:1819-1849`, `server.ts:1897-1913`).
3. It writes thread metadata, then walks older timeline pages with a limit of 20 segments and yields between pages (`server.ts:1914-1951`).
4. It writes the snapshot index only after all pages finish, removes the previous snapshot, writes a README and creates `artifacts/`, `notes/` and `tmp/` (`server.ts:1952-1984`).
5. Export status is stored by thread ID; deleted threads are removed, transient missing environments are not recorded, and other errors are stored for retry (`server.ts:1985-1989`, `server.ts:2011-2023`).
6. The persistent queue coalesces bursts, serializes exports, applies a cooldown and retries failures after at least 60 seconds (`export-queue.ts:13-45`).

## Modes

| Mode | Trigger | Behavior |
|---|---|---|
| Automatic | Thread creation/turn/archive lifecycle | Delay and cooldown queue; unchanged snapshots skipped |
| Manual | `sync` RPC or CLI | Full export traversal; does not use unchanged-head skip |
| Blocked | Thread move or archive in progress | Returns an empty path until operation settles |

Evidence: `server.ts:1897-1913`, `server.ts:1996-2010`, `server.ts:3590-3631`, `export-queue.ts:13-15`.

## Failures

| Failure | Result |
|---|---|
| Thread not found | Its export row is deleted (`server.ts:2011-2017`). |
| Environment is missing transiently | Export error is not persisted (`server.ts:2013-2023`). |
| Other export failure | Error row is written and queue retries after its minimum retry delay (`server.ts:2011-2025`, `export-queue.ts:32-45`). |
| Chat is moving or archived | Sync returns an empty path and waits for the operation to settle (`server.ts:1996-2010`, `server.ts:3593-3607`). |

## Business rules

- Each snapshot uses `history/<snapshot>/page-00000.json` and a newest-first index (`server.ts:1942-1963`).
- The new snapshot index is written after page traversal; an older snapshot is deleted only after the new index exists (`server.ts:1952-1973`).
- Automatic requests for the same thread coalesce; one export runs at a time (`export-queue.ts:16-45`).
- The exported timeline is a copy; export metadata and the generated README identify BB’s database as the canonical chat store (`server.ts:1914-1929`, `server.ts:1974-1976`).

## Public API

| RPC / command | Purpose | Evidence |
|---|---|---|
| `sync` | Manually export one thread’s history | `server.ts:577-580` |
| `bb project-folders sync <thread-id>` | CLI form of manual export | `server.ts:3846-3849`, `server.ts:4052-4056` |

## Gotchas

- The export traverses the full history, not an incremental archive; the automatic digest check only skips an unchanged snapshot (`server.ts:1897-1913`, `server.ts:1930-1951`).
- If an export fails during a move or archive, it is deferred until the operation releases its block (`server.ts:1996-2010`, `server.ts:3593-3607`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [API and commands](../api.md)
- [Data model](../data-model.md)
