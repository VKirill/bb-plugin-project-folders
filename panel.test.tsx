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

const root = {
  id: "p1",
  projectId: "p1",
  hostId: "h1",
  parentId: null,
  path: "/work",
  name: "Project",
};
const section = { ...root, id: "f1", path: "/work/Section", name: "Section" };
const rpc = {
  list: () => ({
    folders: [section],
    roots: [root],
    bindings: {},
    errors: [],
    machines: [{ id: "h1", name: "Mac Mini", connected: true }],
  }),
  archive_list: () => ({ archives: [] }),
};

it("renders the management page as a sidebar tree with a settings pane", async () => {
  const view = renderSlot(app.navPanels[0]!, { subPath: "" }, { rpc });
  await view.findByText("Project");
  expect(view.baseElement.querySelector(".pf-layout")).toBeTruthy();
  expect(view.baseElement.querySelector(".pf-side .pf-side-row")).toBeTruthy();
  expect(view.baseElement.textContent).toContain("Settings");
  view.lifecycle.unmount();
});

it("shows the selected section details with allowed actions", async () => {
  const view = renderSlot(app.navPanels[0]!, { subPath: "" }, { rpc });
  await view.findByText("Project");
  view.getByText("Section").click();
  await view.findByDisplayValue("/work/Section");
  expect(view.baseElement.textContent).toContain("New section");
  expect(view.baseElement.textContent).toContain("Rules");
  expect(view.baseElement.textContent).toContain("Delete");
  view.lifecycle.unmount();
});

it("switches the section card between rules, provider and session blocks", async () => {
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "" },
    {
      rpc: {
        ...rpc,
        session_policy_capability: () => ({ available: true }),
      },
    },
  );
  await view.findByText("Project");
  view.getByText("Section").click();
  await view.findByDisplayValue("/work/Section");
  const nav = view.getByRole("tablist", { name: "Place settings" });
  expect(within(nav).getByRole("tab", { name: "Rules" })).toBeTruthy();
  expect(within(nav).getByRole("tab", { name: "Provider" })).toBeTruthy();
  await view.findByRole("heading", { name: /AGENTS.md rules/ });
  fireEvent.click(within(nav).getByRole("tab", { name: "Provider" }));
  await view.findByRole("heading", { name: /Provider, model and agent/ });
  expect(
    view.queryByRole("heading", { name: /AGENTS.md rules/ }),
  ).toBeNull();
  view.lifecycle.unmount();
});

it("shows one project entry even when the project has copies on several devices", async () => {
  const copy = { ...root, hostId: "h2", path: "/srv/project" };
  const copySection = {
    ...copy,
    id: "f2",
    path: "/srv/project/Server",
    name: "Server",
  };
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "" },
    {
      rpc: {
        ...rpc,
        list: () => ({
          folders: [section, copySection],
          roots: [root, copy],
          bindings: {},
          errors: [],
          machines: [
            { id: "h1", name: "Mac Mini", connected: true },
            { id: "h2", name: "OVH", connected: true },
          ],
        }),
      },
    },
  );
  await view.findAllByText("Project");
  expect(
    view.baseElement.querySelectorAll(".pf-side .pf-side-project"),
  ).toHaveLength(1);
  // Sections of every device stay visible under the single project entry.
  expect(view.baseElement.textContent).toContain("Section");
  expect(view.baseElement.textContent).toContain("Server");
  view.lifecycle.unmount();
});

