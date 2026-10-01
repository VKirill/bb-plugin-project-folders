// @vitest-environment jsdom
import { beforeAll, afterEach, expect, it } from "vitest";
import { fireEvent, waitFor, cleanup } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { installTestMatchMedia } from "./test-match-media";
import { defaultPrefs, parsePrefs } from "./preferences";

let app: Awaited<ReturnType<typeof loadPluginApp>>;
beforeAll(async () => {
  installTestMatchMedia();
  app = await loadPluginApp(() => import("./app"));
});
afterEach(() => { cleanup(); localStorage.clear(); });

const roots = [
  { id: "p1", projectId: "p1", hostId: "h1", parentId: null, path: "/work", name: "Working project" },
  { id: "p2", projectId: "p2", hostId: "h1", parentId: null, path: "/sandbox", name: "LP sandbox rules" },
];
const folders = [
  { id: "f1", projectId: "p1", hostId: "h1", parentId: null, path: "/work/Ads", name: "Ads" },
  { id: "f2", projectId: "p1", hostId: "h1", parentId: null, path: "/work/Code", name: "Code" },
];

it("old saved preferences keep working and do not show hidden items", () => {
  const { showHidden: _drop, ...oldView } = defaultPrefs.view;
  expect(parsePrefs({ ...defaultPrefs, view: oldView }).view.showHidden).toBe(false);
});

it("leaves hidden projects and sections out of the tree, hides from the menu, and shows them dimmed on request", async () => {
  const saved: Array<{ key: string; style: unknown }> = [];
  let prefs = structuredClone(defaultPrefs);
  const items: Record<string, unknown> = { "p:p2": { hidden: true }, "f:f1": { hidden: true } };
  const rpc = {
    list: () => ({ folders, roots, bindings: {}, errors: [] }),
    prefs_get: () => ({ prefs, items, stored: true }),
    prefs_save: (input: { prefs: typeof prefs }) => { prefs = input.prefs; return { ok: true }; },
    item_style_save: (input: { key: string; style: unknown }) => { saved.push(input); return { ok: true }; },
  };
  const view = renderSlot(app.threadLists[0]!, { activeThreadId: null, onNavigate() {} }, { sidebarThreads: { threads: [], projects: [] }, rpc });
  await view.findByText("Working project");
  await waitFor(() => expect(view.queryByText("LP sandbox rules")).toBeNull());
  expect(view.queryByText("Ads")).toBeNull();
  expect(view.getByText("Code")).toBeTruthy();

  fireEvent.contextMenu(view.getByText("Code"));
  fireEvent.click(await view.findByRole("menuitem", { name: /Hide from the tree/ }));
  await waitFor(() => expect(saved).toEqual([{ key: "f:f2", style: { hidden: true } }]));
  view.lifecycle.unmount();
});
