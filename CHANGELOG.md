# Changelog

## 0.6.22 — Hide from the management page too

- **Hide from the tree / Show in the tree** is also a button on the project and section page, next to Rename and Appearance, and an item of the page's tree menu; 0.6.21 had it only in the sidebar menu.

## 0.6.21 — Hide projects and sections from the tree

- **Hide from the tree** in the menu of any project or section takes it out of the sidebar on every device; its chats and the work in it go on as before.
- **Show hidden projects and sections** in Chat list settings brings them back, dimmed, with **Show in the tree** in their menu; the same settings list everything hidden by name, each with a way back.

## 0.6.20 — Archive every device copy on project delete

- **Move files to the archive** now archives each local working copy, not only a single-folder project.

## 0.6.19 — Project-root chats stay at the project

- A section that points at the project folder no longer steals chats started at the project. Those chats stay at the root unless you file them into the section.

## 0.6.18 — Shared section folders and per-device paths

- Several sections (SEO, Ads, SMM) may point at the same folder.
- A section can have its own path on each device, like a project copy: card device tabs, `section_path_set` / `path-set`.

## 0.6.17 — Sections for other plugins

- A read-only, discoverable `sections_list` RPC gives other plugins a project's sections with their folders, so Lane Pilot can keep settings per section.

## 0.6.16 — Lane Pilot from a section chat

- A section's new chat forwards the composer's hidden plugin data (`pluginSubmission`) to the thread; the request schema dropped it, so a Lane Pilot profile never reached its dispatch hook.
- A Lane Pilot profile enabled in the composer wins over the section's pinned agent, as a hand-picked agent already does.

## 0.6.15 — Background history export

- Coalesce automatic export events in a persistent, serial queue; retry failures without holding lifecycle handlers open.
- Skip unchanged snapshots, use 20-segment pages and yield between requests. Changed history still traverses the full timeline.
- Keep manual sync, move and archive exports complete; preserve the previous snapshot on a failed page write.


## 0.6.14

- The required flag from BB now reaches the Session context editor; the RPC schema dropped it in 0.6.13.

## 0.6.13

- **The lock follows BB.** A plugin BB itself marks as required (`required` in the experimental context contributions) is shown locked in Session context too, not only the ones this plugin knows about.

## 0.6.12

- **What BB needs stays in every session.** In Session context, Project checkout (`environment-project-checkout`), Project folders and the `bb-bridge` MCP server are listed first, marked as required by BB, and locked: ticked in an "only selected" list, unticked in an "all except" list. Saved rules never send them to core as excluded, and an allow list always includes them, so threads keep loading.

## 0.6.11

- **Opening a chat does not move its project or section.** Sort still uses unread replies, a busy agent, and real conversation activity. A visit or read without a message is ignored.

## 0.6.10

- **No empty ⋯ menu in the section composer.** The one-click Section control is a fallback for when BB's project chip is missing and renders nothing otherwise; as a composer action it still took a plugin slot, and where it was the only overflow item BB showed ⋯ opening on nothing. It is a banner now, so it takes no slot.

## 0.6.9

- **An excluded BB plugin is gone from the place, not just from the session.** With BB core `vk.8` a plugin the section's rules leave out shows no controls in that place's composer (new thread and follow-up) and its `message.dispatch` hooks are skipped there. The hint under BB plugins says so.

## 0.6.8

- **Session context shows what each BB plugin adds to a session.** Under every plugin in the BB plugins group: instructions, how many tools and skills, whether it picks them per thread, or that it adds nothing to sessions. Plugins that shape the session are listed first. Needs BB core `vk.7`.

## 0.6.7

- **The project and section card switches between Rules, Provider and Session context.** Session context stays hidden when BB has no experimental session API, so stock BB is unchanged.

## 0.6.6

- **Two more switches in Session context.** **Project instructions** leaves out `AGENTS.md` / `CLAUDE.md` of the section folder and its parents and the workspace `.bb/AGENTS.md` (Claude Code and Codex fully, OpenCode together with its project config, not Cursor). **Skills and plugins from claude.ai** stops Claude Code syncing them from the account. Both inherit like the other groups; they need BB core `vk.6`.
- **Opening an unread chat no longer drops its section.** The open chat keeps that section at the top; unread still ranks above idle ones.

## 0.6.5

- **Chat sort and section sort are separate items in ⋯ and right-click.** Chats: activity, title, newest. Sections: active first or manual order.

