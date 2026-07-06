// Pure Markdown report builder. No Obsidian API — runs in tests under Node.

import { ISSUE_TYPE_LABELS, ISSUE_TYPES, NoteIssue } from "../../types";

/** Everything needed to render a scan into a Markdown report. */
export interface ReportInput {
  /** Human-readable timestamp of when the scan ran. */
  scannedAt: string;
  /** Optional name of the profile that produced the scan. */
  profileName?: string;
  /** Total number of files scanned. */
  totalFiles: number;
  /** The issues found, in any order; grouped by type during rendering. */
  issues: NoteIssue[];
}

/** Strip a single trailing `.md` extension from a note name, if present. */
function stripMdExtension(name: string): string {
  return name.replace(/\.md$/, "");
}

/**
 * Render a scan result into a Markdown report string. The report opens with a
 * title, date, and optional profile line, followed by a summary of issue counts
 * and one section per issue type that has at least one issue (in
 * {@link ISSUE_TYPES} order). Each issue is a wiki-link bullet, with details
 * appended after an em dash when present.
 */
export function buildMarkdownReport(input: ReportInput): string {
  const lines: string[] = [];

  lines.push("# Note Doctor Report");
  lines.push(`Date: ${input.scannedAt}`);
  if (input.profileName) {
    lines.push(`Profile: ${input.profileName}`);
  }
  lines.push("");

  lines.push("## Summary");
  lines.push(`- Total issues: ${input.issues.length}`);
  for (const issueType of ISSUE_TYPES) {
    const count = input.issues.filter((issue) => issue.issueType === issueType).length;
    if (count > 0) {
      lines.push(`- ${ISSUE_TYPE_LABELS[issueType]}: ${count}`);
    }
  }
  lines.push("");

  for (const issueType of ISSUE_TYPES) {
    const group = input.issues.filter((issue) => issue.issueType === issueType);
    if (group.length === 0) continue;
    lines.push(`## ${ISSUE_TYPE_LABELS[issueType]}`);
    for (const issue of group) {
      // Link by full path with a short display alias, so notes that share a
      // basename (index, README, daily notes…) resolve to the RIGHT file.
      const target = stripMdExtension(issue.notePath);
      const alias = stripMdExtension(issue.noteName);
      const link = `- [[${target}|${alias}]]`;
      // Fall back to the reason so every line carries the "why" the dashboard
      // shows — not just the missing-properties detector, which is the only one
      // that sets `details`.
      const why = issue.details ?? issue.reason;
      lines.push(why ? `${link} — ${why}` : link);
    }
    lines.push("");
  }

  return lines.join("\n");
}
