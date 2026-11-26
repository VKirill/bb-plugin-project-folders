import { it, expect } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  realpath,
  lstat,
  rm,
  rename,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { inspectMove, moveDirectory } from "./move-files";
import plugin from "./server";
async function setup() {
  const base = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "bb-move-test-")),
  );
  const root = path.join(base, "project");
  await mkdir(root);
  let current = root;
  let failUpdate = false;
  let active = false;
  const h = createFakePluginHost({
    pluginId: "project-folders",
    agentSkillIds: ["project-folders"],
    experimental_hostEntry: true,
    experimental_callHostRpc: async (call) =>
      call.method === "inspect"
        ? inspectMove(call.input as never)
        : moveDirectory(call.input as never),
    sdk: {
      projects: {
        list: async () =>
          [
            {
              id: "p1",
              name: "Demo",
              sources: [
                {
                  id: "s1",
                  type: "local_path",
                  hostId: "h1",
                  path: current,
                  isDefault: true,
                },
              ],
            },
          ] as never,
        sources: {
          update: async (args) => {
            if (failUpdate) throw new Error("Simulated source update failure");
            current = args.path!;
            return {} as never;
          },
        },
      },
      environments: {
        list: async () =>
          [
            {
              id: "env1",
              projectId: "p1",
              hostId: "h1",
              path: path.join(root, "work"),
              status: "ready",
            },
          ] as never,
      },
      threads: {
        list: async (args) =>
          !args.archived && active
            ? [
                makeThreadResponse({
                  id: "t1",
                  projectId: "p1",
                  status: "active",
                }),
              ]
            : [],
      },
      hosts: {
        list: async () =>
          [{ id: "h1", name: "Mac", status: "connected" }] as never,
        pathsExist: async (args) => ({
          existence: Object.fromEntries(
            await Promise.all(
              args.paths.map(async (p) => [
                p,
                await lstat(p).then(
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
    h,
    base,
    root,
    dest: path.join(base, "relocated"),
    fail: (v: boolean) => {
      failUpdate = v;
    },
    active: (v: boolean) => {
      active = v;
    },
    close: async () => {
      await h.harness.lifecycle.dispose();
      await rm(base, { recursive: true, force: true });
    },
  };
}
it("moves files including dotfiles, rebases sections, and preserves old environment bindings", async () => {
  const f = await setup();
  try {
    const section = (await f.h.harness.behavior.callRpc("create", {
      projectId: "p1",
      folderId: null,
      name: "Work",
      relativePath: "work",
    })) as { id: string };
    await writeFile(path.join(f.root, "work/AGENTS.md"), "Rules");
    await writeFile(path.join(f.root, ".hidden"), "secret demo");
    await f.h.harness.behavior.callRpc("project_move", {
      projectId: "p1",
      hostId: "h1",
      destination: f.dest,
    });
    expect((await lstat(f.root)).isSymbolicLink()).toBe(true);
    expect(await readFile(path.join(f.dest, ".hidden"), "utf8")).toBe(
      "secret demo",
    );
    expect(await readFile(path.join(f.root, "work/AGENTS.md"), "utf8")).toBe(
      "Rules",
    );
    const tree = (await f.h.harness.behavior.callRpc("list")) as {
      folders: { path: string }[];
      bindings: Record<string, string>;
    };
    expect(tree.folders[0].path).toBe(path.join(f.dest, "work"));
    expect(tree.bindings.env1).toBe(section.id);
    const second = path.join(f.base, "again");
    await f.h.harness.behavior.callRpc("project_move", {
      projectId: "p1",
      hostId: "h1",
      destination: second,
    });
    expect(await readFile(path.join(f.root, "work/AGENTS.md"), "utf8")).toBe(
      "Rules",
    );
    const again = (await f.h.harness.behavior.callRpc("list")) as typeof tree;
    expect(again.bindings.env1).toBe(section.id);
    expect(again.folders[0].path).toBe(path.join(second, "work"));
  } finally {
    await f.close();
  }
});
it("retries a metadata failure without moving files twice", async () => {
  const f = await setup();
  try {
    await f.h.harness.behavior.callRpc("create", {
      projectId: "p1",
      folderId: null,
      name: "Work",
      relativePath: "work",
    });
    f.fail(true);
    await expect(
      f.h.harness.behavior.callRpc("project_move", {
        projectId: "p1",
        hostId: "h1",
        destination: f.dest,
      }),
    ).rejects.toThrow("Simulated");
    expect(
      ((await f.h.harness.behavior.callRpc("pending_moves")) as unknown[])
        .length,
    ).toBe(1);
    f.fail(false);
    await f.h.harness.behavior.callRpc("project_move", {
      projectId: "p1",
      hostId: "h1",
      destination: f.dest,
    });
    expect(await f.h.harness.behavior.callRpc("pending_moves")).toEqual([]);
  } finally {
    await f.close();
  }
});
it("rejects active work and occupied destinations without a persisted barrier", async () => {
  const f = await setup();
  try {
    f.active(true);
    await expect(
      f.h.harness.behavior.callRpc("project_move", {
        projectId: "p1",
        hostId: "h1",
        destination: f.dest,
      }),
    ).rejects.toThrow("Work is still going on");
    expect(await f.h.harness.behavior.callRpc("pending_moves")).toEqual([]);
    f.active(false);
    await mkdir(f.dest);
    await writeFile(path.join(f.dest, "keep"), "keep");
    await expect(
      moveDirectory({ source: f.root, destination: f.dest }),
    ).rejects.toThrow("already exists");
    expect(await readFile(path.join(f.dest, "keep"), "utf8")).toBe("keep");
  } finally {
    await f.close();
  }
});
it("rebases archives and restores their files at the new project location", async () => {
  const f = await setup();
  try {
    const section = (await f.h.harness.behavior.callRpc("create", {
      projectId: "p1",
      folderId: null,
      name: "Work",
      relativePath: "work",
    })) as { id: string };
    await writeFile(path.join(f.root, "work/AGENTS.md"), "Archived rules");
    const archive = (await f.h.harness.behavior.callRpc("archive", {
      folderId: section.id,
    })) as { id: string };
    await f.h.harness.behavior.callRpc("project_move", {
      projectId: "p1",
      hostId: "h1",
      destination: f.dest,
    });
    const result = (await f.h.harness.behavior.callRpc("archive_list")) as {
      archives: { archivePath: string; folder: { path: string } }[];
    };
    expect(result.archives[0].archivePath.startsWith(f.dest + "/")).toBe(true);
    expect(result.archives[0].folder.path).toBe(path.join(f.dest, "work"));
    await f.h.harness.behavior.callRpc("restore", { id: archive.id });
    expect(await readFile(path.join(f.dest, "work/AGENTS.md"), "utf8")).toBe(
      "Archived rules",
    );
  } finally {
    await f.close();
  }
});

it("rejects the filesystem root and home directory", async () => {
  const home = await realpath(os.homedir());
  await expect(
    inspectMove({ source: "/", destination: "/some-new-folder" }),
  ).rejects.toThrow("nested one inside the other");
  await expect(
    inspectMove({
      source: home,
      destination: path.join(path.dirname(home), "bb-home-move-test"),
    }),
  ).rejects.toThrow("home folder");
});
