# Keepalive: do not let future-scheduled queued messages block it (project-folders 0.6.35)

- [x] Accepted in Lane Pilot run `lprun_94fe112109c04e95be6ed6b833f6330c` (2026-10-09).

## Root cause (verified live on the hub)
Thread thr_b3kgttu4vh was pinned, idle 75 min, config enabled, DB row `idleAt=1791509203164, wakes=0, lastPingAt=NULL`, and the sweep ran every 60 s. It was skipped every time because its queue held one message: a Lane Pilot reminder stored as a BB queued message with a future `sendAt` (due 75 min later). `cache-keepalive.ts` ~231–236 skips a thread when `queuedMessageCount > 0` or `queuedMessages.list` is non-empty, and logs nothing. Replaying the real module against the hub's thread list with an empty queue sent `[Cache keepalive 1/∞]` correctly, so timing and other filters are fine. Users schedule messages too (`sendAt`), so any future-scheduled message currently disables the keepalive for that thread.

## Fix in cache-keepalive.ts
1. Replace the queue check with: skip the thread only if some queued message will dispatch before the cache would expire on its own, i.e. it has no future `sendAt` (waiting now — it will run as soon as possible, a ping would only compete with it) or its `sendAt` is earlier than `idleAt + 60 min`. A queued message whose `sendAt` is at or after `idleAt + 60 min` does not block the ping. Read the queued-message shape from the SDK d.ts (`ThreadQueuedMessage`, `sendAt` / similar field) and use the SDK's real queue API: the audit noted `threads.queuedMessages` does not exist in the pinned SDK (the area is `threads.queue` / check the d.ts for the per-thread list call, e.g. `bb.sdk.threads.queuedMessages` vs `threads.queue.list({threadId})`); make sure the call actually used is one that exists, and keep `queuedMessageCount` only as a fast path (`0` → nothing queued; `> 0` → fetch the list and apply the rule above; if the list cannot be fetched, skip as today).
2. Log at debug level, once per thread per idle spell, why a pinned Claude thread was skipped (not idle, queued message due at X, interaction pending, outside window, maxWakes reached).
3. Implement `recordPingSent` (lastPingAt) in the SQLite-backed store in server.ts/cache-keepalive.ts — it is currently missing so `lastPingAt` stays NULL.

## Tests (cache-keepalive.test.ts)
- Queued message with sendAt after idleAt+60min → ping is sent.
- Queued message with sendAt before idleAt+60min → no ping.
- Queued message without sendAt / due now → no ping.
- queuedMessageCount 0 → no list call needed, ping sent.
- After a ping the SQLite store has lastPingAt set (if testable with the existing store helpers; otherwise unit-test the store function).
Bump package.json to 0.6.35 (patch) with a CHANGELOG entry.
