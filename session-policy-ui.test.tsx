// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

const { rpc, saved } = vi.hoisted(() => {
  const saved: unknown[] = [];
  const global = { scope: "global", folderId: null };
  const none = {
    bbPlugins: null,
    skills: null,
    mcpServers: null,
    nativePlugins: null,
    userInstructions: null,
    projectInstructions: null,
    claudeAiSync: null,
  };
  const inherited = {
    ...none,
    skills: {
      value: { mode: "deny", names: ["rigging", "voxel-style"] },
      origin: global,
    },
  };
  const handlers: Record<string, (input: any) => unknown> = {
    session_policy_read: () => ({
      own: { skills: { mode: "adjust", names: [], enable: [] } },
      userInstructionsFile: { path: "/data/AGENTS.md", exists: false },
      inherited,
      effective: inherited,
    }),
    session_policy_inventory: () => ({
      bbPlugins: [],
      skills: [
        { name: "rigging", label: "rigging" },
        { name: "seo-agent", label: "seo-agent" },
        { name: "voxel-style", label: "voxel-style" },
      ],
      mcpServers: [],
      nativePlugins: [],
    }),
    session_policy_save: ({ value }) => {
      saved.push(value);
      return { ok: true };
    },
  };
  const rpc = { call: async (m: string, input: any) => handlers[m]!(input) };
  return { rpc, saved };
});
vi.mock("@get-bb/plugin-sdk/app", async (original) => ({
  ...(await original<object>()),
  useRpc: () => rpc,
}));

import { SessionPolicyEditor } from "./session-policy-ui";

afterEach(cleanup);

it("switches single inherited skills in the 'as above, with changes' mode", async () => {
  const view = render(
    <SessionPolicyEditor scope={{ kind: "project", projectId: "p1" }} />,
  );
  const box = (name: string) =>
    [...view.container.querySelectorAll('[role="checkbox"]')].find((el) =>
      el.closest("label")?.textContent?.startsWith(name),
    ) as HTMLElement;
  await waitFor(() => expect(box("rigging")).toBeTruthy());
  // Shown as the place above loads it: rigging off, seo-agent on.
  expect(box("rigging").getAttribute("aria-checked")).toBe("false");
  expect(box("seo-agent").getAttribute("aria-checked")).toBe("true");

  fireEvent.click(box("rigging"));
  fireEvent.click(box("seo-agent"));
  fireEvent.click(box("voxel-style"));
  fireEvent.click(box("voxel-style")); // back to inherited: no change stored
  fireEvent.click(view.getByRole("button", { name: /Сохранить|Save/ }));

  await waitFor(() => expect(saved).toHaveLength(1));
  expect((saved[0] as { skills: unknown }).skills).toEqual({
    mode: "adjust",
    names: ["seo-agent"],
    enable: ["rigging"],
  });
});
