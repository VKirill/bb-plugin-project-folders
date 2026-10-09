import { describe, it, expect, vi } from "vitest";
import { makeMessageDispatchHookContext } from "@get-bb/plugin-sdk/testing";
import { handleMessageDispatch, hasRelocateMarker, type DispatchHookDeps } from "./dispatch-hook";
import { RELOCATE_MARKER } from "./thread-move";

describe("hasRelocateMarker", () => {
  it("detects marker only in text blocks", () => {
    expect(hasRelocateMarker(undefined)).toBe(false);
    expect(hasRelocateMarker([])).toBe(false);
    expect(hasRelocateMarker([{ type: "image", url: `data:${RELOCATE_MARKER}` }])).toBe(false);
    expect(hasRelocateMarker([{ type: "text", text: "hello world" }])).toBe(false);
    expect(
      hasRelocateMarker([
        { type: "text", text: "hello" },
        { type: "text", text: `${RELOCATE_MARKER} move thread` },
      ]),
    ).toBe(true);
  });
});

describe("handleMessageDispatch", () => {
  function createDeps(overrides?: Partial<DispatchHookDeps>): {
    deps: DispatchHookDeps;
    warnLogs: string[];
  } {
    const warnLogs: string[] = [];
    const deps: DispatchHookDeps = {
      threadMoves: {
        blocked: vi.fn(() => false),
      },
      moves: {
        busy: vi.fn(() => false),
      },
      sectionMoves: {
        busyProject: vi.fn(() => false),
      },
      archives: {
        blocked: vi.fn(() => false),
        moving: vi.fn(() => false),
      },
      log: {
        warn: (msg: string) => {
          warnLogs.push(msg);
        },
      },
      ...overrides,
    };
    return { deps, warnLogs };
  }

  it("normal proceed when no move or archive is blocked", () => {
    const { deps } = createDeps();
    const ctx = makeMessageDispatchHookContext({
      thread: { id: "t1" } as any,
      project: { id: "p1" } as any,
      input: {
        text: "hello",
        blocks: [{ type: "text", text: "hello" }],
      },
    });

    const decision = handleMessageDispatch(ctx, deps);
    expect(decision).toEqual({ action: "proceed" });
    expect(deps.threadMoves.blocked).toHaveBeenCalledTimes(1);
  });

  it("reject while a move is blocked", () => {
    const { deps } = createDeps({
      threadMoves: {
        blocked: vi.fn(() => true),
      },
    });
    const ctx = makeMessageDispatchHookContext({
      thread: { id: "t1" } as any,
      project: { id: "p1" } as any,
      input: {
        text: "regular message",
        blocks: [{ type: "text", text: "regular message" }],
      },
    });

    const decision = handleMessageDispatch(ctx, deps);
    expect(decision).toEqual({
      action: "reject",
      message:
        "Chat relocation is unfinished. Repeat Move to section in Projects & Sections to finish moving its files.",
    });
    // Checked blocked once
    expect(deps.threadMoves.blocked).toHaveBeenCalledTimes(1);
  });

  it("marker lets the relocation message through when thread move is blocked", () => {
    const { deps } = createDeps({
      threadMoves: {
        blocked: vi.fn(() => true),
      },
    });
    const ctx = makeMessageDispatchHookContext({
      thread: { id: "t1" } as any,
      project: { id: "p1" } as any,
      input: {
        text: `${RELOCATE_MARKER} relocation message`,
        blocks: [{ type: "text", text: `${RELOCATE_MARKER} relocation message` }],
      },
    });

    const decision = handleMessageDispatch(ctx, deps);
    expect(decision).toEqual({ action: "proceed" });
    expect(deps.threadMoves.blocked).toHaveBeenCalledTimes(1);
  });

  it("thrown error proceeds with a warning log", () => {
    const { deps, warnLogs } = createDeps({
      threadMoves: {
        blocked: vi.fn(() => {
          throw new Error("Database locked");
        }),
      },
    });
    const ctx = makeMessageDispatchHookContext({
      thread: { id: "t1" } as any,
      project: { id: "p1" } as any,
    });

    const decision = handleMessageDispatch(ctx, deps);
    expect(decision).toEqual({ action: "proceed" });
    expect(warnLogs).toHaveLength(1);
    expect(warnLogs[0]).toContain("Database locked");
  });

  it("computes threadMoves.blocked once and does not inspect blocks when not blocked", () => {
    const blockedSpy = vi.fn(() => false);
    const { deps } = createDeps({
      threadMoves: {
        blocked: blockedSpy,
      },
    });

    let blocksInspected = false;
    const blocksProxy = new Proxy([{ type: "text", text: "dummy" }], {
      get(target, prop, receiver) {
        blocksInspected = true;
        return Reflect.get(target, prop, receiver);
      },
    });

    const ctx = makeMessageDispatchHookContext({
      thread: { id: "t1" } as any,
      project: { id: "p1" } as any,
      input: {
        text: "dummy",
        blocks: blocksProxy,
      },
    });

    const decision = handleMessageDispatch(ctx, deps);
    expect(decision).toEqual({ action: "proceed" });
    expect(blockedSpy).toHaveBeenCalledTimes(1);
    expect(blocksInspected).toBe(false);
  });

  it("rejects when project moves or section moves or archives are busy/blocked", () => {
    const { deps } = createDeps({
      moves: {
        busy: vi.fn(() => true),
      },
    });
    const ctx = makeMessageDispatchHookContext({
      thread: { id: "t1" } as any,
      project: { id: "p1" } as any,
    });

    const decision = handleMessageDispatch(ctx, deps);
    expect(decision).toEqual({
      action: "reject",
      message:
        "The chat section is archived or moving. Restore it in Projects & Sections.",
    });
  });
});