## 0.6.4

- **Sections with live chats float to the top.** An unread reply goes first, then a busy agent, then recent activity. Manual order stays on the management page and when the chat-list switch is off.
- **Idle sections collapse after a set time, including empty ones.** The threshold is hours or days (default 2 hours).

## 0.6.3

- **MCP servers of Claude plugins are offered in the editor.** The machine inventory reads the `.mcp.json` of every enabled Claude plugin (agentmemory, winnow…). With BB core `vk.5` an allow list can keep such a server on its own.

## 0.6.2

- **Cursor honors the MCP group too.** With the matching BB core (`vk.4`) a Cursor (and Grok) session drops MCP servers the rules exclude; the hint next to the editor says so.

## 0.6.1

- **The session switch for `<dataDir>/AGENTS.md` says what it is.** “Personal BB rules” is now **BB-wide instructions**, with the file's path on the BB server and a note when the file does not exist. Groups with no rule anywhere read **BB default** instead of “as in BB”.

## 0.6.0

- **Session context, on BB builds that support it.** A new settings section and a block on every project and section card choose which BB plugins, skills, MCP servers and CLI plugins an agent session loads, and whether personal `<dataDir>/AGENTS.md` rules apply. Groups inherit one at a time from the section above, the project and the plugin. The rules reach core through the experimental `bb.agents.experimental_vkSessionPolicy`; the editor lists names found on the section's machine. On stock BB the API is absent, the UI stays hidden and nothing is sent.

## 0.5.6

- **Working rules no longer dump the file over the chat.** Right-click → Working rules put `CLAUDE.md` in an unbounded preview. The Own file tab now edits `AGENTS.md` and `CLAUDE.md` in capped fields, and `rules_read` accepts either a string or `{ content }` from `files.read`.

## 0.5.5

- **Chats nobody opened for 48 hours hide under Show all.** Each section still respects the count limit; pinned, unread, busy and the open chat stay in the short list. The hours are a chat-list setting (0 turns the age rule off).
- **The GitHub mark follows a nested folder and refreshes after the host lookup.** Walking up finds `.git` under a section that is not the repo root. After the host batch fills the cache the tree republishes, so a newly pointed section does not stay unmarked. An anonymous GitHub lookup paints a private (or missing) repo as a black cat.

## 0.5.4

- **A section with a GitHub remote shows a small GitHub mark left of +.** The plugin reads `.git` and `origin` on the section's machine (HTTPS or `git@github.com:`), then lists `githubUrl` on folders and roots. Groups stay unmarked. The first list may omit the mark until the host batch returns; a click opens the repo and does not expand the row.
- **Section rules are no longer capped at two levels.** Creating a section or applying the template writes `AGENTS.md` at any depth (groups still skip). The Rules card and apply list follow the same rule: nearest ancestor, then the project, then the shared template.

## 0.5.3

- **The chip keeps naming the section it applied.** Choosing a section sets its project, which remounts every plugin surface in the composer — so the chip fell back to the project name a moment after choosing, as the live check on the hub showed. The chosen place now lives in a store the surfaces share, kept in the tab and published to all of them, and a pick that belongs to the project being switched to survives the switch.
- **Every project BB offers is in the chip, in BB's order** — including **No project** and a project the plugin has no folder for. Replacing BB's chip must not take a place to work away; the plugin's tree only adds the sections underneath.

## 0.5.2

- **The section tree is in BB's project chip now.** Pressing **New thread** in the sidebar opened a chip with a flat list of projects: the sections were only in the plugin's own screen or behind the composer's **Section** control, which BB folds into the `⋯` overflow when the action row is full. The chip now opens the whole tree — projects with their sections under them, every device — and picking a place sets both the project and the environment. The separate **Section** control stands down while the chip is in charge, so the row is not asked for the same choice twice; if BB's chip cannot be found, the control is still there.

## 0.5.1

- **The Section control no longer disappears.** It rendered nothing while the composer had no project yet, no sections on the chosen device, or the tree still loading — which read as a missing feature. It now always sits in the action row and says what it is waiting for.

## 0.5.0

- **Pick the section right in BB's New thread screen.** A **Section** control now sits in the composer's action row, next to the model and the machine: choose a section and the composer's environment switches to that section's folder on its machine. Until now the tree was two clicks deep, inside the environment picker. Needs BB 0.43.3, whose composer lets a plugin set the pickers.
- **The folder menu under the composer no longer opens off-screen.** It was centred on a chip that sits at the composer's left edge, so a wide tree hung past it.
- Rebuilt against the plugin SDK of BB 0.43.3.

