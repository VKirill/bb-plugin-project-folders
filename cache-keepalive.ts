import { z } from "zod";

export const cacheKeepaliveSchema = z.object({
  enabled: z.boolean(),
  periodMinutes: z.number().int().min(3).max(59),
  maxWakes: z.number().int().min(0).max(100),
});
export type CacheKeepaliveConfig = z.infer<typeof cacheKeepaliveSchema>;

export const defaultCacheKeepaliveConfig: CacheKeepaliveConfig = {
  enabled: false,
  periodMinutes: 55,
  maxWakes: 0,
};

export function parseCacheKeepaliveConfig(value: unknown): CacheKeepaliveConfig {
  const result = cacheKeepaliveSchema.safeParse(value);
  if (result.success) return result.data;
  const out = { ...defaultCacheKeepaliveConfig };
  if (value && typeof value === "object") {
    const raw = value as Record<string, unknown>;
    if (typeof raw.enabled === "boolean") out.enabled = raw.enabled;
    if (
      typeof raw.periodMinutes === "number" &&
      Number.isInteger(raw.periodMinutes) &&
      raw.periodMinutes >= 3 &&
      raw.periodMinutes <= 59
    ) {
      out.periodMinutes = raw.periodMinutes;
    }
    if (
      typeof raw.maxWakes === "number" &&
      Number.isInteger(raw.maxWakes) &&
      raw.maxWakes >= 0 &&
      raw.maxWakes <= 100
    ) {
      out.maxWakes = raw.maxWakes;
    }
  }
  return out;
}

export const CLAUDE_FAMILY_PATTERN =
  /claude|anthropic|opus|sonnet|haiku/i;

export interface KeepaliveThread {
  id: string;
  providerId: string;
  pinnedAt: number | null;
  archivedAt: number | null;
  deletedAt?: number | null;
  status: string;
  updatedAt: number;
  queuedMessageCount?: number;
  runtime?: {
    displayStatus?: string;
  };
}

export interface KeepaliveSdkSubset {
  threads: {
    list: (args?: { signal?: AbortSignal }) => Promise<KeepaliveThread[]>;
    get?: (args: { threadId: string }) => Promise<KeepaliveThread>;
    send: (args: any) => Promise<unknown>;
    queuedMessages?: {
      list: (args: { threadId: string }) => Promise<unknown[]>;
    };
    interactions?: {
      list?: (args: { threadId: string }) => Promise<unknown[]>;
    };
  };
}

export interface KeepaliveStore {
  getIdleAt: (threadId: string) => number | null;
  setIdleAt: (threadId: string, idleAt: number) => void;
  getWakeCount: (threadId: string) => number;
  setWakeCount: (threadId: string, wakes: number) => void;
  deleteThread: (threadId: string) => void;
  recordPingSent?: (threadId: string, at: number) => void;
}

export function createSqliteKeepaliveStore(db: {
  prepare: (sql: string) => {
    run: (...args: any[]) => any;
    get: (...args: any[]) => any;
  };
}): KeepaliveStore {
  return {
    getIdleAt(threadId: string): number | null {
      const row = db
        .prepare("SELECT idleAt FROM thread_keepalive WHERE threadId=?")
        .get(threadId) as { idleAt: number } | undefined;
      return row ? row.idleAt : null;
    },
    setIdleAt(threadId: string, idleAt: number): void {
      db.prepare(
        "INSERT INTO thread_keepalive (threadId, idleAt, wakes, updatedAt) VALUES (?, ?, 0, ?) ON CONFLICT(threadId) DO UPDATE SET idleAt=excluded.idleAt, updatedAt=excluded.updatedAt",
      ).run(threadId, idleAt, Date.now());
    },
    getWakeCount(threadId: string): number {
      const row = db
        .prepare("SELECT wakes FROM thread_keepalive WHERE threadId=?")
        .get(threadId) as { wakes: number } | undefined;
      return row ? row.wakes : 0;
    },
    setWakeCount(threadId: string, wakes: number): void {
      db.prepare(
        "INSERT INTO thread_keepalive (threadId, idleAt, wakes, updatedAt) VALUES (?, 0, ?, ?) ON CONFLICT(threadId) DO UPDATE SET wakes=excluded.wakes, updatedAt=excluded.updatedAt",
      ).run(threadId, wakes, Date.now());
    },
    deleteThread(threadId: string): void {
      db.prepare("DELETE FROM thread_keepalive WHERE threadId=?").run(threadId);
    },
  };
}

export function createInMemoryKeepaliveStore(): KeepaliveStore {
  const records = new Map<string, { idleAt: number | null; wakes: number }>();
  return {
    getIdleAt(threadId: string) {
      return records.get(threadId)?.idleAt ?? null;
    },
    setIdleAt(threadId: string, idleAt: number) {
      const r = records.get(threadId) ?? { idleAt: null, wakes: 0 };
      r.idleAt = idleAt;
      records.set(threadId, r);
    },
    getWakeCount(threadId: string) {
      return records.get(threadId)?.wakes ?? 0;
    },
    setWakeCount(threadId: string, wakes: number) {
      const r = records.get(threadId) ?? { idleAt: null, wakes: 0 };
      r.wakes = wakes;
      records.set(threadId, r);
    },
    deleteThread(threadId: string) {
      records.delete(threadId);
    },
  };
}

export interface CacheKeepaliveDeps {
  pluginId: string;
  sdk: KeepaliveSdkSubset;
  store: KeepaliveStore;
  getConfig: () => CacheKeepaliveConfig;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => any;
  clearInterval?: (handle: any) => void;
  log?: {
    debug?: (msg: string) => void;
    warn?: (msg: string) => void;
  };
}

