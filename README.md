# Vault Triage

**A ruthless review queue for the notes that actually need attention.**

Vault Triage scans your vault for stale notes, thin notes, orphan notes, missing metadata, and unfinished drafts — then gives you a clean review workflow so maintenance stops feeling like a side quest from hell.

<!-- SCREENSHOT SLOT — drop a real Obsidian capture here to lift conversions.
     ![Vault Triage dashboard: flagged notes grouped by issue, with the review queue open](docs/assets/hero.png)
     Suggested shot: the triage dashboard with a few stale/thin/orphan flags and the review queue visible. Save as docs/assets/hero.png -->


Free gets you real scanning and one-note-at-a-time cleanup. Pro adds saved audits, custom rules, bulk workflows, severity tuning, and Markdown reports.

> Local-first, privacy-friendly, and built to help you decide what to fix first instead of burying you in note guilt.

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

Purchase: [Buy Me a Coffee — Vault Triage Pro](https://buymeacoffee.com/vaultspotlight/e/560209). License keys are verified **offline** (Ed25519) — no account, server, or subscription.

**Activate Pro**

1. Purchase via the link above.
2. Your license key is emailed to you **automatically, within seconds** — delivery is fully automated, no waiting.
3. Paste it into the plugin's settings — Pro unlocks instantly, fully offline.

## Install

**Community plugins**

Open **Settings → Community plugins**, search **Vault Triage**, and install it — one click, auto-updates.

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

- one-time payment
- no account required
- no always-online checks
- validated locally in your vault

Pro is for people who want recurring audits, custom standards, bulk cleanup workflows, and exportable reports instead of babysitting maintenance manually.

## Buy Pro

Vault Triage Pro uses an offline license key and a one-time payment.

Purchase: [Buy Me a Coffee — Vault Triage Pro — $12 one-time](https://buymeacoffee.com/vaultspotlight/e/560209). License keys are verified **offline** (Ed25519) — no account, server, or subscription.

What you get:
- saved audits
- custom rules
- bulk workflows
- severity tuning
- Markdown report export

Delivery model:
- one-time purchase
- no account required
- offline license verification
- license key delivered automatically by email, in seconds

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

## Feedback and support

Bug reports, feature requests, and questions all go to the GitHub issue tracker. It is
the only place I track them, so an issue will always get further than a review comment.

- **[Report a bug](https://github.com/israerusan/vault-triage/issues/new?labels=bug)** — please include your Obsidian version, your operating system, and the steps that reproduce it.
- **[Request a feature](https://github.com/israerusan/vault-triage/issues/new?labels=enhancement)** — describe the workflow you are trying to make faster; that is more useful than a proposed solution.
- **[Browse open issues](https://github.com/israerusan/vault-triage/issues)** — worth a look first, in case it is already tracked.

## More plugins by the same author

Small, local-first Obsidian plugins that each do one job and keep your data in your vault.
All of them are in the community directory — search the name under
**Settings → Community plugins**.

**Search and views**

- [Vault Spotlight](https://github.com/israerusan/obsidian-vault-spotlight) — keyboard-first command center — fuzzy search, saved workflows, and result actions.
- [Bases Power Pack](https://github.com/israerusan/bases-power-pack) — kanban, calendar, Gantt, and outline views over your notes or a `.base` file.

**Vault health**

- [Attachment Audit](https://github.com/israerusan/attachment-audit) — find orphaned, duplicate, oversized, and misplaced attachments, then clean them up safely.
- [Patina](https://github.com/israerusan/patina) — score every note's staleness from edits, opens, and inbound links.
- [Vault Router](https://github.com/israerusan/vault-router) — move new notes out of Inbox with fast local routing rules.
- [FlowKit Health Dashboard](https://github.com/israerusan/flowkit-health-dashboard) — find which add-on is breaking your vault, and score every one installed.

**Writing and research**

- [Prose Lens](https://github.com/israerusan/prose-lens) — live writing feedback — passive voice, adverbs, hedges, cliches, and a reading grade.
- [Prior Art](https://github.com/israerusan/prior-art) — show similar existing notes while you write, and merge duplicates without losing links.
- [Standing Questions](https://github.com/israerusan/standing-questions) — track the open questions in your vault and surface new notes that may answer them.
- [Unwritten](https://github.com/israerusan/unwritten) — report the notes you never wrote — unexplained link pairs, stub hubs, unreasoned decisions.
- [Effort Index](https://github.com/israerusan/effort-index) — measure the editing time behind every note and resurface the expensive ones.

**Time and billing**

- [Task Calendar Bridge](https://github.com/israerusan/obsidian-task-calendar-bridge) — export dated Markdown tasks to standards-based ICS calendar files.
- [Invoice Forge](https://github.com/israerusan/obsidian-invoice-forge) — turn `#billable` notes into numbered invoices, so nothing is missed or billed twice.
- [Time Tracker and Invoicing](https://github.com/israerusan/time-tracker-invoicing) — track billable time against notes and projects, then invoice by client.
