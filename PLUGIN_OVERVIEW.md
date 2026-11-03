## What you get

A sidebar tree of projects, sections and subsections that are real folders on your devices, with the chats of each folder inside it. A chat started from a section runs with that folder as its working directory. Every heading has a new-chat button and a menu for new sections, rules, appearance, sorting, rename, change path and archive. Names turn bold when a chat below them is unread, inactive sections collapse after a set time (2 hours by default), and each list shows its newest chats up to a limit you choose.

## Rules beside the work

Projects and sections of any depth get AGENTS.md from a project or sections template when they are created. The plugin writes only between its own markers at the end of the file and never touches your text above them. Each project or section can use the shared template, its own template, or its own hand-written file. Custom rules can go into AGENTS.md and CLAUDE.md, into the instructions of chats started from BB, or both. A startup instruction adds a one-shot request to the first message of every new chat. Apply to existing sections rewrites every managed block at once.

## Provider, model and agent

A new chat starts with whatever BB remembers for the project. The plugin adds a place to pin that: the plugin as a whole, a project, or any section can set the provider and model with their reasoning level and service tier, the permission mode, and — with the CLI Agents plugin — the native Claude Code, Codex or OpenCode session agent. Each group is inherited on its own and the nearest place wins, so a section can take its project's model and still pin its own agent or refuse one. The values are seeds: the composer opens with them filled in and its own pickers still decide that chat.

## Starting a chat from BB's own screen

BB's New thread screen knows projects, not folders. The plugin puts the section tree into its project chip, adds **Project section** to its environment picker and draws the tree beside it, so a chat started there — or handed off to a new thread — begins in the section folder you pick. A line under the composer names the section the chat will start in.

## Your own look

Four ready-made styles: Standard, Monochrome, By level and By project. Per level, pick one of 118 icons in 7 groups or any emoji, one of 12 theme-aware colors or a custom color, and a fill: none, icon badge, left stripe or row background. Colors follow the level or the project. Any project or section can have its own icon, color, fill, chat sorting and chat limit, optionally inherited by nested sections. List density and nesting indent are adjustable.

## Archive and restore

Archive a section with nested sections, files and chats into a hidden folder inside the project. Restore returns everything to the original path and reopens the chats. Running chats block archiving, and restore never overwrites an occupied folder.

## Devices and moves

Keep a working copy of one project on several connected machines and switch between them with device tabs. A section can have its own folder on each device, and several sections (SEO, Ads, SMM) may share one path. The new-chat folder picker shows the project once; the composer's machine control chooses which copy to open. Move a whole project folder, move a section, or re-link a section whose folder was renamed outside BB; the old path stays as a link so existing chats keep working. Moves work within one device and disk volume. Moving a chat into a section on its own device takes its working folder along: the chat performs the switch itself in one turn, because BB has no plugin API for it yet.

## Settings

The management page and the plugin page in BB settings show the same settings: Chat list, Appearance, AGENTS.md rules, Provider and agent, Section archive, Import & export and Language. Settings are stored on the BB server and shared by every device; export and import them as JSON. The interface comes in 11 languages with English by default, chosen per browser.

## Requirements

BB 0.43.0 or later and connected macOS or Linux devices with local-path project sources. On BB 0.43.0–0.43.2 the project chip stays BB's own: pick the section in the environment picker. An older BB stops the install with "no release … runs on this bb": update BB first. Windows paths are not supported. No account, API key or external service is needed. Chat history stays in BB; the plugin also exports it to a hidden .bb/chats folder inside each section, which is not a full backup. Some BB interfaces this plugin uses are experimental.
