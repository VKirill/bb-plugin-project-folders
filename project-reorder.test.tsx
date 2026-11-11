// @vitest-environment jsdom
import { beforeAll, afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { installTestMatchMedia, setCompactViewport } from "./test-match-media";
let app: Awaited<ReturnType<typeof loadPluginApp>>;
beforeAll(async () => {
  installTestMatchMedia();
  app = await loadPluginApp(() => import("./app"));
});
afterEach(() => {
  setCompactViewport(false);
  cleanup();
});

const a = {
  id: "A",
  projectId: "A",
  hostId: "h1",
  parentId: null,
  path: "/a",
  name: "Alpha",
};
const c = { ...a, id: "C", projectId: "C", path: "/c", name: "Gamma" };
const b1 = {
  id: "B",
  projectId: "B",
  hostId: "h1",
  parentId: null,
  path: "/b",
  name: "Beta",
};
const b2 = { ...b1, hostId: "h2", path: "/srv/b" };

function setup(roots: (typeof a)[]) {
  const calls: { kind: string; ids: string[] }[] = [];
  const rpc = {
    list: () => ({
      folders: [],
      roots,
      bindings: {},
      errors: [],
      machines: [
        { id: "h1", name: "M1", connected: true },
        { id: "h2", name: "M2", connected: true },
      ],
    }),
    archive_list: () => ({ archives: [] }),
    reorder: (input: { kind: string; ids: string[] }) => {
      calls.push(input);
      return { ok: true };
    },
  };
  return {
    view: renderSlot(app.navPanels[0]!, { subPath: "" }, { rpc }),
    calls,
  };
}

const rowOf = (view: { baseElement: HTMLElement }, name: string) =>
  [...view.baseElement.querySelectorAll(".pf-side .pf-side-row")].find(
    (r) => r.textContent?.includes(name),
  ) as HTMLElement;

// jsdom drag events carry no clientY, so every drop lands "below" the target row.
function dropBelow(view: { baseElement: HTMLElement }, from: string, to: string) {
  const dt = {
    setData() {},
    getData() {
      return "";
    },
    effectAllowed: "",
    dropEffect: "",
  };
  fireEvent.dragStart(rowOf(view, from), { dataTransfer: dt });
  fireEvent.dragOver(rowOf(view, to), { dataTransfer: dt });
  fireEvent.drop(rowOf(view, to), { dataTransfer: dt });
}

it("reorders single-host projects on drop", async () => {
  const { view, calls } = setup([c, a]);
  await view.findAllByText("Alpha");
  dropBelow(view, "Gamma", "Alpha");
  await waitFor(() =>
    expect(calls).toEqual([{ kind: "projects", ids: ["A", "C"] }]),
  );
  view.lifecycle.unmount();
});

it("reorders when the drop target has copies on two hosts", async () => {
  const { view, calls } = setup([a, b1, b2]);
  await view.findAllByText("Beta");
  dropBelow(view, "Alpha", "Beta");
  await waitFor(() =>
    expect(calls).toEqual([{ kind: "projects", ids: ["B", "A"] }]),
  );
  view.lifecycle.unmount();
});

it("reorders a project that has copies on two hosts", async () => {
  const { view, calls } = setup([b1, b2, a]);
  await view.findAllByText("Beta");
  dropBelow(view, "Beta", "Alpha");
  await waitFor(() =>
    expect(calls).toEqual([{ kind: "projects", ids: ["A", "B"] }]),
  );
  view.lifecycle.unmount();
});

it("moves a two-host project up from the row menu", async () => {
  const { view, calls } = setup([a, b1, b2]);
  await view.findAllByText("Beta");
  const more = within(rowOf(view, "Beta")).getByRole("button", {
    name: "Actions: Beta",
  });
  fireEvent.pointerDown(more, {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  const item = await view.findByRole("menuitem", { name: "Move up" });
  expect(item.getAttribute("aria-disabled")).not.toBe("true");
  expect(item.hasAttribute("data-disabled")).toBe(false);
  fireEvent.click(item);
  await waitFor(() =>
    expect(calls).toEqual([{ kind: "projects", ids: ["B", "A"] }]),
  );
  view.lifecycle.unmount();
});
