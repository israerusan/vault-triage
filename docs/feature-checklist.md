# Note Doctor — v1 feature checklist (Free / Pro)

The v1 scope: sellable, buildable, not bloated.

- **Free thesis:** "Show me what's wrong with my vault."
- **Pro thesis:** "Help me fix and manage it faster at scale."

## Free

- [x] Scan all Markdown notes, respecting excluded folders / paths / tags
- [x] Five built-in detectors:
  - [x] Stale notes (not modified in N days)
  - [x] Thin notes (below a content-length threshold)
  - [x] Orphan notes (no inbound links)
  - [x] Missing required properties (user-defined frontmatter fields)
  - [x] Draft markers (`TODO`, `FIXME`, `draft`, `incomplete`, configurable)
- [x] Dashboard: total count, counts by type, run-scan button, quick filters
- [x] Results list: filter by type, sort (severity / title / path), open, reveal
- [x] Ignore a result; exclude a note from future scans; mark reviewed
- [x] Review queue: one note at a time, prev/next, keyboard shortcuts
- [x] Settings: stale threshold, min length, required properties, draft markers,
      excluded folders / paths / tags

## Pro (one-time $12, offline license key)

- [x] Offline Pro unlock — paste a signed key, verified locally, persisted
- [x] Saved scan profiles (enabled types, folder scope, threshold overrides, sort)
- [x] Custom rules (missing-property / has-marker / older-than-days / property-equals,
      scoped by folder and tag, with severity and message)
- [x] Bulk actions: ignore, mark reviewed, add property, add tag, export selection
      (no risky content rewrites in v1)
- [x] Advanced review: review a filtered/sorted subset from the dashboard
- [x] Severity tuning: per-issue-type weights
- [x] Export report: Markdown, grouped by issue type, saved to `Note Doctor Reports/`

## Commands

**Free:** Run vault scan · Open dashboard · Review flagged notes
**Pro:** Run saved scan profile · Export scan report

## Explicitly out of scope for v1

AI summaries, auto-fixing body text, scheduled background scans, graph
visualizations, collaboration, external sync, nested rule logic, chart dashboards.

## Acceptance

**Free** — install and scan in under a minute; finds real issues; filter/open;
ignore/exclude; review queue; feels complete enough to recommend.

**Pro** — valid key unlocks, invalid/tampered key rejected; save & rerun a profile;
create a custom rule; run a safe bulk action; export a Markdown report.
