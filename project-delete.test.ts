import { describe, it, expect } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";

const root = {
  id: "p1",
  kind: "standard" as const,
  name: "Test",
  sources: [
    {
      id: "s1",
      type: "local_path" as const,
      hostId: "h1",
      path: "/work",
      isDefault: true,
    },
  ],
};

async function setup(
  projects = [root],
  hosts = [{ id: "h1", name: "Mac", status: "connected" as const }],
) {
  const writes: Record<string, unknown>[] = [];
  const deleted: string[] = [];
  const moved: Record<string, unknown>[] = [];
  const h = createFakePluginHost({
    pluginId: "project-folders",
    agentSkillIds: ["project-folders"],
    sdk: {
      hosts: {
        list: async () => hosts as never,
      },
      projects: {
        list: async () => projects as never,
        delete: async (args: { projectId: string }) => {
          deleted.push(args.projectId);
          return { ok: true };
        },
      },
      files: {
        mkdir: async (args) => {
          writes.push(args);
          return {} as never;
        },
        write: async (args) => {
          writes.push(args);
          return { outcome: "written", sha256: "sha", sizeBytes: 1 };
        },
        move: async (args) => {
          moved.push(args);
          return {} as never;
        },
      },
      environments: { list: async () => [] },
      threads: { list: async () => [] },
    },
  });
  await plugin(h.bb);
  return { ...h, writes, deleted, moved };
}

describe("project delete", () => {
  it("removes the BB project and leaves files when keep is selected", async () => {
    const h = await setup();
    try {
      await h.harness.behavior.callRpc("create", {
        projectId: "p1",
        folderId: null,
        name: "Docs",
        relativePath: "Docs",
      });
      const result = (await h.harness.behavior.callRpc("project_delete", {
        projectId: "p1",
        files: "keep",
      })) as { files: string; archivePath: string | null };
      expect(result.files).toBe("keep");
      expect(result.archivePath).toBeNull();
      expect(h.deleted).toEqual(["p1"]);
      expect(h.moved).toEqual([]);
      const listed = (await h.harness.behavior.callRpc("list", null)) as {
        folders: unknown[];
      };
      expect(listed.folders).toEqual([]);
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });

  it("archives every local copy when the project lives on several devices", async () => {
    const dual = {
      ...root,
      sources: [
        root.sources[0],
        {
          id: "s2",
          type: "local_path" as const,
          hostId: "h2",
          path: "/home/u/work",
          isDefault: false,
        },
      ],
    };
    const h = await setup([dual], [
      { id: "h1", name: "Mac", status: "connected" },
      { id: "h2", name: "OVH", status: "connected" },
    ]);
    try {
      const result = (await h.harness.behavior.callRpc("project_delete", {
        projectId: "p1",
        files: "archive",
      })) as { files: string; archivePath: string | null };
      expect(result.files).toBe("archive");
      expect(result.archivePath).toMatch(
        /^\/\.bb\/archive\/projects\/[^/]+\/folder$/,
      );
      const id = result.archivePath!.split("/")[4];
      expect(h.moved).toEqual([
        {
          hostId: "h1",
          sourcePath: "/work",
          destinationPath: `/.bb/archive/projects/${id}/folder`,
        },
        {
          hostId: "h2",
          sourcePath: "/home/u/work",
          destinationPath: `/home/u/.bb/archive/projects/${id}/folder`,
        },
      ]);
      expect(h.deleted).toEqual(["p1"]);
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });

  it("refuses to archive files when there is no local project folder", async () => {
    const remoteOnly = { ...root, sources: [] };
    const h = await setup([remoteOnly]);
    try {
      await expect(
        h.harness.behavior.callRpc("project_delete", {
          projectId: "p1",
          files: "archive",
        }),
      ).rejects.toThrow(/local project folder/);
      expect(h.deleted).toEqual([]);
      expect(h.moved).toEqual([]);
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });

  it("moves the folder into a sibling archive before deleting the project", async () => {
    const h = await setup();
    try {
      const result = (await h.harness.behavior.callRpc("project_delete", {
        projectId: "p1",
        files: "archive",
      })) as { files: string; archivePath: string | null };
      expect(result.files).toBe("archive");
      expect(result.archivePath).toMatch(
        /^\/\.bb\/archive\/projects\/[^/]+\/folder$/,
      );
      expect(h.moved).toEqual([
        {
          hostId: "h1",
          sourcePath: "/work",
          destinationPath: result.archivePath,
        },
      ]);
      expect(h.deleted).toEqual(["p1"]);
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });

  it("refuses to archive files when the folder is also another project's section", async () => {
    const other = {
      id: "p2",
      kind: "standard" as const,
      name: "Parent",
      sources: [
        {
          id: "s2",
          type: "local_path" as const,
          hostId: "h1",
          path: "/parent",
          isDefault: true,
        },
      ],
    };
    const nested = {
      ...root,
      sources: [{ ...root.sources[0], path: "/parent/work" }],
    };
    const h = await setup([other, nested]);
    try {
      await h.harness.behavior.callRpc("create", {
        projectId: "p2",
        folderId: null,
        name: "work",
        relativePath: "work",
      });
      await expect(
        h.harness.behavior.callRpc("project_delete", {
          projectId: "p1",
          files: "archive",
        }),
      ).rejects.toThrow(/also a section/);
      expect(h.deleted).toEqual([]);
      expect(h.moved).toEqual([]);
    } finally {
      await h.harness.lifecycle.dispose();
    }
  });
});
