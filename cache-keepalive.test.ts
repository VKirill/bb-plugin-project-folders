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
});
