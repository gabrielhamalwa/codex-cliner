# codex-cliner

![Bun](https://img.shields.io/badge/Bun-1.3.11%2B-black?logo=bun)
![Node](https://img.shields.io/badge/Node-20%2B-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

Backup-first cleanup and recovery for local Codex session artifacts.

Name-wise: think `Codex cleaner`, with a small CLI wink.

## What it does

- Inspect active sessions in `sessions/`
- Inspect archived sessions in `archived_sessions/`
- Find stale `session_index.jsonl` and `history.jsonl` entries
- Delete or prune with automatic backups outside Codex-owned storage
- Restore full backup runs or selected files from a run
- Browse everything through an Ink terminal UI or helper commands

> [!WARNING]
> `codex-cliner` modifies local Codex session files and index files. It is designed to be recoverable, not harmless. Review destructive actions before confirming them.

> [!IMPORTANT]
> The tool does not store app-owned state inside Codex directories and does not mutate Codex SQLite databases in v0.1.0.

## Why this exists

Codex keeps useful local history, but local cleanup is still awkward when you want to remove old sessions, prune archived runs, or clean index drift without manually editing storage.

`codex-cliner` treats Codex paths as target data only. Backups, catalog state, and app-owned metadata live outside Codex storage.

## Quick start

Requirements:

- Node.js `20+`

Run from the npm registry:

```bash
npx codex-cliner
```

Run from this repo:

```bash
bun install
bun run dev -- --codex-home ~/.codex
```

## Interactive UI

The default UI now starts with a dedicated Codex home selection screen.

Once you select a Codex home, `codex-cliner` saves that choice in app-owned config outside Codex paths and reuses it on the next launch when it is still valid. The picker now labels saved, recent, and autodetected homes separately.

Current interactive surfaces:

- Codex home picker with autodetected paths and manual path entry
- Active sessions browser
- Archived sessions browser
- Stale index browser
- Project grouping browser
- Backup browser
- Backup detail view with selective file restore
- Diagnostics view

Current keybindings:

- `Enter`: open or confirm the focused item
- `q`: back or quit
- `/`: filter the current list
- `Space`: toggle selection in list views
- `a`: select all visible rows
- `A`: clear selection
- `d`: delete selected sessions or selected project
- `p`: prune selected archived rows or backup runs
- `c`: clean stale index rows
- `r`: restore selected backup items or refresh the current view
- `R`: restore a full backup run from backup detail view
- `m`: enter a custom Codex home path on the home picker
- `?` or `h`: open the interactive help screen

## Commands

Most users only need the interactive mode:

```bash
codex-cliner
```

CLI help is always available:

```bash
codex-cliner --help
codex-cliner <command> --help
```

App config:

```bash
codex-cliner config show
codex-cliner config reset
```

Read-only inspection:

```bash
codex-cliner scan --codex-home ~/.codex
codex-cliner doctor --codex-home ~/.codex
codex-cliner backups
```

Backup inspection and restore:

```bash
codex-cliner backups
codex-cliner restore --run-id <run-id>
codex-cliner restore --run-id <run-id> --source-path /abs/path/one --source-path /abs/path/two
```

Cleanup actions:

```bash
codex-cliner cleanup-stale --codex-home ~/.codex
codex-cliner prune-archived --older-than 30 --codex-home ~/.codex
codex-cliner delete --session <session-id> --codex-home ~/.codex
codex-cliner delete --project <project-name-or-path> --codex-home ~/.codex
```

## Safety model

What the tool guarantees:

- Backups are created before destructive actions
- Backups live outside Codex-owned paths
- Per-run `manifest.json` files are canonical
- `catalog.json` is rebuildable cache only
- `session_index.jsonl` and `history.jsonl` are rewritten atomically
- Restore works even if the backup catalog is missing or corrupt

## Support

- Security issues: report privately via GitHub private vulnerability reporting if available, or email `gdhdev@protonmail.com`
- General maintenance contact: `gdhdev@protonmail.com`
- Response target: within 14 days

For security reports, do not open a public issue with exploit details first.

Public issue reporting:

- Use the bug report template for reproducible product problems
- Use the feature request template for focused improvements
- Keep security reports private

See [SUPPORT.md](./SUPPORT.md) for the support path in one place.

Repository guardrails:

- CI runs lint, tests, package checks, and the repository security check
- a dedicated security workflow runs CodeQL, dependency review, and the repository security check
- the repository security check fails on unexpected use of high-risk patterns such as `child_process`, `eval`, `new Function`, sync shell execution, `rm -rf`, `sudo`, and recursive `fs.rm(...)` outside an allowlist

This is not an airtight guarantee. It reduces risk; it does not eliminate it.

What `0.1.0` does not do:

- Codex SQLite mutation
- Worktree cleanup as a primary surface
- Claims about undocumented internal Codex state beyond scanned session artifacts

## Storage ownership

Codex paths are target data only.

The tool may:

- Read from Codex paths
- Delete session or archive files from Codex paths
- Rewrite `session_index.jsonl` and `history.jsonl`
- Restore backed-up files into their original Codex paths

The tool does not:

- Store its own backups or metadata inside Codex directories
- Use Codex directories as a cache for app-owned state

Backup data lives outside Codex storage:

- macOS: `~/Library/Application Support/codex-cliner/`
- Linux: `~/.local/share/codex-cliner/`
- Windows: `%APPDATA%/codex-cliner/`

Backup structure:

```text
<app-data-root>/backups/
  catalog.json
  <run-id>/
    manifest.json
    files/
```

Run id format:

- UTC timestamp
- short random suffix
- example: `2026-04-09T16-05-12Z_k4m8qx`

## Project grouping

Project grouping is heuristic, not canonical.

Current inference order:

1. nearest Git root from discovered session cwd
2. nearest project marker root such as `package.json`, `bun.lock`, `turbo.json`, `pyproject.toml`, `Cargo.toml`, or `go.mod`
3. nested `cwd` discovery from session JSONL payloads
4. raw cwd basename fallback

Duplicate session files are collapsed in inventory views, but destructive actions still retain every backing file path so prune and delete do not silently miss duplicates.

## Acknowledgements

- [Ink](https://github.com/vadimdemedes/ink) for the interactive terminal UI
- [Commander](https://github.com/tj/commander.js) for the CLI command surface
- [github/copilot-sdk](https://github.com/github/copilot-sdk) as a reference for slim public repo hygiene and security-policy structure

## Maintainer

- Maintainer: `gdhdev`
- Contact: `gdhdev@protonmail.com`
- Response target: within 14 days

Use public issues for reproducible bugs and focused feature requests. Use private contact for security reports or when public issue filing is not appropriate.

## Development

<details>
<summary>Developer setup and validation</summary>

Requirements:

- Bun `1.3.11+`
- Node.js `20+`

Editor defaults for this repo are defined in `.editorconfig`:

- spaces, not tabs
- width `4`

Install dependencies:

```bash
bun install
```

Validate locally:

```bash
bun run format:check
bun run security:check
bun run release:check
bun run typecheck
bun run lint
bun run test
bun run build
bun run package:check
```

</details>

## Release checklist

Before publishing `0.1.0`:

- Update `CHANGELOG.md`
- Confirm `package.json` version matches the release tag
- Run `bun run release:check`
- Run the full validation suite locally
- Confirm `NPM_TOKEN` is configured for GitHub Actions
- Push a `v0.1.0` tag or run the release workflow manually

The release workflow validates the package before publish and checks tag/version alignment.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Security

See [SECURITY.md](./SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
