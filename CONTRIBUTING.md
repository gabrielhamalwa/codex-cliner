# Contributing

Thanks for contributing to `codex-cliner`.

## Code of conduct

By participating in this repository, you agree to the standards in [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Development setup

Requirements:

- Bun `1.3.11+`
- Node.js `20+`

Editor defaults are defined in `.editorconfig`:

- spaces, not tabs
- width `4`

Install dependencies:

```bash
bun install
```

Run the app during development:

```bash
bun run dev -- --codex-home ~/.codex
```

## Project constraints

Treat these as hard boundaries unless the scope explicitly changes:

- Do not add app-owned files inside Codex directories
- Treat backup manifests as canonical and the backup catalog as rebuildable cache only
- Do not add Codex SQLite mutation in this repository without explicit approval
- Keep contributor workflows Bun-first while preserving npm-compatible publishing

## Before you open a pull request

Run:

```bash
bun run format:check
bun run security:check
bun run release:check
bun run typecheck
bun run lint
bun run test
bun run build
```

Also verify:

- README and progress docs still match user-visible behavior
- destructive changes remain covered by backup and restore logic
- new heuristics do not silently widen write scope
- formatting stays consistent across TypeScript, TSX, JSON, and Markdown files

## Pull request guidance

A good pull request includes:

- a clear summary
- the user-visible impact
- tests added or updated
- storage and recovery considerations

Keep changes reviewable. Small, coherent patches are preferred over broad refactors.

## Questions and contact

For contributor-facing questions, maintainer contact, or private follow-up:

- email `gdhdev@protonmail.com`
- expected response target: within 14 days

Do not use that path for public bug reports that belong in the issue tracker, and do not send exploit details publicly. Use the security policy for vulnerability reporting.

See [SUPPORT.md](./SUPPORT.md) for the public/private support split.