it("opens the working copies dialog from the root details", async () => {
  const copy = { ...root, hostId: "h2", path: "/srv/project" };
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "" },
    {
      rpc: {
        ...rpc,
        list: () => ({
          folders: [],
          roots: [root, copy],
          bindings: {},
          errors: [],
          machines: [
            { id: "h1", name: "Mac Mini", connected: true },
            { id: "h2", name: "OVH", connected: true },
          ],
        }),
        machines: () => ({
          machines: [
            { id: "h1", name: "Mac Mini", connected: true },
            { id: "h2", name: "OVH", connected: true },
          ],
        }),
      },
    },
  );
  await view.findAllByText("Project");
  view.getAllByText("Project")[0].click();
  const copiesButton = await view.findByRole("button", {
    name: /Working copies/,
  });
  copiesButton.click();
  await view.findByText(/Each device can hold its own working copy/);
  expect(view.baseElement.textContent).toContain("Mac Mini");
  expect(view.getByDisplayValue("/srv/project")).toBeTruthy();
  view.lifecycle.unmount();
});
it("switches device tabs on the project card and edits that copy's AGENTS.md", async () => {
  const copy = { ...root, hostId: "h2", path: "/srv/project" };
  const machinesList = [
    { id: "h1", name: "Mac Mini", connected: true },
    { id: "h2", name: "OVH", connected: true },
  ];
  const reads: { hostId?: string }[] = [];
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "" },
    {
      rpc: {
        ...rpc,
        list: () => ({
          folders: [],
          roots: [root, copy],
          bindings: {},
          errors: [],
          machines: machinesList,
        }),
        machines: () => ({ machines: machinesList }),
        rules_read: (input: { hostId?: string }) => {
          reads.push(input);
          return Promise.resolve({
            content: `rules for ${input.hostId ?? "default"}`,
            claude: `claude for ${input.hostId ?? "default"}`,
            sha: null,
            path: "/AGENTS.md",
            mode: "manual",
            template: "",
            projectTemplate: "",
            custom: "",
            customTarget: "session" as const,
            startup: "",
            suggestedSection: "",
            suggestedProject: "",
          });
        },
        rules_save: () => Promise.resolve({ ok: true as const }),
        rules_settings_save: () => Promise.resolve({ ok: true as const }),
      },
    },
  );
  await view.findAllByText("Project");
  view.getAllByText("Project")[0].click();
  const tabs = await view.findAllByRole("tab", { name: /Mac Mini|OVH/ });
  expect(tabs).toHaveLength(2);
  const editor = await view.findByRole("textbox", {
    name: /AGENTS.md contents/,
  });
  expect((editor as HTMLTextAreaElement).value).toBe("rules for h1");
  expect(view.baseElement.textContent).toContain("claude for h1");
  tabs[1].click();
  await view.findByRole("textbox", { name: /AGENTS.md contents — OVH/ });
  expect(
    (
      view.getByRole("textbox", {
        name: /AGENTS.md contents — OVH/,
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("rules for h2");
  expect(
    (
      view.getByRole("textbox", {
        name: /CLAUDE.md — OVH/,
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("claude for h2");
  expect(reads.at(-1)).toMatchObject({ hostId: "h2" });
  view.lifecycle.unmount();
});

it("switches device tabs on the project card and previews that copy's rules", async () => {
  const copy = { ...root, hostId: "h2", path: "/srv/project" };
  const machinesList = [
    { id: "h1", name: "Mac Mini", connected: true },
    { id: "h2", name: "OVH", connected: true },
  ];
  const reads: { hostId?: string }[] = [];
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "" },
    {
      rpc: {
        ...rpc,
        list: () => ({
          folders: [],
          roots: [root, copy],
          bindings: {},
          errors: [],
          machines: machinesList,
        }),
        machines: () => ({ machines: machinesList }),
        rules_read: (input: { hostId?: string }) => {
          reads.push(input);
          return Promise.resolve({
            content: `rules for ${input.hostId ?? "default"}`,
            sha: null,
            path: "/AGENTS.md",
            mode: "manual",
            template: "",
            projectTemplate: "",
            custom: "",
            customTarget: "session" as const,
            startup: "",
            suggestedSection: "",
            suggestedProject: "",
          });
        },
        rules_settings_save: () => Promise.resolve({ ok: true as const }),
      },
    },
  );
  await view.findAllByText("Project");
  view.getAllByText("Project")[0].click();
  const tabs = await view.findAllByRole("tab", { name: /Mac Mini|OVH/ });
  expect(tabs).toHaveLength(2);
  expect(
    (
      view.getByRole("textbox", {
        name: /AGENTS.md contents/,
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("rules for h1");
  tabs[1].click();
  await view.findByDisplayValue("rules for h2");
  expect(reads.at(-1)).toMatchObject({ hostId: "h2" });
  view.lifecycle.unmount();
});

it("switches the project between inherited and custom rules with the mode tabs", async () => {
  const saves: { mode?: string; projectTemplate?: string }[] = [];
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "" },
    {
      rpc: {
        ...rpc,
        rules_read: () =>
          Promise.resolve({
            content: "file rules",
            claude: null,
            sha: null,
            path: "/work/AGENTS.md",
            mode: "manual",
            template: "",
            projectTemplate: "",
            custom: "",
            customTarget: "session" as const,
            startup: "",
            suggestedSection: "section template",
            suggestedProject: "project template",
          }),
        rules_settings_save: (input: { mode?: string }) => {
          saves.push(input);
          return Promise.resolve({ ok: true as const });
        },
      },
    },
  );
  await view.findAllByText("Project");
  view.getAllByText("Project")[0].click();
  // A file without the plugin markers opens on its own tab, not on a template.
  await view.findByRole("textbox", { name: /AGENTS.md contents/ });
  expect(view.baseElement.textContent).not.toContain("Section template");
  const custom = await view.findByRole("tab", { name: "Custom template" });
  custom.click();
  // The open tab is the mode: its fields are prefilled from the inherited block.
  expect(
    ((await view.findByDisplayValue("project template")) as HTMLTextAreaElement)
      .tagName,
  ).toBe("TEXTAREA");
  expect(view.getByDisplayValue("section template")).toBeTruthy();
  expect(view.queryByRole("textbox", { name: /AGENTS.md contents/ })).toBe(
    null,
  );
  view.getByRole("button", { name: /Save/ }).click();
  await waitFor(() => expect(saves).toHaveLength(1));
  expect(saves[0]).toMatchObject({
    mode: "custom",
    projectTemplate: "project template",
  });
  // Three modes, and the file tab brings the editors back.
  expect(
    [...view.container.querySelectorAll(".pf-agents-rule [role=tab]")].map(
      (b) => b.textContent,
    ),
  ).toEqual(["Default", "Custom template", "Own file"]);
  view.getByRole("tab", { name: "Own file" }).click();
  await view.findByRole("textbox", { name: /AGENTS.md contents/ });
  view.lifecycle.unmount();
});

it("loads AGENTS.md and CLAUDE.md in the rules dialog Own file tab", async () => {
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "" },
    {
      rpc: {
        ...rpc,
        rules_read: () =>
          Promise.resolve({
            content: "dialog agents",
            claude: "dialog claude",
            sha: null,
            path: "/work/Section/AGENTS.md",
            mode: "manual",
            template: "",
            projectTemplate: "",
            custom: "",
            customTarget: "session" as const,
            startup: "",
            suggestedSection: "",
            suggestedProject: "",
          }),
        rules_save: () => Promise.resolve({ ok: true as const }),
        rules_settings_save: () => Promise.resolve({ ok: true as const }),
      },
    },
  );
  await view.findByText("Project");
  view.getByText("Section").click();
  fireEvent.click(await view.findByRole("button", { name: "Rules" }));
  const dialog = await view.findByRole("dialog");
  await within(dialog).findByRole("tab", { name: "Own file" });
  expect(
    (
      within(dialog).getByRole("textbox", {
        name: "AGENTS.md contents",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("dialog agents");
  expect(
    (
      within(dialog).getByRole("textbox", { name: "CLAUDE.md" }) as HTMLTextAreaElement
    ).value,
  ).toBe("dialog claude");
  fireEvent.click(within(dialog).getByRole("tab", { name: "Custom template" }));
  expect(
    within(dialog).queryByRole("textbox", { name: "AGENTS.md contents" }),
  ).toBe(null);
  view.lifecycle.unmount();
});

it("offers a tab for a machine that has no copy of the project yet", async () => {
  const copy = { ...root, hostId: "h2", path: "/srv/project" };
  const machinesList = [
    { id: "h1", name: "Mac Mini", connected: true },
    { id: "h2", name: "OVH", connected: true },
    { id: "h3", name: "MacBook", connected: true },
  ];
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "" },
    {
      rpc: {
        ...rpc,
        list: () => ({
          folders: [],
          roots: [root, copy],
          bindings: {},
          errors: [],
          machines: machinesList,
        }),
        machines: () => ({ machines: machinesList }),
        rules_read: () =>
          Promise.resolve({
            content: "file rules",
            claude: null,
            sha: null,
            path: "/work/AGENTS.md",
            mode: "manual",
            template: "",
            projectTemplate: "",
            custom: "",
            customTarget: "session" as const,
            startup: "",
            suggestedSection: "",
            suggestedProject: "",
          }),
      },
    },
  );
  await view.findAllByText("Project");
  view.getAllByText("Project")[0].click();
  const tabs = await view.findAllByRole("tab", {
    name: /Mac Mini|OVH|MacBook/,
  });
  expect(tabs.map((b) => b.textContent)).toEqual([
    "Mac Mini",
    "OVH",
    "MacBook",
  ]);
  // The machine without a copy explains itself and offers to add one.
  view.getByRole("tab", { name: "MacBook" }).click();
  // Said once, next to the device tabs, and not repeated in the rules block.
  expect(
    await view.findAllByText("The project has no copy on this device"),
  ).toHaveLength(1);
  expect(view.getByRole("button", { name: /Add copy/ })).toBeTruthy();
  view.lifecycle.unmount();
});

it("hands a copy to the folder picker and moves the files there", async () => {
  const copy = { ...root, hostId: "h2", path: "/srv/project" };
  const machinesList = [
    { id: "h1", name: "Mac Mini", connected: true },
    { id: "h2", name: "OVH", connected: true },
  ];
  const browsed: { hostId: string; path?: string }[] = [];
  const moves: { hostId: string; destination: string }[] = [];
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "" },
    {
      rpc: {
        ...rpc,
        list: () => ({
          folders: [],
          roots: [root, copy],
          bindings: {},
          errors: [],
          machines: machinesList,
        }),
        machines: () => ({ machines: machinesList }),
        project_browse: (input: { hostId: string; path?: string }) => {
          browsed.push(input);
          return Promise.resolve({
            path: "/Users/kirill/Projects",
            parent: "/Users/kirill",
            directories: [
              { name: "other", path: "/Users/kirill/Projects/other" },
            ],
          });
        },
        project_move: (input: { hostId: string; destination: string }) => {
          moves.push(input);
          return Promise.resolve({
            destination: input.destination,
            complete: true,
          });
        },
      },
    },
  );
  await view.findAllByText("Project");
  view.getAllByText("Project")[0].click();
  (await view.findByRole("button", { name: /Working copies/ })).click();
  // Each copy shows its path read-only; the folder button opens the picker.
  const pickers = await view.findAllByRole("button", { name: /Choose folder/ });
  expect(view.getByDisplayValue("/srv/project")).toBeTruthy();
  pickers[0].click();
  const browseButton = await view.findByRole("button", {
    name: /Choose folder/,
  });
  browseButton.click();
  await waitFor(() => expect(browsed.at(-1)).toMatchObject({ hostId: "h1" }));
  (await view.findByRole("button", { name: "Choose folder" })).click();
  // The project folder keeps its name inside the chosen parent.
  await view.findByDisplayValue("/Users/kirill/Projects/work");
  (await view.findByRole("button", { name: /^Move$/ })).click();
  await waitFor(() => expect(moves).toHaveLength(1));
  expect(moves[0]).toMatchObject({
    hostId: "h1",
    destination: "/Users/kirill/Projects/work",
  });
  view.lifecycle.unmount();
});

it("adopts an existing folder instead of moving the files", async () => {
  const edits: { hostId: string; path: string }[] = [];
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "" },
    {
      rpc: {
        ...rpc,
        project_browse: () =>
          Promise.resolve({
            path: "/Users/kirill/Clients",
            parent: "/Users/kirill",
            // The project folder is already sitting in the chosen parent.
            directories: [{ name: "work", path: "/Users/kirill/Clients/work" }],
          }),
        copy_edit: (input: { hostId: string; path: string }) => {
          edits.push(input);
          return Promise.resolve({ ok: true as const });
        },
      },
    },
  );
  await view.findAllByText("Project");
  view.getAllByText("Project")[0].click();
  (await view.findByRole("button", { name: /Choose folder/ })).click();
  await view.findByText("Move project");
  (await view.findByRole("button", { name: /Choose folder/ })).click();
  await view.findByText("/Users/kirill/Clients");
  (await view.findByRole("button", { name: "Choose folder" })).click();
  await view.findByText(/A folder with this name already exists/);
  (await view.findByRole("button", { name: /Use this folder/ })).click();
  await waitFor(() => expect(edits).toHaveLength(1));
  expect(edits[0]).toMatchObject({ path: "/Users/kirill/Clients/work" });
  view.lifecycle.unmount();
});

it("saves custom rules for BB sessions and a startup instruction", async () => {
  const saves: { customTarget?: string; startup?: string }[] = [];
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "" },
    {
      rpc: {
        ...rpc,
        rules_read: () =>
          Promise.resolve({
            content: "",
            claude: null,
            sha: null,
            path: "/work/Section/AGENTS.md",
            mode: "inherit" as const,
            template: "",
            projectTemplate: "",
            custom: "",
            customTarget: "session" as const,
            startup: "",
            suggestedSection: "",
            suggestedProject: "",
          }),
        rules_settings_save: (input: { customTarget?: string }) => {
          saves.push(input);
          return Promise.resolve({ ok: true as const });
        },
      },
    },
  );
  await view.findByText("Project");
  view.getByText("Section").click();
  const rules = await view.findByRole("textbox", { name: /Custom rules/ });
  const startup = view.getByRole("textbox", { name: /Startup instruction/ });
  // Both fields sit outside the mode tabs and explain themselves.
  expect(
    view.getAllByRole("button", { name: /Standing rules for this place/ }),
  ).not.toHaveLength(0);
  fireEvent.change(rules, { target: { value: "Ads go to the agency" } });
  fireEvent.change(startup, { target: { value: "Run the tasks skill" } });
  view.getByRole("button", { name: /^Save$/ }).click();
  await waitFor(() => expect(saves).toHaveLength(1));
  expect(saves[0]).toMatchObject({
    customTarget: "session",
    startup: "Run the tasks skill",
    custom: "Ads go to the agency",
  });
  view.lifecycle.unmount();
});

