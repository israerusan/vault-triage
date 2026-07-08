# Vault Triage

**The fastest way to figure out which notes deserve attention next.**

Vault Triage scans your vault for stale notes, thin notes, orphan notes, missing metadata, and unfinished drafts — then gives you a clean review workflow so maintenance stops feeling like a side quest from hell.

Free gets you real scanning and one-note-at-a-time cleanup. Pro adds saved audits, custom rules, bulk workflows, severity tuning, and Markdown reports.

> Local-first, privacy-friendly, and built to help you decide what to fix first instead of burying you in note guilt.

<!-- TODO: screenshot — dashboard showing issue counts by category -->

## Why Vault Triage exists

Most vault-maintenance tools dump a pile of flags on you and call it a day. That is not triage. That is administrative vandalism.

Vault Triage is built around a sharper job:
- surface the notes most worth reviewing
- show why they were flagged
- let you work through them one at a time or in batches
- keep the workflow tight enough that you will actually use it

## What it finds

- **Stale notes** — notes that have gone untouched longer than your threshold
- **Thin notes** — notes with barely any substance
- **Orphan notes** — notes with no real connections in or out
- **Missing required properties** — notes missing frontmatter fields your workflow depends on
- **Draft markers** — `TODO`, `FIXME`, `WIP`, and your own custom unfinished-note markers

## Why this is better than a generic vault audit

Vault Triage is not trying to be a vague "health dashboard." Its wedge is simple: help you decide what to fix next.

That means:
- a dashboard that shows where the mess actually is
- a review queue so you can clean as you go
- filters and severity so you can work the high-value problems first
- custom rules when your vault has its own standards

## Free vs Pro

Free is genuinely useful. Pro is about speed, repeatability, and scale.

| Feature | Free | Pro |
| --- | :---: | :---: |
| Manual vault scan | ✓ | ✓ |
| Built-in detectors | ✓ | ✓ |
| Dashboard and issue list | ✓ | ✓ |
| Open notes from results | ✓ | ✓ |
| Ignore / exclude / mark reviewed | ✓ | ✓ |
| Basic review queue | ✓ | ✓ |
| Saved scan profiles |  | ✓ |
| Custom rules |  | ✓ |
| Bulk actions |  | ✓ |
| In-queue quick fixes |  | ✓ |
| Severity tuning |  | ✓ |
| Markdown report export |  | ✓ |

## Install

**Community plugins**

After community review approval, search for **Vault Triage** in Community plugins and install it there.

**Manual install**

Copy `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/vault-triage/` in your vault, then enable the plugin.

## Usage

1. Run **Vault Triage: Run vault scan** from the command palette.
2. Review the dashboard to see what actually needs attention.
3. Filter by issue type or start the review queue.
4. Fix notes one at a time, or use Pro workflows when you need to move fast.

## Configuration

You can customize:
- stale-note thresholds
- minimum note length
- required properties
- draft markers
- folder, path, and tag exclusions

## Pro

Vault Triage Pro uses an offline license key.

- one-time purchase model
- no account required
- no always-online checks
- validated locally in your vault

Pro is for people who want recurring audits, custom standards, bulk cleanup workflows, and exportable reports instead of babysitting maintenance manually.

## Privacy

Vault Triage is local-first.

- your notes stay in your vault
- no cloud processing
- no telemetry
- offline license validation

## Pricing

- **Free** — core scanning and review features
- **Pro — $12 one-time** — saved audits, custom rules, bulk workflows, quick fixes, severity tuning, and Markdown reports

## FAQ

**Is the free version actually useful?**
Yes. Free is meant to stand on its own, not act like a crippled demo.

**Does Pro require an account?**
No. Pro uses a one-time offline license key.

**Does Vault Triage send my notes anywhere?**
No. It runs locally in your vault.

**Can I use it without a metadata-heavy workflow?**
Yes. The default detectors are useful even if your vault is lightweight.

## Support

Open an issue at [github.com/israerusan/vault-triage](https://github.com/israerusan/vault-triage/issues).