export function isClaudeFamily(thread: KeepaliveThread): boolean {
  return CLAUDE_FAMILY_PATTERN.test(thread.providerId || "");
}

export function formatKeepaliveMessage(wake: number, maxWakes: number): string {
  const maxLabel = maxWakes > 0 ? String(maxWakes) : "∞";
  return (
    `[Cache keepalive ${wake}/${maxLabel}] ` +
    `This turn only keeps the prompt cache of this pinned chat warm. ` +
    `Do no work and call no tools. ` +
    `Reply with one line of at most seven words in the conversation's language, e.g. ` +
    `«🕯 cache kept warm ${wake}/${maxLabel}».`
  );
}

export function createCacheKeepalive(deps: CacheKeepaliveDeps) {
  const now = deps.now ?? (() => Date.now());
  const setIntervalFn = deps.setInterval ?? setInterval;
  const clearIntervalFn = deps.clearInterval ?? clearInterval;
  const log = deps.log;

  // In-memory set or map of threads where keepalive ping was sent
  // to differentiate idle from keepalive vs idle from human
  const pingPending = new Map<string, number>();

  function onThreadIdle(thread: KeepaliveThread) {
    const currentNow = now();
    const wasPending = pingPending.has(thread.id);

    if (wasPending) {
      pingPending.delete(thread.id);
      // Keep wake counter, update idleAt
      deps.store.setIdleAt(thread.id, currentNow);
    } else {
      // Real (non-keepalive) idle: reset wake counter to 0
      deps.store.setWakeCount(thread.id, 0);
      deps.store.setIdleAt(thread.id, currentNow);
    }
  }

  function onThreadRemoved(threadId: string) {
    pingPending.delete(threadId);
    deps.store.deleteThread(threadId);
  }

  async function sweep() {
    const config = deps.getConfig();
    if (!config.enabled) return;

    const currentNow = now();
    let threadList: KeepaliveThread[] = [];
    try {
      threadList = await deps.sdk.threads.list();
    } catch (e) {
      log?.debug?.(`Cache keepalive: failed to list threads: ${String(e)}`);
      return;
    }

    const periodMs = config.periodMinutes * 60 * 1000;
    const oneHourMs = 60 * 60 * 1000;

    for (const thread of threadList) {
      try {
        // Must be pinned
        if (thread.pinnedAt == null) continue;
        // Non-archived
        if (thread.archivedAt != null) continue;
        // Non-deleted
        if (thread.deletedAt != null) continue;
        // Idle status
        if (thread.status !== "idle") continue;
        if (thread.runtime?.displayStatus && thread.runtime.displayStatus !== "idle") continue;
        // Claude-family
        if (!isClaudeFamily(thread)) continue;
        // No queued messages
        if (thread.queuedMessageCount != null && thread.queuedMessageCount > 0) continue;
        if (deps.sdk.threads.queuedMessages) {
          const queued = await deps.sdk.threads.queuedMessages.list({ threadId: thread.id });
          if (queued && queued.length > 0) continue;
        }
        // No pending interactions
        if (deps.sdk.threads.interactions?.list) {
          const interactions = await deps.sdk.threads.interactions.list({ threadId: thread.id });
          if (interactions && interactions.length > 0) continue;
        }

        // Determine idleAt
        let idleAt = deps.store.getIdleAt(thread.id);
        if (idleAt == null) {
          if (thread.updatedAt != null && thread.updatedAt > 0) {
            idleAt = thread.updatedAt;
            deps.store.setIdleAt(thread.id, idleAt);
          } else {
            // skipped until next idle
            continue;
          }
        }

        // Timing window: now >= idleAt + period and now < idleAt + 60 min
        if (currentNow < idleAt + periodMs) continue;
        if (currentNow >= idleAt + oneHourMs) continue;

        // Ensure we haven't already pinged for this idle spell
        if (pingPending.has(thread.id)) continue;

        const wakes = deps.store.getWakeCount(thread.id);
        if (config.maxWakes > 0 && wakes >= config.maxWakes) continue;

        // Ready to ping!
        const nextWake = wakes + 1;
        const pingText = formatKeepaliveMessage(nextWake, config.maxWakes);

        pingPending.set(thread.id, currentNow);
        deps.store.setWakeCount(thread.id, nextWake);
        deps.store.recordPingSent?.(thread.id, currentNow);

        try {
          await deps.sdk.threads.send({
            threadId: thread.id,
            input: [{ type: "text", text: pingText }],
            mode: "start",
            pluginSubmission: {
              pluginId: deps.pluginId,
              data: { kind: "cache-keepalive", wake: nextWake },
            },
          });
        } catch (sendErr) {
          log?.debug?.(`Cache keepalive: send to ${thread.id} failed: ${String(sendErr)}`);
        }
      } catch (err) {
        // Individual thread sweep error never throws out
        log?.debug?.(`Cache keepalive: error checking thread ${thread.id}: ${String(err)}`);
      }
    }
  }

  // Initial sweep
  const initialPromise = sweep().catch((e) => {
    log?.debug?.(`Cache keepalive: initial sweep failed: ${String(e)}`);
  });

  // 60-second periodic sweep
  const interval = setIntervalFn(() => {
    sweep().catch((e) => {
      log?.debug?.(`Cache keepalive: periodic sweep failed: ${String(e)}`);
    });
  }, 60 * 1000);

  function dispose() {
    clearIntervalFn(interval);
  }

  return {
    sweep,
    onThreadIdle,
    onThreadRemoved,
    dispose,
    initialPromise,
  };
}
