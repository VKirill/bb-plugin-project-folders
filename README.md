# Projects & Sections

Projects & Sections is a BB plugin that organizes project chats into sections backed by folders on connected devices. It also provides per-place rules and chat defaults, archives, history exports, appearance controls, optional session-context filtering and opt-in prompt-cache keepalive for pinned Claude chats.

## Install

```sh
bb plugin install https://github.com/VKirill/bb-plugin-project-folders.git --yes
```

In BB, choose Projects & Sections as the sidebar thread list if it is not selected automatically. Open the management page to create a project.

## Documentation

- [Overview](docs/overview.md) — purpose, stack and starting points.
- [Architecture](docs/architecture.md) — runtime parts and BB integration.
- [Features](docs/features/project-tree.md) — user-facing capabilities.
- [Chat list](docs/features/chat-list.md) · [Starting chats in sections](docs/features/section-chats.md) · [Agent rules](docs/features/agent-rules.md)
- [Execution defaults](docs/features/execution-settings.md) · [Session context](docs/features/session-context.md) · [Appearance](docs/features/appearance-settings.md)
- [Prompt cache keepalive](docs/features/cache-keepalive.md)
- [Archive and restore](docs/features/archive-and-restore.md) · [Device copies and moves](docs/features/devices-and-moves.md) · [Chat history export](docs/features/chat-history-export.md) · [Language](docs/features/language.md)
- [API](docs/api.md) — RPC, host operations and CLI commands.
- [Data model](docs/data-model.md) — plugin-owned storage.
- [Deployment](docs/deployment.md) — installation and development commands.
- [Gotchas](docs/gotchas.md) — constraints and failure behavior.
- [Decisions](docs/decisions.md) — implementation choices supported by code and history.

The interface is available in English, Russian, Spanish, French, German, Portuguese, Simplified Chinese, Japanese, Korean, Hindi and Arabic (`i18n.tsx:13-37`).

See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).
