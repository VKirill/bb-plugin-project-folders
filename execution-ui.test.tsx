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
const section = { ...root, id: "f1", path: "/work/Section", name: "Section" };
const projectPin = {
  model: {
    providerId: "claude-code",
    model: "claude-opus-5",
    reasoningLevel: "high",
    serviceTier: null,
    origin: { scope: "project", folderId: null },
  },
  permissionMode: null,
  environment: null,
  agent: null,
};
const rpc = {
  list: () => ({
    folders: [section],
    roots: [root],
    bindings: {},
    errors: [],
    machines: [{ id: "h1", name: "Mac Mini", connected: true }],
  }),
  archive_list: () => ({ archives: [] }),
  execution_read: () => ({
    own: {},
    effective: projectPin,
    inherited: projectPin,
    hostId: "h1",
    fallback: {
      providerId: "codex",
      model: "gpt-6",
      reasoningLevel: "medium",
      serviceTier: null,
      permissionMode: "auto",
    },
    agents: {
      installed: true,
      supported: true,
      agents: [
        { id: "reviewer", description: "", source: "user", mode: "all" },
      ],
      error: null,
    },
  }),
  execution_save: () => ({ ok: true }),
};

it("starts a section chat with the provider and model pinned above it", async () => {
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "chat/p1/f1" },
    { rpc },
  );
  const composer = await waitFor(() =>
    view.getByTestId("bb-new-thread-composer"),
  );
  expect(composer.getAttribute("data-default-provider-id")).toBe("claude-code");
  expect(composer.getAttribute("data-default-model")).toBe("claude-opus-5");
  expect(composer.getAttribute("data-default-reasoning-level")).toBe("high");
  // Nobody pinned these: BB keeps its own behaviour.
  expect(composer.getAttribute("data-default-service-tier")).toBe("");
  expect(composer.getAttribute("data-default-permission-mode")).toBe("");
  expect(JSON.parse(composer.getAttribute("data-default-environment")!)).toEqual(
    {
      type: "provider",
      environmentProviderId: "project-checkout",
      machine: { type: "existing", hostId: "h1" },
      inputs: { path: "/work/Section" },
    },
  );
  view.lifecycle.unmount();
});

it("opens a chat even when the pinned values cannot be read", async () => {
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "chat/p1/f1" },
    {
      rpc: {
        ...rpc,
        execution_read: () => {
          throw new Error("server is having a moment");
        },
      },
    },
  );
  const composer = await waitFor(() =>
    view.getByTestId("bb-new-thread-composer"),
  );
  expect(composer.getAttribute("data-default-provider-id")).toBe("");
  view.lifecycle.unmount();
});

it("starts a section chat in a managed worktree when that is pinned", async () => {
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "chat/p1/f1" },
    {
      rpc: {
        ...rpc,
        execution_read: () => ({
          ...rpc.execution_read(),
          effective: {
            ...projectPin,
            environment: {
              value: "worktree",
              origin: { scope: "project", folderId: null },
            },
          },
        }),
      },
    },
  );
  const composer = await waitFor(() =>
    view.getByTestId("bb-new-thread-composer"),
  );
  expect(JSON.parse(composer.getAttribute("data-default-environment")!)).toEqual(
    {
      type: "host",
      hostId: "h1",
      workspace: {
        type: "managed-worktree",
        baseBranch: { kind: "default" },
      },
    },
  );
  view.lifecycle.unmount();
});

it("shows a section where its unpinned model comes from", async () => {
  const view = renderSlot(app.navPanels[0]!, { subPath: "" }, { rpc });
  await view.findByText("Project");
  view.getByText("Section").click();
  // The card opens on Rules; provider defaults live on their own tab.
  fireEvent.click(await view.findByRole("tab", { name: "Provider" }));
  await view.findByText("Provider, model and agent");
  expect(view.baseElement.textContent).toContain("from the project");
  const picker = view.getByTestId("bb-provider-model-picker");
  expect(picker.getAttribute("data-disabled")).toBe("true");
  expect(picker.getAttribute("data-routing-id")).toBe("h1");
  view.lifecycle.unmount();
});

it("pins an agent on the section and saves it", async () => {
  const view = renderSlot(app.navPanels[0]!, { subPath: "" }, { rpc });
  await view.findByText("Project");
  view.getByText("Section").click();
  // The card opens on Rules; provider defaults live on their own tab.
  fireEvent.click(await view.findByRole("tab", { name: "Provider" }));
  await view.findByText("Provider, model and agent");
  fireEvent.change(view.getByLabelText("Agent"), {
    target: { value: "reviewer" },
  });
  fireEvent.click(view.getByRole("button", { name: /Save/ }));
  await waitFor(() =>
    expect(
      view.inspection.rpcCalls.some((c) => c.method === "execution_save"),
    ).toBe(true),
  );
  const saved = view.inspection.rpcCalls.find(
    (c) => c.method === "execution_save",
  )!.input as { scope: unknown; value: unknown };
  expect(saved.scope).toEqual({
    kind: "folder",
    projectId: "p1",
    folderId: "f1",
  });
  expect(saved.value).toEqual({ agentMode: "agent", agentId: "reviewer" });
  view.lifecycle.unmount();
});

