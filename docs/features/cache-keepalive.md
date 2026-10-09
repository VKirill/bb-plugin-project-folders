---
title: Prompt cache keepalive
type: component
created: 2026-10-09
updated: 2026-10-09
status: active
confidence: high
tags: [cache, keepalive, claude, settings]
sources:
  - cache-keepalive.ts
  - server.ts
  - plugin-settings.tsx
---
# Prompt cache keepalive

TL;DR: When enabled, the plugin sends a short turn to eligible pinned, idle Claude-family chats before one hour of inactivity so their prompt cache stays warm; the feature is off by default (`cache-keepalive.ts:10-14`, `cache-keepalive.ts:202-303`).

## Purpose

Cache keepalive is a plugin-wide setting for pinned Claude-family chats. Each ping reads the cached context and produces a short response; it does not select a new model or override the chat’s execution settings (`plugin-settings.tsx:99-120`, `cache-keepalive.ts:161-169`, `cache-keepalive.ts:273-282`).

## How it works

1. Server initialization loads `cache_keepalive` from the plugin `preferences` row, falls back to the default configuration, creates a SQLite-backed idle/wake store and starts the keepalive coordinator (`server.ts:753-767`).
2. The coordinator runs an initial sweep and then sweeps once per minute. It exits immediately when disabled; a thread-list error is logged and ends that sweep (`cache-keepalive.ts:202-213`, `cache-keepalive.ts:293-303`).
3. Each sweep selects only pinned, non-archived, non-deleted Claude-family threads whose status and runtime display status are idle and which have no queued messages or pending interactions (`cache-keepalive.ts:218-240`).
4. The first eligible sweep uses a stored idle timestamp or seeds it from `thread.updatedAt`; it sends only after the configured period and before the one-hour idle boundary. A positive `maxWakes` stops sends after that many wakes in one idle spell; zero has no count limit (`cache-keepalive.ts:243-267`).
5. Before sending, it increments the wake count and records the pending ping. The message asks for one line of at most seven words, and is sent as a plugin submission tagged `cache-keepalive` (`cache-keepalive.ts:161-169`, `cache-keepalive.ts:265-282`).
6. A resulting idle event preserves the wake count and resets the idle timestamp. A real idle event resets the count. Archive/delete events clear the thread’s keepalive row; plugin disposal clears the sweep interval (`cache-keepalive.ts:182-200`, `server.ts:768-771`).

| Configuration or thread state | Inputs and limits | Outcome |
|---|---|---|
| Disabled | `enabled=false`; default | No pings are sent (`cache-keepalive.ts:10-14`, `cache-keepalive.ts:202-205`). |
| Enabled | Period is an integer from 3 to 59 minutes; default 55 | Eligible threads are pinged within the window from `idleAt + period` up to, but not including, `idleAt + 60 minutes` (`cache-keepalive.ts:3-14`, `cache-keepalive.ts:255-257`). |
| Wake cap | Integer 0–100; `0` means unbounded | Stops after the cap within the idle spell; real activity and a new idle spell reset the count (`cache-keepalive.ts:3-7`, `cache-keepalive.ts:188-193`, `cache-keepalive.ts:262-264`). |
| Ineligible thread | Unpinned, archived, deleted, busy, queued, has pending interaction or non-Claude provider | Skipped (`cache-keepalive.ts:218-240`). |

## Business rules

- The provider ID matches the case-insensitive family pattern `claude|anthropic|opus|sonnet|haiku` (`cache-keepalive.ts:43-44`, `cache-keepalive.ts:157-159`).
- Pings only run while the feature is enabled, and the coordinator allows at most one outstanding ping per thread; the next interval can run after its idle event resets the timer (`cache-keepalive.ts:202-205`, `cache-keepalive.ts:182-194`, `cache-keepalive.ts:255-264`).
- The configuration editor persists changes through `cache_keepalive_save`; validated values are stored under the `cache_keepalive` preference key (`plugin-settings.tsx:84-97`, `server.ts:3529-3537`).

## Public API

| RPC | Purpose | Evidence |
|---|---|---|
| `cache_keepalive_get` | Read the current feature configuration | `server.ts:616-619`, `server.ts:3529-3531` |
| `cache_keepalive_save` | Validate and persist the feature configuration | `server.ts:620-623`, `server.ts:3532-3537` |

## Failures

- Thread-list failure ends the current sweep after a debug log (`cache-keepalive.ts:207-213`).
- A queued-message, interaction, or per-thread check failure skips that thread after a debug log; it does not stop the sweep (`cache-keepalive.ts:218-240`, `cache-keepalive.ts:286-289`).
- Send failure is logged and the sweep continues with the other threads (`cache-keepalive.ts:273-289`).
- The wake count increments before the send request; a rejected send does not decrement it (`cache-keepalive.ts:265-285`).
- Invalid configuration values fall back field-by-field to defaults (`cache-keepalive.ts:16-40`).

## Gotchas

- Enabling the feature can cause model usage: the setting description says each ping reads the cached context and generates a short answer (`plugin-settings.tsx:101-105`).
- A thread with no stored idle time and no positive `updatedAt` is skipped until a later idle event records an idle time (`cache-keepalive.ts:243-252`).

<!-- lane-pilot:backlinks -->
## Referenced by

- [API and commands](../api.md)
- [Architecture](../architecture.md)
- [Data model](../data-model.md)
- [Projects & Sections — Overview](../overview.md)