it("lists the plugin settings sections in the tree sidebar and opens them", async () => {
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "" },
    {
      rpc: { ...rpc, prefs_get: () => Promise.reject(new Error("offline")) },
    },
  );
  await view.findByText("Project");
  const side = view.baseElement.querySelector(".pf-side")!;
  expect(side.textContent).toContain("Chat list");
  expect(side.textContent).toContain("Appearance");
  fireEvent.click(view.getByRole("button", { name: "Section archive" }));
  await view.findByText("Archive is empty");
  view.getByText("Section").click();
  await view.findByDisplayValue("/work/Section");
  expect(
    view
      .getByRole("button", { name: "Section archive" })
      .getAttribute("aria-current"),
  ).toBeNull();
  view.lifecycle.unmount();
});

it("offers Rules on a third-level section and not on a group", async () => {
  const l1 = { ...root, id: "f1", parentId: null, path: "/work/a", name: "L1" };
  const l2 = { ...root, id: "f2", parentId: "f1", path: "/work/a/b", name: "L2" };
  const l3 = { ...root, id: "f3", parentId: "f2", path: "/work/a/b/c", name: "L3" };
  const group = {
    ...root,
    id: "g1",
    parentId: null,
    name: "Apps",
    path: "@group/g1",
    kind: "group",
  };
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "" },
    {
      rpc: {
        ...rpc,
        list: () => ({
          folders: [l1, l2, l3, group],
          roots: [root],
          bindings: {},
          errors: [],
          machines: [{ id: "h1", name: "Mac Mini", connected: true }],
        }),
        rules_read: () => ({
          mode: "default",
          template: "",
          suggestedSection: "",
          projectTemplate: "",
          suggestedProject: "",
          custom: "",
          customTarget: "file",
          startup: "",
          content: "",
          claude: "",
        }),
      },
    },
  );
  await view.findByText("L3");
  view.getByText("L3").click();
  await view.findByDisplayValue("/work/a/b/c");
  const details = view.baseElement.querySelector(".pf-details")!;
  expect(details.textContent).toContain("Rules");
  view.getByText("Apps").click();
  await view.findByText(/creates no folder/);
  const groupCard = view.baseElement.querySelector(".pf-details")!;
  expect(groupCard.textContent).not.toContain("Rules");
  view.lifecycle.unmount();
});

