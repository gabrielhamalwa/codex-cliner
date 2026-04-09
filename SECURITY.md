# Security Policy

If you discover a security issue in `codex-cliner`, do not open a public issue with exploit details.

## Reporting a vulnerability

Use a private reporting channel:

- GitHub private vulnerability reporting for the repository, if enabled
- otherwise, contact the maintainer privately at `gdhdev@protonmail.com` before public disclosure

Include:

- affected version
- operating system
- reproduction steps
- impact assessment
- whether the issue can corrupt, delete, or expose local Codex data or backups

## Response expectations

- Maintainer point of contact: `gdhdev@protonmail.com`
- Initial response target: within 14 days
- For active exploitation or clear data-loss risk, include `URGENT` in the subject line

Best-effort communication is the realistic promise here. That is a response target, not a contractual SLA.

## In scope

Security-relevant issues include:

- unintended deletion outside the selected Codex home
- restore writing to the wrong destination
- backup corruption or silent loss of recoverability
- path traversal in backup or restore logic
- accidental persistence of app-owned files inside Codex directories

## Out of scope

These are not treated as security issues by default:

- unsupported Codex internal format changes that break features without data loss
- missing support for undocumented Codex storage surfaces
- requests to add SQLite mutation that the project intentionally does not support

## Security automation

This repository includes:

- CodeQL analysis
- dependency review on pull requests
- a repository security check that flags unexpected high-risk patterns such as `child_process`, `eval`, `new Function`, sync shell execution, `rm -rf`, `sudo`, and recursive `fs.rm(...)` outside an allowlist

These checks are useful guardrails, not proof that the package is harmless in all environments.

## Warranty and liability

The repository can document constraints, run checks, and reduce obvious risk, but it cannot provide an airtight guarantee that no harmful change could ever be introduced.

The MIT license already provides the standard `AS IS` no-warranty disclaimer. If you want advice on stronger liability language or commercial risk posture, that is a legal question and should be reviewed with counsel rather than stated informally in project docs.
