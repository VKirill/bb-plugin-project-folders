// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { defaultPrefs } from "./preferences";
import { installTestMatchMedia } from "./test-match-media";

const state = vi.hoisted(() => ({
  limit: 10,
  freshLists: false,
  hideId: null as string | null,
  display: "classic",
}));
// A live host hands out a new array of new thread objects on every update; the
// harness keeps one fixed list. `freshLists` makes the hook behave like the host.
vi.mock("@get-bb/plugin-sdk/app", async (importOriginal) => {
  const sdk = await importOriginal<typeof import("@get-bb/plugin-sdk/app")>();
  return {
    ...sdk,
    experimental_useSidebarThreads: () => {
      const live = sdk.experimental_useSidebarThreads();
      const threads = state.hideId
        ? live.threads.filter((t) => t.id !== state.hideId)
        : live.threads;
      return state.freshLists
        ? { ...live, threads: threads.map((t) => ({ ...t })) }
        : { ...live, threads };
    },
  };
});
vi.mock("./prefs-store", () => ({
  usePrefs: () => ({
    prefs: {
      ...defaultPrefs,
      chatList: {
        ...defaultPrefs.chatList,
        limit: state.limit,
        sort: "title",
        threadDisplay: state.display,
      },
    },
    items: {},
    loaded: true,
    savePrefs: vi.fn(),
    saveItem: vi.fn(),
  }),
}));
const KEY = "project-folders:collapsed-chats";
// The first import of app.tsx takes a few seconds on a busy machine; do it
// here so the first test is not charged for it.
beforeAll(async () => {
  installTestMatchMedia();
  await loadPluginApp(() => import("./app"));
}, 60_000);
beforeEach(() => {
  installTestMatchMedia();
  localStorage.clear();
  state.limit = 10;
  state.display = "classic";
  state.hideId = null;
});
afterEach(cleanup);

