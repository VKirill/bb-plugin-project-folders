// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeAll, afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { defaultPrefs } from "./preferences";
import { installTestMatchMedia, setCompactViewport } from "./test-match-media";

const state = vi.hoisted(() => ({
  display: "classic" as "classic" | "provider-status",
}));
vi.mock("./prefs-store", () => ({
  usePrefs: () => ({
    prefs: {
      ...defaultPrefs,
      chatList: {
        ...defaultPrefs.chatList,
        threadDisplay: state.display,
      },
    },
    items: {},
    loaded: true,
    savePrefs: vi.fn(),
    saveItem: vi.fn(),
  }),
}));

let app: Awaited<ReturnType<typeof loadPluginApp>>;
beforeAll(async () => {
  installTestMatchMedia();
  app = await loadPluginApp(() => import("./app"));
});
afterEach(() => {
  vi.useRealTimers();
  setCompactViewport(false);
  cleanup();
  localStorage.clear();
  document.documentElement.lang = "";
  delete (window.navigator as { language?: string }).language;
});

const thread = (overrides: Partial<PluginSidebarThread> = {}): PluginSidebarThread => ({
  id: "t1",
  projectId: "p1",
  title: "Example chat",
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
  ...overrides,
});

const root = {
  id: "p1",
  projectId: "p1",
  hostId: "h1",
  parentId: null,
  path: "/work",
  name: "Project",
};

function mountTree(
  threads: PluginSidebarThread[],
  activeThreadId: string | null = null,
  folders: Array<typeof root> = [],
  bindings: Record<string, string> = {},
) {
  return renderSlot(
    app.threadLists[0]!,
    { activeThreadId, onNavigate() {} },
    {
      sidebarThreads: { threads, projects: [] },
      rpc: {
        list: () => ({
          roots: [root],
          folders,
          bindings,
          errors: [],
          machines: [{ id: "h1", name: "Mini", connected: true }],
        }),
      },
    },
  );
}

const touchAt = (x: number, y: number) => [{ clientX: x, clientY: y }];
const openCalls = (view: ReturnType<typeof renderSlot>) =>
  view.inspection.sidebarActionCalls.filter((c) => c.method === "open");

it("renders no status element for an inactive thread on compact and desktop", async () => {
  state.display = "provider-status";
  const desktop = mountTree([thread()]);
  await desktop.findByText("Example chat");
  expect(desktop.baseElement.querySelector(".pf-thread-state")).toBeNull();
  expect(desktop.baseElement.querySelector(".pf-thread-state-dot")).toBeNull();
  desktop.lifecycle.unmount();

  setCompactViewport(true);
  const compact = mountTree([thread()]);
  await compact.findByText("Example chat");
  expect(compact.baseElement.querySelector(".pf-thread-state")).toBeNull();
  expect(compact.baseElement.querySelector(".pf-thread-state-dot")).toBeNull();
  compact.lifecycle.unmount();
});

it("shows a working thread as one provider dot on compact and a text pill on desktop", async () => {
  state.display = "provider-status";
  setCompactViewport(true);
  const compact = mountTree([thread({ indicator: "runtime" })]);
  await compact.findByText("Example chat");
  const dots = compact.baseElement.querySelectorAll(
    ".pf-provider > .pf-thread-state-dot.pf-state-working",
  );
  expect(dots).toHaveLength(1);
  expect(dots[0].getAttribute("role")).toBe("img");
  expect(dots[0].getAttribute("aria-label")).toBe("Working");
  expect(compact.baseElement.querySelector(".pf-thread-state")).toBeNull();
  compact.lifecycle.unmount();

  setCompactViewport(false);
  const desktop = mountTree([thread({ indicator: "runtime" })]);
  await desktop.findByText("Example chat");
  const pill = desktop.baseElement.querySelector(
    ".pf-thread-state.pf-state-working",
  );
  expect(pill?.textContent).toBe("Working");
  expect(
    desktop.baseElement.querySelector(".pf-provider > .pf-thread-state-dot"),
  ).toBeNull();
  desktop.lifecycle.unmount();
});

it("styles the status dot as an 8px circle with the surface ring", () => {
  const css = readFileSync("style.css", "utf8");
  const start = css.indexOf(".pf-thread-state-dot");
  expect(start).toBeGreaterThan(-1);
  const block = css.slice(start, css.indexOf("}", start));
  expect(block).toContain("width: 8px");
  expect(block).toContain("height: 8px");
  expect(block).toContain("border-radius: 50%");
  expect(block).toContain("border-width: 0");
  expect(block).toContain(
    "box-shadow: 0 0 0 2px var(--pk-surface, var(--sidebar, var(--background)))",
  );
});

