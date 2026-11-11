# PROGRESS — fix-project-drag-reorder-2

attempt lpattempt_03b88d0ae1da442494de1906c52e632f, 2026-11-11T14:23:34.759Z

## files touched
- app.tsx
- project-reorder.test.tsx

## commands and tool calls
- commandExecution: ls /Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders
- commandExecution: ls /Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders
  agents-apply.test.tsx
agents-apply.tsx
agents-template.test.ts
agents-template.ts
app.tsx
appearance.tsx
archive.test.ts
archive.ts
auto-archive.test.ts
auto-archive.ts
backup.test.ts
backup.ts
bb-remembered.test.ts
bb-remembered.ts
cache-keepalive.test.ts
cache-keepalive.ts
CHANGELOG.md
chat-actions.test.tsx
chat-list.test.ts
chat-list.ts
chat-settings.tsx
components
components.json
composer-chip [cut: 1587 chars]
- commandExecution: grep -n "sideNode\|visibleRoots" /Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders/app.tsx | head -40
- commandExecution: ls /tmp/pf-reorder/ && cat /tmp/pf-reorder/check.sh 2>/dev/null; cat /tmp/pf-reorder/vitest.config.mjs 2>/dev/null
- commandExecution: grep -n "sideNode\|visibleRoots" /Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders/app.tsx | head -40
  2561:  const visibleRoots = data.roots.filter(
2860:      {visibleRoots.map((f) => node(f, true))}
3390:  const visibleRoots = data.roots.filter(
3504:  const sideNode = (f: Folder, root: boolean): React.ReactNode => {
3822:            {children.map((c) => sideNode(c, false))}
4801:                {visibleRoots.map((r) => sectionMenu(r))}
4895:          {visibleRoots.map((r) => sideNode(r, true))}
- commandExecution: ls /tmp/pf-reorder/ && cat /tmp/pf-reorder/check.sh 2>/dev/null; cat /tmp/pf-reorder/vitest.config.mjs 2>/dev/null
  check.sh
out.txt
reorder.test.tsx
vitest.config.mjs
#!/bin/sh
# PM red check: runs /tmp/pf-reorder/reorder.test.tsx against the project in the current directory.
exec npx vitest run --config /tmp/pf-reorder/vitest.config.mjs --root "$PWD" /private/tmp/pf-reorder/reorder.test.tsx
export default { server: { fs: { strict: false, allow: ["/"] } }, test: { dir: "/private/tmp/pf-reorder", include: ["** [cut: 26 chars]
- commandExecution: grep -n "panelHidden\|isHidden\|showHidden\|hiddenRoots\|hidden" /Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders/app.tsx | head -50
- commandExecution: grep -n "panelHidden\|isHidden\|showHidden\|hiddenRoots\|hidden" /Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders/app.tsx | head -50
  2151:  hidden = false,
2157:  /** Hidden from the tree; drawn only while «Show hidden» is on. */
2158:  hidden?: boolean;
2279:              <Icon name={hidden ? "Eye" : "EyeOff"} />
2280:              {hidden ? t("Показать в дереве") : t("Скрыть из дерева")}
2327:  // Hidden projects and sections stay out of the tree unless «Show hidden» is on; their chats keep working.
2329:  const showHidden =  [cut: 1158 chars]
- commandExecution: grep -n "pf-hidden\|itemStyles" /Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders/app.tsx
- commandExecution: grep -n "pf-hidden\|itemStyles" /Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders/app.tsx
  2711:          (isHidden(f, root) ? " pf-hidden" : "")
3212:  const { items: itemStyles, saveItem: saveItemStyle } = usePrefs();
3216:    itemStyles[panelHiddenKey(f, root)]?.hidden === true;
3220:      ...(itemStyles[key] ?? {}),
- commandExecution: grep -n "useTree\|function refresh\|const refresh\|archive_list\|rpc.call(\"list\"\|rpc.call('list'" /Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders/app.tsx | head -30
- commandExecution: grep -n "Сдвинуть вверх\|Сдвинуть вниз\|Move up\|Move down" /Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders/translations.ts
- commandExecution: grep -n "useTree\|function refresh\|const refresh\|archive_list\|rpc.call(\"list\"\|rpc.call('list'" /Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders/app.tsx | head -30
  348:function useTree() {
367:  const refresh = useCallback(() => {
368:    rpc.call("list").then(
1436:      rpc.call("list").then(
2324:  const { rpc, data, error, refresh } = useTree();
3086:  const refresh = useCallback(() => {
3087:    rpc.call("archive_list").then(
3151:  const { rpc, data, error, refresh } = useTree();
- commandExecution: grep -n "Сдвинуть вверх\|Сдвинуть вниз\|Move up\|Move down" /Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders/translations.ts
  191:  "Сдвинуть вверх": "Move up",
192:  "Сдвинуть вниз": "Move down",
- commandExecution: cd /Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders && git log --oneline -8 -- app.tsx && git log -1 --format=%H
- commandExecution: cat /Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders/.agents/plans/items/fix-project-drag-reorder-2/PLAN.md /Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders/.agents/plans/items/fix-p
- commandExecution: cd /Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders && git log --oneline -8 -- app.tsx && git log -1 --format=%H
  3535f27 mobile-compact-tree: Compact sidebar tree on phones
e0177cd Release 0.7.6
5ec0d5b fix: align nested chats, guides and show-all rows (0.7.3)
643507b feat: GitLab and Bitbucket links with opt-in visibility checks (#4)
c37d64d feat: configure the starting folder for new projects (#5)
7b93c52 feat: optional native provider icons and themed chat status (#2)
c77984f fix: preserve manual project  [cut: 143 chars]
- commandExecution: cat /Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders/.agents/plans/items/fix-project-drag-reorder-2/PLAN.md /Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders/.agents/plans/items/fix-p
  # Fix: drag-and-drop reorder of projects in the "Projects & Sections" panel

## Symptom (owner)
In the settings panel tree (heading "Проекты"), dragging a project row up shows the drop line but nothing moves. The ro[0mw[0m
 menu item "Сдвинуть вверх" moves the same project fine.

## Root cause (found by PM in app.tsx, settings panel component around lines 3390-3600)
- The rows are rendered from  [cut: 3600 chars]
- tool: {"command":"search","keywords":["project-folders","bb-plugin-authoring","ponytail"],"path":"/Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders"}
- tool: {"command":"search","keywords":["ponytail","bb-plugin"],"source":"plugins"}
- tool: {"command":"search","keywords":["project-folders","bb-plugin-authoring","ponytail"],"path":"/Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders"}
- tool: {"command":"search","keywords":["ponytail","bb-plugin"],"source":"plugins"}
- commandExecution: cd /Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders && git log -L '/const move = (dir/,/^    };/:app.tsx' --oneline | head -60
- commandExecution: cd /Users/vechkasov/.lane-pilot/worktrees/lpattempt_03b88d0ae1da442494de1906c52e632f/bb-plugin-project-folders && git log -L '/const move = (dir/,/^    };/:app.tsx' --oneline | head -60
  4baffa0 Release 0.4.0

diff --git a/app.tsx b/app.tsx
index a254131..d34e429 100644
--- a/app.tsx
+++ b/app.tsx
@@ -1715,0 +2342,4 @@ function Panel({ subPath }: PluginNavPanelProps) {
+    const move = (dir: -1 | 1) => {
+      const other = siblings[at + dir];
+      if (other) reorder(scope, key, other);
+    };
b04b291 Release Projects & Sections 0.2.0 with archive restore and 11 languages

di [cut: 407 chars]

… calls after the first 500 thread events are not shown
