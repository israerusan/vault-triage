import { getAllTags, type App, type CachedMetadata } from "obsidian";
import { ISSUE_TYPES } from "../../types";
import type {
  NoteIssue,
  RawNoteInput,
  ScanConfig,
  IssueType,
  NoteDoctorSettings,
  ScanProfile,
} from "../../types";
import { buildNoteStat } from "./noteStats";
import { isExcluded, includedByFolders } from "./fileFilters";
import { staleDetector } from "../detectors/staleDetector";
import { thinDetector } from "../detectors/thinDetector";
import { orphanDetector } from "../detectors/orphanDetector";
import { missingPropertiesDetector } from "../detectors/missingPropertiesDetector";
import { draftMarkerDetector } from "../detectors/draftMarkerDetector";
import { runCustomRules } from "../rules/customRuleEngine";
import { sortIssues } from "../rules/severity";
import { issueKey } from "../utils/ids";

export interface ScanResult {
  issues: NoteIssue[];
  totalFiles: number;
}

/**
 * The single boundary that touches the Obsidian API. It gathers a plain
 * {@link RawNoteInput} per note, then runs the pure detectors and (Pro) custom
 * rules over them. `now` is injected so scans are deterministic in tests.
 */
export async function scanVault(
  app: App,
  config: ScanConfig,
  isPro: boolean,
  now: number
): Promise<ScanResult> {
  const files = app.vault.getMarkdownFiles();
  const inbound = buildInboundCounts(app);

  const enabled = new Set<IssueType>(config.enabledIssueTypes);
  const issues: NoteIssue[] = [];
  let totalFiles = 0;

  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const tags = extractTags(cache);

    if (
      isExcluded(file.path, tags, {
        excludedFolders: config.excludedFolders,
        excludedPaths: config.excludedPaths,
        excludedTags: config.excludedTags,
      })
    ) {
      continue;
    }
    if (!includedByFolders(file.path, config.includedFolders)) continue;

    totalFiles++;

    const content = await app.vault.cachedRead(file);
    const raw: RawNoteInput = {
      path: file.path,
      name: file.basename,
      mtime: file.stat.mtime,
      content,
      frontmatter: extractFrontmatter(cache),
      tags,
      inboundLinks: inbound.get(file.path) ?? 0,
    };
    const stat = buildNoteStat(raw);

    if (enabled.has("stale")) {
      pushHit(issues, stat, "stale", config, staleDetector(stat, config.staleDaysThreshold, now));
    }
    if (enabled.has("thin")) {
      pushHit(issues, stat, "thin", config, thinDetector(stat, config.minNoteLength));
    }
    if (enabled.has("orphan")) {
      pushHit(issues, stat, "orphan", config, orphanDetector(stat));
    }
    if (enabled.has("missing-properties")) {
      pushHit(
        issues,
        stat,
        "missing-properties",
        config,
        missingPropertiesDetector(stat, config.requiredProperties)
      );
    }
    if (enabled.has("draft-marker")) {
      pushHit(issues, stat, "draft-marker", config, draftMarkerDetector(stat, config.draftMarkers));
    }

    if (isPro && enabled.has("custom") && config.customRules.length > 0) {
      for (const hit of runCustomRules(stat, config.customRules, now)) {
        issues.push({
          id: issueKey(stat.path, "custom", hit.ruleId),
          notePath: stat.path,
          noteName: stat.name,
          issueType: "custom",
          severity: hit.severity,
          reason: hit.reason,
          sourceRuleId: hit.ruleId,
        });
      }
    }
  }

  return { issues: sortIssues(issues, config.sortMode), totalFiles };
}

/**
 * Resolve the effective scan configuration from base settings, optionally
 * overridden by a saved profile (Pro). A profile's per-field overrides win when
 * present; its folder scoping and enabled issue types always apply.
 */
export function resolveScanConfig(
  settings: NoteDoctorSettings,
  profile?: ScanProfile
): ScanConfig {
  const base: ScanConfig = {
    enabledIssueTypes: [...ISSUE_TYPES],
    staleDaysThreshold: settings.staleDaysThreshold,
    minNoteLength: settings.minNoteLength,
    requiredProperties: settings.requiredProperties,
    draftMarkers: settings.draftMarkers,
    includedFolders: [],
    excludedFolders: settings.excludedFolders,
    excludedPaths: settings.excludedPaths,
    excludedTags: settings.excludedTags,
    severityWeights: settings.severityWeights,
    customRules: settings.customRules,
    sortMode: "severity",
  };
  if (!profile) return base;

  const ruleIds = new Set(profile.customRuleIds ?? []);
  return {
    ...base,
    enabledIssueTypes: profile.enabledIssueTypes.length
      ? profile.enabledIssueTypes
      : base.enabledIssueTypes,
    staleDaysThreshold: profile.staleDaysThreshold ?? base.staleDaysThreshold,
    minNoteLength: profile.minNoteLength ?? base.minNoteLength,
    requiredProperties: profile.requiredProperties ?? base.requiredProperties,
    draftMarkers: profile.draftMarkers ?? base.draftMarkers,
    includedFolders: profile.includedFolders ?? [],
    excludedFolders: profile.excludedFolders.length
      ? profile.excludedFolders
      : base.excludedFolders,
    customRules: profile.customRuleIds
      ? base.customRules.filter((r) => ruleIds.has(r.id))
      : base.customRules,
    sortMode: profile.sortMode ?? base.sortMode,
  };
}

function pushHit(
  issues: NoteIssue[],
  stat: { path: string; name: string },
  type: IssueType,
  config: ScanConfig,
  hit: { reason: string; details?: string } | null
): void {
  if (!hit) return;
  issues.push({
    id: issueKey(stat.path, type),
    notePath: stat.path,
    noteName: stat.name,
    issueType: type,
    severity: config.severityWeights[type],
    reason: hit.reason,
    details: hit.details,
  });
}

/** Reverse the resolved-link graph into an inbound-count-per-note map. */
function buildInboundCounts(app: App): Map<string, number> {
  const counts = new Map<string, number>();
  const resolved = app.metadataCache.resolvedLinks;
  for (const source of Object.keys(resolved)) {
    const targets = resolved[source];
    for (const target of Object.keys(targets)) {
      counts.set(target, (counts.get(target) ?? 0) + targets[target]);
    }
  }
  return counts;
}

function extractTags(cache: CachedMetadata | null): string[] {
  if (!cache) return [];
  const raw = getAllTags(cache) ?? [];
  return raw.map((t) => t.replace(/^#/, ""));
}

function extractFrontmatter(cache: CachedMetadata | null): Record<string, unknown> {
  const fm = cache?.frontmatter;
  if (!fm) return {};
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(fm)) {
    if (key === "position") continue;
    copy[key] = fm[key];
  }
  return copy;
}
