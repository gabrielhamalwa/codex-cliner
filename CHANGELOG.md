# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog.

## [0.1.0] - 2026-04-09

### Added

- Initial npm/TypeScript package scaffold for `codex-cliner`
- Ink-based interactive terminal UI
- Dedicated Codex home selection screen in the interactive UI
- Detail pane for sessions, projects, backups, and diagnostics
- Backup-detail screen with selective file restore in the TUI
- Codex inventory scan for active sessions, archived sessions, and stale index records
- Backup manager with per-run manifests and rebuildable catalog cache
- Restore support for full backup runs
- CLI subcommands for scan, doctor, backups, restore, delete, prune-archived, and cleanup-stale
- Fixture-based tests for run-id generation, inventory scanning, and backup restore/catalog rebuild
- Public repository docs and GitHub templates
- GitHub CI and npm release workflows
- Slim code of conduct and issue configuration for public repo hygiene
- Release-check helper for tag/version and changelog validation

### Changed

- Contributor workflow is Bun-first while published usage remains npm-compatible via `npx`
- Project inference now prefers Git and common project-marker roots, then falls back to nested `cwd` discovery
- Duplicate session files are collapsed in inventory while destructive actions still preserve all backing paths
- README, contributing, and security docs were tightened and restructured for public release
- Interactive mode now falls back cleanly outside TTY environments
