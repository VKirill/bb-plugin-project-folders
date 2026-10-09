# Project / section card redesign (project-folders 0.6.32)

- [x] Accepted in Lane Pilot run `lprun_94fe112109c04e95be6ed6b833f6330c` (2026-10-09).

Implement sections R1–R7 of the design-lead proposal below in one task, starting with a failing test that reproduces P0.

PM decisions on the open questions:
1. Use underline nav tabs as proposed.
2. Confirm P0 with a test first; R5 (one dirty-driven save bar) is the UX either way.
3. The section «Свой шаблон» note is wrong copy: change it so it points to the «Применить к существующим разделам» button in plugin settings (which applies to all sections), same wording style as the project note.
4. The greyed host tab stays out of scope.
Also bump package.json to 0.6.32 (patch only) and add a CHANGELOG entry.

---

## 0. Where the code is

| Region | Location | Note |
| --- | --- | --- |
| Project **and** section card | `app.tsx` ~4023–4530 (`const details = …`) | One render serves both. `selRoot` = project, `!selRoot` = section. |
| Group card | `app.tsx` ~3925–4021 (`const groupDetails`) | Same `pf-details-actions` row and same problems. |
| Sidebar tree `⋯` menu | `app.tsx` ~3437–3617 | Reference for action order and danger styling (`DropdownMenuItem variant="destructive"` after a separator). |
| AGENTS.md / CLAUDE.md file editors | `app.tsx` ~3848–3923 (`const fileEditors`) | Passed into `RuleFields` as `fileSlot`. |
| Rules fields (mode switch, «Свои правила», «Куда применять», «Стартовое поручение») | `agents-apply.tsx` 238–387 (`RuleFields`) | Shared with the «Правила» dialog (`app.tsx` ~871, `namePrefix="pf-dialog"`); check both places. |
| Styles | `style.css` 263–311 (`.pf-tabs/.pf-tab`), 371–399, 465–505, 556–583, 677–736, 992–1030 | `.pf-details-actions` is declared twice (465 and 579). |

## 1. Problems

- **P0 (functional).** `app.tsx` ~4465: the «Сохранить» button for `ruleDraft` renders only when `ruleDraft.mode !== "manual" || ruleModeSaved !== "manual"`. With stored mode «Свой файл», the «Свои правила» / «Стартовое поручение» textareas are editable but nothing calls `saveRules()`; the file editor's own save (`saveCardRules`) writes only AGENTS.md/CLAUDE.md. Text is lost.
- **P1.** No hierarchy: host switch, card tabs and rules-mode switch are identical `.pf-tabs` pills; labels same weight as body text.
- **P2.** Action row overflow: 7 buttons (project) / up to 9 (section), mixed outline and ghost, wraps to 2–4 lines. Section «Правила» button duplicates the «Правила» tab; «Изменить путь» duplicates the folder button.
- **P3.** «Удалить» is a plain ghost button next to «Рабочие копии»; the tree menu does it right (separator + destructive last).
- **P4.** ~45px dead space under the AGENTS.md textarea (stacked `.pf-field` margin 18px + `.pf-rules` margin 8px 0 16px + `.pf-file-editors` padding); textarea clipped at max-height 240px with `field-sizing: fixed`. «Свои правила» 4-row and «Стартовое поручение» 3-row empty textareas with no placeholders.
- **P5.** «Куда применять» sits below «Свои правила» with `margin: -8px 0 14px`, reads as belonging to «Стартовое поручение»; in «Свой файл» mode it is disabled and forced to «В сессии BB» with no explanation. Note «Плагин не вписывает в эти файлы ничего…» names files before any file is shown. Project «Свой шаблон» note points to a button that lives in plugin settings.
- **P6.** Action sets/order differ between card, group card and tree menu. Tree row `⋯` aria-label «Действия чата: {name}» is wrong for a folder menu (`app.tsx` ~3445).
- **P7.** Below ~420px the action row wraps 3–4 lines and pushes tabs off screen.

## 2. Target layout

Principles: pill segmented = choose a value (host, rules mode) — unchanged BB-native `.pf-tabs`. Underline tabs = navigate card pages (Правила / Провайдер / Контекст сессии). Two primary actions plus `⋯`; everything else in one menu in the tree-menu order, «Удалить» last after a separator in destructive style. Textareas start small and grow. No unexplained disabled controls. One save bar per tab.