it("shows a group as a folderless card with group actions", async () => {
  const group = {
    ...root,
    id: "g1",
    parentId: null,
    name: "Apps",
    path: "@group/g1",
    kind: "group",
  };
  const inGroup = {
    ...root,
    id: "f2",
    parentId: "g1",
    name: "VK bot",
    path: "/work/vk-bot",
  };
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "" },
    {
      rpc: {
        ...rpc,
        list: () => ({ ...rpc.list(), folders: [section, group, inGroup] }),
      },
    },
  );
  await view.findByText("VK bot");
  view.getByText("Apps").click();
  await view.findByText(/creates no folder/);
  const card = view.baseElement.querySelector(".pf-details")!;
  expect(card.textContent).toContain("Delete group");
  expect(card.textContent).not.toContain("Rules");
  expect(card.textContent).not.toContain("New chat");
  view.lifecycle.unmount();
});
it("keeps nested sections indented in the phone-width project picker", async () => {
  setCompactViewport(true);
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "chat/p1/root:h1" },
    { rpc },
  );
  const compose = await waitFor(() => {
    const node = view.baseElement.querySelector(".pf-native-compose");
    expect(node).toBeTruthy();
    return node as HTMLElement;
  });
  const native = document.createElement("button");
  native.setAttribute("data-promptbox-project-control", "");
  native.className = "native-project";
  compose.append(native);
  const picker = await waitFor(() =>
    view.getByRole("button", { name: "Projects & Sections" }),
  );
  fireEvent.click(picker);
  const nested = await view.findByRole("menuitem", { name: /Section/ });
  expect(nested.style.paddingLeft).toBe("24px");
  view.lifecycle.unmount();
});

