# Pinned-thread prompt-cache keepalive (project-folders 0.6.31)

- [x] Accepted in Lane Pilot run `lprun_94fe112109c04e95be6ed6b833f6330c` (2026-10-09).

Idea taken from vzakharov/muthur `.claude/keepalive/`: an idle Claude Code session is woken about 5 minutes before its one-hour prompt cache expires, so the owner's next real prompt reads the cache instead of re-writing the whole conversation (about 40x the price of a cache read). muthur needs a background Bash task inside the session; in BB the plugin server can do it from outside, so no hook, no Python and nothing in the agent prompt.

## SDK facts (from node_modules/@get-bb/plugin-sdk/bundled-types/bb-plugin-sdk.d.ts)
- `bb.events.on("thread.idle", ({ thread, lastAssistantText }) => …)`; also `thread.archived`, `thread.deleted`, `thread.active`. Existing usage: server.ts around line 3649 (export queue).
- Thread DTO has `pinnedAt: number | null`. `bb.sdk.threads.list(args?)`, `bb.sdk.threads.get({ threadId })`, `bb.sdk.threads.queuedMessages.list(...)`.
- `bb.sdk.threads.send({ threadId, input: [{ type: "text", text, ... }], mode: "start" | "auto" | "queue-if-active" | ..., pluginSubmission?: { pluginId, data }, sendAt? })`. Check the exact input item shape in the d.ts (sendMessageRequestSchema near line 12120).
- Plugin SQLite: `bb.storage.database()` + `bb.storage.migrate(db, [...])` (server.ts ~line 744).

## Build
1. New module `cache-keepalive.ts`: a testable `createCacheKeepalive(deps)` with injected `now`, timers, sdk subset, settings getter, logger and a small store (backed by a new table in the plugin DB via a new migration appended at the end of the existing list — never edit existing migrations).
   - Record `idleAt` per thread on `thread.idle`. If the idle follows our own ping (we remember the thread we pinged and when), keep the wake counter; any other idle resets it to 0.
   - Sweep every 60 s and once at start: list threads; for each pinned, non-archived thread on a Claude-family provider/model (match provider id or model against /claude|anthropic|opus|sonnet|haiku/i; skip others — Codex/OpenAI caches are not one-hour), idle status, with no queued message and no pending interaction: when `now >= idleAt + period` and `now < idleAt + 60 min` and (maxWakes == 0 or wakes < maxWakes), send one ping. Never ping past the 60-minute mark (cache already cold). A thread idle before plugin start with no stored idleAt uses the DTO's last-activity timestamp if the DTO has one, else is skipped until its next idle.
   - The ping: `threads.send` with `mode: "start"`, no model/permission/reasoning override, `pluginSubmission: { pluginId: bb.pluginId, data: { kind: "cache-keepalive", wake } }`, English text: "[Cache keepalive {wake}/{max or ∞}] This turn only keeps the prompt cache of this pinned chat warm. Do no work and call no tools. Reply with one line of at most seven words in the conversation's language, e.g. «🕯 кеш продлён {wake}/{max or ∞}»." A send failure is logged at debug and does not throw; at most one ping per thread per idle spell window.
   - Archived/deleted threads drop their row; `bb.onDispose` clears the interval.
2. Settings: plugin-wide `cacheKeepalive: { enabled (default true), periodMinutes (default 55, int 3–59), maxWakes (default 0 = unlimited, int 0–100) }`, stored the way existing plugin-wide settings are stored in server.ts, read/saved over the plugin's existing rpc pattern. New section in `plugin-settings.tsx` (add to SETTINGS_SECTIONS) titled «Кеш закреплённых чатов», with the three controls and one explanatory line: works only for pinned Claude chats; each ping costs a cache read of the whole context plus a short answer; it saves the full re-write when you come back after an hour. Russian strings with English entries in translations.ts (the i18n test must stay green; other locales may fall back).
3. Version bump to 0.6.31 in package.json and a CHANGELOG entry (patch bump only).

## Tests (cache-keepalive.test.ts, fake clock)
Pinned idle Claude thread gets exactly one ping at idle+55 min; not before; none after idle+60; unpinned / archived / active / non-Claude / queued-message threads get none; counter resets on a real idle and keeps on the idle after a ping; maxWakes stops pings; enabled=false stops pings; periodMinutes respected; send rejection does not throw.
