import { describe, it, expect } from "vitest";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import plugin from "./server";
import {
  machineLabel,
  normalizeExecution,
  offeredMachineIds,
  placeOnHost,
  resolveExecution,
  seedMachineId,
} from "./execution";

const root = {
  id: "p1",
  name: "Test",
  sources: [
    { type: "local_path", hostId: "h1", path: "/work", isDefault: true },
  ],
};
/** What the CLI Agents plugin answered, per rpc method, in this test. */
type AgentStubs = {
  running?: boolean;
  catalog?: { agents: string[]; supported?: boolean; warnings?: string[] };
  select?: () => { token: string; label: string };
  pending?: unknown;
};
async function setup(agents: AgentStubs = {}) {
  const rpcCalls: { method: string; input: unknown }[] = [];
  const h = createFakePluginHost({
    pluginId: "project-folders",
    agentSkillIds: ["project-folders"],
    sdk: {
      projects: {
        list: async () => [root] as never,
        defaultExecutionOptions: async () =>
          ({ providerId: "codex", model: "gpt-6" }) as never,
      },
      hosts: {
        list: async () =>
          [{ id: "h1", name: "Mac", status: "connected" }] as never,
      },
      files: {
        mkdir: async () => ({}) as never,
        read: async () => {
          throw new Error("ENOENT: no such file or directory");
        },
        write: async () => ({ outcome: "written", sha256: "s", sizeBytes: 1 }),
      },
      environments: { list: async () => [] },
      plugins: {
        list: async () =>
          ({
            plugins: [
              {
                id: "cli-agents",
                status: agents.running === false ? "disabled" : "running",
              },
            ],
          }) as never,
        callRpc: async (args) => {
          const { method, input } = args as unknown as {
            method: string;
            input: unknown;
          };
          rpcCalls.push({ method, input });
          if (method === "catalog")
            return {
              supported: agents.catalog?.supported ?? true,
              warnings: agents.catalog?.warnings ?? [],
              agents: (agents.catalog?.agents ?? ["reviewer", "writer"]).map(
                (id) => ({ id, description: "", source: "user", mode: "all" }),
              ),
            } as never;
          if (method === "pending") return (agents.pending ?? null) as never;
          if (method === "select")
            return (agents.select?.() ?? {
              token: "11111111-1111-4111-8111-111111111111",
              label: "Agent: reviewer",
            }) as never;
          if (method === "clearPending") return true as never;
          throw new Error(`unexpected cli-agents method ${method}`);
        },
      },
    },
  });
  await plugin(h.bb);
  return { ...h, rpcCalls };
}
const call = (h: Awaited<ReturnType<typeof setup>>) =>
  h.harness.behavior.callRpc;
const section = async (h: Awaited<ReturnType<typeof setup>>, name: string) =>
  (
    (await call(h)("create", {
      projectId: "p1",
      folderId: null,
      name,
      relativePath: name,
    })) as { id: string }
  ).id;
const spawnRequest = (providerId = "claude-code") => ({
  projectId: "p1",
  providerId,
  model: "claude-opus-5",
  reasoningLevel: "high",
  permissionMode: "full",
  environment: {
    type: "provider",
    environmentProviderId: "project-checkout",
    machine: { type: "existing", hostId: "h1" },
  },
  input: [],
  executionInputSources: {},
});
function stubSpawn(h: Awaited<ReturnType<typeof setup>>) {
  h.harness.inspection.sdk.stub("threads.spawn", async () =>
    makeThreadResponse({ id: "t1", projectId: "p1" }),
  );
  h.harness.inspection.sdk.stub("threads.get", async () =>
    makeThreadResponse({ id: "t1", projectId: "p1", environmentId: null }),
  );
}

