import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createCacheKeepalive,
  createInMemoryKeepaliveStore,
  createSqliteKeepaliveStore,
  defaultCacheKeepaliveConfig,
  formatKeepaliveMessage,
  isClaudeFamily,
  parseCacheKeepaliveConfig,
  type KeepaliveSdkSubset,
  type KeepaliveThread,
} from "./cache-keepalive";

describe("cache-keepalive configuration", () => {
  it("defaults to enabled=false, periodMinutes=55, maxWakes=0", () => {
    expect(defaultCacheKeepaliveConfig).toEqual({
      enabled: false,
      periodMinutes: 55,
      maxWakes: 0,
    });
  });

  it("parses valid and invalid config values", () => {
    expect(parseCacheKeepaliveConfig(null)).toEqual(defaultCacheKeepaliveConfig);
    expect(parseCacheKeepaliveConfig({ enabled: true, periodMinutes: 30, maxWakes: 5 })).toEqual({
      enabled: true,
      periodMinutes: 30,
      maxWakes: 5,
    });
    // Out of range clamps or fallbacks
    expect(parseCacheKeepaliveConfig({ periodMinutes: 2, maxWakes: -1 })).toEqual(
      defaultCacheKeepaliveConfig,
    );
    expect(parseCacheKeepaliveConfig({ periodMinutes: 60, maxWakes: 101 })).toEqual(
      defaultCacheKeepaliveConfig,
    );
  });
});

describe("isClaudeFamily", () => {
  it("recognizes claude / anthropic / opus / sonnet / haiku providers and models", () => {
    expect(isClaudeFamily({ id: "1", providerId: "anthropic", pinnedAt: null, archivedAt: null, status: "idle", updatedAt: 0 })).toBe(true);
    expect(isClaudeFamily({ id: "2", providerId: "claude-code", pinnedAt: null, archivedAt: null, status: "idle", updatedAt: 0 })).toBe(true);
    expect(isClaudeFamily({ id: "3", providerId: "custom-sonnet-4", pinnedAt: null, archivedAt: null, status: "idle", updatedAt: 0 })).toBe(true);
    expect(isClaudeFamily({ id: "4", providerId: "openai", pinnedAt: null, archivedAt: null, status: "idle", updatedAt: 0 })).toBe(false);
    expect(isClaudeFamily({ id: "5", providerId: "codex", pinnedAt: null, archivedAt: null, status: "idle", updatedAt: 0 })).toBe(false);
  });
});

describe("formatKeepaliveMessage", () => {
  it("formats the text asking for one line of at most seven words with wake counter", () => {
    const msg = formatKeepaliveMessage(1, 0);
    expect(msg).toContain("[Cache keepalive 1/∞]");
    expect(msg).toContain("Do no work and call no tools");
    expect(msg).toContain("at most seven words");
    expect(msg).toContain("«🕯 cache kept warm 1/∞»");

    const msgWithMax = formatKeepaliveMessage(2, 5);
    expect(msgWithMax).toContain("[Cache keepalive 2/5]");
    expect(msgWithMax).toContain("«🕯 cache kept warm 2/5»");
  });
});

