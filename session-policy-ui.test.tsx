// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

const { rpc, saved, bound } = vi.hoisted(() => {
  const saved: unknown[] = [];
  const bound: { elsewhere?: Record<string, string[]> } = {};
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
      ...(bound.elsewhere ? { boundElsewhere: bound.elsewhere } : {}),
      userInstructionsFile: { path: "/data/AGENTS.md", exists: false },
      inherited,
      effective: inherited,
    }),
    session_policy_inventory: () => ({
      bbPlugins: [],
      skills: [
        {
          name: "rigging",
          label: "rigging",
          category: {
            path: ["3D и Blender", "Персонажи и анимация"],
            pathEn: ["3D and Blender", "Characters and animation"],
            order: 1005,
          },
        },
        { name: "seo-agent", label: "seo-agent" },
        {
          name: "voxel-style",
          label: "voxel-style",
          category: {
            path: ["3D и Blender", "Стили и арт-дирекция"],
            pathEn: ["3D and Blender", "Styles and art direction"],
            order: 1006,
          },
        },
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
  return { rpc, saved, bound };
});
vi.mock("@get-bb/plugin-sdk/app", async (original) => ({
  ...(await original<object>()),
  useRpc: () => rpc,
}));

import { SessionPolicyEditor } from "./session-policy-ui";

afterEach(() => {
  cleanup();
  saved.length = 0;
  delete bound.elsewhere;
});

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

it("groups skills by the Agent tools tree and switches a whole section", async () => {
  const view = render(
    <SessionPolicyEditor scope={{ kind: "project", projectId: "p1" }} />,
  );
  const section = (title: string) =>
    view.container.querySelector(
      `summary [role="checkbox"][aria-label="${title}"]`,
    ) as HTMLElement | null;
  await waitFor(() =>
    expect(section("3D и Blender") ?? section("3D and Blender")).toBeTruthy(),
  );
  const threeD = (section("3D и Blender") ?? section("3D and Blender"))!;
  // Both 3D skills are off above, so the section box is clear; seo-agent sits in "No section".
  expect(threeD.getAttribute("aria-checked")).toBe("false");
  expect(view.container.querySelectorAll(".pf-session-branch").length).toBe(4); // 3D, its two subsections, and "No section"

  fireEvent.click(threeD);
  fireEvent.click(view.getByRole("button", { name: /Сохранить|Save/ }));
  await waitFor(() => expect(saved).toHaveLength(1));
  expect((saved[0] as { skills: unknown }).skills).toEqual({
    mode: "adjust",
    names: [],
    enable: ["rigging", "voxel-style"],
  });
});

it("locks a skill bound elsewhere and binds one here", async () => {
  bound.elsewhere = { "seo-agent": ["Murdoku"] };
  const view = render(
    <SessionPolicyEditor scope={{ kind: "project", projectId: "p1" }} />,
  );
  const box = (name: string) =>
    [...view.container.querySelectorAll('[role="checkbox"]')].find((el) =>
      el.closest("label")?.textContent?.startsWith(name),
    ) as HTMLElement;
  await waitFor(() => expect(box("seo-agent")).toBeTruthy());
  // Loaded above, but bound to another place: off and locked here.
  expect(box("seo-agent").getAttribute("aria-checked")).toBe("false");
  expect(box("seo-agent").hasAttribute("disabled")).toBe(true);
  expect(box("seo-agent").closest("label")?.textContent).toContain("Murdoku");

  const input = view.getByRole("combobox", { name: /Привязать навык|Bind skill/ });
  fireEvent.change(input, { target: { value: "rigging" } });
  fireEvent.click(view.getByRole("button", { name: /Привязать навык|Bind skill/ }));
  fireEvent.click(view.getByRole("button", { name: /Сохранить|Save/ }));
  await waitFor(() => expect(saved).toHaveLength(1));
  expect((saved[0] as { onlyHere: unknown }).onlyHere).toEqual(["rigging"]);
});