### Wide (card ≥ 560px)
```
┌──────────────────────────────────────────────────────────────────────────┐
│ SelfyStudio                          [⊕ Новый чат] [⊞ Новый раздел] [⋯] │
│ ( ⚡MAC Mini │ ⚡OVH Server │ ⚡MacBook Pro — Кирилл )                     │
│ [/Users/…/SelfyStudio                                            ] [📁] │
│  Правила    Провайдер    Контекст сессии                                 │  ← underline tabs
│  ━━━━━━━──────────────────────────────────────────────────────────────── │
│ Правила AGENTS.md (?)                                                    │
│ ( По умолчанию │ Свой шаблон │ Свой файл )                                │
│ Файлы ведёте вы: плагин не дописывает в них ни шаблон, ни свои правила.  │
│ ┌ AGENTS.md · MAC Mini ─────────────────────────────── [⌄ Развернуть] ┐ │
│ │ … ~11 lines, bottom fade …                                           │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│ Свои правила (?)                    Куда применять [В сессии BB      ⌄] │
│ [ Например: отвечай по-русски, коммиты — по Conventional Commits    ]    │  ← 2 rows, grows
│ Стартовое поручение (?)                                                  │
│ [ Например: запусти скилл и пришли текущие задачи                   ]    │
│                                          [Отмена] [Сохранить]  (dirty)   │
└──────────────────────────────────────────────────────────────────────────┘
⋯ project: Переименовать, Оформление, Скрыть из дерева/Показать…, Рабочие копии, Новая группа, ───, Удалить (red)
⋯ section: Переименовать, Оформление, Скрыть/Показать…, Переместить в группу… (if targets), Изменить путь, Новая группа, ───, Удалить (red)
```
In «Свой файл» mode the select is replaced by muted static text `Куда применять: только в сессии BB` with a Help.

### Narrow (card < 560px)
Title + `⋯` on line 1; «Новый чат» «Новый раздел» on line 2, never wrapping further; host and nav tabs scroll horizontally inside themselves; AGENTS.md expand button icon-only; «Куда применять» drops under the «Свои правила» label; save bar sticky at the bottom when dirty.

### Keep exactly as BB native
`.pf-tabs`/`.pf-tab` pill look for host switch and rules mode; `Input` + outline icon `Button` path control; `Help` bubble; `Button` variants from `components/ui/button.tsx`; `DropdownMenu*` from `components/ui/dropdown-menu.tsx` with `variant="destructive"` for delete; `.pf-card` frame; existing tokens only (`--border`, `--muted-foreground`, `--state-hover`, `--destructive`). No new colours, fonts, shadows.

## 3. Change list

### R1. Header — `app.tsx` `details` (~4023, ~4207–4384)
1. Wrap `<h2>{sel.name}</h2>` and actions in `<div className="pf-details-head">`: h2 (flex 1, min-w-0, truncate) and `<div className="pf-details-primary">`.
2. `pf-details-primary`: existing outline «Новый чат», existing outline «Новый раздел» (handlers unchanged), new `DropdownMenu` → trigger `Button size="sm" variant="ghost" className="w-8 px-0" aria-label={t("Другие действия")}` with `<Icon name="MoreHorizontal" />` → `DropdownMenuContent align="end"`.
3. Move into `DropdownMenuItem`s (same handlers, icons, labels, conditions): Переименовать, Оформление, Скрыть из дерева/Показать в дереве (keep `data-testid="pf-toggle-hidden"` on the item), Переместить в группу… (section, if `reparentTargets(...)`), Изменить путь (section), Рабочие копии (project). Add «Новая группа» (`setModal({ action: "group", target, folder: sel, level: selLevel })`, as in the tree menu). Then `DropdownMenuSeparator`, then «Удалить» as `DropdownMenuItem variant="destructive"` (`forget` for a section, `remove` for a project, unchanged).
4. Delete the section-only «Правила» button (~4245–4263); the tab covers it and the tree menu keeps the dialog.
5. Delete the old `pf-details-actions` row from `details`.
6. Same for `groupDetails` (~3938–4019): primaries «Новый раздел» (outline) and «Новая группа» (switch to outline); `⋯` holds Переименовать, Оформление, Переместить в группу…, separator, «Удалить группу» (destructive).
7. Order inside `⋯` matches the tree `⋯` menu (~3450–3615). Optionally extract a shared `cardMenuItems(...)` helper; otherwise keep order in sync by hand.

### R2. Card nav tabs — `app.tsx` ~4386–4430, `style.css`
- Keep markup (`role="tablist"`, `pf-tab`, `pf-selected`); className `pf-tabs pf-details-nav pf-tabs-underline`.
- `.pf-tabs-underline { background: transparent; padding: 0; gap: 16px; border-radius: 0; border-bottom: 1px solid var(--border); display: flex; width: 100% }`
- `.pf-tabs-underline .pf-tab { padding: 8px 2px; border-radius: 0; margin-bottom: -1px; border-bottom: 2px solid transparent }`
- `.pf-tabs-underline .pf-tab.pf-selected { background: transparent; box-shadow: none; border-bottom-color: var(--foreground); color: var(--foreground) }`
- `.pf-details-nav + .pf-agents-rule { border-top: 0; padding-top: 0; margin-top: 14px }`