it("pins an isolated worktree on the section and shows the inherited origin when off", async () => {
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "" },
    {
      rpc: {
        ...rpc,
        execution_read: () => ({
          ...rpc.execution_read(),
          inherited: {
            ...projectPin,
            environment: {
              value: "worktree",
              origin: { scope: "project", folderId: null },
            },
          },
        }),
      },
    },
  );
  await view.findByText("Project");
  view.getByText("Section").click();
  fireEvent.click(await view.findByRole("tab", { name: "Provider" }));
  await view.findByText("Provider, model and agent");
  expect(
    view.getByRole("switch", { name: "Own environment" }).getAttribute(
      "aria-checked",
    ),
  ).toBe("false");
  expect(view.baseElement.textContent).toContain("from the project");
  const select = view.getByRole("combobox", { name: "Own environment" });
  expect((select as HTMLSelectElement).disabled).toBe(true);
  expect((select as HTMLSelectElement).value).toBe("worktree");
  fireEvent.click(view.getByRole("switch", { name: "Own environment" }));
  expect((select as HTMLSelectElement).disabled).toBe(false);
  fireEvent.change(select, { target: { value: "worktree" } });
  fireEvent.click(view.getByRole("button", { name: /Save/ }));
  await waitFor(() =>
    expect(
      view.inspection.rpcCalls.some((c) => c.method === "execution_save"),
    ).toBe(true),
  );
  const saved = view.inspection.rpcCalls.find(
    (c) => c.method === "execution_save",
  )!.input as { scope: unknown; value: unknown };
  expect(saved.scope).toEqual({
    kind: "folder",
    projectId: "p1",
    folderId: "f1",
  });
  expect(saved.value).toEqual({ environmentMode: "worktree" });
  view.lifecycle.unmount();
});

it("offers the CLI Agents plugin when agents are not available", async () => {
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "" },
    {
      rpc: {
        ...rpc,
        execution_read: () => ({
          ...rpc.execution_read(),
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
  await view.findByText("Project");
  view.getByText("Section").click();
  // The card opens on Rules; provider defaults live on their own tab.
  fireEvent.click(await view.findByRole("tab", { name: "Provider" }));
  await view.findByText("Provider, model and agent");
  expect(view.baseElement.textContent).toContain("CLI Agents");
  expect((view.getByLabelText("Agent") as HTMLSelectElement).disabled).toBe(
    true,
  );
  view.lifecycle.unmount();
});

it("never sends a switched-off group as undefined", async () => {
  // `undefined` is not a JSON value: a group turned on without a service tier,
  // or turned off again, used to travel as an explicit undefined and the rpc
  // refused the whole save.
  const view = renderSlot(app.navPanels[0]!, { subPath: "" }, { rpc });
  await view.findByText("Project");
  view.getByText("Section").click();
  // The card opens on Rules; provider defaults live on their own tab.
  fireEvent.click(await view.findByRole("tab", { name: "Provider" }));
  await view.findByText("Provider, model and agent");
  fireEvent.click(view.getByRole("switch", { name: "Own provider and model" }));
  fireEvent.click(view.getByRole("switch", { name: "Own permission mode" }));
  fireEvent.click(view.getByRole("switch", { name: "Own permission mode" }));
  fireEvent.click(view.getByRole("button", { name: /Save/ }));
  await waitFor(() =>
    expect(
      view.inspection.rpcCalls.some((c) => c.method === "execution_save"),
    ).toBe(true),
  );
  const value = (
    view.inspection.rpcCalls.find((c) => c.method === "execution_save")!
      .input as { value: Record<string, unknown> }
  ).value;
  expect(Object.values(value).every((v) => v !== undefined)).toBe(true);
  expect("serviceTier" in value).toBe(false);
  expect("permissionMode" in value).toBe(false);
  // The group that is on still carries what the section inherits.
  expect(value).toMatchObject({
    providerId: "claude-code",
    model: "claude-opus-5",
  });
  view.lifecycle.unmount();
});

it("does not argue with the picker about a service tier it dropped", async () => {
  // The picker resolves its own catalog and reports the result back. If this
  // state answers with the inherited tier again, the two never agree and React
  // stops the panel with "Maximum update depth exceeded".
  const withTier = {
    ...rpc,
    execution_read: () => ({
      ...rpc.execution_read(),
      inherited: {
        ...projectPin,
        model: { ...projectPin.model, serviceTier: "fast" },
      },
    }),
  };
  const view = renderSlot(
    app.navPanels[0]!,
    { subPath: "" },
    { rpc: withTier },
  );
  await view.findByText("Project");
  view.getByText("Section").click();
  // The card opens on Rules; provider defaults live on their own tab.
  fireEvent.click(await view.findByRole("tab", { name: "Provider" }));
  await view.findByText("Provider, model and agent");
  fireEvent.click(view.getByRole("switch", { name: "Own provider and model" }));
  const tier = view.getByLabelText("Service tier") as HTMLSelectElement;
  expect(tier.value).toBe("fast");
  fireEvent.change(tier, { target: { value: "" } });
  fireEvent.click(
    view.getByRole("button", { name: "Apply execution selection" }),
  );
  await waitFor(() =>
    expect(
      (view.getByLabelText("Service tier") as HTMLSelectElement).value,
    ).toBe(""),
  );
  view.lifecycle.unmount();
});