it("lists a project once in the composer picker and keeps every device's sections", async () => {
  setCompactViewport(true);
  const copy = { ...root, hostId: "h2", path: "/srv/project" };
  const copySection = {
    ...copy,
    id: "f2",
    path: "/srv/project/Server",
    name: "Server",
  };
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "chat/p1/root:h1" },
    {
      rpc: {
        ...rpc,
        list: () => ({
          folders: [section, copySection],
          roots: [root, copy],
          bindings: {},
          errors: [],
          machines: [
            { id: "h1", name: "Mac Mini", connected: true },
            { id: "h2", name: "OVH", connected: true },
          ],
        }),
      },
    },
  );
  const compose = await waitFor(() => {
    const node = view.baseElement.querySelector(".pf-native-compose");
    expect(node).toBeTruthy();
    return node as HTMLElement;
  });
  const native = document.createElement("button");
  native.setAttribute("data-promptbox-project-control", "");
  native.className = "native-project";
  compose.append(native);
  fireEvent.click(
    await waitFor(() =>
      view.getByRole("button", { name: "Projects & Sections" }),
    ),
  );
  const projectRows = await view.findAllByRole("menuitem", {
    name: /^Project/,
  });
  expect(projectRows).toHaveLength(1);
  expect(projectRows[0].textContent).not.toMatch(/Mac Mini|OVH/);
  expect(projectRows[0].textContent).toContain("✓");
  expect(view.getByRole("menuitem", { name: /Section/ })).toBeTruthy();
  expect(view.getByRole("menuitem", { name: /Server/ }).textContent).toContain(
    "OVH",
  );
  view.lifecycle.unmount();
});

