// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import { defaultPrefs } from "./preferences";
import { ProjectDialog } from "./app";
import { PluginSettings, SettingsPane } from "./plugin-settings";

const state = vi.hoisted(() => ({
  folder: "",
  loaded: true,
  call: vi.fn(),
  savePrefs: vi.fn(),
}));
const rpc = { call: state.call };
vi.mock("@get-bb/plugin-sdk/app", async (original) => ({
  ...(await original<typeof import("@get-bb/plugin-sdk/app")>()),
  definePluginApp: (initialize: unknown) => initialize,
  useRpc: () => rpc,
}));
vi.mock("./prefs-store", () => ({
  usePrefs: () => ({
    prefs: { ...defaultPrefs, projects: { startingFolder: state.folder } },
    loaded: state.loaded,
    items: {},
    saveItem: vi.fn(),
    savePrefs: state.savePrefs,
  }),
}));

const machines = [
  { id: "h1", name: "Desktop", connected: true },
  { id: "h2", name: "Server", connected: true },
];
const listing = (path: string) => ({ path, parent: "/", directories: [] });
const props = () => ({ open: true, onClose: vi.fn(), onCreated: vi.fn() });
beforeEach(() => {
  state.folder = "";
  state.loaded = true;
  state.call.mockReset().mockImplementation(async (method, input) => {
    if (method === "machines") return { machines };
    if (method === "project_browse")
      return listing(
        input.path ?? (input.hostId === "h1" ? "/home/me" : "/home/server"),
      );
    if (method === "session_policy_capability") return { available: false };
    if (method === "project_create") return { id: "created" };
    throw new Error(`Unexpected RPC: ${method}`);
  });
  state.savePrefs.mockReset().mockImplementation(async (prefs) => {
    state.folder = prefs.projects.startingFolder;
  });
});
afterEach(cleanup);

it("waits for preferences, suggests a child path and starts the browser at the configured folder", async () => {
  state.folder = "/work/projects";
  state.loaded = false;
  const options = props();
  const view = render(<ProjectDialog {...options} />);
  await view.findByText("Desktop");
  expect(
    state.call.mock.calls.some(([method]) => method === "project_browse"),
  ).toBe(false);
  state.loaded = true;
  view.rerender(<ProjectDialog {...options} />);
  await view.findByDisplayValue("/work/projects/");
  fireEvent.change(view.getByRole("textbox", { name: "Project name" }), {
    target: { value: "my-app" },
  });
  expect(view.getByDisplayValue("/work/projects/my-app")).toBeTruthy();
  expect(state.call).toHaveBeenCalledWith("project_browse", {
    hostId: "h1",
    path: "/work/projects",
  });
  fireEvent.click(view.getByRole("button", { name: "Choose folder" }));
  await view.findByText("/work/projects");
  fireEvent.click(view.getByRole("button", { name: "Choose folder" }));
  fireEvent.click(view.getByRole("button", { name: "Create project" }));
  await waitFor(() =>
    expect(state.call).toHaveBeenCalledWith("project_create", {
      hostId: "h1",
      name: "my-app",
      path: "/work/projects",
    }),
  );
});

it("preserves a manually entered folder when preferences change and uses the new default on reopening", async () => {
  state.folder = "/work/projects";
  const options = props();
  const view = render(<ProjectDialog {...options} />);
  await view.findByDisplayValue("/work/projects/");
  fireEvent.change(view.getByRole("textbox", { name: "Project name" }), {
    target: { value: "my-app" },
  });
  fireEvent.change(view.getByRole("textbox", { name: "Project folder" }), {
    target: { value: "/custom/app" },
  });
  state.folder = "/other/projects";
  view.rerender(<ProjectDialog {...options} />);
  expect(view.getByDisplayValue("/custom/app")).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Create project" }));
  await waitFor(() => expect(options.onCreated).toHaveBeenCalled());
  expect(state.call).toHaveBeenCalledWith("project_create", {
    hostId: "h1",
    name: "my-app",
    path: "/custom/app",
  });
  view.rerender(<ProjectDialog {...options} open={false} />);
  view.rerender(<ProjectDialog {...options} />);
  await view.findByDisplayValue("/other/projects/");
});

it("uses the selected device's home folder when the setting is blank", async () => {
  const view = render(<ProjectDialog {...props()} defaultHostId="h2" />);
  await view.findByDisplayValue("/home/server/");
  expect(state.call).toHaveBeenCalledWith("project_browse", { hostId: "h2" });
  expect(view.queryByRole("status")).toBeNull();
});

