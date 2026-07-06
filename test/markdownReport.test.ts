import assert from "node:assert";
import { NoteIssue } from "../src/types";
import { buildMarkdownReport, ReportInput } from "../src/core/reports/markdownReport";

function issue(overrides: Partial<NoteIssue>): NoteIssue {
  return {
    id: "id",
    notePath: "notes/example.md",
    noteName: "example.md",
    issueType: "stale",
    severity: 1,
    reason: "reason",
    ...overrides,
  };
}

const issues: NoteIssue[] = [
  issue({
    id: "a",
    notePath: "notes/old.md",
    noteName: "old.md",
    issueType: "stale",
    reason: "not touched in a while",
    details: "120 days old",
  }),
  issue({
    id: "b",
    notePath: "notes/thin.md",
    noteName: "thin.md",
    issueType: "thin",
    reason: "too short",
  }),
  issue({
    id: "c",
    notePath: "notes/old2.md",
    noteName: "old2.md",
    issueType: "stale",
    reason: "not touched in a while",
  }),
];

// --- With a profile name and a mix of issue types ---------------------------
const withProfile: ReportInput = {
  scannedAt: "2026-07-05T00:00:00Z",
  profileName: "Weekly cleanup",
  totalFiles: 42,
  issues,
};
const report = buildMarkdownReport(withProfile);
const reportLines = report.split("\n");

assert.ok(reportLines.includes("# Note Doctor Report"), "has title");
assert.ok(reportLines.includes("Date: 2026-07-05T00:00:00Z"), "has date");
assert.ok(reportLines.includes("Profile: Weekly cleanup"), "has profile line");

// Summary counts.
assert.ok(reportLines.includes("## Summary"), "has summary heading");
assert.ok(reportLines.includes("- Total issues: 3"), "total issues count");
assert.ok(reportLines.includes("- Stale notes: 2"), "stale summary count");
assert.ok(reportLines.includes("- Thin notes: 1"), "thin summary count");
// Types with no issues are omitted from the summary.
assert.ok(!report.includes("Orphan notes"), "omits empty types from summary");

// Section headings appear in ISSUE_TYPES order: stale before thin.
assert.ok(reportLines.includes("## Stale notes"), "stale section heading");
assert.ok(reportLines.includes("## Thin notes"), "thin section heading");
assert.ok(
  report.indexOf("## Stale notes") < report.indexOf("## Thin notes"),
  "stale section precedes thin section",
);

// Bullets: link by full path with a short alias so duplicate basenames resolve
// correctly; details win, else the reason is the fallback so every line has a "why".
assert.ok(reportLines.includes("- [[notes/old|old]] — 120 days old"), "path-qualified link with details");
assert.ok(
  reportLines.includes("- [[notes/old2|old2]] — not touched in a while"),
  "detail-less bullet falls back to the reason",
);
assert.ok(reportLines.includes("- [[notes/thin|thin]] — too short"), "thin bullet carries its reason");
assert.ok(!report.includes(".md|"), "no .md extension in link target");
assert.ok(!report.includes(".md]]"), "no .md extension in link text");

// --- Without a profile name -------------------------------------------------
const noProfile: ReportInput = {
  scannedAt: "2026-07-05T00:00:00Z",
  totalFiles: 0,
  issues: [],
};
const emptyReport = buildMarkdownReport(noProfile);

assert.ok(!emptyReport.includes("Profile:"), "profile line omitted when absent");
assert.ok(emptyReport.includes("- Total issues: 0"), "zero issues total");
assert.ok(emptyReport.includes("# Note Doctor Report"), "empty report still has title");

console.log("markdownReport tests passed");
