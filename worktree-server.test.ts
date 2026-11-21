import { expect, it, vi } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";

type Listed = {
  bindings: Record<string, string>;
};

function setup(origins: (paths: string[]) => { path: string; main: string | null }[] | Promise<never>) {
  const asked: string[][] = [];
  const h = createFakePluginHost({
    pluginId: "project-folders",
    agentSkillIds: ["project-folders"],
    experimental_hostEntry: true,
    experimental_callHostRpc: async (call) => {
      if (call.method === "worktree_origins") {
        const paths = (call.input as { paths: string[] }).paths;
        asked.push(paths);
        return { origins: await origins(paths) };
      }
      return { remotes: [] };
    },
    sdk: {
      projects: {
        list: async () =>
          [
            {
              id: "p1",
              name: "BB",
              sources: [
                { type: "local_path", hostId: "h1", path: "/srv/bb", isDefault: true },
              ],
            },
          ] as never,
      },
      hosts: {
        list: async () => [{ id: "h1", name: "OVH", status: "connected" }] as never,
      },
      environments: { list: async () => [] },
      files: {
        read: async () => {
          throw new Error("ENOENT");
        },
        write: async () => ({ outcome: "written", sha256: "sha", sizeBytes: 1 }),
        mkdir: async () => ({}) as never,
      },
    },
  });
  return { h, asked };
}

const env = (id: string, path: string, isWorktree = true, phase = "active") => ({
  id,
  projectId: "p1",
  hostId: "h1",
  path,
  isWorktree,
  lifecycle: { phase, retireAt: null, teardown: null },
});

it("files a chat that moved into a worktree under the section of its main checkout", async () => {
  const { h, asked } = setup((paths) =>
    paths.map((p) => ({
      path: p,
      main: p.startsWith("/srv/bb/lane-pilot-feature")
        ? "/srv/bb/lane-pilot"
        : p === "/srv/bb-feature-root"
          ? "/srv/bb"
          : null,
    })),
  );
  try {
    await plugin(h.bb);
    const call = h.harness.behavior.callRpc;
    const lane = (await call("create", {
      projectId: "p1",
      folderId: null,
      name: "lane-pilot",
      relativePath: "lane-pilot",
    })) as { id: string; path: string };
    expect(lane.path).toBe("/srv/bb/lane-pilot");
    h.harness.inspection.sdk.stub("environments.list", async () => [
      env("e-section", "/srv/bb/lane-pilot", false),
      env("e-wt", "/srv/bb/lane-pilot-feature-graph"),
      env("e-root-wt", "/srv/bb-feature-root"),
      env("e-other", "/tmp/elsewhere"),
      env("e-gone", "/srv/bb/lane-pilot-feature-old", true, "destroyed"),
    ]);
    await vi.waitFor(async () => {
      const listed = (await call("list", null)) as Listed;
      expect(listed.bindings["e-wt"]).toBe(lane.id);
    });
    const listed = (await call("list", null)) as Listed;
    expect(listed.bindings["e-section"]).toBe(lane.id);
    // A worktree of the project's own checkout stays at the root.
    expect(listed.bindings["e-root-wt"]).toBeUndefined();
    expect(listed.bindings["e-other"]).toBeUndefined();
    // Destroyed and non-worktree environments are never read on the device.
    const everAsked = asked.flat();
    expect(everAsked).not.toContain("/srv/bb/lane-pilot-feature-old");
    expect(everAsked).not.toContain("/srv/bb/lane-pilot");
    // Known main checkouts are not asked again.
    const before = asked.length;
    await call("list", null);
    await call("list", null);
    expect(asked.flat().filter((p) => p === "/srv/bb/lane-pilot-feature-graph")).toHaveLength(1);
    expect(asked.length).toBeGreaterThanOrEqual(before);
  } finally {
    await h.harness.lifecycle.dispose();
  }
});

it("keeps the old placement when the device cannot answer", async () => {
  const { h, asked } = setup(() => Promise.reject(new Error("unknown method")));
  try {
    await plugin(h.bb);
    const call = h.harness.behavior.callRpc;
    await call("create", {
      projectId: "p1",
      folderId: null,
      name: "lane-pilot",
      relativePath: "lane-pilot",
    });
    h.harness.inspection.sdk.stub("environments.list", async () => [
      env("e-wt", "/srv/bb/lane-pilot-feature-graph"),
    ]);
    await call("list", null);
    await vi.waitFor(() => expect(asked.length).toBe(1));
    const listed = (await call("list", null)) as Listed;
    expect(listed.bindings["e-wt"]).toBeUndefined();
    // Failed reads back off instead of asking on every list.
    await call("list", null);
    expect(asked.length).toBe(1);
  } finally {
    await h.harness.lifecycle.dispose();
  }
});
