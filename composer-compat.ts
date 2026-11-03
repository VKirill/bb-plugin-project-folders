import type { useComposer } from "@get-bb/plugin-sdk/app";

type Composer = ReturnType<typeof useComposer>;

/**
 * BB 0.43.0–0.43.2 ship a composer without `experimental_setSelection` and
 * `experimental_onSubmitted` (both arrived with BB 0.43.3). The plugin installs
 * on those versions, so every call goes through these checks instead of
 * raising `engines.bb` and locking older BB out of the install.
 */
export function composerCanSetSelection(composer: Composer): boolean {
  return (
    typeof (composer as Partial<Composer>).experimental_setSelection ===
    "function"
  );
}

/** Subscribe to sent messages; a no-op where the composer cannot report them. */
export function onComposerSubmitted(
  composer: Composer,
  listener: () => void,
): () => void {
  const subscribe = (composer as Partial<Composer>).experimental_onSubmitted;
  return typeof subscribe === "function"
    ? subscribe.call(composer, listener)
    : () => undefined;
}
