# Context — Есть предложения как можно улучшить дизайн архитектуру нашего плагина на телефо…

Goal: Есть предложения как можно улучшить дизайн архитектуру нашего плагина на телефонах? А то как-то не очень компактно UI смотрится чтоли

## Appetite
One writer task (~1–2 h), roughly ~60–80 changed lines across app.tsx, style.css, i18n.tsx and tests; patch release 0.7.9.

Scope: small; recommendation: go_with_conditions; confidence: 92.

## Decisions
- **L1** (locked): The screen is the sidebar tree only. Management page and settings are not touched (owner confirmed scope).
- **L2** (locked): All mobile changes are scoped to useIsCompactViewport() (<= 767px), except dropping the Inactive pill everywhere.
- **L3** (locked): On compact viewports, status for non-inactive chats is a dot badge on the provider icon with translated aria-label, not a text pill.
- **L4** (locked): On compact viewports, the per-row ⋯ button is rendered only on the active chat row; non-active rows open menu via long-press (~450ms touch timer).
- **L5** (locked): On compact viewports, per-level indent is at most 8px; row heights stay >= 32px (no touch target reduction).
- **L6** (locked): On compact viewports, «Новый проект» is an icon-only button; stays first child button of .pf-tree to preserve theme anchoring.
- **L7** (locked): Language fallback: navigator.language decides before falling back to English when no stored choice exists and document.documentElement.lang lacks ru.
- **L8** (locked): Drill-down navigation is an opt-in setting with nested tree as default (owner instruction); deferred to future phase.
- **F1** (free): Exact dot size and position on provider icon; touch timer duration within 400-600 ms.
- **D1** (deferred): Drill-down navigation design spec and implementation (deferred to future phase after design-lead spec).
- **D2** (deferred): Pokecut theme project card border flattening on phones (handled in separate bb-plugin-pokecut-theme repo).

## No-gos
- No desktop (>= 768px) layout changes other than dropping the «Inactive» status pill.
- No new colors, fonts or design tokens; reuse existing state tokens (--pk-info, --pk-warning, --pk-danger, --pk-success).
- No server, RPC, host or BB core changes.
- No shrinking of touch targets or row heights below 32px.
- No removal of the ⋯ menu button on the active chat row.
- No drill-down navigation in this phase (deferred to later phase as opt-in setting).

## Risks
- value: Chat titles at deep nesting (depth 5+) could still suffer truncation; mitigated by 8px indent clamp and freeing ~150px per row.
- usability: Long-press gesture is less discoverable than ⋯ button; mitigated by keeping ⋯ on active row and canceling timer on scroll movement > 10px.
- feasibility: jsdom tests cannot simulate real iOS Safari touch gestures or rendering; mitigated by testing DOM state in vitest and browser QA.
- viability: Pokecut theme relies on .pf-tree button:first-child; keeping Новый проект as the first child button prevents CSS breakage.
- security: none seen

## Open questions
- Exact long-press threshold: 450 ms (within 400–600 ms range)?
- Exact dot badge diameter: 6px or 8px on top-right of .pf-provider?

Written by Lane Pilot from the analysis (lp.analyze); the plan stands on this file.