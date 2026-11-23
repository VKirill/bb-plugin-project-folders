import { beforeEach, describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";
import {
  wantedRemembered,
  type Remembered,
} from "./bb-remembered";
import { selectionFromExecution } from "./execution";

/** BB's own table, as its migrations create it. */
const BB_SCHEMA = `
CREATE TABLE projects (id TEXT PRIMARY KEY NOT NULL);
CREATE TABLE project_execution_defaults (
  project_id text NOT NULL,
  provider_id text NOT NULL,
  model text NOT NULL,
  service_tier text NOT NULL,
  reasoning_level text NOT NULL,
  permission_mode text NOT NULL,
  updated_at integer NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX project_execution_defaults_project_idx ON project_execution_defaults (project_id);
`;

/** What BB's SDK reports as the remembered row, per project. */
const rows = new Map<string, Remembered>();
beforeEach(() => rows.clear());

const antigravity: Remembered = {
  providerId: "acp-antigravity",
  model: "gemini-3.8-flash",
  reasoningLevel: "high",
  serviceTier: "default",
  permissionMode: "full",
};
const opus = {
  providerId: "claude-code",
  model: "claude-opus-5-5",
  reasoningLevel: "high" as const,
  permissionMode: "full" as const,
};

describe("the row the plugin's project setting stands for", () => {
  const pin = (
    model: Partial<{
      providerId: string;
      model: string;
      reasoningLevel: "high" | null;
      serviceTier: "fast" | null;
    }> | null,
    permission?: "full" | "auto",
  ) => ({
    model: model
      ? {
          providerId: model.providerId ?? "claude-code",
          model: model.model ?? "claude-opus-5-5",
          reasoningLevel: model.reasoningLevel ?? null,
          serviceTier: model.serviceTier ?? null,
          origin: { scope: "project" as const, folderId: null },
        }
      : null,
    permissionMode: permission
      ? {
          value: permission,
          origin: { scope: "project" as const, folderId: null },
        }
      : null,
  });
  it("says nothing when the plugin pins nothing BB stores", () => {
    expect(wantedRemembered(pin(null), antigravity)).toBeNull();
    expect(wantedRemembered(pin(null, "full"), null)).toBeNull();
  });
  it("replaces another provider and fills what is not pinned with BB defaults", () => {
    expect(wantedRemembered(pin({}), antigravity)).toEqual({
      providerId: "claude-code",
      model: "claude-opus-5-5",
      reasoningLevel: "medium",
      serviceTier: "default",
      // The permission mode is not tied to a provider: BB's stays.
      permissionMode: "full",
    });
  });
  it("keeps BB's reasoning and tier when the provider stays the same", () => {
    expect(
      wantedRemembered(pin({ providerId: "acp-antigravity", model: "x" }), {
        ...antigravity,
        serviceTier: "fast",
      }),
    ).toMatchObject({ reasoningLevel: "high", serviceTier: "fast" });
  });
  it("changes only the permission mode when no provider is pinned", () => {
    expect(wantedRemembered(pin(null, "auto"), antigravity)).toEqual({
      ...antigravity,
      permissionMode: "auto",
    });
  });
});

const root = {
  id: "p1",
  name: "Test",
  sources: [
    { type: "local_path", hostId: "h1", path: "/work", isDefault: true },
  ],
};
async function setup(live = ["claude-code", "codex"]) {
  const h = createFakePluginHost({
    pluginId: "project-folders",
    agentSkillIds: ["project-folders"],
    sdk: {
      projects: {
        list: async () => [root] as never,
        defaultExecutionOptions: async ({ projectId }) =>
          (rows.get(projectId) ?? null) as never,
      },
      providers: {
        list: async () =>
          ["claude-code", "codex", "acp-antigravity"].map((id) => ({
            id,
            available: live.includes(id),
          })) as never,
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
        list: async () => ({ plugins: [] }) as never,
      },
    },
  });
  await plugin(h.bb);
  return h;
}
const project = { kind: "project", projectId: "p1" } as const;

describe("project setting → BB's remembered defaults", () => {
  it("compares a project save with BB's row and never writes it", async () => {
    rows.set("p1", antigravity);
    const h = await setup();
    try {
      const call = h.harness.behavior.callRpc;
      const before = (await call("execution_read", { scope: project })) as {
        bb: Record<string, unknown>;
      };
      expect(before.bb).toMatchObject({
        remembered: antigravity,
        rememberedAvailable: false,
        wanted: null,
        matches: true,
      });
      const saved = (await call("execution_save", {
        scope: project,
        value: opus,
      })) as { bb: unknown };
      expect(saved.bb).toEqual({
        status: "pending",
        providerId: "claude-code",
        message: null,
      });
      expect(rows.get("p1")).toEqual(antigravity);
      const after = (await call("execution_read", { scope: project })) as {
        bb: Record<string, unknown>;
      };
      expect(after.bb).toMatchObject({
        wantedAvailable: true,
        matches: false,
      });
      // Once BB has remembered it itself, the plugin reports it unchanged.
      rows.set("p1", { ...opus, serviceTier: "default" });
      expect(await call("execution_remember", { projectId: "p1" })).toMatchObject({
        status: "unchanged",
      });
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
  it("reports a provider without a live bridge as unavailable", async () => {
    rows.set("p1", { ...antigravity, providerId: "codex", model: "gpt-6" });
    const h = await setup();
    try {
      const saved = (await h.harness.behavior.callRpc("execution_save", {
        scope: project,
        value: { providerId: "acp-antigravity", model: "gemini-3.8-flash" },
      })) as { bb: { status: string } };
      expect(saved.bb.status).toBe("unavailable");
      const read = (await h.harness.behavior.callRpc("execution_read", {
        scope: project,
      })) as { bb: Record<string, unknown> };
      expect(read.bb).toMatchObject({
        rememberedAvailable: true,
        wantedAvailable: false,
        matches: false,
      });
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
  it("leaves a section out of the comparison", async () => {
    rows.set("p1", antigravity);
    const h = await setup();
    try {
      const call = h.harness.behavior.callRpc;
      const { id } = (await call("create", {
        projectId: "p1",
        folderId: null,
        name: "Site",
        relativePath: "Site",
      })) as { id: string };
      const sectionSave = (await call("execution_save", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
        value: { providerId: "codex", model: "gpt-6" },
      })) as { bb?: unknown };
      expect(sectionSave.bb).toBeUndefined();
      const folderRead = (await call("execution_read", {
        scope: { kind: "folder", projectId: "p1", folderId: id },
      })) as { bb: unknown };
      expect(folderRead.bb).toBeNull();
      // The plugin-wide default is not written to BB; the project inherits
      // it, so the project page shows the mismatch.
      await call("execution_save", { scope: { kind: "global" }, value: opus });
      expect(rows.get("p1")).toEqual(antigravity);
      const read = (await call("execution_read", { scope: project })) as {
        bb: Record<string, unknown>;
      };
      expect(read.bb).toMatchObject({
        wanted: { providerId: "claude-code" },
        matches: false,
      });
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
});

describe("selectionFromExecution", () => {
  const origin = { scope: "project" as const, folderId: null };
  it("passes only the fields that are set", () => {
    expect(selectionFromExecution({ model: null, permissionMode: null })).toEqual({});
    expect(
      selectionFromExecution({
        model: { providerId: "codex", model: "gpt-6", reasoningLevel: null, serviceTier: null, origin },
        permissionMode: null,
      }),
    ).toEqual({ providerId: "codex", model: "gpt-6" });
    expect(
      selectionFromExecution({
        model: { providerId: "codex", model: "gpt-6", reasoningLevel: "high", serviceTier: "fast", origin },
        permissionMode: { value: "full", origin },
      }),
    ).toEqual({
      providerId: "codex",
      model: "gpt-6",
      reasoningLevel: "high",
      serviceTier: "fast",
      permissionMode: "full",
    });
  });
});

describe("giving every project the plugin-wide model and agent back", () => {
  it("lists the pins, drops their model and agent, keeps the machine and writes BB's row", async () => {
    rows.set("p1", antigravity);
    const h = await setup();
    try {
      const call = h.harness.behavior.callRpc;
      const shared = { providerId: "codex", model: "gpt-6", reasoningLevel: "high" as const };
      await call("execution_save", { scope: { kind: "global" }, value: shared });
      await call("execution_save", { scope: project, value: { ...opus, agentMode: "none", hostId: "h1" } });
      expect(await call("execution_overrides", {})).toEqual({
        places: [{ projectId: "p1", projectName: "Test", folderId: null, folderName: null, model: true, agent: true }],
      });
      expect(await call("execution_reset_all", {})).toEqual({ ok: true, places: 1 });
      expect(await call("execution_overrides", {})).toEqual({ places: [] });
      const read = (await call("execution_read", { scope: project })) as { own: unknown; effective: { model: { providerId: string; model: string } | null } };
      // Access and machine are not who answers: they stay.
      expect(read.own).toEqual({ permissionMode: opus.permissionMode, hostId: "h1" });
      expect(read.effective.model).toMatchObject({ providerId: "codex", model: "gpt-6" });
      expect(((await call("execution_read", { scope: { kind: "global" } })) as { own: unknown }).own).toEqual(shared);
      // BB's row is never written by the plugin.
      expect(rows.get("p1")).toEqual(antigravity);
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
});