it("renders the row menu trigger only on the active row on a phone", async () => {
  state.display = "classic";
  setCompactViewport(true);
  const compact = mountTree(
    [thread({ id: "t1", title: "Alpha chat" }), thread({ id: "t2", title: "Beta chat" })],
    "t1",
  );
  await compact.findByText("Beta chat");
  const triggers = compact.baseElement.querySelectorAll(
    'button[aria-label="Chat actions"]',
  );
  expect(triggers).toHaveLength(1);
  expect(triggers[0].closest(".pf-thread")!.className).toContain("pf-active");
  compact.lifecycle.unmount();

  setCompactViewport(false);
  const desktop = mountTree(
    [thread({ id: "t1", title: "Alpha chat" }), thread({ id: "t2", title: "Beta chat" })],
    "t1",
  );
  await desktop.findByText("Beta chat");
  expect(
    desktop.baseElement.querySelectorAll('button[aria-label="Chat actions"]'),
  ).toHaveLength(2);
  desktop.lifecycle.unmount();
});

it("opens the row menu by a 450 ms hold, not at 449 ms, and never opens the chat", async () => {
  state.display = "classic";
  setCompactViewport(true);
  const view = mountTree([thread({ id: "t2", title: "Beta chat" })], "t1");
  const link = (await view.findByText("Beta chat")).closest("a")!;
  vi.useFakeTimers();
  fireEvent.touchStart(link, { touches: touchAt(10, 10) });
  act(() => {
    vi.advanceTimersByTime(449);
  });
  expect(view.queryByRole("menuitem")).toBeNull();
  expect(openCalls(view)).toHaveLength(0);
  act(() => {
    vi.advanceTimersByTime(1);
  });
  act(() => {
    vi.advanceTimersByTime(200);
  });
  expect(view.getAllByRole("menuitem").length).toBeGreaterThan(0);
  expect(openCalls(view)).toHaveLength(0);
  view.lifecycle.unmount();
});

it("cancels the hold when the finger moves more than 10px", async () => {
  state.display = "classic";
  setCompactViewport(true);
  const view = mountTree([thread({ id: "t2", title: "Beta chat" })], "t1");
  const link = (await view.findByText("Beta chat")).closest("a")!;
  vi.useFakeTimers();
  fireEvent.touchStart(link, { touches: touchAt(10, 10) });
  fireEvent.touchMove(link, { touches: touchAt(25, 10) });
  act(() => {
    vi.advanceTimersByTime(600);
  });
  expect(view.queryByRole("menuitem")).toBeNull();
  expect(openCalls(view)).toHaveLength(0);
  view.lifecycle.unmount();
});

it("swallows the tap after a fired hold; a tap after 700 ms opens the chat once", async () => {
  state.display = "classic";
  setCompactViewport(true);
  const view = mountTree([thread({ id: "t2", title: "Beta chat" })], "t1");
  const link = (await view.findByText("Beta chat")).closest("a")!;
  vi.useFakeTimers();
  fireEvent.touchStart(link, { touches: touchAt(10, 10) });
  act(() => {
    vi.advanceTimersByTime(450);
  });
  act(() => {
    vi.advanceTimersByTime(200);
  });
  expect(view.getAllByRole("menuitem").length).toBeGreaterThan(0);
  fireEvent.click(link);
  expect(openCalls(view)).toHaveLength(0);
  act(() => {
    vi.advanceTimersByTime(700);
  });
  fireEvent.click(link);
  const opens = openCalls(view);
  expect(opens).toHaveLength(1);
  expect(opens[0].threadId).toBe("t2");
  view.lifecycle.unmount();
});

it("re-arms the swallow window for 400 ms on touchend", async () => {
  state.display = "classic";
  setCompactViewport(true);
  const view = mountTree([thread({ id: "t2", title: "Beta chat" })], "t1");
  const link = (await view.findByText("Beta chat")).closest("a")!;
  vi.useFakeTimers();
  fireEvent.touchStart(link, { touches: touchAt(10, 10) });
  act(() => {
    vi.advanceTimersByTime(450);
  });
  fireEvent.touchEnd(link, { touches: [] });
  act(() => {
    vi.advanceTimersByTime(399);
  });
  fireEvent.click(link);
  expect(openCalls(view)).toHaveLength(0);
  act(() => {
    vi.advanceTimersByTime(1);
  });
  fireEvent.click(link);
  expect(openCalls(view)).toHaveLength(1);
  view.lifecycle.unmount();
});

