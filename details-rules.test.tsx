// @vitest-environment jsdom
import { beforeAll, afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
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

it("reproduces P0: with stored mode manual, editing custom rules or startup shows save bar and saving persists the text", async () => {
  const settingsSaves: {
    mode?: string;
    custom?: string;
    startup?: string;
  }[] = [];
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "" },
    {
      rpc: {
        list: () => ({
          folders: [],
          roots: [root],
          bindings: {},
          errors: [],
          machines: [{ id: "h1", name: "Mac Mini", connected: true }],
        }),
        archive_list: () => ({ archives: [] }),
        rules_read: () =>
          Promise.resolve({
            content: "# manual file",
            claude: null,
            sha: null,
            path: "/work/AGENTS.md",
            mode: "manual",
            template: "",
            projectTemplate: "",
            custom: "initial custom",
            customTarget: "session" as const,
            startup: "initial startup",
            suggestedSection: "",
            suggestedProject: "",
          }),
        rules_settings_save: (input: {
          mode?: string;
          custom?: string;
          startup?: string;
        }) => {
          settingsSaves.push(input);
          return Promise.resolve({ ok: true as const });
        },
      },
    },
  );

  await view.findAllByText("Project");
  view.getAllByText("Project")[0].click();

  // Find the custom rules textarea and change it
  const customInput = await view.findByRole("textbox", {
    name: "Custom rules",
  });
  expect((customInput as HTMLTextAreaElement).value).toBe("initial custom");

  // In stored manual mode before editing, save bar should not be visible
  expect(
    view.queryByRole("button", { name: "Save", exact: true }),
  ).toBeNull();

  // Edit custom rules
  fireEvent.change(customInput, { target: { value: "edited custom rules" } });

  // Save button should now appear in the save bar
  const saveBtn = await view.findByRole("button", {
    name: "Save",
    exact: true,
  });
  expect(saveBtn).toBeTruthy();

  // Clicking Save should persist via rules_settings_save
  fireEvent.click(saveBtn);

  await waitFor(() => expect(settingsSaves).toHaveLength(1));
  expect(settingsSaves[0]).toMatchObject({
    mode: "manual",
    custom: "edited custom rules",
    startup: "initial startup",
  });

  view.lifecycle.unmount();
});