## 0.4.24

- **A refused folder says who already holds it.** "This path is already in the tree" left you hunting: the folder is one section, and the section that has it is often in another project. The refusal now names it — "This folder is already the section “Parser” of “Clients”" — and an overlap says which way it goes, inside or containing. A folder taken by another project's own root names that project too.

## 0.4.23

- **The machine badge appears only when the machines really differ.** Filing a chat into a section of its own device is an arrangement of the tree, not a mismatch, so those rows stay clean. A chat sitting in a section bound to another machine — the folder on the server, the chat on the laptop — still says which machine it runs on, with the folder in the tooltip.

## 0.4.22

- **An agent can set the rules of a project or a section, not just type into the file.** `bb project-folders rules show|set` writes the same record the card writes, so asking a chat for "rules for this section" now leaves the card on **Custom template** with the text in it, instead of on Default with an edit the next apply would overwrite. The plugin skill explains the modes, the inheritance and what section rules should contain.
- **Saving a custom template writes it to that place's AGENTS.md at once.** Until now only a project did that, and a section's own template waited for the next **Apply to existing sections**.

## 0.4.21

- **A moved chat is listed where you dropped it, whatever its agent can do.** The chat is filed into the destination the moment you move it, so the tree follows immediately; when its own agent then switches the working directory, the filing is dropped and the chat belongs to that section outright.
- **A provider without the directory tool no longer leaves the move hanging.** Cursor Grok, for one, has no `update_environment_directory`: it failed the call and answered as if it had moved. The plugin now settles the move at the end of that turn — the folder stays, the chat keeps the badge naming the machine it runs on, and nothing is left pending. The request also tells the agent to say plainly that it has no such tool instead of confirming a move that did not happen.

## 0.4.20

- **BB's own New thread screen can start a chat in a section.** The environment picker gains **Project section**, and the plugin draws the section tree of the chosen project and device beside it. Until now that screen knew projects only, so a chat started there — including one handed off to a new thread — landed in the project root.
- **It also says where the chat will start.** A line under the composer names the section of the environment being reused, because BB's project chip names the project and stops there.
- The section folder belongs to the project, never to the environment: retiring a chat never touches it.

## 0.4.19

- **A chat handed off to a new thread shows its section again.** The new chat exists before its workspace does, so the very first lookup answered "no workspace yet" and the project chip stayed on the bare project name. The lookup now says it is not ready instead of failing, and the label asks again until the workspace arrives.
- **The badge on a chat filed elsewhere names its machine**, not its folder: what matters about a chat sitting in another device's section is where it actually runs. The full path stays in the badge's tooltip.

## 0.4.18

