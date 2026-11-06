import { describe, expect, it } from "vitest";
import { agentConfiguration } from "./agent-context";

const base = { thread: { id: "thr_a", parentThreadId: null }, project: { kind: "standard" as const }, environment: { path: "/w" } };
const rules = () => "Section rule: deploy after edits.";

describe("agentConfiguration", () => {
  it("gives an owner's chat the chat-files line, the section rules and the skill", () => {
    const out = agentConfiguration({ ...base, origin: { kind: null, pluginId: null } }, rules);
    expect(out.instructions).toContain("/w/.bb/chats/thr_a");
    expect(out.instructions).toContain("Section rule");
    expect(out.skills).toEqual(["project-folders"]);
  });
  it("gives a plugin's helper under a chat nothing", () => {
    let read = false;
    const out = agentConfiguration({ ...base, thread: { id: "thr_w", parentThreadId: "thr_pm" }, origin: { kind: null, pluginId: "lane-pilot" } }, () => { read = true; return "x"; });
    expect(out).toEqual({ tools: [], skills: [], instructions: undefined });
    expect(read).toBe(false);
  });
  it("keeps everything for a side chat and for a plugin's own top-level chat", () => {
    expect(agentConfiguration({ ...base, thread: { id: "thr_s", parentThreadId: "thr_a" }, origin: { kind: "fork", pluginId: "side-chat" } }, rules).instructions).toContain("Section rule");
    expect(agentConfiguration({ ...base, origin: { kind: null, pluginId: "lane-pilot" } }, rules).skills).toEqual(["project-folders"]);
  });
});
