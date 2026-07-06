import { getAllTags, type App, type CachedMetadata, type TFile } from "obsidian";
import { ISSUE_TYPES } from "../../types";
import { REPORT_FOLDER } from "../../product";
import type {
  NoteIssue,
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

/** Progress callback: how many candidate notes have been read so far, of total. */
export type ScanProgress = (done: number, total: number) => void;

/** Files are read in bounded-parallel batches to overlap I/O without flooding it. */
const READ_BATCH = 64;

/**
 * The single boundary that touches the Obsidian API. It gathers a plain
 * {@link RawNoteInput} per note, then runs the pure detectors and (Pro) custom
 * rules over them. `now` is injected so scans are deterministic in tests.
 *
 * Reads happen in batches (I/O overlapped) and yield between batches so the UI
 * stays responsive and can report progress on large vaults.
 */
export async function scanVault(
  app: App,
  config: ScanConfig,
  isPro: boolean,
  now: number,
  onProgress?: ScanProgress
): Promise<ScanResult> {
  const { inbound, outbound } = buildLinkCounts(app);
  const enabled = new Set<IssueType>(config.enabledIssueTypes);
  const issues: NoteIssue[] = [];

  // Pass 1 (synchronous): filter to the notes we'll actually scan, capturing the
  // metadata cache we already have so pass 2 only does the async file reads.
  const candidates: { file: TFile; tags: string[]; frontmatter: Record<string, unknown> }[] = [];
  for (const file of app.vault.getMarkdownFiles()) {
    // Never scan our own exported reports (they'd self-flag as draft/stale).
    if (file.path === REPORT_FOLDER || file.path.startsWith(REPORT_FOLDER + "/")) continue;
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
    candidates.push({ file, tags, frontmatter: extractFrontmatter(cache) });
  }

  const totalFiles = candidates.length;
  onProgress?.(0, totalFiles);

  const yielder = makeYielder();
  let lastYield = performance.now();

  // Pass 2: read + detect in bounded-parallel batches, yielding between them.
  for (let i = 0; i < candidates.length; i += READ_BATCH) {
    const batch = candidates.slice(i, i + READ_BATCH);
    const contents = await Promise.all(batch.map((c) => app.vault.cachedRead(c.file)));
    batch.forEach((c, j) => {
      const stat = buildNoteStat({
        path: c.file.path,
        name: c.file.basename,
        mtime: c.file.stat.mtime,
        content: contents[j],
        frontmatter: c.frontmatter,
        tags: c.tags,
        inboundLinks: inbound.get(c.file.path) ?? 0,
        outboundLinks: outbound.get(c.file.path) ?? 0,
      });

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
    });
    onProgress?.(Math.min(i + READ_BATCH, totalFiles), totalFiles);
    // Yield only when we've held the main thread a frame's worth, so the UI can
    // paint/stay responsive — but warm rescans (cachedRead resolves on the
    // microtask queue) don't pay a fixed per-batch tax. A MessageChannel yield
    // isn't subject to the nested-setTimeout 4ms clamp.
    if (performance.now() - lastYield > 16) {
      await yielder();
      lastYield = performance.now();
    }
  }

  return { issues: sortIssues(issues, config.sortMode), totalFiles };
}

/** A reusable macrotask yield via MessageChannel (no 4ms setTimeout clamp). */
function makeYielder(): () => Promise<void> {
  const channel = new MessageChannel();
  let resolveCurrent: (() => void) | null = null;
  channel.port1.onmessage = () => {
    const r = resolveCurrent;
    resolveCurrent = null;
    if (r) r();
  };
  return () =>
    new Promise<void>((resolve) => {
      resolveCurrent = resolve;
      channel.port2.postMessage(0);
    });
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
    // A profile's enabled types are honored exactly — including an empty set,
    // which scans nothing (ProfileEditModal blocks saving zero types). A missing
    // field (hand-edited data) falls back to base; an empty array does NOT.
    enabledIssueTypes: profile.enabledIssueTypes ?? base.enabledIssueTypes,
    staleDaysThreshold: profile.staleDaysThreshold ?? base.staleDaysThreshold,
    minNoteLength: profile.minNoteLength ?? base.minNoteLength,
    requiredProperties: profile.requiredProperties ?? base.requiredProperties,
    draftMarkers: profile.draftMarkers ?? base.draftMarkers,
    includedFolders: profile.includedFolders ?? [],
    excludedFolders: profile.excludedFolders?.length
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

/** Per-note inbound and outbound link counts, ignoring self-links. */
function buildLinkCounts(app: App): {
  inbound: Map<string, number>;
  outbound: Map<string, number>;
} {
  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();
  const add = (map: Map<string, number>, key: string, n: number): void => {
    map.set(key, (map.get(key) ?? 0) + n);
  };

  const resolved = app.metadataCache.resolvedLinks;
  for (const source of Object.keys(resolved)) {
    const targets = resolved[source];
    for (const target of Object.keys(targets)) {
      if (target === source) continue; // a self-link is not a real connection
      add(inbound, target, targets[target]);
      add(outbound, source, targets[target]);
    }
  }

  // Unresolved links still count as the source note reaching outward.
  const unresolved = app.metadataCache.unresolvedLinks;
  for (const source of Object.keys(unresolved)) {
    for (const count of Object.values(unresolved[source])) {
      add(outbound, source, count);
    }
  }

  return { inbound, outbound };
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
