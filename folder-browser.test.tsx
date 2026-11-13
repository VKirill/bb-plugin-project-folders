// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { FolderBrowser } from "./folder-browser";
const { call, rpc } = vi.hoisted(() => {
  const call = vi.fn().mockResolvedValue({ path: "/work/New" });
  return { call, rpc: { call } };
});
vi.mock("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => rpc,
  useRealtime: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("creates on the chosen host and requires confirmation before deleting", async () => {
  const refresh = vi.fn();
  const view = render(
    <FolderBrowser
      hostId="mini"
      path="/work"
      parent="/"
      directories={[{ name: "Child", path: "/work/Child" }]}
      loading={false}
      navigate={vi.fn()}
      refresh={refresh}
      onBusyChange={vi.fn()}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "New folder" }));
  fireEvent.change(view.getByRole("textbox", { name: "Folder name" }), {
    target: { value: "New" },
  });
  fireEvent.click(view.getByRole("button", { name: "Create" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(call).toHaveBeenCalledWith("folder_edit", {
    hostId: "mini",
    parent: "/work",
    name: "New",
    action: "create",
  });
  fireEvent.click(
    view.getByRole("button", { name: "Delete empty folder: Child" }),
  );
  expect(call).toHaveBeenCalledTimes(1);
  expect(view.queryByRole("button", { name: "Child" })).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  expect(call).toHaveBeenLastCalledWith("folder_edit", {
    hostId: "mini",
    parent: "/work",
    name: "Child",
    action: "delete",
  });
});
it("lets the section path dialog create folders on the picked device", async () => {
  const { SectionMoveDialog } = await import("./move-dialog");
  call.mockImplementation(async (method: string) =>
    method === "machines"
      ? { machines: [{ id: "mini", name: "Mini", connected: true }] }
      : { path: "/Users/me", parent: "/Users", directories: [] },
  );
  const view = render(
    <SectionMoveDialog
      folder={
        { id: "f", hostId: "linux", path: "/home/u/s", name: "s" } as never
      }
      presetHost="mini"
      onClose={vi.fn()}
      onMoved={vi.fn()}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Choose folder" }));
  fireEvent.click(await view.findByRole("button", { name: "New folder" }));
  fireEvent.change(view.getByRole("textbox", { name: "Folder name" }), {
    target: { value: "New" },
  });
  fireEvent.click(view.getByRole("button", { name: "Create" }));
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith("folder_edit", {
      hostId: "mini",
      parent: "/Users/me",
      name: "New",
      action: "create",
    }),
  );
});
