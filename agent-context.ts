import path from "node:path";

/** The slice of BB's agent-configuration context this plugin reads. */
export type AgentContextInput = {
  thread: { id: string; parentThreadId: string | null };
  project: { kind: "standard" | "personal" };
  environment: { path: string | null };
  origin?: { kind: "fork" | null; pluginId: string | null } | null;
};

/**
 * A background helper another plugin spawned under a chat (a Lane Pilot writer, critic, analyst…): its brief already names
 * its folder and rules. The chat-files line would send it to write .bb/chats into a worktree, and section rules written for
 * the owner's chats (deploy steps, who to message) are not its job. A side chat is a fork of the owner's chat and keeps them.
 */
export const pluginHelperThread = (ctx: AgentContextInput): boolean =>
  !!ctx.origin?.pluginId && ctx.origin.pluginId !== "side-chat" && ctx.thread.parentThreadId !== null;

export function agentConfiguration(ctx: AgentContextInput, sessionRules: () => string): {
  tools: never[]; skills: string[]; instructions: string | undefined;
} {
  if (pluginHelperThread(ctx)) return { tools: [], skills: [], instructions: undefined };
  const blocks: string[] = [];
  if (ctx.project.kind === "standard" && ctx.environment.path)
    blocks.push(
      `Store this chat's supporting files in ${path.join(ctx.environment.path, ".bb/chats", ctx.thread.id)}: documents and reports in artifacts/, notes in notes/, temporary files in tmp/. Create directories as needed. Keep conversation artifacts out of the working folder root. Place source code and project files according to the task. Do not edit automatically exported thread.json or history/. Read applicable AGENTS.md files, including parent folder rules.`,
    );
  const rules = sessionRules().trim();
  if (rules) blocks.push(rules);
  return { tools: [], skills: ["project-folders"], instructions: blocks.length ? blocks.join("\n\n") : undefined };
}
