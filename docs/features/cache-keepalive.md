---
title: Prompt cache keepalive
type: component
created: 2026-10-09
updated: 2026-10-19
status: active
confidence: medium
tags: [cache, keepalive, claude, settings]
sources:
  - cache-keepalive.ts
  - server.ts
  - plugin-settings.tsx
---
# Prompt cache keepalive

TL;DR: When enabled, the plugin sends a short turn to eligible pinned, idle Claude-family chats before one hour of inactivity so their prompt cache stays warm; queued messages due before cache expiry block the ping, while later scheduled messages do not (`cache-keepalive.ts:10-14`, `cache-keepalive.ts:315-329`).

## Purpose

Cache keepalive is a plugin-wide setting for pinned Claude-family chats. Each ping reads the cached context and produces a short response; it does not select a new model or override the chat’s execution settings (`plugin-settings.tsx:99-120`, `cache-keepalive.ts:161-169`, `cache-keepalive.ts:273-282`).

## How it works

1. Server initialization loads `cache_keepalive` from the plugin `preferences` row, falls back to the default configuration, creates a SQLite-backed idle/wake store and starts the keepalive coordinator (`server.ts:777-792`).
2. The coordinator runs an initial sweep and then sweeps once per minute. It exits immediately when disabled; a thread-list error is logged and ends that sweep (`cache-keepalive.ts:231-242`, `cache-keepalive.ts:393-403`).
3. Each sweep selects only pinned, non-archived, non-deleted Claude-family threads whose status and runtime display status are idle. It skips due-now queued messages and messages scheduled before `idleAt + 60 minutes`; a message scheduled at or after that boundary does not block the ping. If queue inspection fails or is unavailable while the thread reports queued messages, the thread is skipped. Pending interactions also skip it (`cache-keepalive.ts:247-279`, `cache-keepalive.ts:281-341`).
4. The first eligible sweep uses a stored idle timestamp or seeds it from `thread.updatedAt`; it sends only after the configured period and before the one-hour idle boundary. A positive `maxWakes` stops sends after that many wakes in one idle spell; zero has no count limit (`cache-keepalive.ts:258-270`, `cache-keepalive.ts:343-363`).
5. Before sending, it increments the wake count, records the pending ping and writes `lastPingAt` with the current timestamp. The message asks for one line of at most seven words, and is sent as a plugin submission tagged `cache-keepalive` (`cache-keepalive.ts:365-382`, `cache-keepalive.ts:125-135`).
6. A resulting idle event preserves the wake count and resets the idle timestamp. A real idle event resets the count. Archive/delete events clear the thread’s keepalive row; plugin disposal clears the sweep interval (`cache-keepalive.ts:211-229`, `server.ts:792-795`).

| Configuration or thread state | Inputs and limits | Outcome |
|---|---|---|
| Disabled | `enabled=false`; default | No pings are sent (`cache-keepalive.ts:10-14`, `cache-keepalive.ts:202-205`). |
| Enabled | Period is an integer from 3 to 59 minutes; default 55 | Eligible threads are pinged within the window from `idleAt + period` up to, but not including, `idleAt + 60 minutes` (`cache-keepalive.ts:3-14`, `cache-keepalive.ts:255-257`). |
| Wake cap | Integer 0–100; `0` means unbounded | Stops after the cap within the idle spell; real activity and a new idle spell reset the count (`cache-keepalive.ts:3-7`, `cache-keepalive.ts:188-193`, `cache-keepalive.ts:262-264`). |
| Queued messages | No send time or `sendAt < idleAt + 60 minutes` blocks; `sendAt >= idleAt + 60 minutes` does not | Skip if a blocking message exists; if queue inspection fails or queued count is positive but no list API exists, skip (`cache-keepalive.ts:281-331`). |
| Ineligible thread | Unpinned, archived, deleted, busy, has a pending interaction or non-Claude provider | Skipped (`cache-keepalive.ts:247-279`, `cache-keepalive.ts:334-341`). |

## Business rules

- The provider ID matches the case-insensitive family pattern `claude|anthropic|opus|sonnet|haiku` (`cache-keepalive.ts:43-44`, `cache-keepalive.ts:186-188`).
- Pings only run while the feature is enabled, and the coordinator allows at most one outstanding ping per thread (`cache-keepalive.ts:231-234`, `cache-keepalive.ts:353-363`).
- The coordinator records `lastPingAt` before calling `threads.send`; a rejected send is logged without clearing the incremented wake count or the timestamp (`cache-keepalive.ts:365-385`, `cache-keepalive.ts:125-135`).
- The configuration editor persists changes through `cache_keepalive_save`; validated values are stored under the `cache_keepalive` preference key (`plugin-settings.tsx:84-97`, `server.ts:3559-3567`).

## Public API

| RPC | Purpose | Evidence |
|---|---|---|
| `cache_keepalive_get` | Read the current feature configuration | `server.ts:628-631`, `server.ts:3559-3561` |
| `cache_keepalive_save` | Validate and persist the feature configuration | `server.ts:632-635`, `server.ts:3562-3567` |

## Failures

- Thread-list failure ends the current sweep after a debug log (`cache-keepalive.ts:237-242`).
- Queue-list failure or an uninspectable positive queued count skips that thread; the skip reason is logged at debug level (`cache-keepalive.ts:287-330`).
- Interaction or per-thread check failure is caught for that thread and does not stop the sweep (`cache-keepalive.ts:334-341`, `cache-keepalive.ts:386-389`).
- Send failure is logged and the sweep continues with the other threads (`cache-keepalive.ts:373-389`).
- The wake count, pending marker and `lastPingAt` are written before the send request; a rejected send does not decrement the count or clear the timestamp. The pending marker remains until a `thread.idle` or thread removal event clears it, so another ping is not sent for that idle spell (`cache-keepalive.ts:211-229`, `cache-keepalive.ts:353-385`).
- Invalid configuration values fall back field-by-field to defaults (`cache-keepalive.ts:16-40`).

## Gotchas

- Enabling the feature can cause model usage: the setting description says each ping reads the cached context and generates a short answer (`plugin-settings.tsx:101-105`).
- A thread with no stored idle time and no positive `updatedAt` is skipped until a later idle event records an idle time (`cache-keepalive.ts:258-267`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [API and commands](../api.md)
- [Architecture](../architecture.md)
- [Data model](../data-model.md)
- [Projects & Sections — Overview](../overview.md)