describe("createCacheKeepalive with fake clock", () => {
  let fakeNow = 1000000;
  let timerCallbacks: Array<() => void> = [];

  function createMockSdk(threads: KeepaliveThread[]) {
    const sentMessages: Array<{
      threadId: string;
      input: Array<{ type: "text"; text: string }>;
      mode: string;
      pluginSubmission?: any;
    }> = [];

    const sdk: KeepaliveSdkSubset = {
      threads: {
        list: vi.fn(async () => threads),
        send: vi.fn(async (args) => {
          sentMessages.push(args);
          return { ok: true };
        }),
        queuedMessages: {
          list: vi.fn(async () => []),
        },
        interactions: {
          list: vi.fn(async () => []),
        },
      },
    };

    return { sdk, sentMessages };
  }

  beforeEach(() => {
    fakeNow = 1000000;
    timerCallbacks = [];
  });

  it("pings a pinned idle Claude thread at idleAt + periodMinutes (default 55) and none before it", async () => {
    const thread: KeepaliveThread = {
      id: "t1",
      providerId: "anthropic",
      pinnedAt: fakeNow,
      archivedAt: null,
      status: "idle",
      updatedAt: fakeNow,
    };
    const { sdk, sentMessages } = createMockSdk([thread]);
    const store = createInMemoryKeepaliveStore();
    store.setIdleAt("t1", fakeNow);

    const keepalive = createCacheKeepalive({
      pluginId: "project-folders",
      sdk,
      store,
      getConfig: () => ({ enabled: true, periodMinutes: 55, maxWakes: 0 }),
      now: () => fakeNow,
      setInterval: (fn) => {
        timerCallbacks.push(fn);
        return 123;
      },
      clearInterval: vi.fn(),
    });

    // Right now: exactly idleAt (fakeNow) -> no ping
    await keepalive.sweep();
    expect(sentMessages).toHaveLength(0);

    // Advance to idleAt + 54 min (fakeNow + 54 * 60 * 1000) -> no ping
    fakeNow += 54 * 60 * 1000;
    await keepalive.sweep();
    expect(sentMessages).toHaveLength(0);

    // Advance to idleAt + 55 min -> exactly 1 ping sent
    fakeNow += 1 * 60 * 1000;
    await keepalive.sweep();
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].threadId).toBe("t1");
    expect(sentMessages[0].pluginSubmission).toEqual({
      pluginId: "project-folders",
      data: { kind: "cache-keepalive", wake: 1 },
    });

    // Sweep again without idle update: should not duplicate ping in same window
    await keepalive.sweep();
    expect(sentMessages).toHaveLength(1);

    keepalive.dispose();
  });

  it("does not ping at or after idleAt + 60 minutes", async () => {
    const thread: KeepaliveThread = {
      id: "t-cold",
      providerId: "anthropic",
      pinnedAt: fakeNow,
      archivedAt: null,
      status: "idle",
      updatedAt: fakeNow,
    };
    const { sdk, sentMessages } = createMockSdk([thread]);
    const store = createInMemoryKeepaliveStore();
    store.setIdleAt("t-cold", fakeNow);

    const keepalive = createCacheKeepalive({
      pluginId: "project-folders",
      sdk,
      store,
      getConfig: () => ({ enabled: true, periodMinutes: 55, maxWakes: 0 }),
      now: () => fakeNow,
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
    });

    // Advance directly to idleAt + 60 min (prompt cache already expired cold)
    fakeNow += 60 * 60 * 1000;
    await keepalive.sweep();
    expect(sentMessages).toHaveLength(0);

    // Advance to idleAt + 70 min
    fakeNow += 10 * 60 * 1000;
    await keepalive.sweep();
    expect(sentMessages).toHaveLength(0);

    keepalive.dispose();
  });

  it("never pings unpinned, archived, active, errored, non-Claude, or queued-message threads", async () => {
    const threads: KeepaliveThread[] = [
      { id: "unpinned", providerId: "anthropic", pinnedAt: null, archivedAt: null, status: "idle", updatedAt: fakeNow },
      { id: "archived", providerId: "anthropic", pinnedAt: fakeNow, archivedAt: fakeNow, status: "idle", updatedAt: fakeNow },
      { id: "active", providerId: "anthropic", pinnedAt: fakeNow, archivedAt: null, status: "active", updatedAt: fakeNow },
      { id: "errored", providerId: "anthropic", pinnedAt: fakeNow, archivedAt: null, status: "error", updatedAt: fakeNow },
      { id: "non-claude", providerId: "openai", pinnedAt: fakeNow, archivedAt: null, status: "idle", updatedAt: fakeNow },
      { id: "with-queued", providerId: "anthropic", pinnedAt: fakeNow, archivedAt: null, status: "idle", updatedAt: fakeNow, queuedMessageCount: 1 },
    ];
    const { sdk, sentMessages } = createMockSdk(threads);
    const store = createInMemoryKeepaliveStore();
    for (const t of threads) store.setIdleAt(t.id, fakeNow);

    const keepalive = createCacheKeepalive({
      pluginId: "project-folders",
      sdk,
      store,
      getConfig: () => ({ enabled: true, periodMinutes: 55, maxWakes: 0 }),
      now: () => fakeNow + 55 * 60 * 1000,
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
    });

    fakeNow += 55 * 60 * 1000;
    await keepalive.sweep();
    expect(sentMessages).toHaveLength(0);

    keepalive.dispose();
  });

  it("picks up pinning an already idle thread on the next sweep without a new event", async () => {
    const thread: KeepaliveThread = {
      id: "t-unpinned-then-pinned",
      providerId: "anthropic",
      pinnedAt: null,
      archivedAt: null,
      status: "idle",
      updatedAt: fakeNow,
    };
    const { sdk, sentMessages } = createMockSdk([thread]);
    const store = createInMemoryKeepaliveStore();
    store.setIdleAt("t-unpinned-then-pinned", fakeNow);

    const keepalive = createCacheKeepalive({
      pluginId: "project-folders",
      sdk,
      store,
      getConfig: () => ({ enabled: true, periodMinutes: 55, maxWakes: 0 }),
      now: () => fakeNow,
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
    });

    fakeNow += 55 * 60 * 1000;
    // Unpinned: sweep ignores it
    await keepalive.sweep();
    expect(sentMessages).toHaveLength(0);

    // Pin the thread without firing any event
    thread.pinnedAt = fakeNow;

    // Next sweep picks it up
    await keepalive.sweep();
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].threadId).toBe("t-unpinned-then-pinned");

    keepalive.dispose();
  });

  it("resets wake counter after real idle, preserves wake counter after keepalive idle, and respects maxWakes", async () => {
    const thread: KeepaliveThread = {
      id: "t-wake",
      providerId: "anthropic",
      pinnedAt: fakeNow,
      archivedAt: null,
      status: "idle",
      updatedAt: fakeNow,
    };
    const { sdk, sentMessages } = createMockSdk([thread]);
    const store = createInMemoryKeepaliveStore();
    store.setIdleAt("t-wake", fakeNow);

    const keepalive = createCacheKeepalive({
      pluginId: "project-folders",
      sdk,
      store,
      getConfig: () => ({ enabled: true, periodMinutes: 55, maxWakes: 2 }),
      now: () => fakeNow,
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
    });

    // 1st wake: idleAt + 55 min
    fakeNow += 55 * 60 * 1000;
    await keepalive.sweep();
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].pluginSubmission.data.wake).toBe(1);
    expect(store.getWakeCount("t-wake")).toBe(1);

    // Keepalive response causes thread.idle
    keepalive.onThreadIdle(thread);
    // Counter should still be 1!
    expect(store.getWakeCount("t-wake")).toBe(1);

    // 2nd wake: advance another 55 minutes
    fakeNow += 55 * 60 * 1000;
    await keepalive.sweep();
    expect(sentMessages).toHaveLength(2);
    expect(sentMessages[1].pluginSubmission.data.wake).toBe(2);
    expect(store.getWakeCount("t-wake")).toBe(2);

    // Keepalive response causes thread.idle
    keepalive.onThreadIdle(thread);
    expect(store.getWakeCount("t-wake")).toBe(2);

    // 3rd wake: advance another 55 minutes -> maxWakes=2 reached, so no ping!
    fakeNow += 55 * 60 * 1000;
    await keepalive.sweep();
    expect(sentMessages).toHaveLength(2);

    // Now a human interacts and thread goes idle (real idle, not following keepalive ping)
    keepalive.onThreadIdle(thread);
    expect(store.getWakeCount("t-wake")).toBe(0);

    // Can ping again after human idle!
    fakeNow += 55 * 60 * 1000;
    await keepalive.sweep();
    expect(sentMessages).toHaveLength(3);
    expect(sentMessages[2].pluginSubmission.data.wake).toBe(1);

    keepalive.dispose();
  });

  it("enabled=false stops all pings", async () => {
    const thread: KeepaliveThread = {
      id: "t-disabled",
      providerId: "anthropic",
      pinnedAt: fakeNow,
      archivedAt: null,
      status: "idle",
      updatedAt: fakeNow,
    };
    const { sdk, sentMessages } = createMockSdk([thread]);
    const store = createInMemoryKeepaliveStore();
    store.setIdleAt("t-disabled", fakeNow);

    const keepalive = createCacheKeepalive({
      pluginId: "project-folders",
      sdk,
      store,
      getConfig: () => ({ enabled: false, periodMinutes: 55, maxWakes: 0 }),
      now: () => fakeNow + 55 * 60 * 1000,
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
    });

    fakeNow += 55 * 60 * 1000;
    await keepalive.sweep();
    expect(sentMessages).toHaveLength(0);

    keepalive.dispose();
  });

  it("default config sends no ping", async () => {
    const thread: KeepaliveThread = {
      id: "t-default-optin",
      providerId: "anthropic",
      pinnedAt: fakeNow,
      archivedAt: null,
      status: "idle",
      updatedAt: fakeNow,
    };
    const { sdk, sentMessages } = createMockSdk([thread]);
    const store = createInMemoryKeepaliveStore();
    store.setIdleAt("t-default-optin", fakeNow);

    const keepalive = createCacheKeepalive({
      pluginId: "project-folders",
      sdk,
      store,
      getConfig: () => defaultCacheKeepaliveConfig,
      now: () => fakeNow + 55 * 60 * 1000,
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
    });

    fakeNow += 55 * 60 * 1000;
    await keepalive.sweep();
    expect(sentMessages).toHaveLength(0);

    keepalive.dispose();
  });

  it("a failed send never throws out of the sweep", async () => {
    const thread: KeepaliveThread = {
      id: "t-fail",
      providerId: "anthropic",
      pinnedAt: fakeNow,
      archivedAt: null,
      status: "idle",
      updatedAt: fakeNow,
    };
    const { sdk } = createMockSdk([thread]);
    sdk.threads.send = vi.fn(async () => {
      throw new Error("Network / SDK failure");
    });

    const store = createInMemoryKeepaliveStore();
    store.setIdleAt("t-fail", fakeNow);

    const keepalive = createCacheKeepalive({
      pluginId: "project-folders",
      sdk,
      store,
      getConfig: () => ({ enabled: true, periodMinutes: 55, maxWakes: 0 }),
      now: () => fakeNow + 55 * 60 * 1000,
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
    });

    fakeNow += 55 * 60 * 1000;
    await expect(keepalive.sweep()).resolves.not.toThrow();

    keepalive.dispose();
  });

  it("clears the sweep interval on dispose", () => {
    const { sdk } = createMockSdk([]);
    const clearIntervalMock = vi.fn();

    const keepalive = createCacheKeepalive({
      pluginId: "project-folders",
      sdk,
      store: createInMemoryKeepaliveStore(),
      getConfig: () => defaultCacheKeepaliveConfig,
      setInterval: () => 999 as any,
      clearInterval: clearIntervalMock,
    });

    keepalive.dispose();
    expect(clearIntervalMock).toHaveBeenCalledWith(999);
  });

  describe("queued messages sendAt filtering and logging", () => {
    it("pings when a queued message has sendAt at or after idleAt + 60 min", async () => {
      const thread: KeepaliveThread = {
        id: "t-far-future",
        providerId: "anthropic",
        pinnedAt: fakeNow,
        archivedAt: null,
        status: "idle",
        updatedAt: fakeNow,
        queuedMessageCount: 1,
      };
      const { sdk, sentMessages } = createMockSdk([thread]);
      const store = createInMemoryKeepaliveStore();
      store.setIdleAt("t-far-future", fakeNow);

      const idleAt = fakeNow;
      const expiry = idleAt + 60 * 60 * 1000;
      // Scheduled for 75 min after idleAt (past the 60m expiry)
      sdk.threads.queuedMessages!.list = vi.fn(async () => [
        { id: "qm-1", sendAt: expiry + 15 * 60 * 1000 },
      ]);

      const debugLogs: string[] = [];
      const keepalive = createCacheKeepalive({
        pluginId: "project-folders",
        sdk,
        store,
        getConfig: () => ({ enabled: true, periodMinutes: 55, maxWakes: 0 }),
        now: () => fakeNow,
        setInterval: vi.fn(),
        clearInterval: vi.fn(),
        log: { debug: (msg) => debugLogs.push(msg) },
      });

      fakeNow += 55 * 60 * 1000;
      await keepalive.sweep();

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].threadId).toBe("t-far-future");
      keepalive.dispose();
    });

    it("does not ping when a queued message has sendAt earlier than idleAt + 60 min", async () => {
      const thread: KeepaliveThread = {
        id: "t-near-future",
        providerId: "anthropic",
        pinnedAt: fakeNow,
        archivedAt: null,
        status: "idle",
        updatedAt: fakeNow,
        queuedMessageCount: 1,
      };
      const { sdk, sentMessages } = createMockSdk([thread]);
      const store = createInMemoryKeepaliveStore();
      store.setIdleAt("t-near-future", fakeNow);

      const idleAt = fakeNow;
      // Scheduled 58 min after idleAt (before 60m cache expiry)
      sdk.threads.queuedMessages!.list = vi.fn(async () => [
        { id: "qm-2", sendAt: idleAt + 58 * 60 * 1000 },
      ]);

      const debugLogs: string[] = [];
      const keepalive = createCacheKeepalive({
        pluginId: "project-folders",
        sdk,
        store,
        getConfig: () => ({ enabled: true, periodMinutes: 55, maxWakes: 0 }),
        now: () => fakeNow,
        setInterval: vi.fn(),
        clearInterval: vi.fn(),
        log: { debug: (msg) => debugLogs.push(msg) },
      });

      fakeNow += 55 * 60 * 1000;
      await keepalive.sweep();

      expect(sentMessages).toHaveLength(0);
      expect(debugLogs.some((l) => l.includes("queued message due before cache expiry"))).toBe(true);
      keepalive.dispose();
    });

    it("does not ping when a queued message has no sendAt (due now)", async () => {
      const thread: KeepaliveThread = {
        id: "t-due-now",
        providerId: "anthropic",
        pinnedAt: fakeNow,
        archivedAt: null,
        status: "idle",
        updatedAt: fakeNow,
        queuedMessageCount: 1,
      };
      const { sdk, sentMessages } = createMockSdk([thread]);
      const store = createInMemoryKeepaliveStore();
      store.setIdleAt("t-due-now", fakeNow);

      // sendAt is null or undefined (waiting now)
      sdk.threads.queuedMessages!.list = vi.fn(async () => [
        { id: "qm-3", sendAt: null },
      ]);

      const debugLogs: string[] = [];
      const keepalive = createCacheKeepalive({
        pluginId: "project-folders",
        sdk,
        store,
        getConfig: () => ({ enabled: true, periodMinutes: 55, maxWakes: 0 }),
        now: () => fakeNow,
        setInterval: vi.fn(),
        clearInterval: vi.fn(),
        log: { debug: (msg) => debugLogs.push(msg) },
      });

      fakeNow += 55 * 60 * 1000;
      await keepalive.sweep();

      expect(sentMessages).toHaveLength(0);
      expect(debugLogs.some((l) => l.includes("queued message due before cache expiry"))).toBe(true);
      keepalive.dispose();
    });

    it("does not call queue list if queuedMessageCount is 0", async () => {
      const thread: KeepaliveThread = {
        id: "t-empty-queue",
        providerId: "anthropic",
        pinnedAt: fakeNow,
        archivedAt: null,
        status: "idle",
        updatedAt: fakeNow,
        queuedMessageCount: 0,
      };
      const { sdk, sentMessages } = createMockSdk([thread]);
      const store = createInMemoryKeepaliveStore();
      store.setIdleAt("t-empty-queue", fakeNow);

      const listSpy = vi.fn(async () => []);
      sdk.threads.queuedMessages!.list = listSpy;

      const keepalive = createCacheKeepalive({
        pluginId: "project-folders",
        sdk,
        store,
        getConfig: () => ({ enabled: true, periodMinutes: 55, maxWakes: 0 }),
        now: () => fakeNow,
        setInterval: vi.fn(),
        clearInterval: vi.fn(),
      });

      fakeNow += 55 * 60 * 1000;
      await keepalive.sweep();

      expect(sentMessages).toHaveLength(1);
      expect(listSpy).not.toHaveBeenCalled();
      keepalive.dispose();
    });

    it("logs debug reason when skipping pinned Claude threads", async () => {
      const activeThread: KeepaliveThread = {
        id: "t-active",
        providerId: "anthropic",
        pinnedAt: fakeNow,
        archivedAt: null,
        status: "active",
        updatedAt: fakeNow,
      };
      const { sdk } = createMockSdk([activeThread]);
      const store = createInMemoryKeepaliveStore();
      store.setIdleAt("t-active", fakeNow);

      const debugLogs: string[] = [];
      const keepalive = createCacheKeepalive({
        pluginId: "project-folders",
        sdk,
        store,
        getConfig: () => ({ enabled: true, periodMinutes: 55, maxWakes: 0 }),
        now: () => fakeNow + 55 * 60 * 1000,
        setInterval: vi.fn(),
        clearInterval: vi.fn(),
        log: { debug: (msg) => debugLogs.push(msg) },
      });

      fakeNow += 55 * 60 * 1000;
      await keepalive.sweep();

      expect(debugLogs.some((l) => l.includes("skipping pinned Claude thread t-active: not idle"))).toBe(true);
      keepalive.dispose();
    });
  });

  describe("createSqliteKeepaliveStore and recordPingSent", () => {
    it("records lastPingAt in the SQLite store and updates on ping", () => {
      const rows = new Map<string, any>();
      const fakeDb = {
        prepare: (sql: string) => ({
          run: (...args: any[]) => {
            const threadId = args[0];
            const existing = rows.get(threadId) || { threadId, idleAt: 0, wakes: 0, updatedAt: 0, lastPingAt: null };
            if (sql.includes("INSERT INTO thread_keepalive")) {
              if (sql.includes("lastPingAt")) {
                // INSERT INTO thread_keepalive (threadId, idleAt, wakes, updatedAt, lastPingAt) VALUES (?, 0, 0, ?, ?)
                // args: [threadId, updatedAt, lastPingAt] -> args[1] = updatedAt, args[2] = lastPingAt
                existing.updatedAt = args[1];
                existing.lastPingAt = args[2];
              } else if (sql.includes("idleAt=excluded.idleAt")) {
                existing.idleAt = args[1];
                existing.updatedAt = args[2];
              } else if (sql.includes("wakes=excluded.wakes")) {
                existing.wakes = args[1];
                existing.updatedAt = args[2];
              }
              rows.set(threadId, existing);
            } else if (sql.includes("DELETE FROM thread_keepalive")) {
              rows.delete(threadId);
            }
            return { changes: 1 };
          },
          get: (threadId: string) => rows.get(threadId),
        }),
      };

      const sqliteStore = createSqliteKeepaliveStore(fakeDb as any);
      expect(sqliteStore.getLastPingAt?.("th-1")).toBeNull();

      sqliteStore.recordPingSent?.("th-1", 1234567890);
      expect(sqliteStore.getLastPingAt?.("th-1")).toBe(1234567890);
    });
  });
});