### R3. AGENTS.md / CLAUDE.md editors — `app.tsx` `fileEditors` (~3848–3923), `style.css` 493–509
- Replace `<label className="pf-field">AGENTS.md · {machine}` with `<div className="pf-file-head"><span>AGENTS.md · {machineName(cardHost)}</span><Button size="sm" variant="ghost" aria-expanded={expanded} onClick={toggle}><Icon name={expanded ? "ChevronUp" : "ChevronDown"} />{expanded ? t("Свернуть") : t("Развернуть")}</Button></div>` then the textarea (keep its `aria-label`). Same for CLAUDE.md. `expanded` = local `useState(false)`, reset on `cardHost` change (existing `key={cardHost}`).
- Collapsed: `.pf-file-editors .pf-rules { max-height: 11lh; overflow: auto; field-sizing: fixed; margin: 0 }` with `rows={8}`; 24px bottom fade `mask-image: linear-gradient(to bottom, #000 calc(100% - 24px), transparent)` only `:not(:focus)`.
- Expanded (`.pf-file-editors.pf-expanded .pf-rules`): `field-sizing: content; max-height: 70vh; mask-image: none`.
- Inside `.pf-file-editors`: `.pf-field { margin: 0 }`, `.pf-rules { margin: 0 }`; `.pf-file-editors { gap: 8px; padding: 10px 12px 12px }`.
- When `cardDraft !== cardSaved`, force expanded. Save/Cancel of the file editor stay in its footer.

### R4. Rules fields — `agents-apply.tsx` `RuleFields` (238–387) (card **and** dialog)
- «Свои правила» label row: `<div className="pf-agents-labelrow">` with label + Help left and the «Куда применять» control right (move `<label className="pf-agents-target">` above the textarea). CSS `.pf-agents-labelrow { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px }`; `.pf-agents-target { margin: 0 }`.
- Manual mode: render `<span className="pf-agents-target pf-agents-fixed">{t("Куда применять")}: {t("только в сессии BB")}<Help text={t("В режиме «Свой файл» плагин не пишет в файлы, поэтому свои правила действуют только в сессиях, запущенных из BB.")} /></span>` instead of the disabled select. `.pf-agents-fixed { color: var(--muted-foreground); font-weight: 400 }`.
- «Свои правила» and «Стартовое поручение»: `rows={2}`, class `pf-rules-grow`; `.pf-rules-grow { field-sizing: content; min-height: calc(2lh + 22px); max-height: 320px; resize: vertical; margin: 6px 0 14px }`; placeholders from R7.
- «Свой шаблон» template textareas: `pf-rules-grow`, `rows={3}`.

### R5. One save bar for the rules tab — `app.tsx` ~4462–4480 (P0 fix)
- Snapshot `ruleDraftSaved` where `setRuleDraft` loads (~3660) and after a successful `saveRules`. `ruleDirty = JSON.stringify(ruleDraft) !== JSON.stringify(ruleDraftSaved)`.
- Render `<div className="pf-agents-actions pf-save-bar">` whenever `ruleDirty` (any mode, including «Свой файл») with ghost «Отмена» (restore snapshot) and «Сохранить» → `saveRules()`; keep the existing «Сохранено» state.
- `.pf-save-bar { justify-content: flex-end; position: sticky; bottom: 0; padding: 10px 0; background: var(--background); border-top: 1px solid var(--border) }`.
- The AGENTS.md file editor keeps its own Save/Cancel.

### R6. Responsive — `style.css`
- `.pf-details { container-type: inline-size; }`
- `.pf-details-head { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; margin-bottom: 8px }`; `.pf-details-head h2 { flex: 1 1 auto; min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }`; `.pf-details-primary { display: flex; gap: 8px; flex: none }`.
- `@container (max-width: 559px)`: `⋯` trigger as its own child of `.pf-details-head` with `order: 2`, title `order: 1`, `.pf-details-primary { order: 3; flex-basis: 100% }`; `.pf-file-head .pf-btn-label { display: none }`.
- Remove duplicate `.pf-details-actions` rules (465–476, 579–584) if nothing uses the class anymore (search).

### R7. Strings (`t()` keys; `translations.ts` english + all `locales/*.json`; `i18n.test.ts` requires non-empty values)
| Where | Old → New |
| --- | --- |
| Manual-mode note (`RuleFields`) | «Плагин не вписывает в эти файлы ничего: ни шаблон, ни свои правила.» → «Файлы ведёте вы: плагин не дописывает в них ни шаблон, ни свои правила.» |
| Project «Свой шаблон» note (`app.tsx` ~4455) | «…и по кнопке «Применить к существующим разделам».» → «…и по кнопке «Применить к существующим разделам» в настройках плагина.» |
| Section «Свой шаблон» note | point to the same plugin-settings button (applies to all sections), not «для этого раздела» |
| «Куда применять» option | «И туда и туда» → «В файл и в сессию BB» |
| New | «Другие действия» — EN "More actions" |
| New | «Развернуть» / «Свернуть» — EN "Expand" / "Collapse" (reuse if present) |
| New | «только в сессии BB» — EN "BB sessions only" |
| New help | «В режиме «Свой файл» плагин не пишет в файлы, поэтому свои правила действуют только в сессиях, запущенных из BB.» |
| New placeholder | «Например: отвечай по-русски, коммиты — по Conventional Commits» |
| New placeholder | «Например: запусти скилл и пришли текущие задачи» |
| Tree `⋯` aria-label (~3445) | «Действия чата: {name}» → «Действия: {name}» (key «Действия», EN "Actions") |
All other Russian labels stay.