describe("execution inheritance", () => {
  it("lets the nearest place win one group at a time", () => {
    const resolved = resolveExecution([
      {
        origin: { scope: "folder", folderId: "f1" },
        value: { agentMode: "none" },
      },
      {
        origin: { scope: "project", folderId: null },
        value: {
          providerId: "claude-code",
          model: "opus",
          reasoningLevel: "high",
          agentMode: "agent",
          agentId: "reviewer",
        },
      },
      {
        origin: { scope: "global", folderId: null },
        value: { providerId: "codex", model: "gpt-6", permissionMode: "auto" },
      },
    ]);
    // The section pins no model, so the project's travels down to it.
    expect(resolved.model).toMatchObject({
      providerId: "claude-code",
      model: "opus",
      origin: { scope: "project" },
    });
    // Nobody above the plugin default pinned permissions.
    expect(resolved.permissionMode).toMatchObject({
      value: "auto",
      origin: { scope: "global" },
    });
    // "No agent" is a decision, not an absence: it beats the project's agent.
    expect(resolved.agent).toMatchObject({
      mode: "none",
      origin: { scope: "folder", folderId: "f1" },
    });
    expect(resolved.environment).toBeNull();
  });
  it("resolves the environment group nearest-first, apart from the others", () => {
    const resolved = resolveExecution([
      {
        origin: { scope: "folder", folderId: "f1" },
        value: { environmentMode: "folder" },
      },
      {
        origin: { scope: "project", folderId: null },
        value: {
          providerId: "claude-code",
          model: "opus",
          environmentMode: "worktree",
        },
      },
      {
        origin: { scope: "global", folderId: null },
        value: { environmentMode: "worktree" },
      },
    ]);
    expect(resolved.environment).toMatchObject({
      value: "folder",
      origin: { scope: "folder", folderId: "f1" },
    });
    expect(resolved.model).toMatchObject({
      providerId: "claude-code",
      origin: { scope: "project" },
    });
    expect(
      resolveExecution([
        { origin: { scope: "folder", folderId: "f1" }, value: {} },
        {
          origin: { scope: "project", folderId: null },
          value: { environmentMode: "worktree" },
        },
      ]).environment,
    ).toMatchObject({
      value: "worktree",
      origin: { scope: "project" },
    });
    expect(resolveExecution([]).environment).toBeNull();
  });
  it("resolves the machine group nearest-first, apart from the others", () => {
    const resolved = resolveExecution([
      {
        origin: { scope: "folder", folderId: "f1" },
        value: { hostId: "h2" },
      },
      {
        origin: { scope: "project", folderId: null },
        value: { hostId: "h1", environmentMode: "worktree" },
      },
      {
        origin: { scope: "global", folderId: null },
        value: { hostId: "h0" },
      },
    ]);
    expect(resolved.machine).toMatchObject({
      hostId: "h2",
      origin: { scope: "folder", folderId: "f1" },
    });
    expect(resolved.environment).toMatchObject({
      value: "worktree",
      origin: { scope: "project" },
    });
    expect(
      resolveExecution([
        { origin: { scope: "folder", folderId: "f1" }, value: {} },
        {
          origin: { scope: "project", folderId: null },
          value: { hostId: "h1" },
        },
      ]).machine,
    ).toMatchObject({
      hostId: "h1",
      origin: { scope: "project" },
    });
    expect(resolveExecution([]).machine).toBeNull();
  });
  it("offers the home host first and each path host once", () => {
    expect(offeredMachineIds("h1", [])).toEqual(["h1"]);
    expect(offeredMachineIds("h1", ["h2", "h1"])).toEqual(["h1", "h2"]);
    expect(offeredMachineIds("h1", ["h2"])).toEqual(["h1", "h2"]);
    expect(offeredMachineIds(null, ["h2"])).toEqual(["h2"]);
  });
  it("labels a known host with its BB name and an unknown one with the fallback", () => {
    const known = [
      { id: "h1", name: "Mac" },
      { id: "h2", name: "OVH" },
    ];
    expect(machineLabel("h2", known, "unknown machine")).toBe("OVH");
    expect(machineLabel("ghost", known, "unknown machine")).toBe(
      "unknown machine",
    );
    expect(machineLabel("h3", [{ id: "h3", name: "  " }], "unknown machine")).toBe(
      "unknown machine",
    );
  });
  it("seeds a preferred host only when it is in the offered list", () => {
    const offered = [{ id: "h1" }, { id: "h2" }];
    expect(seedMachineId(offered, "h2")).toBe("h2");
    expect(seedMachineId([{ id: "h1" }], "h2")).toBe("h1");
    expect(seedMachineId([], "h2")).toBeUndefined();
  });
  it("falls back to the home host when the pinned machine has no folder here", () => {
    const home = { hostId: "h1", path: "/work" };
    expect(placeOnHost(undefined, home, [{ hostId: "h2", path: "/srv" }])).toEqual(
      home,
    );
    expect(
      placeOnHost("h2", home, [
        { hostId: "h1", path: "/work" },
        { hostId: "h2", path: "/srv" },
      ]),
    ).toEqual({ hostId: "h2", path: "/srv" });
    expect(placeOnHost("h2", home, [{ hostId: "h1", path: "/work" }])).toEqual(
      home,
    );
  });
  it("keeps only the groups a place really pins", () => {
    expect(
      normalizeExecution({ model: "opus", reasoningLevel: "high" }),
    ).toEqual({});
    expect(normalizeExecution({ agentMode: "agent" })).toEqual({});
    expect(normalizeExecution({ environmentMode: "worktree" })).toEqual({
      environmentMode: "worktree",
    });
    expect(normalizeExecution({ hostId: "h2" })).toEqual({ hostId: "h2" });
    expect(
      normalizeExecution({
        providerId: "codex",
        model: "gpt-6",
        agentMode: "agent",
        agentId: "reviewer",
      }),
    ).toEqual({
      providerId: "codex",
      model: "gpt-6",
      agentMode: "agent",
      agentId: "reviewer",
    });
  });
  it("shows a section what it pins itself and what it inherits", async () => {
    const h = await setup();
    try {
      const id = await section(h, "Website");
      await call(h)("execution_save", {
        scope: { kind: "project", projectId: "p1" },
        value: {
          providerId: "claude-code",
          model: "claude-opus-5",
          reasoningLevel: "high",
          permissionMode: "auto",
        },
      });
      await call(h)("execution_save", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
        value: {
          providerId: "acp-opencode",
          model: "gemini",
          serviceTier: "fast",
        },
      });
      const read = (await call(h)("execution_read", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
      })) as Record<string, never>;
      expect(read.own).toMatchObject({ providerId: "acp-opencode" });
      expect(read.effective).toMatchObject({
        model: { providerId: "acp-opencode", origin: { scope: "folder" } },
        // Not pinned here: the project's permission mode still applies.
        permissionMode: { value: "auto", origin: { scope: "project" } },
      });
      expect(read.inherited).toMatchObject({
        model: { providerId: "claude-code", origin: { scope: "project" } },
      });
      expect(
        (read.effective as { environment: unknown }).environment,
      ).toBeNull();
      expect(read.hostId).toBe("h1");
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
  it("forgets a group when it is switched off, and survives a reload", async () => {
    const h = await setup();
    try {
      const scope = { kind: "project", projectId: "p1" };
      await call(h)("execution_save", {
        scope,
        value: { providerId: "codex", model: "gpt-6", permissionMode: "auto" },
      });
      Object.assign(h, await h.harness.lifecycle.reload(plugin));
      expect(
        ((await call(h)("execution_read", { scope })) as Record<string, never>)
          .own,
      ).toMatchObject({ providerId: "codex", permissionMode: "auto" });
      await call(h)("execution_save", {
        scope,
        value: { permissionMode: "auto" },
      });
      expect(
        ((await call(h)("execution_read", { scope })) as Record<string, never>)
          .own,
      ).toEqual({ permissionMode: "auto" });
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
  it("saves an environment pin and shows a section what it inherits", async () => {
    const h = await setup();
    try {
      const id = await section(h, "Website");
      await call(h)("execution_save", {
        scope: { kind: "project", projectId: "p1" },
        value: { environmentMode: "worktree" },
      });
      const unread = (await call(h)("execution_read", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
      })) as {
        own: unknown;
        effective: { environment: { value: string; origin: { scope: string } } };
        inherited: { environment: { value: string; origin: { scope: string } } };
      };
      expect(unread.own).toEqual({});
      expect(unread.effective.environment).toMatchObject({
        value: "worktree",
        origin: { scope: "project" },
      });
      expect(unread.inherited.environment).toMatchObject({
        value: "worktree",
        origin: { scope: "project" },
      });
      await call(h)("execution_save", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
        value: { environmentMode: "folder" },
      });
      const pinned = (await call(h)("execution_read", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
      })) as {
        own: { environmentMode: string };
        effective: { environment: { value: string; origin: { scope: string } } };
      };
      expect(pinned.own).toEqual({ environmentMode: "folder" });
      expect(pinned.effective.environment).toMatchObject({
        value: "folder",
        origin: { scope: "folder" },
      });
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
  it("loads a stored execution value that has no environment pin", async () => {
    const h = await setup();
    try {
      const scope = { kind: "project" as const, projectId: "p1" };
      await call(h)("execution_save", {
        scope,
        value: { providerId: "codex", model: "gpt-6" },
      });
      const read = (await call(h)("execution_read", { scope })) as {
        own: unknown;
        effective: { environment: unknown };
      };
      expect(read.own).toEqual({ providerId: "codex", model: "gpt-6" });
      expect(read.effective.environment).toBeNull();
      expect(read.effective.machine).toBeNull();
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
});

describe("pinned agents", () => {
  it("binds the pinned agent to the new chat and leaves no pending choice", async () => {
    const h = await setup();
    try {
      const id = await section(h, "Review");
      await call(h)("execution_save", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
        value: {
          providerId: "claude-code",
          model: "claude-opus-5",
          agentMode: "agent",
          agentId: "reviewer",
        },
      });
      stubSpawn(h);
      await call(h)("spawn", {
        projectId: "p1",
        folderId: id,
        request: spawnRequest(),
      });
      const spawned = JSON.stringify(
        h.harness.inspection.sdk.callsTo("threads.spawn"),
      );
      expect(spawned).toContain("cli-agents-selection:11111111");
      expect(spawned).toContain("agent-only");
      const methods = h.rpcCalls.map((c) => c.method);
      expect(methods).toContain("select");
      expect(methods).toContain("clearPending");
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
  it("leaves the chat alone when the composer runs another CLI", async () => {
    const h = await setup();
    try {
      const id = await section(h, "Review");
      await call(h)("execution_save", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
        value: { agentMode: "agent", agentId: "reviewer" },
      });
      stubSpawn(h);
      await call(h)("spawn", {
        projectId: "p1",
        folderId: id,
        request: spawnRequest("acp-antigravity"),
      });
      expect(
        JSON.stringify(h.harness.inspection.sdk.callsTo("threads.spawn")),
      ).not.toContain("cli-agents-selection");
      expect(h.rpcCalls.map((c) => c.method)).not.toContain("select");
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
  it("yields to an agent the user picked in the composer", async () => {
    const h = await setup({ pending: { agentId: "writer" } });
    try {
      const id = await section(h, "Review");
      await call(h)("execution_save", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
        value: { agentMode: "agent", agentId: "reviewer" },
      });
      stubSpawn(h);
      await call(h)("spawn", {
        projectId: "p1",
        folderId: id,
        request: spawnRequest(),
      });
      expect(h.rpcCalls.map((c) => c.method)).not.toContain("select");
      expect(
        JSON.stringify(h.harness.inspection.sdk.callsTo("threads.spawn")),
      ).not.toContain("cli-agents-selection");
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
  it("yields to a Lane Pilot profile chosen in the composer", async () => {
    const h = await setup();
    try {
      const id = await section(h, "Review");
      await call(h)("execution_save", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
        value: { agentMode: "agent", agentId: "reviewer" },
      });
      stubSpawn(h);
      await call(h)("spawn", {
        projectId: "p1",
        folderId: id,
        request: {
          ...spawnRequest(),
          pluginSubmission: { pluginId: "lane-pilot", data: { token: "t1" } },
        },
      });
      expect(h.rpcCalls.map((c) => c.method)).not.toContain("select");
      const spawned = JSON.stringify(
        h.harness.inspection.sdk.callsTo("threads.spawn"),
      );
      expect(spawned).not.toContain("cli-agents-selection");
      expect(spawned).toContain("lane-pilot");
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
  it("refuses to start a chat whose pinned agent cannot be applied", async () => {
    const h = await setup();
    try {
      const id = await section(h, "Review");
      await call(h)("execution_save", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
        value: { agentMode: "agent", agentId: "reviewer" },
      });
      stubSpawn(h);
      h.harness.inspection.sdk.stub("plugins.callRpc", async (...args) => {
        const { method } = args[0] as unknown as { method: string };
        if (method === "pending") return null;
        throw new Error("Agent is not available. Refresh the list.");
      });
      await expect(
        call(h)("spawn", {
          projectId: "p1",
          folderId: id,
          request: spawnRequest(),
        }),
      ).rejects.toThrow(/reviewer/);
      expect(h.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(0);
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
  it("refuses to pin an agent the machine does not have", async () => {
    const h = await setup({ catalog: { agents: ["writer"] } });
    try {
      const id = await section(h, "Review");
      await expect(
        call(h)("execution_save", {
          scope: { kind: "folder", projectId: "p1", folderId: id },
          value: {
            providerId: "claude-code",
            model: "claude-opus-5",
            agentMode: "agent",
            agentId: "reviewer",
          },
        }),
      ).rejects.toThrow();
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
  it("reports the missing plugin instead of an empty agent list", async () => {
    const h = await setup({ running: false });
    try {
      const id = await section(h, "Review");
      const catalog = (await call(h)("execution_agents", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
        providerId: "claude-code",
      })) as { installed: boolean; agents: unknown[] };
      expect(catalog.installed).toBe(false);
      expect(catalog.agents).toEqual([]);
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
});

describe("pinned environment", () => {
  it("spawns a managed worktree on the folder host instead of rewriting it", async () => {
    const h = await setup();
    try {
      const id = await section(h, "Review");
      await call(h)("execution_save", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
        value: { environmentMode: "worktree" },
      });
      stubSpawn(h);
      await call(h)("spawn", {
        projectId: "p1",
        folderId: id,
        request: {
          ...spawnRequest(),
          environment: {
            type: "host",
            hostId: "h1",
            workspace: {
              type: "managed-worktree",
              baseBranch: { kind: "default" },
            },
          },
        },
      });
      expect(h.harness.inspection.sdk.callsTo("threads.spawn")[0]?.[0]).toMatchObject(
        {
          environment: {
            type: "host",
            hostId: "h1",
            workspace: {
              type: "managed-worktree",
              baseBranch: { kind: "default" },
            },
          },
        },
      );
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
  it("still starts an unpinned chat in the section folder", async () => {
    const h = await setup();
    try {
      const id = await section(h, "Review");
      stubSpawn(h);
      await call(h)("spawn", {
        projectId: "p1",
        folderId: id,
        request: spawnRequest(),
      });
      expect(h.harness.inspection.sdk.callsTo("threads.spawn")[0]?.[0]).toMatchObject(
        {
          environment: {
            type: "provider",
            environmentProviderId: "project-checkout",
            machine: { type: "existing", hostId: "h1" },
            inputs: { path: "/work/Review" },
          },
        },
      );
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
});

async function twoHosts() {
  const h = await setup();
  h.harness.inspection.sdk.stub("hosts.list", async () => [
    { id: "h1", name: "Mac", status: "connected" },
    { id: "h2", name: "OVH", status: "connected" },
  ]);
  h.harness.inspection.sdk.stub("projects.list", async () => [
    {
      ...root,
      sources: [
        { type: "local_path", hostId: "h1", path: "/work", isDefault: true },
        { type: "local_path", hostId: "h2", path: "/srv", isDefault: false },
      ],
    },
  ] as never);
  return h;
}

describe("pinned machine", () => {
  it("lists only machines where the place has a folder, and all hosts globally", async () => {
    const h = await twoHosts();
    try {
      const id = await section(h, "Review");
      const project = (await call(h)("execution_read", {
        scope: { kind: "project", projectId: "p1" },
      })) as { hosts: { id: string; name: string }[]; knownHosts: { id: string }[] };
      expect(project.hosts).toEqual([
        { id: "h1", name: "Mac" },
        { id: "h2", name: "OVH" },
      ]);
      expect(project.knownHosts.map((x) => x.id).sort()).toEqual(["h1", "h2"]);
      const folder = (await call(h)("execution_read", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
      })) as { hosts: { id: string; name: string }[] };
      expect(folder.hosts).toEqual([{ id: "h1", name: "Mac" }]);
      await call(h)("section_path_set", {
        folderId: id,
        hostId: "h2",
        path: "/srv/Review",
      });
      const both = (await call(h)("execution_read", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
      })) as { hosts: { id: string; name: string }[] };
      expect(both.hosts).toEqual([
        { id: "h1", name: "Mac" },
        { id: "h2", name: "OVH" },
      ]);
      const global = (await call(h)("execution_read", {
        scope: { kind: "global" },
      })) as { hosts: { id: string }[]; knownHosts: { id: string }[] };
      expect(global.hosts.map((x) => x.id)).toEqual(["h1", "h2"]);
      expect(global.knownHosts.map((x) => x.id)).toEqual(["h1", "h2"]);
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
  it("saves a machine pin and shows a section what it inherits", async () => {
    const h = await twoHosts();
    try {
      const id = await section(h, "Website");
      await call(h)("execution_save", {
        scope: { kind: "project", projectId: "p1" },
        value: { hostId: "h2" },
      });
      const unread = (await call(h)("execution_read", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
      })) as {
        own: unknown;
        effective: { machine: { hostId: string; origin: { scope: string } } };
        inherited: { machine: { hostId: string; origin: { scope: string } } };
      };
      expect(unread.own).toEqual({});
      expect(unread.effective.machine).toMatchObject({
        hostId: "h2",
        origin: { scope: "project" },
      });
      expect(unread.inherited.machine).toMatchObject({
        hostId: "h2",
        origin: { scope: "project" },
      });
      await call(h)("execution_save", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
        value: { hostId: "h1" },
      });
      const pinned = (await call(h)("execution_read", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
      })) as {
        own: { hostId: string };
        effective: { machine: { hostId: string; origin: { scope: string } } };
      };
      expect(pinned.own).toEqual({ hostId: "h1" });
      expect(pinned.effective.machine).toMatchObject({
        hostId: "h1",
        origin: { scope: "folder" },
      });
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
  it("spawns on the pinned host and that host's folder path", async () => {
    const h = await twoHosts();
    try {
      const id = await section(h, "Review");
      await call(h)("section_path_set", {
        folderId: id,
        hostId: "h2",
        path: "/srv/Review",
      });
      await call(h)("execution_save", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
        value: { hostId: "h2" },
      });
      stubSpawn(h);
      await call(h)("spawn", {
        projectId: "p1",
        folderId: id,
        request: {
          ...spawnRequest(),
          environment: {
            type: "provider",
            environmentProviderId: "project-checkout",
            machine: { type: "existing", hostId: "h2" },
          },
        },
      });
      expect(
        h.harness.inspection.sdk.callsTo("threads.spawn")[0]?.[0],
      ).toMatchObject({
        environment: {
          type: "provider",
          environmentProviderId: "project-checkout",
          machine: { type: "existing", hostId: "h2" },
          inputs: { path: "/srv/Review" },
        },
      });
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
  it("falls back to the home host when the pinned machine has no folder for the place", async () => {
    const h = await twoHosts();
    try {
      const id = await section(h, "Review");
      await call(h)("execution_save", {
        scope: { kind: "project", projectId: "p1" },
        value: { hostId: "h2" },
      });
      stubSpawn(h);
      await call(h)("spawn", {
        projectId: "p1",
        folderId: id,
        request: {
          ...spawnRequest(),
          environment: {
            type: "provider",
            environmentProviderId: "project-checkout",
            machine: { type: "existing", hostId: "h2" },
          },
        },
      });
      expect(
        h.harness.inspection.sdk.callsTo("threads.spawn")[0]?.[0],
      ).toMatchObject({
        environment: {
          type: "provider",
          environmentProviderId: "project-checkout",
          machine: { type: "existing", hostId: "h1" },
          inputs: { path: "/work/Review" },
        },
      });
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
  it("spawns a managed worktree on the pinned host", async () => {
    const h = await twoHosts();
    try {
      const id = await section(h, "Review");
      await call(h)("section_path_set", {
        folderId: id,
        hostId: "h2",
        path: "/srv/Review",
      });
      await call(h)("execution_save", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
        value: { hostId: "h2", environmentMode: "worktree" },
      });
      stubSpawn(h);
      await call(h)("spawn", {
        projectId: "p1",
        folderId: id,
        request: {
          ...spawnRequest(),
          environment: {
            type: "host",
            hostId: "h2",
            workspace: {
              type: "managed-worktree",
              baseBranch: { kind: "default" },
            },
          },
        },
      });
      expect(
        h.harness.inspection.sdk.callsTo("threads.spawn")[0]?.[0],
      ).toMatchObject({
        environment: {
          type: "host",
          hostId: "h2",
          workspace: {
            type: "managed-worktree",
            baseBranch: { kind: "default" },
          },
        },
      });
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
});
