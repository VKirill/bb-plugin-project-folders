import { it, expect } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import plugin from "./server";
import type { Archive } from "./archive";
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "bb-folders-test-"));
  const h = createFakePluginHost({
    pluginId: "project-folders",
    agentSkillIds: ["project-folders"],
    sdk: {
      projects: {
        list: async () =>
          [
            {
              id: "p1",
              name: "Test",
              sources: [
                {
                  type: "local_path",
                  hostId: "h1",
                  path: root,
                  isDefault: true,
                },
              ],
            },
          ] as never,
      },
      environments: { list: async () => [] },
      threads: { list: async () => [] },
      hosts: {
        list: async () =>
          [{ id: "h1", name: "Mac", status: "connected" }] as never,
        pathsExist: async (args) => ({
          existence: Object.fromEntries(
            await Promise.all(
              args.paths.map(async (p) => [
                p,
                await stat(p).then(
                  () => true,
                  () => false,
                ),
              ]),
            ),
          ),
        }),
      },
      files: {
        mkdir: async (a) => {
          await mkdir(a.path, { recursive: a.recursive });
          return {} as never;
        },
        move: async (a) => {
          await rename(a.sourcePath, a.destinationPath);
          return {} as never;
        },
        write: async (a) => {
          if (a.createParents)
            await mkdir(path.dirname(a.path), { recursive: true });
          await writeFile(a.path, a.content);
          return {
            outcome: "written",
            sha256: "test",
            sizeBytes: a.content.length,
          };
        },
      },
    },
  });
  await plugin(h.bb);
  return {
    ...h,
    root,
    close: async () => {
      await h.harness.lifecycle.dispose();
      await rm(root, { recursive: true, force: true });
    },
  };
}
it("moves a nested section into project archive, detects its name and restores original IDs and files", async () => {
  const h = await fixture();
  try {
    const f = (await h.harness.behavior.callRpc("create", {
      projectId: "p1",
      folderId: null,
      name: "123",
      relativePath: "123",
    })) as { id: string };
    const child = (await h.harness.behavior.callRpc("create", {
      projectId: "p1",
      folderId: f.id,
      name: "Child",
      relativePath: "child",
    })) as { id: string };
    await writeFile(
      path.join(h.root, "123/child/AGENTS.md"),
      "rules and history",
    );
    const archived = (await h.harness.behavior.callRpc("archive", {
      folderId: f.id,
    })) as Archive;
    expect(archived.members).toHaveLength(2);
    expect(
      await stat(path.join(h.root, "123")).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
    expect(
      await readFile(
        path.join(archived.archivePath, "child/AGENTS.md"),
        "utf8",
      ),
    ).toBe("rules and history");
    const found = (await h.harness.behavior.callRpc("archive_matches", {
      projectId: "p1",
      folderId: null,
      name: "123",
      relativePath: "123",
    })) as { archives: Archive[] };
    expect(found.archives[0].id).toBe(archived.id);
    await expect(
      h.harness.behavior.callRpc("create", {
        projectId: "p1",
        folderId: null,
        name: "123",
        relativePath: "123",
      }),
    ).rejects.toThrow(/archived/);
    await h.harness.behavior.callRpc("restore", { id: archived.id });
    expect(
      await readFile(path.join(h.root, "123/child/AGENTS.md"), "utf8"),
    ).toBe("rules and history");
    const list = (await h.harness.behavior.callRpc("list", null)) as {
      folders: { id: string }[];
    };
    expect(list.folders.map((f) => f.id)).toContain(child.id);
  } finally {
    await h.close();
  }
});
it("never overwrites a replacement directory on restore", async () => {
  const h = await fixture();
  try {
    const f = (await h.harness.behavior.callRpc("create", {
      projectId: "p1",
      folderId: null,
      name: "A",
      relativePath: "A",
    })) as { id: string };
    const a = (await h.harness.behavior.callRpc("archive", {
      folderId: f.id,
    })) as Archive;
    await mkdir(path.join(h.root, "A"));
    await writeFile(path.join(h.root, "A/new.txt"), "keep");
    await expect(
      h.harness.behavior.callRpc("restore", { id: a.id }),
    ).rejects.toThrow(/occupied/);
    expect(await readFile(path.join(h.root, "A/new.txt"), "utf8")).toBe("keep");
    expect(await stat(a.archivePath).then(() => true)).toBe(true);
  } finally {
    await h.close();
  }
});
it("retains a recoverable journal when the move fails", async () => {
  const h = await fixture();
  try {
    const f = (await h.harness.behavior.callRpc("create", {
      projectId: "p1",
      folderId: null,
      name: "A",
      relativePath: "A",
    })) as { id: string };
    h.harness.inspection.sdk.stub("files.move", async () => {
      throw new Error("host disconnected");
    });
    await expect(
      h.harness.behavior.callRpc("archive", { folderId: f.id }),
    ).rejects.toThrow(/disconnected/);
    const list = (await h.harness.behavior.callRpc("archive_list", null)) as {
      archives: Archive[];
    };
    expect(list.archives[0].state).toBe("archiving");
    expect(await stat(path.join(h.root, "A")).then(() => true)).toBe(true);
    h.harness.inspection.sdk.stub("files.move", async (args) => {
      await rename(args.sourcePath, args.destinationPath);
      return {};
    });
    expect(
      (
        (await h.harness.behavior.callRpc("archive", {
          folderId: f.id,
        })) as Archive
      ).state,
    ).toBe("archived");
  } finally {
    await h.close();
  }
});

it("archives and restores existing idle chats and rejects active work before moving", async () => {
  const h = await fixture();
  try {
    const f = (await h.harness.behavior.callRpc("create", {
      projectId: "p1",
      folderId: null,
      name: "Chat folder",
      relativePath: "chat",
    })) as { id: string };
    const t = {
      ...makeThreadResponse({
        id: "t1",
        projectId: "p1",
        environmentId: "e1",
        status: "idle",
      }),
      queuedWork: "none",
      activity: {},
    };
    h.harness.inspection.sdk.stub("environments.list", async () => [
      {
        id: "e1",
        hostId: "h1",
        projectId: "p1",
        path: path.join(h.root, "chat"),
        status: "ready",
      },
    ]);
    h.harness.inspection.sdk.stub("environments.get", async () => ({
      id: "e1",
      hostId: "h1",
      projectId: "p1",
      path: path.join(h.root, "chat"),
    }));
    h.harness.inspection.sdk.stub("threads.list", async (a) =>
      a.archived ? [] : [{ ...t, status: "active" }],
    );
    await expect(
      h.harness.behavior.callRpc("archive", { folderId: f.id }),
    ).rejects.toThrow(/Work is still going on/);
    h.harness.inspection.sdk.stub("threads.list", async (a) =>
      a.archived ? [] : [t],
    );
    h.harness.inspection.sdk.stub("threads.get", async () => t);
    h.harness.inspection.sdk.stub("threads.timeline", async () => ({
      rows: [{ message: "saved history" }],
      timelinePage: { hasOlderRows: false, olderCursor: null },
    }));
    for (const method of [
      "threads.stop",
      "threads.archive",
      "threads.unarchive",
    ])
      h.harness.inspection.sdk.stub(method as never, async () => ({}));
    const a = (await h.harness.behavior.callRpc("archive", {
      folderId: f.id,
    })) as Archive;
    expect(a.restoreThreadIds).toEqual(["t1"]);
    expect(h.harness.inspection.sdk.callsTo("threads.archive")).toHaveLength(1);
    await h.harness.behavior.callRpc("restore", { id: a.id });
    expect(h.harness.inspection.sdk.callsTo("threads.unarchive")).toHaveLength(
      1,
    );
    expect(
      await stat(
        path.join(h.root, "chat/.bb/chats/t1/history/index.json"),
      ).then(() => true),
    ).toBe(true);
  } finally {
    await h.close();
  }
});
