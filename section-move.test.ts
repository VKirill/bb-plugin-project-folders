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
import { inspectMove, moveDirectory, linkDirectory } from "./move-files";
import plugin from "./server";

async function setup() {
  const base = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "bb-section-move-test-")),
  );
  const root = path.join(base, "project");
  await mkdir(root);
  let active = false;
  const h = createFakePluginHost({
    pluginId: "project-folders",
    agentSkillIds: ["project-folders"],
    experimental_hostEntry: true,
    experimental_callHostRpc: async (call) =>
      call.method === "inspect"
        ? inspectMove(call.input as never)
        : call.method === "link"
          ? linkDirectory(call.input as never)
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
                  path: root,
                  isDefault: true,
                },
              ],
            },
          ] as never,
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
                  environmentId: "env1",
                }),
              ]
            : [],
        stop: async () => ({}) as never,
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
  const createSection = async (name: string, relativePath: string) =>
    (await h.harness.behavior.callRpc("create", {
      projectId: "p1",
      folderId: null,
      name,
      relativePath,
    })) as { id: string };
  return {
    h,
    base,
    root,
    createSection,
    active: (v: boolean) => {
      active = v;
    },
    close: async () => {
      await h.harness.lifecycle.dispose();
      await rm(base, { recursive: true, force: true });
    },
  };
}

it("moves a section, rebases nested sections and keeps old chat paths working", async () => {
  const f = await setup();
  try {
    const section = await f.createSection("Work", "work");
    await writeFile(path.join(f.root, "work/AGENTS.md"), "Rules");
    await writeFile(path.join(f.root, "work/.secret"), "dotfile");
    const nested = await f.h.harness.behavior.callRpc("create", {
      projectId: "p1",
      folderId: section.id,
      name: "Nested",
      relativePath: "nested",
    });
    expect(nested).toBeTruthy();
    const destination = path.join(f.root, "moved-work");
    await f.h.harness.behavior.callRpc("section_move", {
      folderId: section.id,
      destination,
    });
    expect((await lstat(path.join(f.root, "work"))).isSymbolicLink()).toBe(
      true,
    );
    expect(await readFile(path.join(destination, ".secret"), "utf8")).toBe(
      "dotfile",
    );
    const tree = (await f.h.harness.behavior.callRpc("list")) as {
      folders: { id: string; path: string }[];
      bindings: Record<string, string>;
    };
    const byId = new Map(tree.folders.map((x) => [x.id, x.path]));
    expect(byId.get(section.id)).toBe(destination);
    expect(byId.get((nested as { id: string }).id)).toBe(
      path.join(destination, "nested"),
    );
    // The chat environment still recorded the old path; it resolves through
    // the completed move to the new section record.
    expect(tree.bindings.env1).toBe(section.id);
    expect(
      ((await f.h.harness.behavior.callRpc("pending_section_moves")) as unknown[])
        .length,
    ).toBe(0);
  } finally {
    await f.close();
  }
});

it("re-links a section whose folder was renamed outside BB", async () => {
  const f = await setup();
  try {
    const section = await f.createSection("Work", "work");
    await writeFile(path.join(f.root, "work/AGENTS.md"), "Rules");
    const real = path.join(f.root, "renamed");
    await rename(path.join(f.root, "work"), real);
    await f.h.harness.behavior.callRpc("section_move", {
      folderId: section.id,
      destination: real,
    });
    expect((await lstat(path.join(f.root, "work"))).isSymbolicLink()).toBe(
      true,
    );
    expect(await readFile(path.join(real, "AGENTS.md"), "utf8")).toBe("Rules");
    const tree = (await f.h.harness.behavior.callRpc("list")) as {
      folders: { id: string; path: string }[];
      bindings: Record<string, string>;
    };
    expect(tree.folders[0].path).toBe(real);
    expect(tree.bindings.env1).toBe(section.id);
  } finally {
    await f.close();
  }
});

it("rejects running chats without persisting a barrier", async () => {
  const f = await setup();
  try {
    const section = await f.createSection("Work", "work");
    f.active(true);
    await expect(
      f.h.harness.behavior.callRpc("section_move", {
        folderId: section.id,
        destination: path.join(f.root, "moved"),
      }),
    ).rejects.toThrow("running chats");
    expect(
      ((await f.h.harness.behavior.callRpc(
        "pending_section_moves",
      )) as unknown[]).length,
    ).toBe(0);
  } finally {
    await f.close();
  }
});

it("refuses occupied destinations and paths outside the project", async () => {
  const f = await setup();
  try {
    const section = await f.createSection("Work", "work");
    const occupied = path.join(f.root, "occupied");
    await mkdir(occupied);
    await writeFile(path.join(occupied, "keep"), "keep");
    await expect(
      f.h.harness.behavior.callRpc("section_move", {
        folderId: section.id,
        destination: occupied,
      }),
    ).rejects.toThrow("already exists");
    await expect(
      f.h.harness.behavior.callRpc("section_move", {
        folderId: section.id,
        destination: path.join(f.base, "outside"),
      }),
    ).rejects.toThrow("Keep the section inside its project folder");
    const other = await f.createSection("Other", "other");
    const tree = (await f.h.harness.behavior.callRpc("list")) as {
      folders: { id: string; path: string }[];
    };
    const otherPath = tree.folders.find((x) => x.id === other.id)!.path;
    await f.h.harness.behavior.callRpc("section_move", {
      folderId: section.id,
      destination: otherPath,
    });
    const after = (await f.h.harness.behavior.callRpc("list")) as {
      folders: { id: string; path: string }[];
    };
    expect(after.folders.find((x) => x.id === section.id)?.path).toBe(otherPath);
    expect(after.folders.find((x) => x.id === other.id)?.path).toBe(otherPath);
    expect(await readFile(path.join(occupied, "keep"), "utf8")).toBe("keep");
  } finally {
    await f.close();
  }
});

it("closes a failed move once the section already points at its destination", async () => {
  const f = await setup();
  try {
    const section = await f.createSection("Work", "x/work");
    const real = path.join(f.root, "work");
    await rename(path.join(f.root, "x/work"), real);
    await rm(path.join(f.root, "x"), { recursive: true });
    // The compatibility link cannot be made: its parent folder is gone.
    await expect(
      f.h.harness.behavior.callRpc("section_move", {
        folderId: section.id,
        destination: real,
      }),
    ).rejects.toThrow();
    await f.h.harness.behavior.callRpc("section_path_set", {
      folderId: section.id,
      hostId: "h1",
      path: real,
    });
    const pending = () =>
      f.h.harness.behavior.callRpc("pending_section_moves") as Promise<
        unknown[]
      >;
    expect((await pending()).length).toBe(1);
    await f.h.harness.behavior.callRpc("section_move", {
      folderId: section.id,
      destination: real,
    });
    expect((await pending()).length).toBe(0);
  } finally {
    await f.close();
  }
});
