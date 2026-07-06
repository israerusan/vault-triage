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

// Bullets: .md stripped from link text; details appended with an em dash.
assert.ok(reportLines.includes("- [[old]] — 120 days old"), "stale bullet with details");
assert.ok(reportLines.includes("- [[old2]]"), "stale bullet without details");
assert.ok(reportLines.includes("- [[thin]]"), "thin bullet");
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