it("clears the swallow flag on the next touchstart", async () => {
  state.display = "classic";
  setCompactViewport(true);
  const view = mountTree([thread({ id: "t2", title: "Beta chat" })], "t1");
  const link = (await view.findByText("Beta chat")).closest("a")!;
  vi.useFakeTimers();
  fireEvent.touchStart(link, { touches: touchAt(10, 10) });
  act(() => {
    vi.advanceTimersByTime(450);
  });
  fireEvent.touchStart(link, { touches: touchAt(10, 10) });
  fireEvent.click(link);
  expect(openCalls(view)).toHaveLength(1);
  view.lifecycle.unmount();
});

it("clears the hold and swallow timers on unmount", async () => {
  state.display = "classic";
  setCompactViewport(true);
  const view = mountTree([thread({ id: "t2", title: "Beta chat" })], "t1");
  const link = (await view.findByText("Beta chat")).closest("a")!;
  vi.useFakeTimers();
  const baseline = vi.getTimerCount();
  fireEvent.touchStart(link, { touches: touchAt(10, 10) });
  expect(vi.getTimerCount()).toBe(baseline + 1);
  view.lifecycle.unmount();
  cleanup();
  expect(vi.getTimerCount()).toBe(baseline);

  // A fired hold leaves the swallow timer pending; unmount clears it too.
  const fired = mountTree([thread({ id: "t2", title: "Beta chat" })], "t1");
  await act(async () => {});
  const firedLink = fired.getByText("Beta chat").closest("a")!;
  const firedBaseline = vi.getTimerCount();
  fireEvent.touchStart(firedLink, { touches: touchAt(10, 10) });
  act(() => {
    vi.advanceTimersByTime(450);
  });
  expect(vi.getTimerCount()).toBeGreaterThan(firedBaseline);
  fired.lifecycle.unmount();
  cleanup();
  expect(vi.getTimerCount()).toBe(firedBaseline);
});

it("collapses the child indent to an 8px level step on a phone", async () => {
  state.display = "classic";
  setCompactViewport(true);
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
  const threads = ["root", "section", "nested"].map((place, i) => ({
    ...thread({ id: `${place}-${i}`, title: `${place} chat` }),
    environment: { ...thread().environment!, id: `e-${place}` },
  }));
  const view = mountTree(threads, null, folders, {
    "e-section": "s1",
    "e-nested": "s2",
  });
  await view.findByText("Nested");
  const containers = [
    ...view.baseElement.querySelectorAll<HTMLElement>(".pf-children"),
  ];
  expect(containers.length).toBeGreaterThan(1);
  for (const children of containers) {
    expect(children.style.marginInlineStart).toBe("0px");
    expect(children.style.marginInlineEnd).toBe("0px");
    expect(children.style.paddingInlineStart).toBe("7px");
    expect(children.style.paddingInlineEnd).toBe("0px");
    expect(children.style.borderInlineStartWidth).toBe("1px");
    expect(children.style.borderInlineEndWidth).toBe("0px");
    const chats = children.querySelector<HTMLElement>(":scope > .pf-chats")!;
    expect(chats.style.marginInlineStart).toBe("0px");
  }
  view.lifecycle.unmount();
});

it("keeps an icon-only New project button first on a phone and the text label on desktop", async () => {
  state.display = "classic";
  setCompactViewport(true);
  const compact = mountTree([]);
  const compactButton = await compact.findByRole("button", {
    name: "New project",
  });
  const tree = compact.baseElement.querySelector(".pf-tree")!;
  expect(tree.firstElementChild).toBe(compactButton);
  expect(compactButton.textContent.trim()).toBe("");
  compact.lifecycle.unmount();

  document.documentElement.lang = "ru";
  const russian = mountTree([]);
  await russian.findByRole("button", { name: "Новый проект" });
  russian.lifecycle.unmount();

  document.documentElement.lang = "en";
  setCompactViewport(false);
  const desktop = mountTree([]);
  const desktopButton = await desktop.findByRole("button", {
    name: "New project",
  });
  expect(desktopButton.textContent).toContain("New project");
  expect(desktopButton.getAttribute("aria-label")).toBeNull();
  desktop.lifecycle.unmount();
});

it("speaks Russian from navigator.language when nothing is stored, English from a stored choice", async () => {
  state.display = "classic";
  document.documentElement.lang = "";
  Object.defineProperty(window.navigator, "language", {
    value: "ru-RU",
    configurable: true,
  });
  const russian = mountTree([]);
  await russian.findByRole("button", { name: "Новый проект" });
  russian.lifecycle.unmount();

  localStorage.setItem("project-folders:language", "en");
  const english = mountTree([]);
  const stored = await english.findByRole("button", { name: "New project" });
  expect(stored.textContent).toContain("New project");
  english.lifecycle.unmount();
});