const base: PluginSidebarThread = {
  id: "",
  projectId: "p1",
  title: null,
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
const chat = (
  id: string,
  parent: string | null = null,
  extra: Partial<PluginSidebarThread> = {},
): PluginSidebarThread => ({
  ...base,
  id,
  title: id,
  parentThreadId: parent,
  ...extra,
});
const root = {
  id: "p1",
  projectId: "p1",
  hostId: "h1",
  parentId: null,
  path: "/work",
  name: "Project",
};
const listing = (extra = {}) => ({
  roots: [root],
  folders: [],
  bindings: {},
  errors: [],
  machines: [{ id: "h1", name: "Mini", connected: true }],
  ...extra,
});

async function mount(
  threads: PluginSidebarThread[],
  { active = null, list = listing() }: { active?: string | null; list?: object } = {},
) {
  const app = await loadPluginApp(() => import("./app"));
  const props = { activeThreadId: active, onNavigate() {} };
  const view = renderSlot(app.threadLists[0]!, props, {
    sidebarThreads: { threads, projects: [] },
    rpc: { list: () => list } as never,
  });
  return { view, app, props };
}
const titles = (view: { baseElement: HTMLElement }) =>
  [...view.baseElement.querySelectorAll(".pf-thread-title")].map(
    (n) => n.textContent,
  );
const toggle = (view: { baseElement: HTMLElement }, name: string) =>
  view.baseElement.querySelector<HTMLButtonElement>(
    `button.pf-branch-toggle[aria-label$=": ${name}"]`,
  )!;
// The mockup's tree: a (a1 (a1x), a2 (a2x)), b (b1), c.
const family = (extra: Record<string, Partial<PluginSidebarThread>> = {}) =>
  [
    chat("a"),
    chat("a1", "a"),
    chat("a1x", "a1"),
    chat("a2", "a"),
    chat("a2x", "a2"),
    chat("b"),
    chat("b1", "b"),
    chat("c"),
  ].map((t) => ({ ...t, ...extra[t.id] }));

it("draws children under their parents, each chat once, with a labelled toggle only on branches", async () => {
  const { view } = await mount(family());
  await view.findByText("a2x");
  expect(titles(view)).toEqual(["a", "a1", "a1x", "a2", "a2x", "b", "b1", "c"]);
  const a = toggle(view, "a");
  expect(a.tagName).toBe("BUTTON");
  expect(a.getAttribute("type")).toBe("button");
  expect(a.getAttribute("aria-expanded")).toBe("true");
  expect(a.getAttribute("aria-label")).toBe("Collapse branch: a");
  expect(a.tabIndex).toBe(0);
  const branch = a.closest(".pf-thread")!.nextElementSibling!;
  expect(branch.classList.contains("pf-branch")).toBe(true);
  expect(
    [...branch.querySelectorAll(":scope > .pf-thread .pf-thread-title")].map(
      (n) => n.textContent,
    ),
  ).toEqual(["a1", "a2"]);
  expect(branch.querySelector(":scope > .pf-branch")).toBeTruthy();
  // Leaves keep an inert spacer so every row of a nested group lines up.
  const c = view.getByText("c").closest(".pf-thread")!;
  expect(c.querySelector("button.pf-branch-toggle")).toBeNull();
  expect(
    c.querySelector(".pf-branch-toggle")!.getAttribute("aria-hidden"),
  ).toBe("true");
});

it("keeps a flat group exactly as before: no toggle column, no branch container", async () => {
  const { view } = await mount([chat("x"), chat("y")]);
  await view.findByText("x");
  expect(view.baseElement.querySelector(".pf-branch-toggle")).toBeNull();
  expect(view.baseElement.querySelector(".pf-branch")).toBeNull();
});

it("collapses a branch with a real click, summarises what it hides, and expands it again", async () => {
  const { view } = await mount(
    family({
      a1: { isUnread: true },
      a1x: { indicator: "runtime", status: "active" } as never,
    }),
  );
  await view.findByText("a2x");
  fireEvent.click(toggle(view, "a"));
  expect(titles(view)).toEqual(["a", "b", "b1", "c"]);
  const a = toggle(view, "a");
  expect(a.getAttribute("aria-expanded")).toBe("false");
  expect(a.getAttribute("aria-label")).toBe("Expand branch: a");
  const row = a.closest(".pf-thread")!;
  // 2 children + 2 grandchildren.
  expect(row.querySelector(".pf-branch-count")!.textContent).toBe("4");
  expect(row.querySelector(".pf-branch-count")!.getAttribute("aria-label")).toBe(
    "Nested chats in total: 4",
  );
  // Every sign comes as words and as a named marker; the row's width picks one.
  const sign = (name: string) =>
    row.querySelector(`.pf-branch-sign.${name}`)!.textContent;
  expect(sign("pf-state-unread")).toBe("Has unread chats");
  expect(sign("pf-state-working")).toBe("Work in progress");
  const marker = (name: string) =>
    row.querySelector(`.pf-branch-flag.${name}`)!;
  expect(marker("pf-state-unread").getAttribute("role")).toBe("img");
  expect(marker("pf-state-unread").getAttribute("aria-label")).toBe(
    "Has unread chats",
  );
  expect(marker("pf-state-unread").getAttribute("title")).toBe(
    "Has unread chats",
  );
  expect(marker("pf-state-working").getAttribute("aria-label")).toBe(
    "Work in progress",
  );
  expect(marker("pf-state-unread").textContent).toBe("");
  expect(row.querySelector("a")!.classList.contains("pf-branch-link")).toBe(
    true,
  );
  expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(["a"]);
  // An open branch shows no summary, and a quiet one only the count.
  const b = toggle(view, "b").closest(".pf-thread")!;
  expect(b.querySelector(".pf-branch-count")).toBeNull();
  fireEvent.click(toggle(view, "b"));
  const quiet = toggle(view, "b").closest(".pf-thread")!;
  expect(quiet.querySelector(".pf-branch-count")!.textContent).toBe("1");
  expect(quiet.querySelector(".pf-branch-flag")).toBeNull();
  fireEvent.click(toggle(view, "a"));
  expect(titles(view)).toEqual(["a", "a1", "a1x", "a2", "a2x", "b", "c"]);
  expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(["b"]);
  expect(view.inspection.sidebarActionCalls).toEqual([]);
});

it("marks only a folded branch's link for the width switch, and only for what it hides", async () => {
  const { view } = await mount(family({ a1: { isUnread: true } }));
  await view.findByText("a2x");
  expect(view.baseElement.querySelector(".pf-branch-link")).toBeNull();
  fireEvent.click(toggle(view, "a"));
  const row = toggle(view, "a").closest(".pf-thread")!;
  expect(view.baseElement.querySelectorAll(".pf-branch-link")).toHaveLength(1);
  expect(row.querySelector(".pf-branch-sign.pf-state-working")).toBeNull();
  expect(row.querySelector(".pf-branch-flag.pf-state-working")).toBeNull();
  expect(row.querySelector(".pf-branch-sign.pf-state-unread")).toBeTruthy();
});

it("opens exactly the chat whose title is clicked, never the branch parent", async () => {
  const { view } = await mount(family());
  await view.findByText("a1x");
  fireEvent.click(view.getByText("a1x"));
  fireEvent.click(view.getByText("a"));
  expect(
    view.inspection.sidebarActionCalls.map((c) => [c.method, c.threadId]),
  ).toEqual([
    ["open", "a1x"],
    ["open", "a"],
  ]);
  // A collapsed parent's own title still opens that parent.
  fireEvent.click(toggle(view, "b"));
  fireEvent.click(view.getByText("b"));
  expect(view.inspection.sidebarActionCalls.at(-1)).toMatchObject({
    method: "open",
    threadId: "b",
  });
});

it("restores folded branches from localStorage", async () => {
  localStorage.setItem(KEY, JSON.stringify(["a1"]));
  const { view } = await mount(family());
  await view.findByText("a2x");
  expect(titles(view)).toEqual(["a", "a1", "a2", "a2x", "b", "b1", "c"]);
  expect(toggle(view, "a1").getAttribute("aria-expanded")).toBe("false");
});

it("survives corrupt saved fold state", async () => {
  localStorage.setItem(KEY, "{not json");
  const { view } = await mount(family());
  await view.findByText("a2x");
  expect(titles(view)).toHaveLength(8);
});

it("unfolds the branches above a chat opened from outside, once, and lets a later manual fold stand", async () => {
  localStorage.setItem(KEY, JSON.stringify(["a", "a1", "b"]));
  const { view, app, props } = await mount(family(), { active: "a1x" });
  await view.findByText("a1x");
  expect(titles(view)).toEqual(["a", "a1", "a1x", "a2", "a2x", "b", "c"]);
  // Branches that are not above the open chat keep their fold.
  expect(toggle(view, "b").getAttribute("aria-expanded")).toBe("false");
  expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(["b"]);
  fireEvent.click(toggle(view, "a1"));
  expect(titles(view)).not.toContain("a1x");
  // Re-render with the same open chat: the fold must not be undone.
  const Slot = app.threadLists[0]!.component;
  view.lifecycle.rerender(<Slot {...props} />);
  fireEvent.click(toggle(view, "a2"));
  expect(titles(view)).not.toContain("a2x");
  expect(titles(view)).not.toContain("a1x");
  expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(["b", "a1", "a2"]);
});

it("keeps a fold made by hand when the sidebar list is replaced by a new one, as a live host does on every update", async () => {
  state.freshLists = true;
  try {
    const { view, app, props } = await mount(family(), { active: "a1x" });
    await view.findByText("a1x");
    fireEvent.click(toggle(view, "a"));
    expect(titles(view)).toEqual(["a", "b", "b1", "c"]);
    const Slot = app.threadLists[0]!.component;
    view.lifecycle.rerender(<Slot {...props} />);
    fireEvent.click(toggle(view, "b"));
    view.lifecycle.rerender(<Slot {...props} />);
    expect(titles(view)).toEqual(["a", "b", "c"]);
    expect(toggle(view, "a").getAttribute("aria-expanded")).toBe("false");
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(["a", "b"]);
  } finally {
    state.freshLists = false;
  }
});

async function reopenAfter(away: string | null, extra: PluginSidebarThread[] = []) {
  localStorage.setItem(KEY, JSON.stringify(["a1"]));
  const { view, app, props } = await mount([...family(), ...extra], {
    active: "a1x",
  });
  await view.findByText("a1x");
  fireEvent.click(toggle(view, "a1"));
  expect(titles(view)).not.toContain("a1x");
  const Slot = app.threadLists[0]!.component;
  view.lifecycle.rerender(<Slot {...props} activeThreadId={away} />);
  view.lifecycle.rerender(<Slot {...props} activeThreadId="a1x" />);
  return view;
}

it("unfolds again when the same chat is opened again after no chat was open", async () => {
  const view = await reopenAfter(null);
  expect(titles(view)).toContain("a1x");
  expect(toggle(view, "a1").getAttribute("aria-expanded")).toBe("true");
});

it("unfolds again when the same chat is opened again after a chat that no tree draws", async () => {
  const view = await reopenAfter("gone", [chat("gone", null, { isArchived: true })]);
  expect(titles(view)).toContain("a1x");
});

it("keeps a hand fold when the same open chat is missing from the list for a moment", async () => {
  const { view, app, props } = await mount(family(), { active: "a1x" });
  await view.findByText("a1x");
  fireEvent.click(toggle(view, "a1"));
  expect(titles(view)).not.toContain("a1x");
  const Slot = app.threadLists[0]!.component;
  state.hideId = "a1x";
  view.lifecycle.rerender(<Slot {...props} />);
  state.hideId = null;
  view.lifecycle.rerender(<Slot {...props} />);
  expect(titles(view)).not.toContain("a1x");
  expect(toggle(view, "a1").getAttribute("aria-expanded")).toBe("false");
});

async function foldThenHide(hide: string, fold: string) {
  const { view, app, props } = await mount(family(), { active: "a1x" });
  await view.findByText("a1x");
  fireEvent.click(toggle(view, fold));
  const Slot = app.threadLists[0]!.component;
  state.hideId = hide;
  view.lifecycle.rerender(<Slot {...props} />);
  state.hideId = null;
  view.lifecycle.rerender(<Slot {...props} />);
  return view;
}

it("keeps a hand fold of the parent when that parent is missing from the list for a moment and the open child is the same", async () => {
  const view = await foldThenHide("a1", "a1");
  expect(titles(view)).not.toContain("a1x");
  expect(toggle(view, "a1").getAttribute("aria-expanded")).toBe("false");
});

it("keeps a hand fold of the grandparent when the middle parent is missing for a moment and the open child is the same", async () => {
  const view = await foldThenHide("a1", "a");
  expect(titles(view)).toEqual(["a", "b", "b1", "c"]);
  expect(toggle(view, "a").getAttribute("aria-expanded")).toBe("false");
});

it("counts the row's own status pill, so a folded branch keeps room for its title", async () => {
  state.display = "provider-status";
  const { view } = await mount(family({ a: { isUnread: true } }));
  await view.findByText("a2x");
  fireEvent.click(toggle(view, "a"));
  const link = (name: string) =>
    toggle(view, name).closest(".pf-thread")!.querySelector("a")!;
  expect(link("a").getAttribute("data-extras")).toBe("1");
  expect(link("b").getAttribute("data-extras")).toBeNull();
});

it("counts no extras on a classic row", async () => {
  const { view } = await mount(family({ a: { isUnread: true } }));
  await view.findByText("a2x");
  fireEvent.click(toggle(view, "a"));
  expect(
    toggle(view, "a").closest(".pf-thread")!.querySelector("a")!.getAttribute("data-extras"),
  ).toBe("0");
});

it("leaves folds outside the opened chat's own group alone: a child filed in another section is a root there", async () => {
  const folders = [
    { ...root, id: "s1", name: "First", path: "/work/first" },
    { ...root, id: "s2", name: "Second", path: "/work/second" },
  ];
  const env = (id: string) => ({ environment: { ...base.environment!, id } });
  localStorage.setItem(KEY, JSON.stringify(["parent"]));
  const { view } = await mount(
    [
      chat("parent", null, env("e-1")),
      chat("same", "parent", env("e-1")),
      chat("away", "parent", env("e-2")),
    ],
    {
      active: "away",
      list: listing({ folders, bindings: { "e-1": "s1", "e-2": "s2" } }),
    },
  );
  await view.findByText("away");
  expect(titles(view)).toEqual(["parent", "away"]);
  expect(toggle(view, "parent").getAttribute("aria-expanded")).toBe("false");
  expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(["parent"]);
});

it("leaves the fold of a parent behind an archived middle parent alone, since the child is a root", async () => {
  localStorage.setItem(KEY, JSON.stringify(["grand"]));
  const { view } = await mount(
    [
      chat("grand"),
      chat("other", "grand"),
      chat("old", "grand", { isArchived: true }),
      chat("kid", "old"),
    ],
    { active: "kid" },
  );
  await view.findByText("kid");
  expect(titles(view)).toEqual(["grand", "kid"]);
  expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(["grand"]);
});

it("still unfolds a real chain of parents when the open chat sits in a nested section", async () => {
  const folders = [{ ...root, id: "s1", name: "First", path: "/work/first" }];
  const env = { environment: { ...base.environment!, id: "e-1" } };
  localStorage.setItem(KEY, JSON.stringify(["top", "mid", "stay"]));
  const { view } = await mount(
    [
      chat("top", null, env),
      chat("mid", "top", env),
      chat("leaf", "mid", env),
      chat("stay", null, env),
      chat("stay1", "stay", env),
    ],
    {
      active: "leaf",
      list: listing({ folders, bindings: { "e-1": "s1" } }),
    },
  );
  await view.findByText("leaf");
  expect(titles(view)).toEqual(["stay", "top", "mid", "leaf"]);
  expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(["stay"]);
});

it("shows no Show all button when every top-level chat is already visible, however many chats the branches hold", async () => {
  state.limit = 3;
  const { view } = await mount(family());
  await view.findByText("a2x");
  expect(titles(view)).toHaveLength(8);
  expect(view.queryByRole("button", { name: /Show all/ })).toBeNull();
  expect(view.baseElement.querySelector(".pf-show-more")).toBeNull();
});

it("applies the limit to roots: a root with an unread grandchild stays past it, an unread root does not", async () => {
  state.limit = 1;
  const threads = [
    chat("a"),
    chat("b", null, { isUnread: true }),
    chat("c"),
    chat("c1", "c"),
    chat("c1x", "c1", { isUnread: true }),
    chat("d"),
    chat("d1", "d"),
  ];
  const { view } = await mount(threads);
  await view.findByText("a");
  expect(titles(view)).toEqual(["a", "c", "c1", "c1x"]);
  fireEvent.click(view.getByRole("button", { name: /Show all \(7\)/ }));
  expect(titles(view)).toEqual(["a", "b", "c", "c1", "c1x", "d", "d1"]);
});

it("keeps the open chat's root on screen when the limit would cut it", async () => {
  state.limit = 1;
  const threads = [chat("a"), chat("b"), chat("b1", "b")];
  const { view } = await mount(threads, { active: "b1" });
  await view.findByText("a");
  expect(titles(view)).toEqual(["a", "b", "b1"]);
});

it("shows both chats of a parent cycle once and does not loop", async () => {
  const { view } = await mount([
    chat("a", "b"),
    chat("b", "a"),
    chat("self", "self"),
  ]);
  await view.findByText("a");
  expect(titles(view)).toEqual(["a", "b", "self"]);
});

it("treats an archived parent as gone: its active child is reachable as a root", async () => {
  const { view } = await mount([
    chat("old", null, { isArchived: true }),
    chat("kid", "old"),
    chat("grandkid", "kid"),
  ]);
  await view.findByText("kid");
  expect(titles(view)).toEqual(["kid", "grandkid"]);
  expect(titles(view)).not.toContain("old");
});

it("builds the tree inside each section: a child filed elsewhere is a root of its own section", async () => {
  const folders = [
    { ...root, id: "s1", name: "First", path: "/work/first" },
    { ...root, id: "s2", name: "Second", path: "/work/second" },
  ];
  const threads = [
    chat("parent", null, { environment: { ...base.environment!, id: "e-1" } }),
    chat("same", "parent", { environment: { ...base.environment!, id: "e-1" } }),
    chat("away", "parent", { environment: { ...base.environment!, id: "e-2" } }),
  ];
  const { view } = await mount(threads, {
    list: listing({ folders, bindings: { "e-1": "s1", "e-2": "s2" } }),
  });
  await view.findByText("away");
  const sections = [...view.baseElement.querySelectorAll(".pf-folder")];
  const inSection = (name: string) =>
    sections
      .find((s) => s.querySelector(".pf-label")?.textContent?.includes(name))!
      .querySelectorAll(".pf-thread-title");
  expect([...inSection("First")].map((n) => n.textContent)).toEqual([
    "parent",
    "same",
  ]);
  expect([...inSection("Second")].map((n) => n.textContent)).toEqual(["away"]);
  expect(
    inSection("Second")[0]!.closest(".pf-thread")!.querySelector("button.pf-branch-toggle"),
  ).toBeNull();
});

it("drags only the chosen chat; the branch is neither moved nor reparented", async () => {
  const { view } = await mount(family());
  await view.findByText("a1");
  const setData = vi.fn();
  const row = toggle(view, "a1").closest(".pf-thread")!;
  expect(row.getAttribute("draggable")).toBe("true");
  fireEvent.dragStart(row, { dataTransfer: { setData, effectAllowed: "" } });
  expect(setData).toHaveBeenCalledTimes(1);
  expect(setData).toHaveBeenCalledWith(
    "application/x-bb-project-folders-thread",
    "a1",
  );
  expect(view.inspection.rpcCalls.map((c) => c.method)).not.toContain(
    "thread_place",
  );
});

it("opens the chat menu from a nested row", async () => {
  const { view } = await mount(family());
  await view.findByText("a1");
  const row = toggle(view, "a1").closest(".pf-thread")!;
  fireEvent.contextMenu(row);
  await waitFor(() => view.getByRole("menuitem", { name: /Rename/ }));
  expect(view.getAllByRole("menuitem").length).toBeGreaterThan(3);
});