it("resets an explicit folder when switching devices and reads the latest starting folder", async () => {
  state.folder = "/work/projects";
  const options = props();
  const view = render(<ProjectDialog {...options} />);
  await view.findByDisplayValue("/work/projects/");
  fireEvent.change(view.getByRole("textbox", { name: "Project name" }), {
    target: { value: "my-app" },
  });
  fireEvent.change(view.getByRole("textbox", { name: "Project folder" }), {
    target: { value: "/custom/app" },
  });
  state.folder = "/new/projects";
  view.rerender(<ProjectDialog {...options} />);
  fireEvent.pointerDown(view.getByRole("button", { name: "Device" }), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  fireEvent.click(await view.findByRole("menuitem", { name: "Server" }));
  await view.findByDisplayValue("/new/projects/my-app");
  expect(state.call).toHaveBeenCalledWith("project_browse", {
    hostId: "h2",
    path: "/new/projects",
  });
});

it("warns and falls back on the same device when the configured directory is unavailable", async () => {
  state.folder = "/missing";
  state.call.mockImplementation(async (method, input) => {
    if (method === "machines") return { machines };
    if (input.path) throw new Error("ENOENT");
    return listing("/home/server");
  });
  const view = render(<ProjectDialog {...props()} defaultHostId="h2" />);
  await view.findByDisplayValue("/home/server/");
  expect(view.getByRole("status").textContent).toContain(
    "The starting folder is unavailable",
  );
  expect(view.getByRole("status").textContent).toContain("/missing");
  expect(
    state.call.mock.calls
      .filter(([method]) => method === "project_browse")
      .map(([, input]) => input),
  ).toEqual([{ hostId: "h2", path: "/missing" }, { hostId: "h2" }]);
});

it("keeps connection failures visible and prevents creation when home browsing also fails", async () => {
  state.folder = "/work";
  state.call.mockImplementation(async (method) => {
    if (method === "machines") return { machines };
    throw new Error("The device is offline.");
  });
  const view = render(<ProjectDialog {...props()} />);
  expect((await view.findByRole("alert")).textContent).toContain("offline");
  expect(
    (view.getByRole("button", { name: "Create project" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(view.queryByRole("status")).toBeNull();
});

it("ignores a late response after the dialog closes and reopens on another device", async () => {
  state.folder = "/work";
  let resolveOld!: (value: ReturnType<typeof listing>) => void;
  state.call.mockImplementation(async (method, input) => {
    if (method === "machines") return { machines };
    if (input.hostId === "h1")
      return new Promise((resolve) => {
        resolveOld = resolve;
      });
    return listing("/server/projects");
  });
  const options = props();
  const view = render(<ProjectDialog {...options} defaultHostId="h1" />);
  await waitFor(() => expect(resolveOld).toBeDefined());
  view.rerender(<ProjectDialog {...options} open={false} />);
  view.rerender(<ProjectDialog {...options} defaultHostId="h2" />);
  await view.findByDisplayValue("/server/projects/");
  await act(async () => resolveOld(listing("/old/projects")));
  expect(view.getByDisplayValue("/server/projects/")).toBeTruthy();
  expect(view.queryByDisplayValue("/old/projects/")).toBeNull();
});

it("shares the Projects setting between the settings rail and pane and trims saves", async () => {
  const view = render(<PluginSettings archive={null} />);
  fireEvent.click(view.getByRole("button", { name: "Projects" }));
  const input = view.getByRole("textbox", {
    name: "New project starting folder",
  });
  fireEvent.change(input, { target: { value: "  /work/My projects  " } });
  fireEvent.blur(input);
  await waitFor(() =>
    expect(state.savePrefs).toHaveBeenCalledWith({
      ...defaultPrefs,
      projects: { startingFolder: "/work/My projects" },
    }),
  );
  view.unmount();
  const pane = render(<SettingsPane section="projects" archive={null} />);
  expect(pane.getByDisplayValue("/work/My projects")).toBeTruthy();
  fireEvent.change(pane.getByRole("textbox"), { target: { value: " " } });
  fireEvent.blur(pane.getByRole("textbox"));
  await waitFor(() => expect(state.folder).toBe(""));
});

it("shows validation and save errors without saving an invalid folder", async () => {
  const view = render(<SettingsPane section="projects" archive={null} />);
  const input = view.getByRole("textbox", {
    name: "New project starting folder",
  });
  fireEvent.change(input, { target: { value: "relative/path" } });
  fireEvent.blur(input);
  expect(view.getByRole("alert").textContent).toContain("absolute path");
  expect(state.savePrefs).not.toHaveBeenCalled();
  state.savePrefs.mockRejectedValue(new Error("Save failed"));
  fireEvent.change(input, { target: { value: "/work" } });
  fireEvent.blur(input);
  await waitFor(() =>
    expect(view.getByRole("alert").textContent).toContain("Save failed"),
  );
});
