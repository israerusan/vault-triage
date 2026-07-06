// The shared data contract for Note Doctor. Detectors, the rule engine, severity
// scoring, reports, and the UI all speak these types. Kept dependency-free (no
// `obsidian` import) so the core is pure and unit-testable under Node.

export type IssueType =
  | "stale"
  | "thin"
  | "orphan"
  | "missing-properties"
  | "draft-marker"
  | "custom";

export const ISSUE_TYPES: IssueType[] = [
  "stale",
  "thin",
  "orphan",
  "missing-properties",
  "draft-marker",
  "custom",
];

/** Human labels for each issue type, used in the dashboard, results, and reports. */
export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  stale: "Stale notes",
  thin: "Thin notes",
  orphan: "Orphan notes",
  "missing-properties": "Missing properties",
  "draft-marker": "Draft markers",
  custom: "Custom rules",
};

export type SortMode = "severity" | "title" | "path";

// --- Note snapshot handed to the pure detectors -----------------------------

/** Raw per-note data gathered from the Obsidian API by the scan boundary. */
export interface RawNoteInput {
  path: string;
  name: string;
  /** Last-modified time, ms since epoch. */
  mtime: number;
  /** Full file content including any frontmatter block. */
  content: string;
  /** Parsed frontmatter, or an empty object when there is none. */
  frontmatter: Record<string, unknown>;
  /** Tags on the note, normalized without the leading `#`. */
  tags: string[];
  /** Count of resolved inbound links pointing at this note. */
  inboundLinks: number;
  /** Count of outbound links (resolved + unresolved) this note makes. */
  outboundLinks: number;
}

/** Normalized note snapshot the detectors and rule engine actually read. */
export interface NoteStat {
  path: string;
  name: string;
  mtime: number;
  /** Meaningful body length in characters (frontmatter stripped, trimmed). */
  charCount: number;
  content: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  inboundLinks: number;
  outboundLinks: number;
}

// --- Detector output --------------------------------------------------------

/**
 * What a detector returns when a note has a problem: a short human reason plus
 * optional detail. `null` means "no issue". The scan orchestrator turns a hit
 * into a full {@link NoteIssue}, assigning the id and severity weight.
 */
export interface DetectorHit {
  reason: string;
  details?: string;
}

export interface NoteIssue {
  /** Stable key: `path::issueType` (plus `::ruleId` for custom rules). */
  id: string;
  notePath: string;
  noteName: string;
  issueType: IssueType;
  severity: number;
  reason: string;
  details?: string;
  /** Set for issues produced by a custom rule. */
  sourceRuleId?: string;
}

// --- Settings ---------------------------------------------------------------

export interface ScanProfile {
  id: string;
  name: string;
  enabledIssueTypes: IssueType[];
  includedFolders: string[];
  excludedFolders: string[];
  staleDaysThreshold?: number;
  minNoteLength?: number;
  requiredProperties?: string[];
  draftMarkers?: string[];
  customRuleIds?: string[];
  sortMode?: SortMode;
}

export type CustomRuleCondition =
  | { type: "missing-property"; property: string }
  | { type: "has-marker"; marker: string }
  | { type: "older-than-days"; days: number }
  | { type: "property-equals"; property: string; value: string };

export interface CustomRule {
  id: string;
  name: string;
  enabled: boolean;
  scope: {
    folders?: string[];
    tags?: string[];
  };
  condition: CustomRuleCondition;
  severity: number;
  message: string;
}

export interface LastScanSummary {
  scannedAt: string;
  totalFiles: number;
  totalIssues: number;
  /** Distinct notes with at least one issue (the honest "needs attention" count). */
  affectedNotes: number;
  byType: Record<string, number>;
  profileId?: string;
}

export interface NoteDoctorSettings {
  version: number;

  staleDaysThreshold: number;
  minNoteLength: number;

  requiredProperties: string[];
  draftMarkers: string[];

  excludedFolders: string[];
  excludedPaths: string[];
  excludedTags: string[];

  /** Issue keys (`path::issueType`) the user chose to ignore. */
  ignoredIssueKeys: string[];
  /** Issue keys the user marked reviewed. */
  reviewedIssueKeys: string[];

  licenseKey: string;
  licenseStatus: "free" | "valid-pro" | "invalid";
  licenseEmail?: string;

  severityWeights: Record<IssueType, number>;

  savedProfiles: ScanProfile[];
  customRules: CustomRule[];

  lastScanSummary?: LastScanSummary;

  /** First-run onboarding flag. */
  onboardingDismissed: boolean;
}

/** Just the knobs a scan needs; a profile can override these at run time. */
export interface ScanConfig {
  enabledIssueTypes: IssueType[];
  staleDaysThreshold: number;
  minNoteLength: number;
  requiredProperties: string[];
  draftMarkers: string[];
  includedFolders: string[];
  excludedFolders: string[];
  excludedPaths: string[];
  excludedTags: string[];
  severityWeights: Record<IssueType, number>;
  customRules: CustomRule[];
  sortMode: SortMode;
}
