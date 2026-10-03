// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { installTestMatchMedia } from "./test-match-media";
import { chipEntries, placeLabel, rememberPick } from "./section-tree";

const root = {
  id: "p1",
  projectId: "p1",
  hostId: "h1",
  parentId: null,
  path: "/work",
  name: "Project",
};
const section = { ...root, id: "f1", path: "/work/Website", name: "Website" };
const nested = {
  ...root,
  id: "f2",
  parentId: "f1",
  path: "/work/Website/Design",
  name: "Design",
};
const group = { ...root, id: "g1", name: "Apps", kind: "group" as const };
const remote = {
  ...root,
  id: "f3",
  hostId: "h2",
  path: "/srv/project/Server",
  name: "Server",
};
const otherRoot = { ...root, hostId: "h2", path: "/srv/project" };
const tree = { folders: [section, nested, group, remote], roots: [root] };

const list = () => ({
  folders: [section, nested, group, remote],
  roots: [root, otherRoot],
  bindings: {},
  places: {},
  errors: [],
  machines: [
    { id: "h1", name: "Mac", connected: true },
    { id: "h2", name: "OVH", connected: true },
  ],
});

let app: Awaited<ReturnType<typeof loadPluginApp>>;
beforeAll(async () => {
  installTestMatchMedia();
  app = await loadPluginApp(() => import("./app"));
});

/** BB's own project chip, as the composer renders it. */
function nativeChip() {
  const button = document.createElement("button");
  button.setAttribute("data-promptbox-project-control", "");
  button.className = "native-project";
  button.textContent = "Project";
  document.body.append(button);
  return button;
}
afterEach(() => {
  cleanup();
  rememberPick(null);
  for (const el of Array.from(
    document.querySelectorAll("[data-promptbox-project-control]"),
  ))
    el.remove();
});

const chipSlot = () =>
  app.composerCustomizations
    .flatMap((c) => c.banners ?? [])
    .find((b) => b.id === "project-chip")!;
const actionSlot = () =>
  app.composerCustomizations
    .flatMap((c) => c.banners ?? [])
    .find((a) => a.id === "section-picker")!;

const sidebarProjects = [
  { id: "p1", name: "Project", isPersonal: false },
  { id: "p2", name: "Notes", isPersonal: false },
  { id: "personal", name: "Personal", isPersonal: true },
];

const renderChip = (projectId: string | null = "p1") =>
  renderSlot(
    { id: "chip", component: chipSlot().component },
    {},
    {
      composer: { scope: { kind: "new-thread", projectId } },
      sidebarThreads: { projects: sidebarProjects, status: "ready" },
      rpc: { list, section_pick: () => ({ ok: true }) },
    },
  );

const renderAction = (projectId: string | null = "p1") =>
  renderSlot(
    { id: "action", component: actionSlot().component },
    {},
    {
      composer: { scope: { kind: "new-thread", projectId } },
      sidebarThreads: { projects: sidebarProjects, status: "ready" },
      rpc: { list, section_pick: () => ({ ok: true }) },
    },
  );

