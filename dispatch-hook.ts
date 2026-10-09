import type { MessageDispatchHookContext, MessageDispatchHookDecision } from "@get-bb/plugin-sdk";
import { RELOCATE_MARKER } from "./thread-move";

export interface DispatchHookDeps {
  threadMoves: {
    blocked: (threadId: string) => boolean;
  };
  moves: {
    busy: (projectId: string) => boolean;
  };
  sectionMoves: {
    busyProject: (projectId: string) => boolean;
  };
  archives: {
    blocked: (threadId: string) => boolean;
    moving: (hostId: string, path: string) => boolean;
  };
  log?: {
    warn: (msg: string) => void;
  };
}

export function hasRelocateMarker(blocks: readonly unknown[] | undefined): boolean {
  if (!blocks || !Array.isArray(blocks)) return false;
  for (const block of blocks) {
    if (block && typeof block === "object" && (block as { type?: unknown }).type === "text") {
      const text = (block as { text?: unknown }).text;
      if (typeof text === "string" && text.includes(RELOCATE_MARKER)) {
        return true;
      }
    }
  }
  return false;
}

export function handleMessageDispatch(
  ctx: MessageDispatchHookContext,
  deps: DispatchHookDeps,
): MessageDispatchHookDecision {
  try {
    const threadBlocked = deps.threadMoves.blocked(ctx.thread.id);
    const relocating = threadBlocked && hasRelocateMarker(ctx.input?.blocks);

    if (threadBlocked && !relocating) {
      return {
        action: "reject",
        message:
          "Chat relocation is unfinished. Repeat Move to section in Projects & Sections to finish moving its files.",
      };
    }

    const intent = ctx.environmentIntent;
    const inputs = intent?.kind === "provider" ? intent.inputs : null;
    const requestedPath =
      ctx.environment?.path ??
      (inputs &&
      typeof inputs === "object" &&
      !Array.isArray(inputs) &&
      typeof (inputs as Record<string, unknown>).path === "string"
        ? ((inputs as Record<string, unknown>).path as string)
        : null);

    const isArchivedOrMoving =
      deps.moves.busy(ctx.project.id) ||
      deps.sectionMoves.busyProject(ctx.project.id) ||
      deps.archives.blocked(ctx.thread.id) ||
      Boolean(requestedPath && ctx.host && deps.archives.moving(ctx.host.id, requestedPath));

    if (isArchivedOrMoving) {
      return {
        action: "reject",
        message:
          "The chat section is archived or moving. Restore it in Projects & Sections.",
      };
    }

    return { action: "proceed" };
  } catch (err) {
    deps.log?.warn?.(`Message dispatch hook failed: ${String(err)}`);
    return { action: "proceed" };
  }
}
