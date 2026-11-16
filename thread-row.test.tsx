// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { defaultPrefs } from "./preferences";
import { installTestMatchMedia } from "./test-match-media";
const state = vi.hoisted(() => ({ display: "classic", limit: 10 }));
vi.mock("./prefs-store", () => ({
  usePrefs: () => ({
    prefs: {
      ...defaultPrefs,
      chatList: {
        ...defaultPrefs.chatList,
        limit: state.limit,
        threadDisplay: state.display,
      },
    },
    items: {},
    loaded: true,
    savePrefs: vi.fn(),
    saveItem: vi.fn(),
  }),
}));
afterEach(cleanup);
it("keeps classic rows by default and shows provider/status when enabled in EN and RU", async () => {
  installTestMatchMedia();
  const app = await loadPluginApp(() => import("./app"));
  const thread: PluginSidebarThread = {
    id: "t1",
    projectId: "p1",
    title: "Unread chat",
    titleFallback: null,
    parentThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "codex",
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: true,
    isPinned: false,
    isArchived: false,
    environment: {
      id: "e1",
      name: null,
      branchName: null,
      providerId: null,
      workspaceDisplayKind: null,
    },
    host: { id: "h1", name: "Mini" },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastReadAt: Date.now(),
    latestAttentionAt: Date.now(),
  };

  const root = {
    id: "p1",
    projectId: "p1",
    hostId: "h1",
    parentId: null,
    path: "/work",
    name: "Project",
  };
  const mount = () =>
    renderSlot(
      app.threadLists[0]!,
      { activeThreadId: null, onNavigate() {} },
      {
        sidebarThreads: { threads: [thread], projects: [] },
        rpc: {
          list: () => ({
            roots: [root],
            folders: [],
            bindings: {},
            errors: [],
            machines: [{ id: "h1", name: "Mini", connected: true }],
          }),
        },
      },
    );
  let view = mount();
  await view.findByText("Unread chat");
  expect(view.baseElement.querySelector(".pf-provider")).toBeNull();
  expect(view.baseElement.querySelector(".pf-thread-state")).toBeNull();
  view.lifecycle.unmount();
  state.display = "provider-status";
  view = mount();
  await view.findByText("Unread chat");
  expect(
    view.baseElement.querySelector(
      '[data-provider-id="codex"][aria-label="codex"]',
    ),
  ).toBeTruthy();
  expect(view.baseElement.querySelector(".pf-thread-state")?.textContent).toBe(
    "Unread",
  );
  view.lifecycle.unmount();
  document.documentElement.lang = "ru";
  view = mount();
  await view.findByText("Unread chat");
  expect(view.baseElement.querySelector(".pf-thread-state")?.textContent).toBe(
    "Непрочитано",
  );
  view.lifecycle.unmount();
  document.documentElement.lang = "en";
});

it("keeps root, section and nested chat lists and Show all inside their own indented chat container", async () => {
  installTestMatchMedia();
  state.display = "classic";
  state.limit = 1;
  const app = await loadPluginApp(() => import("./app"));
  const thread: PluginSidebarThread = {
    id: "t1",
    projectId: "p1",
    title: "Unread chat",
    titleFallback: null,
    parentThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "codex",
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    isArchived: false,
    environment: {
      id: "e1",
      name: null,
      branchName: null,
      providerId: null,
      workspaceDisplayKind: null,
    },
    host: { id: "h1", name: "Mini" },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastReadAt: Date.now(),
    latestAttentionAt: Date.now(),
  };

  const root = {
    id: "p1",
    projectId: "p1",
    hostId: "h1",
    parentId: null,
    path: "/work",
    name: "Project",
  };
  const folders = [
    { ...root, id: "s1", name: "Section", path: "/work/section" },
    {
      ...root,
      id: "s2",
      name: "Nested",
      path: "/work/section/nested",
      parentId: "s1",
    },
  ];
  const threads = ["root", "section", "nested"].flatMap((place) =>
    [0, 1].map((i) => ({
      ...thread,
      id: `${place}-${i}`,
      title: `${place} chat ${i}`,
      environment: { ...thread.environment!, id: `e-${place}` },
    })),
  );
  const view = renderSlot(
    app.threadLists[0]!,
    { activeThreadId: null, onNavigate() {} },
    {
      sidebarThreads: { threads, projects: [] },
      rpc: {
        list: () => ({
          roots: [root],
          folders,
          bindings: { "e-section": "s1", "e-nested": "s2" },
          errors: [],
          machines: [{ id: "h1", name: "Mini", connected: true }],
        }),
      },
    },
  );
  await view.findByText("Nested");
  const containers = [
    ...view.baseElement.querySelectorAll<HTMLElement>(".pf-children"),
  ];
  expect(containers).toHaveLength(3);
  for (const children of containers) {
    expect(children.style.marginInlineStart).toBe("12px");
    expect(children.style.paddingInlineStart).toBe("8px");
    const chats = children.querySelector<HTMLElement>(":scope > .pf-chats")!;
    expect(chats.style.marginInlineStart).toBe("19px");
    expect(chats.querySelectorAll(":scope > .pf-thread")).toHaveLength(1);
    expect(chats.querySelector(":scope > .pf-show-more")).toBeTruthy();
    expect(chats.querySelector(".pf-folder")).toBeNull();
  }
  view.lifecycle.unmount();
  state.limit = 10;
});
