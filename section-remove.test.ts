import { it, expect } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
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

async function fixture(extraProjects: unknown[] = []) {
  const root = await mkdtemp(path.join(tmpdir(), "bb-folders-remove-"));
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
            ...extraProjects,
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
        remove: async (a) => {
          await rm(a.path, { recursive: a.recursive, force: true });
          return {} as never;
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

async function idleChat(
  h: Awaited<ReturnType<typeof fixture>>,
  folderPath: string,
) {
  const t = {
    ...makeThreadResponse({
      id: "t1",
      projectId: "p1",
      environmentId: "e1",
      status: "idle",
    }),
    queuedWork: "none",
    activity: {},
    archivedAt: null,
  };
  h.harness.inspection.sdk.stub("environments.list", async () => [
    {
      id: "e1",
      hostId: "h1",
      projectId: "p1",
      path: folderPath,
      status: "ready",
    },
  ]);
  h.harness.inspection.sdk.stub("environments.get", async () => ({
    id: "e1",
    hostId: "h1",
    projectId: "p1",
    path: folderPath,
  }));
  h.harness.inspection.sdk.stub("threads.list", async (a) =>
    a.archived ? [] : [t],
  );
  h.harness.inspection.sdk.stub("threads.get", async () => t);
  h.harness.inspection.sdk.stub("threads.timeline", async () => ({
    rows: [{ message: "saved history" }],
    timelinePage: { hasOlderRows: false, olderCursor: null },
  }));
  for (const method of ["threads.stop", "threads.archive", "threads.delete"])
    h.harness.inspection.sdk.stub(method as never, async () => ({}));
  return t;
}

it("unbinds a section from the tree without moving files and archives its chats", async () => {
  const h = await fixture();
  try {
    const f = (await h.harness.behavior.callRpc("create", {
      projectId: "p1",
      folderId: null,
      name: "Dzen",
      relativePath: "dzen",
    })) as { id: string };
    const note = path.join(h.root, "dzen/keep.txt");
    await writeFile(note, "stay");
    await idleChat(h, path.join(h.root, "dzen"));
    const result = (await h.harness.behavior.callRpc("section_remove", {
      folderId: f.id,
      mode: "unbind",
    })) as { mode: string };
    expect(result.mode).toBe("unbind");
    expect(await readFile(note, "utf8")).toBe("stay");
    const list = (await h.harness.behavior.callRpc("list", null)) as {
      folders: { id: string }[];
    };
    expect(list.folders.map((x) => x.id)).not.toContain(f.id);
    expect(h.harness.inspection.sdk.callsTo("threads.archive")).toHaveLength(1);
    expect(h.harness.inspection.sdk.callsTo("threads.delete")).toHaveLength(0);
    const archives = (await h.harness.behavior.callRpc(
      "archive_list",
      null,
    )) as {
      archives: unknown[];
    };
    expect(archives.archives).toHaveLength(0);
  } finally {
    await h.close();
  }
});

it("purges files and deletes chats", async () => {
  const h = await fixture();
  try {
    const f = (await h.harness.behavior.callRpc("create", {
      projectId: "p1",
      folderId: null,
      name: "Gone",
      relativePath: "gone",
    })) as { id: string };
    const note = path.join(h.root, "gone/file.txt");
    await writeFile(note, "bye");
    await idleChat(h, path.join(h.root, "gone"));
    await h.harness.behavior.callRpc("section_remove", {
      folderId: f.id,
      mode: "purge",
    });
    expect(
      await stat(path.join(h.root, "gone")).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
    expect(h.harness.inspection.sdk.callsTo("threads.delete")).toHaveLength(1);
  } finally {
    await h.close();
  }
});

it("refuses to purge a folder that holds another BB project, and unbind still works", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bb-folders-nested-"));
  const nested = path.join(root, "dzen");
  await mkdir(nested, { recursive: true });
  await writeFile(path.join(nested, "keep.txt"), "stay");
  const p1 = {
    id: "p1",
    name: "Content",
    sources: [
      {
        type: "local_path" as const,
        hostId: "h1",
        path: root,
        isDefault: true,
      },
    ],
  };
  const p2 = {
    id: "p2",
    name: "Dzen",
    sources: [
      {
        type: "local_path" as const,
        hostId: "h1",
        path: nested,
        isDefault: true,
      },
    ],
  };
  let projects: unknown[] = [p1];
  const h = createFakePluginHost({
    pluginId: "project-folders",
    agentSkillIds: ["project-folders"],
    sdk: {
      projects: {
        list: async () => projects as never,
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
        write: async (a) => {
          await writeFile(a.path, a.content);
          return {
            outcome: "written",
            sha256: "test",
            sizeBytes: a.content.length,
          };
        },
        remove: async (a) => {
          await rm(a.path, { recursive: a.recursive, force: true });
          return {} as never;
        },
      },
    },
  });
  await plugin(h.bb);
  try {
    const f = (await h.harness.behavior.callRpc("create", {
      projectId: "p1",
      folderId: null,
      name: "Dzen",
      relativePath: "dzen",
    })) as { id: string };
    projects = [p1, p2];
    await expect(
      h.harness.behavior.callRpc("section_remove", {
        folderId: f.id,
        mode: "purge",
      }),
    ).rejects.toThrow(/another BB project/);
    await h.harness.behavior.callRpc("section_remove", {
      folderId: f.id,
      mode: "unbind",
    });
    expect(await readFile(path.join(nested, "keep.txt"), "utf8")).toBe("stay");
  } finally {
    await h.harness.lifecycle.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
