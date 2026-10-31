# Context — Есть предложения как можно улучшить дизайн архитектуру нашего плагина на телефо…

Goal: Есть предложения как можно улучшить дизайн архитектуру нашего плагина на телефонах? А то как-то не очень компактно UI смотрится чтоли

## Appetite
One phase, two writer tasks (A: management page + settings nav on phones; B: tree width + touch sizes), one patch release 0.7.9. Roughly under 400 changed lines across app.tsx, style.css, plugin-settings.tsx and tests; about one working day including browser QA at 375 and 390px.

Scope: medium; recommendation: go_with_conditions; confidence: 66.

## Decisions
- **L1** (locked): Keep the BB-native look: .pf-tabs pills, Button/DropdownMenu from components/ui, existing tokens only, no new colours, fonts or shadows.
- **L2** (locked): Ship as a patch version bump with a CHANGELOG entry and a GitHub release.
- **L3** (locked): Phone fixes must not shrink touch targets: no auto 'compact' density on phones, no rows under the current 32-36px.
- **L4** (locked): Re-run the GitNexus analyze, then impact on Panel / Tree / ThreadRow / FolderHeading / SettingsNav before any edit; detect_changes before commit.
- **L5** (locked): Desktop layout above 860px stays unchanged; all changes are scoped to useIsCompactViewport (767px) or phone media/container queries.
- **F1** (free): Management page on phones: list then details with a back button (recommended), or minimal fixes (no nested 320px scroll, scroll to details on select).
- **F2** (free): Settings nav on phones as horizontal chips, reusing the rail styles, or as a collapsible group.
- **F3** (free): Phone spacing values for .pf-panel padding, h1 size, .pf-card padding and margin, and whether the intro paragraph is shown or collapsed.
- **F4** (free): Save tree width on phones: smaller per-level step, status pill as a dot, shorter device badge.
- **F5** (free): Adopt BB coarse-pointer sizes for .pf-icon and tree rows.
- **F6** (free): Whether «Новый проект» above the tree becomes an icon in a header row on phones.
- **D1** (deferred): BB host sidebar width and drawer behaviour (BB core, not this repo).
- **D2** (deferred): Composer chip / section-environment phone layout: not inspected in gather.
- **D3** (deferred): Dialogs and menus: already bottom drawers on phones.
- **D4** (deferred): Removing the chat-row ⋯ on phones.

## No-gos
- No new colours, fonts, shadows or design tokens.
- No changes to the desktop layout above 860px.
- No server, RPC or host changes.
- No changes to dialog, dropdown or responsive-overlay primitives.
- No shrinking of touch targets and no auto 'compact' density on phones.
- No removal of the chat-row ⋯ button.
- No BB core patches.

## Risks
- value: The owner may mean the sidebar tree rather than the management page; fixing the wrong screen leaves the complaint standing.
- usability: Hiding the chat-row ⋯ on phones would leave iOS users without the chat menu: the only alternative is onContextMenu (app.tsx:1821-1825), which iOS Safari is not known to fire on long-press (platform knowledge, not checked on a device).; A list-then-details layout on phones changes navigation; links into the page (subPath select/chat, app.tsx:3181, 2459-2460, 2691-2692) and the back button must land on the right view.; Narrowing the tree indent on phones can make deep hierarchies harder to read.
- feasibility: The 860/719/559px CSS breakpoints can't be exercised in jsdom; test-match-media.ts only switches the 767px query, so regressions can only be seen in a browser.; app.tsx is 4916 lines and the GitNexus index is 10 commits behind, so impact results may miss callers of Panel or Tree internals.
- viability: Custom phone layout drifts from BB-native mobile patterns and can break after BB updates its shell or tokens.

## Open questions
- Which screen looks bloated on the phone: the sidebar tree, the management page, or both? A screenshot would settle it.
- iOS or Android? This decides whether long-press can replace ⋯ (R1).
- Management page on phones: list then details with a back button (F1, recommended), or only spacing fixes plus settings chips?
- Does the owner use the 'compact' density setting on the phone today?

Written by Lane Pilot from the analysis (lp.analyze); the plan stands on this file.