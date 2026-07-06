# Note Doctor

**Your vault tells you what to fix next.**

Scan your Obsidian vault for stale notes, orphan notes, missing metadata, and
unfinished drafts — then clean it up with a fast review workflow.

Note Doctor helps you keep your vault trustworthy without turning maintenance into
a project. It is local-first, privacy-friendly, and built for real Obsidian usage.

<!-- screenshot: dashboard showing issue counts by category -->

## Why Note Doctor?

As your vault grows, it gets harder to trust:

- which notes are outdated
- which notes are empty or half-finished
- which notes are disconnected
- which notes are missing important structure

Note Doctor scans your vault and shows the highest-value notes to review, fix, or
clean up — one note at a time.

## What Note Doctor checks

The free version detects:

- **Stale notes** — not modified in a while
- **Thin notes** — barely any content
- **Orphan notes** — nothing links to them
- **Missing required properties** — frontmatter fields you rely on are absent
- **Draft markers** — `TODO`, `FIXME`, `draft`, `incomplete`

## Free vs Pro

| Feature                    | Free | Pro |
| -------------------------- | :--: | :-: |
| Manual vault scan          | Yes  | Yes |
| Built-in issue detectors   | Yes  | Yes |
| Dashboard and issue list   | Yes  | Yes |
| Open notes from results    | Yes  | Yes |
| Ignore / exclude notes     | Yes  | Yes |
| Basic review queue         | Yes  | Yes |
| Saved scan profiles        |  No  | Yes |
| Custom rules               |  No  | Yes |
| Bulk actions               |  No  | Yes |
| Advanced review workflows  |  No  | Yes |
| Severity tuning            |  No  | Yes |
| Export Markdown reports    |  No  | Yes |

<!-- screenshot: results view with grouped issues -->

## How it works

1. Run a vault scan.
2. See what needs attention on the dashboard.
3. Filter by issue type.
4. Open or review flagged notes.
5. Clean up your vault one note at a time.

## Pro unlock

Note Doctor Pro is a **one-time purchase** with **offline license-key unlock**.

- No subscription
- No account required
- No always-online checks
- Pro is unlocked locally in your vault

Pro is designed for users who want faster cleanup at scale with saved workflows,
custom rules, and bulk actions.

<!-- screenshot: review queue / Pro profile & rules screen -->

## Install

**From community plugins**

1. Open Obsidian settings.
2. Go to Community plugins.
3. Search for **Note Doctor**.
4. Install and enable.

**Manual install**

Copy `main.js`, `manifest.json`, and `styles.css` into
`.obsidian/plugins/note-doctor/` in your vault, then enable it in Community plugins.

## Usage

**First scan**

- Open the command palette.
- Run **Note Doctor: Run vault scan**.
- Review the dashboard, then open flagged notes or start the review queue.

**Configure checks**

In settings you can customize the stale-note threshold, minimum note length,
required properties, draft markers, and folder/path/tag exclusions.

## Pro features

**Saved scan profiles** — reusable scan setups for workflows like Weekly Review,
Writing Vault Audit, or Project Notes Audit.

**Custom rules** — define your own health checks, for example:

- Notes in `Projects/` must have `status`
- Notes tagged `#project` must have `due`
- Draft notes older than 30 days are high priority

**Bulk actions** — apply safe actions across many flagged notes: ignore, mark
reviewed, add a property, add a tag, or export the selection to a report.

**Export reports** — generate Markdown reports for cleanup sessions and recurring
reviews, saved under `Note Doctor Reports/`.

## Privacy

Note Doctor is local-first.

- Your notes stay in your vault.
- No account is required.
- No cloud sync is needed.
- Pro license validation works offline.

## Pricing

- **Free** — core scanning and review features, useful on their own.
- **Pro — $12 one-time** — saved workflows, custom rules, bulk actions, advanced
  review, severity tuning, and Markdown reports.

## FAQ

**Is the free version actually useful?**
Yes. The free version is designed to deliver real value on its own.

**Does Pro require an account?**
No. Pro uses a one-time offline license key.

**Does Note Doctor send my notes anywhere?**
No. Note Doctor works entirely locally in your vault.

**Can I use it without metadata-heavy workflows?**
Yes. Start with the default checks and only configure required properties if you
want to.

## Support

If you run into a bug or want to suggest a feature, open an issue on GitHub.
