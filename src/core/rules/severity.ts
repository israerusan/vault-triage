// Pure severity ordering and aggregation over detected issues. No Obsidian API —
// these run in tests under Node.

import type { IssueType, NoteIssue, SortMode } from "../../types";
import { ISSUE_TYPES } from "../../types";

// One reused collator — meaningfully faster than String.localeCompare across
// thousands of comparisons, and numeric-aware so "note2" sorts before "note10".
const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/**
 * Return a new array of issues ordered per `mode` (input is never mutated):
 * - "severity": severity descending, then noteName ascending, then notePath ascending.
 * - "title": noteName ascending, then notePath ascending.
 * - "path": notePath ascending.
 */
export function sortIssues(issues: NoteIssue[], mode: SortMode): NoteIssue[] {
  const sorted = issues.slice();
  sorted.sort((a, b) => {
    if (mode === "severity") {
      if (b.severity !== a.severity) return b.severity - a.severity;
      const byName = COLLATOR.compare(a.noteName, b.noteName);
      if (byName !== 0) return byName;
      return COLLATOR.compare(a.notePath, b.notePath);
    }
    if (mode === "title") {
      const byName = COLLATOR.compare(a.noteName, b.noteName);
      if (byName !== 0) return byName;
      return COLLATOR.compare(a.notePath, b.notePath);
    }
    return COLLATOR.compare(a.notePath, b.notePath);
  });
  return sorted;
}

/**
 * Group issues by their type, preserving input order within each group. Every
 * {@link IssueType} key is present, mapped to an empty array when it has none.
 */
export function groupByType(issues: NoteIssue[]): Record<IssueType, NoteIssue[]> {
  const grouped = {} as Record<IssueType, NoteIssue[]>;
  for (const type of ISSUE_TYPES) {
    grouped[type] = [];
  }
  for (const issue of issues) {
    grouped[issue.issueType].push(issue);
  }
  return grouped;
}

/**
 * Count issues by type. Every {@link IssueType} key is present, defaulting to 0.
 */
export function countByType(issues: NoteIssue[]): Record<IssueType, number> {
  const counts = {} as Record<IssueType, number>;
  for (const type of ISSUE_TYPES) {
    counts[type] = 0;
  }
  for (const issue of issues) {
    counts[issue.issueType] += 1;
  }
  return counts;
}

/** Sum of the severities across all issues. */
export function totalSeverity(issues: NoteIssue[]): number {
  return issues.reduce((sum, issue) => sum + issue.severity, 0);
}