- **Moving a chat into a section on its own device now takes its working folder along.** Until BB exposes the directory switch to plugins ([get-bb/bb#3904](https://github.com/get-bb/bb/issues/3904)), the chat performs it: it receives one agent-only request and calls its own `update_environment_directory`. That spends one turn of the chat's model and needs a provider that has the tool.
- Nothing moves until the chat answers: while the request is pending the chat keeps working in its old folder, and its own messages are not blocked. Once it reports the new directory, `.bb/chats/<id>` follows and the chat is listed by that folder — no "works in" badge left over.
- A section on another device still takes only the place in the tree, because a chat cannot change machine.

## 0.4.17

- **A chat that shows the folder it works in keeps one line.** The badge after the title took the truncation rules meant for the title, so such a chat grew into a three-line block in the tree instead of ending in an ellipsis.

## 0.4.16

- **The panel no longer crashes while pinning a provider.** BB's picker resolves its own catalog and reports the result back; this plugin answered with the inherited service tier again, the two never agreed, and React stopped the whole panel with "Maximum update depth exceeded" — after which the section tree stayed dead until the page was reloaded. A group that is switched on now reads only what it pins itself, and a group that is off ignores what the picker says.
- The new-chat composer keeps its place while the pinned values load, instead of remounting around BB's own composer.

## 0.4.15

- **Saving provider and model no longer fails.** A group switched off left an `undefined` behind in the request, and the server refused the whole save with `rpc input at $input.value.serviceTier is not a JSON value`.
- **A card opened from the ⋯ menu or a link loads its rules.** The key arrived before the tree, the first read had no row to ask about and nothing asked again, so **AGENTS.md rules** stayed on "Loading…" until you switched settings sections and came back.

## 0.4.14

- **A new chat can start with the right provider, model and agent.** The plugin as a whole (**Settings → Provider and agent**), a project, and every section — at any depth — can pin the provider and model with their reasoning level and service tier, the permission mode, and the native session agent. A chat created there opens with them.
- **Inherited group by group, nearest place wins.** A section can take its project's model and still pin its own agent, or set **No agent** to refuse the one its project pinned. A group left off falls through to the section above, then the project, then the plugin, then BB's own remembered choice — nothing changes BB's defaults, and nothing is written to disk.
- **Seeds, not locks.** The composer opens with the values filled in and its own pickers still win for that chat.
- **Agents come from the CLI Agents plugin.** Claude Code, Codex and OpenCode agents are listed from the section's own machine, and the choice is bound to the chat it was created for, so two chats started at the same moment never take each other's agent. An agent picked by hand in the composer wins. If a pinned agent cannot be applied — machine offline, agent renamed, plugin off — the chat is not created and the error names the place and the reason. Without that plugin, provider and model still work.

## 0.4.13

- **One project in the new-chat folder picker.** A project with copies on several machines no longer appears once per device. Pick the folder once; the composer's machine control chooses which copy the chat opens in. Sections of every device stay in that same tree; a section still lives on its own device.

## 0.4.12

- **Phone: the folder ⋯ menu no longer crashes the sidebar.** On a narrow screen the menu is a sheet, but the “Chat sorting” submenu still used desktop Radix parts. Opening ⋯ threw, and BB fell back to its own chat list.
- Nested sections stay indented in that same sheet, instead of lining up as a flat list.
- A long section path under the composer is truncated so it no longer runs over the next chip.

## 0.4.11

- **Move a chat to any section of its project.** Moving a chat now files it into the section you pick — only its place in the tree changes, and it works everywhere: a chat that runs on a server can sit in a section of a Mac, because nothing about the chat's own folder is touched. Drag and drop and **Move to section…** both do this.
- Why the old behaviour could not work: moving a chat's working folder needs BB's directory-update API (`threads.update({ experimental_directory })`) from `docs/bb-native-thread-relocation.patch`. Without that patch the server rejects the field, so every real move failed; with it, a move still cannot leave its machine.
- A chat filed away from the folder it works in shows that folder next to its name, and its menu offers **File back where it works**.
- Only a group refuses a chat — it holds sections, not chats — and a chat stays in its own project.

## 0.4.10

- **A refused destination says why.** Dragging a chat onto a section of another device did nothing at all — no highlight, no message. The row now marks itself as refusing (dashed outline) and the drop answers: the chat's device against the section's device, plus the way around it — move the whole section in the tree with **Move to group…**. Groups, foreign projects and a project without a folder on the chat's device explain themselves the same way.
- In **Move to section…** the reason sits on the row of every destination that cannot take the chat, so a greyed-out row is no longer a dead end.

## 0.4.9

- **Move a chat out of a section to the project level**: the destination tree now draws the project once and the project row means the project folder on the chat's own device, so a chat that lives in a section on another device is no longer stuck. Before, the project appeared once per device copy and the row of the other copy was greyed out.
- The destination tree lists sections on other devices under their tree parent, the same as the chat list: a chat's own section is no longer missing from the list. Such sections are disabled while the chat stays on its device, and the chat's current place is marked.
- Dropping a chat onto the project heading works the same way for a chat running on another device copy of the project.

## 0.4.8

- A section can now hold a section on another device directly, without a group in between: New section offers every device where the project has a folder.

## 0.4.7

- **Sections on another device inside any group**: a group inside a section now offers every device where the project has a folder, so a Mac section can hold a group with a section on a server. The tree marks such a section with its device name.
- **A section in any folder of its device**: the folder button in New section can go above the parent and pick any folder, for example a website folder on a server. Folders inside the parent stay ordinary subfolders; the disk root, other sections, other BB projects and folders containing the project are refused.
- Archiving a section whose folder is outside the project keeps the files in place and archives only its chats and tree record; restore brings them back. A section holding sections on other devices or outside its folder asks to move or archive them first.
- Such sections can move to any group or section of their project and change path anywhere on their device except another project.
- The folder picker can always go up a level, even when the current folder is missing on the device.

## 0.4.6

- **Groups**: a section without a folder that only arranges the tree. Create one with **New group** in any project, section or group menu or card. Sections created inside a group get their folder in the nearest real folder above; a project-level group can hold sections from every device copy of the project.
- **Move to group…** in the section menu and card, or drag a row onto a group on the management page: only the place in the tree changes, the folder, files and chats stay put.
- Groups have no chats or rules and do not count as a level, so grouped sections keep their rules. They get their own default icon, can be renamed and styled, deleted when empty, and are archived and restored together with a section that contains them.

## 0.4.5

- Rewritten README in English and Russian: why the plugin exists, every feature in detail, and screenshots of the chat list, appearance, AGENTS.md rules, section archive, import & export and language settings.
- Updated marketplace overview.
- Remove a stray divider above the only row of the Language settings.

## 0.4.4

- The plugin interface keeps the language chosen in the plugin: its pages, tree, dialogs and menus carry `data-bb-ru-skip`, so BB-wide DOM translators such as the Russifier plugin no longer turn part of an English interface into Russian.

## 0.4.3

- Fix appearance choices snapping back right after a click: loading saved preferences dropped optional level fields such as the color, so every preset or color change was saved but then replaced by a colorless copy. Colors now survive the save and reload round trip.

## 0.4.2

- **Language section** in the settings menu, on both the management page and the BB settings page. The interface is English by default; the choice is stored per browser.
- No more wrapped labels in Appearance: the active preset is marked with a corner badge, level tabs share the width evenly (**Level 3+**), and the color mode cards show a short title with a secondary explanation.

## 0.4.1

- **Settings navigation instead of tabs**: on the management page the tree sidebar gains a **Settings** list above the projects — Chat list, Appearance, AGENTS.md rules, Section archive, Import & export; picking one opens it in the main pane, picking a project opens its card. The plugin page in BB settings shows the same sections with its own side rail. `settings/<section>` deep-links to a section.
- **No more raw configuration block**: the AGENTS.md rules moved from declarative plugin settings into the plugin database, so BB no longer renders the long template fields above the plugin's settings. Existing values are migrated once on load. `bb plugin config project-folders` no longer lists these fields; use the settings screen.
- Every section is split into titled groups with explanations: chat order, section collapsing and tree view; ready-made styles as visual cards, color mode as radio cards, one level at a time with a live preview highlighting it; export and import as separate blocks. On/off options are switches.

## 0.4.0

- **One settings screen**: the management page and the plugin page in BB settings now render the same settings in four tabs — Chat list, Appearance, AGENTS.md rules, Import & export. Chat list settings moved from the browser to the BB server, so every device shows the same values; the old browser values are migrated on first load.
- **Appearance**: icon, color and fill per level (projects, sections of levels 1, 2 and 3+). A curated Hugeicons set with search or any emoji; twelve theme-friendly colors or a custom one; no fill, icon badge, left stripe or row background. Presets: Standard, Monochrome, By level, By project (sections take their project's color). Live preview.
- **Per project and section look**: ⋯ → Appearance sets its own icon, color and fill, optionally cascading to nested sections, plus its own chat sort order and limit.
- **More list settings**: adjustable auto-collapse threshold in hours, bold unread sections on/off, compact density and nested indent.
- **Import & export** of all preferences and looks as JSON.

## 0.3.12

- **Manual folder collapse**: manual collapse now takes immediate precedence even if a chat inside is active or an agent is working in the background. You can start a task in a chat and collapse the section while the agent runs.
- **Unread hierarchy indicator**: section and project names now render in regular weight (same as the "New project" button) by default, and become **bold** only when an unread chat exists anywhere in their hierarchy.

## 0.3.11

- Fix inactivity detection: reading or clicking an old chat no longer resets the inactivity timer. Inactivity now tracks real conversation activity (`latestAttentionAt`, active agents, creation), so sections whose chats haven't had messages for > 2 hours collapse properly even if their threads were viewed.

## 0.3.10

- **Change section path**: sections finally get the move action projects always had. The ⋯ / right-click menu of a section and its card offer **Change path** (the project root keeps **Move**): pick a new, nonexistent folder on the same device and the whole section folder relocates with hidden files and chat history — or pick an existing folder and the section re-links to it, for the "I renamed the directory outside BB" case. Either way the old path stays as a compatibility symlink so existing chats keep working, and nested sections, chat exports and archive manifests are remapped. Workspace paths recorded before a finished move now resolve through completed section moves too, so chat labels, bindings and exports keep pointing at the right section. Running chats and queued work block the move; interrupted moves persist a barrier and can be retried from the new **Unfinished section moves** card. CLI: `bb project-folders move-section <folder-id> <absolute-path>`.
- **Auto-collapse inactive sections**: sections with no chat activity for more than 2 hours automatically collapse so old chats don't clutter the project tree. Actively running agents, open chats, and manual toggles keep sections expanded, and the feature can be toggled in plugin settings or the section menu.

## 0.3.9

- The plugin settings gained the same two controls as a project or section: **Where it applies** for the shared custom rules, and a shared **Startup instruction**. A plugin-wide rule addressed to BB sessions now reaches every chat started from BB without touching a single AGENTS.md.
- Every heading of the default-rules block carries a **?** with an explanation on hover or keyboard focus.

## 0.3.8

- Custom rules choose where they apply: **Into the file** appends them to AGENTS.md and CLAUDE.md as before, **Into BB sessions** writes nothing to disk and hands the text to the agent as session instructions, and **Both** does the two. A terminal session on the machine keeps seeing only what is in the files; a chat started from BB also gets the session rules of the nearest project or section.
- New **Startup instruction** per project or section: a one-shot text appended to the first message of a new chat there — "run the skill and send the current tasks", say. It is never written to the files, never repeated on later turns and never sits in the session instructions.
- Both fields moved out of the mode tabs, since they apply whichever way the folder's AGENTS.md is kept, and every heading in the rules block now carries a **?** with an explanation on hover or keyboard focus.

## 0.3.7

- A new chat or section started from a project card follows the device tab that is open, instead of always using the project's first copy.
- A root chat no longer fails when the composer points at another device: the plugin now uses that device's copy of the project. A section chat still refuses — a section exists on its own device only.

## 0.3.6

- **Per-device working copies**: a project can hold its own working folder on every connected device — one path on the Mac mini, another on a server, a third on the MacBook. The sidebar keeps one entry per project, while the project card gains **device tabs for every machine BB knows**, each with a solid bolt while that machine is connected. A tab with a copy shows its folder as a path field with a folder button; a machine without a copy says so and offers **Add copy**, which opens the Working copies dialog with that device preselected — the folder is created when missing and seeded with AGENTS.md. The folder button opens that device's folder browser, where folders can be created, and the action follows what you pick: a place that does not hold the project folder yet means **Move** — the folder relocates with everything inside, the old path stays as a link for open chats, and sections, chat exports and archives are remapped — while a place that already holds it means **Use this folder**, which only re-registers the path. Every copy keeps its own AGENTS.md and CLAUDE.md; project-level rules are written to all of them. New chats pick the device in the composer's project dropdown (each copy is listed with its device name), and a **Configure** item in the ⋯ / right-click menu jumps to the project's settings. The last copy is protected; copies with sections or chats must be cleared first. CLI: `bb project-folders copy-add` / `copy-remove`.

- Default `AGENTS.md` rules: new plugin settings add separate **project** and **sections** templates with an auto-create toggle. Creating a project, section or subsection seeds `AGENTS.md` with the matching template wrapped in `<!-- bb-project-folders:agents:start -->` / `:end` markers at the end of the file. Existing content above the markers is never modified; existing files receive the block appended at the bottom, and later template edits rewrite the same block in place.
- Shipped English rule presets: the project template distills working-project practice (verify the host, read component docs before editing, file placement, result artifacts, records, secrets, evidence discipline), and the sections template merges Karpathy's coding guidelines — think before coding, simplicity first, surgical changes, verification criteria.
- Rules are hierarchical: plugin settings hold the shared defaults — including shared **Custom rules**; a project can set its own project and sections templates plus its own custom rules (applied to its root and new sections inside it); first and second level sections can set their own template and custom rules; third-level sections get no rules at all. The nearest value wins down the tree. The details pane and the Rules dialog show the mode as three tabs — **Default**, **Custom template** and **Own file** — and the open tab is what the folder uses once saved. The custom tab holds the templates, prefilled from the existing managed block; the **Own file** tab edits the AGENTS.md and CLAUDE.md of the selected device directly and tells the plugin to write nothing there. Custom rules land at the bottom of AGENTS.md and CLAUDE.md (when it exists) on save or apply; clearing the field removes the block.
- Adopted folders: when a project or section is created on a directory that already has AGENTS.md, the plugin leaves AGENTS.md and CLAUDE.md untouched and does not inject anything automatically. A file without the plugin's markers opens on the **Own file** tab and is skipped by **Apply to existing sections**; switch the folder to one of the template tabs to let the plugin manage it. When AGENTS.md is missing but CLAUDE.md exists, a one-line `@AGENTS.md` CLAUDE.md bridge is only created for new files.
- **Apply to existing sections** writes the effective template into every project and allowed section at once — skipping folders kept on their **Own file** tab — and reports updated, unchanged and failed counts.
- Manual ordering: drag projects and sections up/down in the management page tree, or use the Move up / Move down actions; the order is stored in the plugin database and used everywhere.
- Redesign the management page: a minimalist tree of projects and sections sits in the left sidebar — expand, select, and act through the ⋯ or right-click menu — while the main pane shows the selected section's details, its rules and the plugin settings. Compact archive list and tighter spacing.
- Export failure noise is cleaned up: deleted chats (404) drop their error rows, chats without an environment no longer record errors, and stale error rows older than an hour are pruned.
- Fix the folder browser of **Move project**: it never opened, because the request carried an undefined path that RPC validation rejected.
- Translate the new controls into all 11 interface languages.

## 0.3.5

- Project and section chats share one composer: the project control becomes a project/section tree with nested sections indented by depth, so a new chat can be bound to the project root or any nested section before sending. The chat-plus button on a project card and the project's new-chat button in the sidebar tree open it.
- Fix the project-root composer route failing to load: panel sub-paths are now URL-decoded, so `root:<host>` destinations resolve correctly.

## 0.3.4

Stable release of the 0.3.4 preview series: it contains everything from 0.3.4-rc.1 through 0.3.4-rc.4 listed below.

- Tighten sidebar spacing: projects sit on a compact list instead of a 20px gap, and an expanded project keeps a smaller separation from the next one.
- Right-click a project or section heading to open the same menu as the ellipsis button.
- Delete a project from the tree menu or the management page.
- Choose **Leave files in place** (default) or **Move files to the archive** next to the project folder.
- BB chats of that project are removed; Git remotes and other machines are not deleted. Archiving files is refused when the folder is also another project's section.

## 0.3.4-rc.3

- Rename chats inline from the context/ellipsis menu or by double-clicking the title. Enter or blur saves through the native BB rename action; Escape cancels.
- Failed drag/drop reports a short notice without reopening the destination picker.
- Explicit Move action opens a collapsible folder tree with destination selection and Move/Cancel buttons.

## 0.3.4-rc.2 (included in rc.3)

- Share a compact BB-style folder browser between project and section dialogs, adapting BB RemotePathBrowser layout.
- Create folders on the selected device without leaving the picker.
- Confirm empty-folder deletion; preserve nonempty folders, symlinks, and registered project/section folders.
- Translate new controls into all 11 supported languages.

## 0.3.4-rc.1

- Share the chat action menu between right-click and the ellipsis button.
- Move existing chats through a section picker or drag and drop, with durable storage-move recovery.
- Requires the companion BB native directory-update API; unsupported servers leave chats and files unchanged.

## 0.3.3

Show the project and nested section hierarchy in the existing project label of created chats. Labels are scoped to each conversation and restored on unload.

## 0.3.2

Integrate the destination tree into the existing project-control position beneath the composer, removing the extra selector and path block.

## 0.3.1

Add a hierarchical project/section destination picker and show the selected working path above the native composer. Fix section chat creation with the native project-checkout environment provider. Preserve composer selections, enforce the section device and directory, and display submission errors without clearing the draft.

## 0.3.0

Move an entire project directory on the same host and volume, including hidden files, rules, sections and archives. Keep existing chat paths working through a compatibility link. Journal interrupted moves for retry, update project/section/archive paths and block active-work relocation. Add translated move dialogs in all 11 languages.

### Interface

Move sorting into the project/section three-dot menu and make show-all controls compact single-line buttons.

## 0.2.1

Activity, alphabetical and creation-date sorting; configurable per-list chat limit (default 10); independent show-all controls. List settings are translated into all 11 interface languages.

## 0.2.0

First public release: real project sections, per-section chats and working rules, device-aware creation, hidden history snapshots, journaled archive/restore, and interface in 11 languages with English as the default.

## 0.1.0

Local prototype.
