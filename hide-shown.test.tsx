// @vitest-environment jsdom
import { beforeAll, afterEach, expect, it } from "vitest";
import { fireEvent, cleanup } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { installTestMatchMedia } from "./test-match-media";
import { defaultPrefs } from "./preferences";

let app: Awaited<ReturnType<typeof loadPluginApp>>;
beforeAll(async () => {
  installTestMatchMedia();
  app = await loadPluginApp(() => import("./app"));
});
afterEach(() => { cleanup(); localStorage.clear(); });

it("shows hidden projects dimmed with «Show in the tree» while «Show hidden» is on", async () => {
  const prefs = { ...defaultPrefs, view: { ...defaultPrefs.view, showHidden: true } };
  const roots = [
    { id: "p1", projectId: "p1", hostId: "h1", parentId: null, path: "/work", name: "Working project" },
    { id: "p2", projectId: "p2", hostId: "h1", parentId: null, path: "/sandbox", name: "LP sandbox rules" },
  ];
  const view = renderSlot(app.threadLists[0]!, { activeThreadId: null, onNavigate() {} }, {
    sidebarThreads: { threads: [], projects: [] },
    rpc: {
      list: () => ({ folders: [], roots, bindings: {}, errors: [] }),
      prefs_get: () => ({ prefs, items: { "p:p2": { hidden: true } }, stored: true }),
    },
  });
  const hidden = await view.findByText("LP sandbox rules");
  expect(hidden.closest(".pf-hidden")).not.toBeNull();
  expect(view.getByText("Working project").closest(".pf-hidden")).toBeNull();
  fireEvent.contextMenu(hidden);
  expect(await view.findByRole("menuitem", { name: /Show in the tree/ })).toBeTruthy();
  view.lifecycle.unmount();
});
