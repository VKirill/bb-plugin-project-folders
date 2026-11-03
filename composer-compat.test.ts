import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { useComposer } from "@get-bb/plugin-sdk/app";
import {
  composerCanSetSelection,
  onComposerSubmitted,
} from "./composer-compat";

type Composer = ReturnType<typeof useComposer>;
const composer = (methods: Partial<Composer>) => methods as Composer;

describe("a composer from BB before 0.43.3", () => {
  it("cannot set the pickers", () => {
    expect(composerCanSetSelection(composer({}))).toBe(false);
  });
  it("takes a submit listener without failing and never calls it", () => {
    const listener = vi.fn();
    const dispose = onComposerSubmitted(composer({}), listener);
    expect(() => dispose()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("a composer from BB 0.43.3 or later", () => {
  it("sets the pickers", () => {
    const setSelection = vi.fn();
    expect(
      composerCanSetSelection(
        composer({ experimental_setSelection: setSelection }),
      ),
    ).toBe(true);
  });
  it("passes the listener through and returns its disposer", () => {
    const dispose = vi.fn();
    const target = {
      experimental_onSubmitted(this: unknown, listener: () => void) {
        expect(this).toBe(target);
        listener();
        return dispose;
      },
    };
    const listener = vi.fn();
    onComposerSubmitted(composer(target), listener)();
    expect(listener).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });
});

// BB installs a marketplace plugin by probing only the newest 10 release tags.
// Raising this floor locks every older BB out of the install with nothing but
// "no release … runs on this bb", so a new BB API is feature-tested instead
// (see composer-compat.ts). Below BB 0.43.0 the environment-provider API the
// plugin is built on does not exist.
describe("the BB versions the plugin installs on", () => {
  it("stays at BB 0.43.0 and its plugin SDK 0.4.84", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("./package.json", import.meta.url), "utf8"),
    ) as { engines: { bb: string; bbPluginSdk: string } };
    expect(pkg.engines).toEqual({ bb: ">=0.43.0", bbPluginSdk: ">=0.4.84" });
  });
});