it("loads the rules of a card opened by deep link, before the tree arrives", async () => {
  // The key comes from the URL while the tree is still loading, so the first
  // run of the rules effect has no row to read yet: it has to ask again.
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "select/p1/f1" },
    {
      rpc: {
        ...rpc,
        rules_read: () => ({
          content: "",
          claude: null,
          sha: null,
          path: "/work/Section/AGENTS.md",
          mode: "inherit",
          template: "Section template",
          projectTemplate: "",
          custom: "",
          customTarget: "file",
          startup: "",
          suggestedSection: "",
          suggestedProject: "",
        }),
      },
    },
  );
  await view.findByDisplayValue("/work/Section");
  expect(await view.findByRole("tab", { name: "Default" })).toBeTruthy();
  view.lifecycle.unmount();
});

it("shows a repo icon left of new-chat only when repoUrl is set", async () => {
  const withRepo = {
    ...section,
    repoUrl: "https://github.com/VKirill/bb-plugin-project-folders",
    repoProvider: "github" as const,
    repoPrivate: true,
  };
  const plain = {
    ...section,
    id: "f2",
    name: "Plain",
    path: "/work/Plain",
    repoUrl: null,
  };
  const onGitlab = {
    ...section,
    id: "f3",
    name: "Api",
    path: "/work/Api",
    repoUrl: "https://gitlab.com/acme/platform/api",
    repoProvider: "gitlab" as const,
    repoPrivate: false,
  };
  const group = {
    ...root,
    id: "g1",
    name: "Group",
    path: "@group/g1",
    kind: "group" as const,
    repoUrl: null,
  };
  const view = renderSlot(
    app.threadLists[0]!,
    { activeThreadId: null, onNavigate() {} },
    {
      sidebarThreads: { threads: [], projects: [] },
      rpc: {
        list: () => ({
          folders: [withRepo, plain, onGitlab, group],
          roots: [{ ...root, repoUrl: null }],
          bindings: {},
          errors: [],
          machines: [{ id: "h1", name: "Mac Mini", connected: true }],
        }),
      },
    },
  );
  await view.findByText("Section");
  const link = view.baseElement.querySelector(
    'a[href="https://github.com/VKirill/bb-plugin-project-folders"]',
  );
  expect(link).toBeTruthy();
  expect(link?.getAttribute("target")).toBe("_blank");
  expect(link?.getAttribute("rel")).toContain("noopener");
  expect(link?.getAttribute("rel")).toContain("noreferrer");
  expect(link?.classList.contains("pf-repo-private")).toBe(true);
  expect(link?.getAttribute("data-provider")).toBe("github");
  expect(link?.querySelector(".pf-repo-lock")).toBeTruthy();
  const gitlab = view.baseElement.querySelector(
    'a[href="https://gitlab.com/acme/platform/api"]',
  );
  expect(gitlab?.getAttribute("data-provider")).toBe("gitlab");
  expect(gitlab?.getAttribute("aria-label")).toBe("Open GitLab repository");
  expect(gitlab?.classList.contains("pf-repo-private")).toBe(false);
  expect(gitlab?.querySelector(".pf-repo-lock")).toBeNull();
  const heading = link?.closest(".pf-heading");
  const plus = heading?.querySelector('button[aria-label="New chat: Section"]');
  expect(plus).toBeTruthy();
  expect(
    heading &&
      [...heading.children].indexOf(link as HTMLElement) <
        [...heading.children].indexOf(plus as HTMLElement),
  ).toBe(true);
  expect(view.baseElement.querySelectorAll("a.pf-icon")).toHaveLength(2);
  expect(view.getByText("Group")).toBeTruthy();
  expect(view.getByText("Plain")).toBeTruthy();
  view.lifecycle.unmount();
});
