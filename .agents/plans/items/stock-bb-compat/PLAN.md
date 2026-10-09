# Stock-BB compatibility fixes (project-folders 0.6.33)

- [x] Accepted in Lane Pilot run `lprun_94fe112109c04e95be6ed6b833f6330c` (2026-10-09).

An audit of 0.6.31 against stock BB (no vk core patches) found these defects. Fix all of them in one task.

## 1. engines.bbPluginSdk is too low (blocker)
`package.json` declares `"bbPluginSdk": ">=0.4.84"`, but the code uses APIs absent from SDK 0.4.84 and 0.4.87 `.d.ts` and present in the pinned 0.4.104: `experimental_onSubmitted` and `experimental_setSelection` (unguarded calls at `composer-chip.tsx:217,293` and `section-environment.tsx:215,287`), `pluginSubmission` on `threads.send` (cache-keepalive, `server.ts` ~187) and `experimental_discoverable` (`server.ts` ~3634). A BB with an SDK between 0.4.84 and 0.4.103 throws in the composer UI. Fix: set `engines.bbPluginSdk` to `">=0.4.104"`. Do not change `engines.bb` or the devDependency pin.

## 2. Cache keepalive must be opt-in for other users
`cache-keepalive.ts`: `defaultCacheKeepaliveConfig.enabled` is `true`, so every user who installs the plugin gets real paid turns sent into their pinned Claude threads without consent. Change the default to `enabled: false` (keep `periodMinutes: 55`, `maxWakes: 0`). Make the ping text language-neutral: the example inside the message must not be Russian; use e.g. `«🕯 cache kept warm ${wake}/${maxLabel}»` while still asking for a reply in the conversation's language. Update `cache-keepalive.test.ts` for the new default (tests that need it on pass `enabled: true` explicitly) and add a test that the default config sends no ping. Check that every keepalive settings string in `plugin-settings.tsx` has an entry in `translations.ts` (English) and in all `locales/*.json` (non-empty); add the missing ones.

## 3. Harden the message.dispatch hook (server.ts ~2189–2227)
This hook runs on every message in every project of every user.
- `JSON.stringify(ctx.input.blocks)` serialises the whole input (attachments included) on every send. Only check for `RELOCATE_MARKER` when `threadMoves.blocked(ctx.thread.id)` is true, and check text blocks only.
- `threadMoves.blocked(...)` is called twice; compute it once.
- Wrap the hook body in try/catch: on any thrown error log it with `bb.log.warn` and return `{ action: "proceed" }`, so a bug in move/archive bookkeeping never blocks users' messages.
- Behaviour otherwise identical: same reject messages, same conditions.
Add tests in `server.test.ts` (or a new `dispatch-hook.test.ts` if the hook is easier to test extracted into a small exported function in a new file `dispatch-hook.ts`): proceeds normally; rejects while a thread move is blocked unless the marker is present; proceeds (does not throw) when a bookkeeping call throws; does not stringify blocks when no move is blocked.

## 4. Version
Bump `package.json` to 0.6.33 (patch only) and add a CHANGELOG entry listing the three fixes. The current version when you start will be 0.6.32 (this task runs after the card redesign task).
