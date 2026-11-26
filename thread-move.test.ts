import { describe, it, expect } from "vitest";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { makeThreadMoves } from "./thread-move";
import { z } from "zod";
async function setup({
  supported = true,
  failFiles = false,
  status = "idle",
}: {
  supported?: boolean;
  failFiles?: boolean;
  status?: "idle" | "active";
} = {}) {
  let thread = makeThreadResponse({
    id: "t1",
    projectId: "p1",
    environmentId: "e1",
    status,
  });
  const files = new Set(["/work/.bb/chats/t1"]);
  const sent: string[] = [];
  let fail = failFiles;
  const h = createFakePluginHost({
    pluginId: "project-folders",
    sdk: {
      threads: {
        get: async () => thread,
        send: async (input) => {
          sent.push(JSON.stringify(input));
          return {} as never;
        },
        update: async (input) => {
          if (supported) {
            z.object({
              experimental_directory: z.object({
                path: z.literal("/work/section"),
                expectedEnvironmentId: z.literal("e1"),
              }),
            }).parse(input);
            thread = { ...thread, environmentId: "e2" };
          }
          return thread;
        },
      },
      environments: {
        get: async ({ environmentId }) =>
          ({
            id: environmentId,
            hostId: "h1",
            path: environmentId === "e1" ? "/work" : "/work/section",
          }) as never,
      },
      hosts: {
        pathsExist: async ({ paths }) =>
          ({
            existence: Object.fromEntries(paths.map((p) => [p, files.has(p)])),
          }) as never,
      },
      files: {
        mkdir: async () => ({}) as never,
        move: async ({ sourcePath, destinationPath }) => {
          if (fail) throw new Error("Disk unavailable");
          files.delete(sourcePath);
          files.add(destinationPath);
          return {} as never;
        },
      },
    },
  });
  h.bb.storage.migrate(h.bb.storage.database(), [
    "CREATE TABLE thread_moves (threadId TEXT PRIMARY KEY, data TEXT NOT NULL)",
  ]);
  const filed: (string | null)[] = [];
  const options = {
    file: (_threadId: string, folderId: string | null) => filed.push(folderId),
    target: async () => ({
      id: "f1",
      projectId: "p1",
      hostId: "h1",
      path: "/work/section",
      parentId: null,
      name: "Section",
    }),
    allowed: () => {},
    pendingExports: async () => {},
    canonical: (_host: string, p: string) => p,
    changed: () => {},
  };
  return {
    h,
    files,
    options,
    sent,
    /** What the chat's own agent does when it obeys the request. */
    agentSwitchesDirectory: () => {
      thread = { ...thread, environmentId: "e2", updatedAt: Date.now() + 1000 };
    },
    /** A provider whose agent has no directory tool: the turn just ends. */
    agentAnswersWithoutSwitching: () => {
      thread = { ...thread, updatedAt: Date.now() + 1000 };
    },
    filed,
    current: () => thread,
    recover: () => {
      fail = false;
    },
    moves: makeThreadMoves(h.bb, options),
  };
}
const input = { threadId: "t1", projectId: "p1", folderId: "f1", hostId: "h1" };
describe("native chat relocation", () => {
  it("preserves the chat and moves only its dedicated storage", async () => {
    const x = await setup();
    try {
      await x.moves.move(input);
      expect(x.current()).toMatchObject({ id: "t1", environmentId: "e2" });
      expect([...x.files]).toEqual(["/work/section/.bb/chats/t1"]);
      expect(x.moves.blocked("t1")).toBe(false);
    } finally {
      await x.h.harness.lifecycle.dispose();
    }
  });
  it("asks the chat to switch its own directory when core has no such API", async () => {
    const x = await setup({ supported: false });
    try {
      const result = await x.moves.move(input);
      expect(result).toMatchObject({ path: "/work/section", asked: true });
      // Nothing moved yet: the chat still works in the old folder.
      expect(x.current().environmentId).toBe("e1");
      expect([...x.files]).toEqual(["/work/.bb/chats/t1"]);
      // Nothing has moved, so the chat is not locked out of its own turns.
      expect(x.moves.blocked("t1")).toBe(false);
      expect(x.moves.any()).toBe(true);
      const request = x.sent.join("");
      expect(request).toContain("update_environment_directory");
      expect(request).toContain("/work/section");
      expect(request).toContain("agent-only");
      // Nothing happens while the chat has not switched.
      expect(await x.moves.finish("t1")).toBe(false);
      expect(x.moves.any()).toBe(true);
      // Listed where it was dropped from the start, whatever the agent does.
      expect(x.filed).toEqual(["f1"]);
      // The agent obeys: the storage follows and the barrier lifts.
      x.agentSwitchesDirectory();
      expect(await x.moves.finish("t1")).toBe("moved");
      expect([...x.files]).toEqual(["/work/section/.bb/chats/t1"]);
      expect(x.moves.any()).toBe(false);
    } finally {
      await x.h.harness.lifecycle.dispose();
    }
  });
  it("asks only once and leaves a chat alone when nothing is pending", async () => {
    const x = await setup({ supported: false });
    try {
      await x.moves.move(input);
      expect(x.sent).toHaveLength(1);
      x.agentSwitchesDirectory();
      await x.moves.finish("t1");
      expect(await x.moves.finish("t1")).toBe(false);
      expect(x.sent).toHaveLength(1);
    } finally {
      await x.h.harness.lifecycle.dispose();
    }
  });
  it("keeps the chat where it was dropped when the agent cannot switch", async () => {
    // Not every provider gives its agent the directory tool; Cursor Grok does
    // not. The folder stays, the tree still shows the move, nothing hangs.
    const x = await setup({ supported: false });
    try {
      await x.moves.move(input);
      x.agentAnswersWithoutSwitching();
      expect(await x.moves.finish("t1")).toBe("kept");
      expect(x.filed).toEqual(["f1"]);
      expect([...x.files]).toEqual(["/work/.bb/chats/t1"]);
      expect(x.moves.any()).toBe(false);
      expect(x.moves.blocked("t1")).toBe(false);
    } finally {
      await x.h.harness.lifecycle.dispose();
    }
  });
  it("recovers a failed storage move using its durable journal", async () => {
    const x = await setup({ failFiles: true });
    try {
      await expect(x.moves.move(input)).rejects.toThrow("Disk unavailable");
      expect(x.moves.blocked("t1")).toBe(true);
      x.recover();
      const resumed = makeThreadMoves(x.h.bb, x.options);
      await resumed.move(input);
      expect(resumed.blocked("t1")).toBe(false);
      expect([...x.files]).toEqual(["/work/section/.bb/chats/t1"]);
    } finally {
      await x.h.harness.lifecycle.dispose();
    }
  });
  it("rejects active chats and another project before changing anything", async () => {
    const x = await setup({ status: "active" });
    try {
      await expect(x.moves.move(input)).rejects.toThrow("can’t be moved right now");
      await expect(
        x.moves.move({ ...input, projectId: "other" }),
      ).rejects.toThrow("the chat belongs to");
      expect(x.current().environmentId).toBe("e1");
    } finally {
      await x.h.harness.lifecycle.dispose();
    }
  });
});