const openChip = async (view: ReturnType<typeof renderChip>) => {
  const button = await waitFor(() =>
    view.getByRole("button", { name: "Projects & Sections" }),
  );
  // Radix opens a desktop menu on pointerdown, not on click.
  fireEvent.pointerDown(button, {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  return button;
};

describe("the tree behind BB's project chip", () => {
  it("lists a project once and keeps its sections under it, every device", () => {
    expect(
      chipEntries(tree).map((e) => [e.kind, e.folder.name, e.depth]),
    ).toEqual([
      ["project", "Project", 0],
      ["section", "Website", 1],
      ["section", "Design", 2],
      ["group", "Apps", 1],
      ["section", "Server", 1],
    ]);
  });
  it("keeps every project BB offers, in BB's order, with sections under them", () => {
    const entries = chipEntries(tree, [
      { id: "p0", name: "Notes", isPersonal: false },
      { id: "p1", name: "Project", isPersonal: false },
      { id: "personal", name: "Personal", isPersonal: true },
    ]);
    expect(
      entries.map((e) => [e.kind, e.projectId, e.folder?.name ?? null]),
    ).toEqual([
      // A project the plugin has no folder for is still a place to work.
      ["project", "p0", null],
      ["project", "p1", "Project"],
      ["section", "p1", "Website"],
      ["section", "p1", "Design"],
      ["group", "p1", "Apps"],
      ["section", "p1", "Server"],
      ["project", "personal", null],
    ]);
    expect(entries.at(-1)?.personal).toBe(true);
  });
  it("names the place the way the chip has to say it", () => {
    const entries = chipEntries(tree);
    expect(placeLabel(tree, entries[0])).toBe("Project");
    expect(placeLabel(tree, entries[2])).toBe("Project / Website / Design");
  });
});

describe("the chip in BB's own New thread composer", () => {
  it("takes BB's chip, offers the tree and gives the chip back", async () => {
    const native = nativeChip();
    const view = renderChip();
    await waitFor(() => expect(native.style.display).toBe("none"));
    await openChip(view);
    expect(
      (await view.findAllByRole("menuitem")).map((i) => i.textContent?.trim()),
    ).toEqual([
      "Project ✓",
      "Website",
      "Design",
      "Server",
      "Notes",
      "No project",
    ]);
    // A group holds sections and has no folder a chat could run in.
    expect(view.getByText("Apps").getAttribute("role")).not.toBe("menuitem");
    view.lifecycle.unmount();
    expect(native.style.display).toBe("");
    expect(document.querySelector(".pf-native-project-slot")).toBeNull();
  });
  it("starts the chat in the chosen section's folder and machine", async () => {
    nativeChip();
    const view = renderChip();
    await openChip(view);
    fireEvent.click(await view.findByRole("menuitem", { name: /Server/ }));
    await waitFor(() =>
      expect(
        view.inspection.rpcCalls.find((c) => c.method === "section_pick")
          ?.input,
      ).toEqual({ projectId: "p1", hostId: "h2", folderId: "f3" }),
    );
    await waitFor(() =>
      expect(view.inspection.composer.selections).toHaveLength(1),
    );
    expect(view.inspection.composer.selections[0]).toEqual({
      projectId: "p1",
      environment: {
        type: "provider",
        environmentProviderId: "section",
        machine: { type: "existing", hostId: "h2" },
        inputs: { folderId: "f3" },
      },
    });
    expect(
      view.getByRole("button", { name: "Projects & Sections" }).textContent,
    ).toContain("Project / Server");
    view.lifecycle.unmount();
  });
  it("starts a chat in the project root without asking for a section", async () => {
    nativeChip();
    const view = renderChip();
    await openChip(view);
    fireEvent.click(await view.findByRole("menuitem", { name: /^Project/ }));
    await waitFor(() =>
      expect(view.inspection.composer.selections).toHaveLength(1),
    );
    expect(view.inspection.composer.selections[0]).toEqual({
      projectId: "p1",
      environment: {
        type: "provider",
        environmentProviderId: "project-checkout",
        machine: { type: "existing", hostId: "h1" },
        inputs: { path: "/work" },
      },
    });
    expect(
      view.inspection.rpcCalls.some((c) => c.method === "section_pick"),
    ).toBe(false);
    view.lifecycle.unmount();
  });
  it("starts the chat in a managed worktree when the place pins one", async () => {
    nativeChip();
    const view = renderSlot(
      { id: "chip", component: chipSlot().component },
      {},
      {
        composer: { scope: { kind: "new-thread", projectId: "p1" } },
        sidebarThreads: { projects: sidebarProjects, status: "ready" },
        rpc: {
          list,
          section_pick: () => ({ ok: true }),
          execution_read: () => ({
            own: {},
            effective: {
              model: null,
              permissionMode: null,
              environment: {
                value: "worktree",
                origin: { scope: "project", folderId: null },
              },
              agent: null,
            },
            inherited: {
              model: null,
              permissionMode: null,
              environment: null,
              agent: null,
            },
            hostId: "h1",
            fallback: null,
            agents: {
              installed: false,
              supported: false,
              agents: [],
              error: null,
            },
          }),
        },
      },
    );
    await openChip(view);
    fireEvent.click(await view.findByRole("menuitem", { name: /^Project/ }));
    await waitFor(() =>
      expect(view.inspection.composer.selections).toHaveLength(1),
    );
    expect(view.inspection.composer.selections[0]).toEqual({
      projectId: "p1",
      environment: {
        type: "host",
        hostId: "h1",
        workspace: {
          type: "managed-worktree",
          baseBranch: { kind: "default" },
        },
      },
    });
    view.lifecycle.unmount();
  });
  it("starts the chat on the pinned machine and that host's folder path", async () => {
    nativeChip();
    const view = renderSlot(
      { id: "chip", component: chipSlot().component },
      {},
      {
        composer: { scope: { kind: "new-thread", projectId: "p1" } },
        sidebarThreads: { projects: sidebarProjects, status: "ready" },
        rpc: {
          list,
          section_pick: () => ({ ok: true }),
          execution_read: () => ({
            own: {},
            effective: {
              model: null,
              permissionMode: null,
              environment: null,
              machine: {
                hostId: "h2",
                origin: { scope: "project", folderId: null },
              },
              agent: null,
            },
            inherited: {
              model: null,
              permissionMode: null,
              environment: null,
              machine: null,
              agent: null,
            },
            hostId: "h1",
            hosts: [
              { id: "h1", name: "Mac" },
              { id: "h2", name: "OVH" },
            ],
            fallback: null,
            agents: {
              installed: false,
              supported: false,
              agents: [],
              error: null,
            },
          }),
        },
      },
    );
    await openChip(view);
    fireEvent.click(await view.findByRole("menuitem", { name: /^Project/ }));
    await waitFor(() =>
      expect(view.inspection.composer.selections).toHaveLength(1),
    );
    expect(view.inspection.composer.selections[0]).toEqual({
      projectId: "p1",
      environment: {
        type: "provider",
        environmentProviderId: "project-checkout",
        machine: { type: "existing", hostId: "h2" },
        inputs: { path: "/srv/project" },
      },
    });
    view.lifecycle.unmount();
  });
  it("still names the section after applying it remounted the composer", async () => {
    nativeChip();
    // No project yet: choosing a section is what sets one, and that is the
    // switch which remounts every plugin surface in the composer.
    const chip = renderChip(null);
    const action = renderAction(null);
    await openChip(chip);
    fireEvent.click(await chip.findByRole("menuitem", { name: /Design/ }));
    await waitFor(() =>
      expect(chip.inspection.composer.selections).toHaveLength(1),
    );
    chip.lifecycle.unmount();
    action.lifecycle.unmount();
    const back = renderChip("p1");
    const backAction = renderAction("p1");
    await waitFor(() =>
      expect(
        back.getByRole("button", { name: "Projects & Sections" }).textContent,
      ).toContain("Project / Website / Design"),
    );
    back.lifecycle.unmount();
    backAction.lifecycle.unmount();
  });
  it("follows a section picked in the composer's own action", async () => {
    nativeChip();
    const view = renderChip();
    await waitFor(() =>
      view.getByRole("button", { name: "Projects & Sections" }),
    );
    // The action lives in another React tree; the pick is what they share.
    act(() => rememberPick({ projectId: "p1", hostId: "h1", folderId: "f2" }));
    await waitFor(() =>
      expect(
        view.getByRole("button", { name: "Projects & Sections" }).textContent,
      ).toContain("Project / Website / Design"),
    );
    view.lifecycle.unmount();
  });
  it("hands a project it has no folder for to BB untouched", async () => {
    nativeChip();
    const view = renderChip();
    await openChip(view);
    fireEvent.click(await view.findByRole("menuitem", { name: /No project/ }));
    await waitFor(() =>
      expect(view.inspection.composer.selections).toHaveLength(1),
    );
    expect(view.inspection.composer.selections[0]).toEqual({
      projectId: "personal",
    });
    view.lifecycle.unmount();
  });
  it("leaves the action row alone while it owns the chip", async () => {
    nativeChip();
    const chip = renderChip();
    await waitFor(() =>
      chip.getByRole("button", { name: "Projects & Sections" }),
    );
    const action = renderSlot(
      { id: "action", component: actionSlot().component },
      {},
      {
        composer: { scope: { kind: "new-thread", projectId: "p1" } },
        rpc: { list, section_pick: () => ({ ok: true }) },
      },
    );
    await waitFor(() =>
      expect(
        action.queryByRole("button", { name: "Project section" }),
      ).toBeNull(),
    );
    // Without the chip — BB changed its composer, say — the action is back.
    chip.lifecycle.unmount();
    await waitFor(() =>
      expect(
        action.queryByRole("button", { name: "Project section" }),
      ).not.toBeNull(),
    );
    action.lifecycle.unmount();
  });
  it("leaves BB's chip alone when there is none to take", async () => {
    const view = renderChip();
    await waitFor(() =>
      expect(view.inspection.rpcCalls.length).toBeGreaterThan(0),
    );
    expect(
      view.queryByRole("button", { name: "Projects & Sections" }),
    ).toBeNull();
    view.lifecycle.unmount();
  });
});
