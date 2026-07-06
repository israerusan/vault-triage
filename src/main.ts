import {
  App,
  FuzzySuggestModal,
  Notice,
  Plugin,
  TFile,
  WorkspaceLeaf,
  normalizePath,
} from "obsidian";
import type { NoteDoctorSettings, NoteIssue, CustomRule, ScanProfile, SortMode } from "./types";
import { DEFAULT_SETTINGS, NoteDoctorSettingTab } from "./settings";
import { NoteDoctorView, VIEW_TYPE_NOTE_DOCTOR } from "./ui/DashboardView";
import { ReviewQueueModal } from "./ui/ReviewQueueModal";
import { scanVault, resolveScanConfig } from "./core/scan/scanVault";
import { countByType } from "./core/rules/severity";
import { buildMarkdownReport } from "./core/reports/markdownReport";
import { issueKey, issueKeyPath } from "./core/utils/ids";
import { isMeaningful } from "./core/utils/frontmatter";
import { LicenseManager } from "./core/license/LicenseManager";
import { requirePro } from "./ui/pro/ProGate";
import { PRODUCT_NAME, REPORT_FOLDER } from "./product";

/** Obsidian's internal command runner — not in the public typings. */
interface CommandsApi {
  executeCommandById: (id: string) => boolean;
  commandExists?: (id: string) => boolean;
}
type AppInternals = { commands?: CommandsApi };

export interface ScanRun {
  issues: NoteIssue[];
  totalFiles: number;
  scannedAt: string;
  profileId?: string;
  sortMode: SortMode;
}

export default class NoteDoctorPlugin extends Plugin {
  settings: NoteDoctorSettings = structuredClone(DEFAULT_SETTINGS);

  /** Pro entitlement, derived from the license key on load / change. */
  isPro = false;
  licenseEmail?: string;
  licenseError?: string;

  /** The most recent scan, held in memory for the dashboard and export. */
  lastResult: ScanRun | null = null;

  /** In-flight scan state, so the UI can show progress and block re-entry. */
  scanning = false;
  scanDone = 0;
  scanTotal = 0;

  /** O(1) mirrors of the ignored/reviewed key arrays (rebuilt on load/mutation). */
  private ignoredSet = new Set<string>();
  private reviewedSet = new Set<string>();

  /** Debounce handle for coalescing rapid ignore/reviewed writes. */
  private saveTimer: number | null = null;

  /** Aborts a pending cache-settle wait if the plugin unloads mid-flight. */
  private abortCacheWait: (() => void) | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.refreshLicense();

    this.registerView(VIEW_TYPE_NOTE_DOCTOR, (leaf) => new NoteDoctorView(leaf, this));

    this.addRibbonIcon("stethoscope", "Open Note Doctor", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "run-vault-scan",
      name: "Run vault scan",
      callback: () => void this.runScanAndReveal(),
    });
    this.addCommand({
      id: "open-dashboard",
      name: "Open dashboard",
      callback: () => void this.activateView(),
    });
    this.addCommand({
      id: "review-flagged-notes",
      name: "Review flagged notes",
      callback: () => this.openReviewQueue(),
    });
    this.addCommand({
      id: "run-saved-scan-profile",
      name: "Run saved scan profile",
      callback: () => this.runSavedProfileCommand(),
    });
    this.addCommand({
      id: "export-scan-report",
      name: "Export scan report",
      callback: () => this.exportReportCommand(),
    });

    // Keep dismissed/excluded state and any on-screen results attached to notes
    // as they move or disappear.
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (this.migratePath(oldPath, file.path)) void this.saveSettings();
        if (this.remapLastResult(oldPath, file.path)) this.refreshViews();
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (this.dropPath(file.path)) void this.saveSettings();
        if (this.dropLastResult(file.path)) this.refreshViews();
      })
    );

    this.addSettingTab(new NoteDoctorSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<NoteDoctorSettings> | null;
    // Clone the defaults so live settings never alias the module-level arrays.
    this.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), data);
    this.settings.severityWeights = {
      ...DEFAULT_SETTINGS.severityWeights,
      ...(this.settings.severityWeights ?? {}),
    };
    for (const key of [
      "requiredProperties",
      "draftMarkers",
      "excludedFolders",
      "excludedPaths",
      "excludedTags",
      "ignoredIssueKeys",
      "reviewedIssueKeys",
      "savedProfiles",
      "customRules",
    ] as const) {
      if (!Array.isArray(this.settings[key])) {
        (this.settings as unknown as Record<string, unknown>)[key] = [];
      }
    }
    this.rebuildKeySets();
  }

  async saveSettings(): Promise<void> {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.materializeKeys();
    await this.saveData(this.settings);
  }

  /** The Sets are canonical; write them into the persisted arrays only at save time. */
  private materializeKeys(): void {
    this.settings.ignoredIssueKeys = [...this.ignoredSet];
    this.settings.reviewedIssueKeys = [...this.reviewedSet];
  }

  /** Coalesce a burst of toggles into one write (the Sets are already current). */
  private scheduleSave(): void {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      this.materializeKeys();
      void this.saveData(this.settings);
    }, 400);
  }

  /** Flush any pending debounced write immediately (on close / unload). */
  flushPendingSave(): void {
    if (this.saveTimer === null) return;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.materializeKeys();
    void this.saveData(this.settings);
  }

  onunload(): void {
    this.flushPendingSave();
    if (this.abortCacheWait) this.abortCacheWait();
  }

  private rebuildKeySets(): void {
    this.ignoredSet = new Set(this.settings.ignoredIssueKeys);
    this.reviewedSet = new Set(this.settings.reviewedIssueKeys);
  }

  /**
   * Drop ignore/reviewed keys only for notes that no longer exist. Keeping keys
   * for still-present notes preserves the user's curation across threshold changes
   * (e.g. a note that stops being "thin" and later qualifies again stays ignored).
   */
  private pruneKeys(): void {
    const gone = (key: string): boolean =>
      this.app.vault.getAbstractFileByPath(issueKeyPath(key)) === null;
    for (const k of [...this.ignoredSet]) if (gone(k)) this.ignoredSet.delete(k);
    for (const k of [...this.reviewedSet]) if (gone(k)) this.reviewedSet.delete(k);
  }

  /** Re-verify the stored license key and update the Pro entitlement flags. */
  refreshLicense(): void {
    const key = this.settings.licenseKey?.trim();
    if (!key) {
      this.isPro = false;
      this.licenseEmail = undefined;
      this.licenseError = undefined;
      this.settings.licenseStatus = "free";
      return;
    }
    const result = LicenseManager.verify(key);
    this.isPro = result.valid;
    this.licenseEmail = result.valid ? result.email : undefined;
    this.licenseError = result.valid ? undefined : result.error;
    this.settings.licenseStatus = result.valid ? "valid-pro" : "invalid";
  }

  // --- Views ----------------------------------------------------------------

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_NOTE_DOCTOR)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      await leaf?.setViewState({ type: VIEW_TYPE_NOTE_DOCTOR, active: true });
    }
    if (leaf) void workspace.revealLeaf(leaf);
  }

  refreshViews(): void {
    for (const view of this.views()) view.render();
  }

  private views(): NoteDoctorView[] {
    return this.app.workspace
      .getLeavesOfType(VIEW_TYPE_NOTE_DOCTOR)
      .map((leaf) => leaf.view)
      .filter((v): v is NoteDoctorView => v instanceof NoteDoctorView);
  }

  // --- Scanning -------------------------------------------------------------

  async runScan(profileId?: string): Promise<void> {
    if (this.scanning) return; // re-entrancy guard: ignore overlapping triggers
    const profile = profileId
      ? this.settings.savedProfiles.find((p) => p.id === profileId)
      : undefined;
    if (profileId && !profile) {
      new Notice("Note Doctor: saved profile not found.");
      return;
    }

    this.scanning = true;
    this.scanDone = 0;
    this.scanTotal = 0;
    this.refreshViews(); // show the scanning state (disabled button + progress line)

    try {
      const config = resolveScanConfig(this.settings, profile);
      const now = Date.now();
      const { issues, totalFiles } = await scanVault(
        this.app,
        config,
        this.isPro,
        now,
        (done, total) => {
          this.scanDone = done;
          this.scanTotal = total;
          for (const view of this.views()) view.showScanProgress(done, total);
        }
      );
      const scannedAt = new Date(now).toISOString();

      this.lastResult = { issues, totalFiles, scannedAt, profileId, sortMode: config.sortMode };
      this.settings.lastScanSummary = {
        scannedAt,
        totalFiles,
        totalIssues: issues.length,
        affectedNotes: new Set(issues.map((i) => i.notePath)).size,
        byType: countByType(issues),
        profileId,
      };
      this.settings.onboardingDismissed = true;
      // Forget marks for notes that no longer exist (bounds data.json growth).
      if (!profileId) this.pruneKeys();
      await this.saveSettings();

      const visible = this.visibleIssues().length;
      new Notice(`${PRODUCT_NAME}: ${visible} issue(s) across ${totalFiles} note(s).`);
    } catch (err) {
      console.error("Note Doctor: scan failed", err);
      new Notice("Note Doctor: scan failed. See the console for details.");
    } finally {
      this.scanning = false;
      this.refreshViews();
    }
  }

  private async runScanAndReveal(): Promise<void> {
    await this.activateView();
    await this.runScan();
  }

  /** Issues from the last scan minus the ones the user has ignored. */
  visibleIssues(): NoteIssue[] {
    if (!this.lastResult) return [];
    return this.lastResult.issues.filter((i) => !this.ignoredSet.has(i.id));
  }

  // --- Ignore / reviewed / exclude ------------------------------------------

  isIgnored(issue: NoteIssue): boolean {
    return this.ignoredSet.has(issue.id);
  }

  isReviewed(issue: NoteIssue): boolean {
    return this.reviewedSet.has(issue.id);
  }

  /** Persist an ignore/reviewed toggle (debounced). Callers update UI in place. */
  async setIgnored(issue: NoteIssue, ignored: boolean): Promise<void> {
    this.applyKey(this.ignoredSet, issue.id, ignored);
    this.scheduleSave();
  }

  async setReviewed(issue: NoteIssue, reviewed: boolean): Promise<void> {
    this.applyKey(this.reviewedSet, issue.id, reviewed);
    this.scheduleSave();
  }

  private applyKey(set: Set<string>, key: string, on: boolean): void {
    if (on) set.add(key);
    else set.delete(key);
  }

  /** Exclude a note's path from all future scans. Caller refreshes its own UI. */
  async excludeNote(path: string): Promise<void> {
    if (!this.settings.excludedPaths.includes(path)) {
      this.settings.excludedPaths = [...this.settings.excludedPaths, path];
    }
    if (this.lastResult) {
      this.lastResult.issues = this.lastResult.issues.filter((i) => i.notePath !== path);
    }
    await this.saveSettings();
    new Notice(`${PRODUCT_NAME}: excluded ${path} from future scans.`);
  }

  /** Rewrite stored keys/paths when a note (or folder) is renamed or moved. */
  private migratePath(oldPath: string, newPath: string): boolean {
    const remap = (p: string): string =>
      p === oldPath ? newPath : p.startsWith(oldPath + "/") ? newPath + p.slice(oldPath.length) : p;
    const remapKey = (key: string): string => {
      const p = issueKeyPath(key);
      return remap(p) + key.slice(p.length); // path + (separator + type [+ ruleId])
    };
    const remapSet = (set: Set<string>): boolean => {
      let changed = false;
      const next = new Set<string>();
      for (const k of set) {
        const nk = remapKey(k);
        if (nk !== k) changed = true;
        next.add(nk);
      }
      if (changed) {
        set.clear();
        for (const k of next) set.add(k);
      }
      return changed;
    };

    let changed = remapSet(this.ignoredSet);
    changed = remapSet(this.reviewedSet) || changed;
    const nextEx = this.settings.excludedPaths.map(remap);
    if (nextEx.some((p, i) => p !== this.settings.excludedPaths[i])) {
      this.settings.excludedPaths = nextEx;
      changed = true;
    }
    return changed;
  }

  /** Rewrite in-memory scan results when a note (or folder) is renamed/moved. */
  private remapLastResult(oldPath: string, newPath: string): boolean {
    if (!this.lastResult) return false;
    let changed = false;
    this.lastResult.issues = this.lastResult.issues.map((issue) => {
      const p = issue.notePath;
      const np =
        p === oldPath ? newPath : p.startsWith(oldPath + "/") ? newPath + p.slice(oldPath.length) : p;
      if (np === p) return issue;
      changed = true;
      const noteName = basename(np);
      return {
        ...issue,
        notePath: np,
        noteName,
        id: issueKey(np, issue.issueType, issue.sourceRuleId),
      };
    });
    return changed;
  }

  /** Drop in-memory results for a deleted note or folder subtree. */
  private dropLastResult(path: string): boolean {
    if (!this.lastResult) return false;
    const before = this.lastResult.issues.length;
    this.lastResult.issues = this.lastResult.issues.filter(
      (i) => i.notePath !== path && !i.notePath.startsWith(path + "/")
    );
    return this.lastResult.issues.length !== before;
  }

  /** Drop stored keys/paths for a deleted note or folder subtree. */
  private dropPath(path: string): boolean {
    // A folder delete fires ONE event for the folder, so match the subtree too.
    const affected = (p: string): boolean => p === path || p.startsWith(path + "/");
    let changed = false;
    for (const k of [...this.ignoredSet]) if (affected(issueKeyPath(k))) { this.ignoredSet.delete(k); changed = true; }
    for (const k of [...this.reviewedSet]) if (affected(issueKeyPath(k))) { this.reviewedSet.delete(k); changed = true; }
    const nextEx = this.settings.excludedPaths.filter((p) => !affected(p));
    if (nextEx.length !== this.settings.excludedPaths.length) {
      this.settings.excludedPaths = nextEx;
      changed = true;
    }
    return changed;
  }

  // --- Navigation -----------------------------------------------------------

  async openNote(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(file);
    }
  }

  async revealNote(path: string): Promise<void> {
    await this.openNote(path);
    // Reveal-in-file-explorer has no public API; feature-detect the internal
    // command so a missing/renamed command (or mobile) degrades to just opening.
    // Reveal is best-effort via a private command; wrap it so a shape/behavior
    // change in a future Obsidian degrades to "note is already open".
    try {
      const commands = (this.app as unknown as AppInternals).commands;
      if (!commands) return;
      const id = "file-explorer:reveal-active-file";
      const available = commands.commandExists ? commands.commandExists(id) : true;
      if (available) commands.executeCommandById(id);
    } catch {
      /* reveal is optional */
    }
  }

  // --- Review queue ---------------------------------------------------------

  openReviewQueue(issues?: NoteIssue[]): void {
    const list = issues ?? this.visibleIssues();
    if (list.length === 0) {
      new Notice(`${PRODUCT_NAME}: no flagged notes. Run a scan first.`);
      return;
    }
    new ReviewQueueModal(this.app, this, list).open();
  }

  // --- Pro: profiles --------------------------------------------------------

  async saveProfile(profile: ScanProfile): Promise<void> {
    const idx = this.settings.savedProfiles.findIndex((p) => p.id === profile.id);
    if (idx >= 0) this.settings.savedProfiles[idx] = profile;
    else this.settings.savedProfiles.push(profile);
    await this.saveSettings();
  }

  async deleteProfile(id: string): Promise<void> {
    this.settings.savedProfiles = this.settings.savedProfiles.filter((p) => p.id !== id);
    await this.saveSettings();
  }

  runSavedProfileCommand(): void {
    requirePro(this, "profiles", () => {
      const profiles = this.settings.savedProfiles;
      if (profiles.length === 0) {
        new Notice("Note Doctor: no saved profiles yet. Create one in settings.");
        return;
      }
      const run = (id: string): void =>
        void (async () => {
          await this.activateView();
          await this.runScan(id);
        })();
      if (profiles.length === 1) {
        run(profiles[0].id);
        return;
      }
      new ProfileSuggestModal(this.app, profiles, (p) => run(p.id)).open();
    });
  }

  // --- Pro: custom rules ----------------------------------------------------

  async saveRule(rule: CustomRule): Promise<void> {
    const idx = this.settings.customRules.findIndex((r) => r.id === rule.id);
    if (idx >= 0) this.settings.customRules[idx] = rule;
    else this.settings.customRules.push(rule);
    await this.saveSettings();
  }

  async deleteRule(id: string): Promise<void> {
    this.settings.customRules = this.settings.customRules.filter((r) => r.id !== id);
    await this.saveSettings();
  }

  // --- Pro: bulk actions ----------------------------------------------------

  async bulkIgnore(issues: NoteIssue[]): Promise<void> {
    for (const issue of issues) this.ignoredSet.add(issue.id);
    await this.saveSettings();
    this.refreshViews();
    new Notice(`${PRODUCT_NAME}: ignored ${issues.length} result(s).`);
  }

  async bulkMarkReviewed(issues: NoteIssue[]): Promise<void> {
    for (const issue of issues) this.reviewedSet.add(issue.id);
    await this.saveSettings();
    this.refreshViews();
    new Notice(`${PRODUCT_NAME}: marked ${issues.length} result(s) reviewed.`);
  }

  /**
   * Add a frontmatter property only to notes where it is ABSENT or empty (matching
   * the detector's `isMeaningful`), never clobbering a real value. An empty input
   * value is rejected up front (writing `key: ""` wouldn't clear the flag anyway).
   * Returns the paths actually changed so the caller can rescan them.
   */
  async bulkAddProperty(paths: string[], key: string, value: string): Promise<string[]> {
    if (!isMeaningful(value)) {
      new Notice("Note Doctor: enter a value for the property.");
      return [];
    }
    const changed: string[] = [];
    let skipped = 0;
    for (const path of unique(paths)) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      let didSet = false;
      await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        if (isMeaningful(fm[key])) return;
        fm[key] = value;
        didSet = true;
      });
      if (didSet) changed.push(path);
      else skipped++;
    }
    const tail = skipped > 0 ? ` (${skipped} already had it)` : "";
    new Notice(`${PRODUCT_NAME}: set "${key}" on ${changed.length} note(s)${tail}.`);
    return changed;
  }

  /** Append a tag to notes that lack it. Returns the paths actually changed. */
  async bulkAddTag(paths: string[], tag: string): Promise<string[]> {
    const clean = tag.replace(/^#/, "").trim();
    if (!clean) return [];
    const changed: string[] = [];
    for (const path of unique(paths)) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      let added = false;
      await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        const existing = fm.tags;
        // A scalar `tags: reading, todo` is two tags to Obsidian — split it the
        // same way. Leave any unexpected shape (number/object) untouched.
        if (existing != null && !Array.isArray(existing) && typeof existing !== "string") return;
        const tags: string[] = Array.isArray(existing)
          ? existing.map((t) => String(t))
          : typeof existing === "string"
            ? existing
                .split(/[,\s]+/)
                .map((t) => t.replace(/^#/, "").trim())
                .filter((t) => t.length > 0)
            : [];
        if (tags.includes(clean)) return;
        tags.push(clean);
        fm.tags = tags;
        added = true;
      });
      if (added) changed.push(path);
    }
    new Notice(`${PRODUCT_NAME}: added #${clean} to ${changed.length} note(s).`);
    return changed;
  }

  /** Wait for the metadata cache to reparse the given paths, then re-scan. */
  async settleCacheThenRescan(paths: string[]): Promise<void> {
    if (paths.length > 0) await this.awaitCacheChanges(paths);
    await this.runScan(this.lastResult?.profileId);
  }

  /** Resolve once the metadata cache has emitted `changed` for every path (or 2s,
   *  or immediately if the plugin unloads). */
  private awaitCacheChanges(paths: string[]): Promise<void> {
    const pending = new Set(paths);
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        this.app.metadataCache.offref(ref);
        window.clearTimeout(timer);
        this.abortCacheWait = null;
        resolve();
      };
      const ref = this.app.metadataCache.on("changed", (file) => {
        pending.delete(file.path);
        if (pending.size === 0) finish();
      });
      const timer = window.setTimeout(finish, 2000);
      this.abortCacheWait = finish;
    });
  }

  /** Public debounced-save hook for the settings tab's field edits. */
  queueSave(): void {
    this.scheduleSave();
  }

  /** Clear all ignored results (recover from accidental ignores). */
  async clearIgnored(): Promise<void> {
    this.ignoredSet.clear();
    await this.saveSettings();
    this.refreshViews();
  }

  ignoredCount(): number {
    return this.ignoredSet.size;
  }

  // --- Pro: report export ---------------------------------------------------

  private exportReportCommand(): void {
    requirePro(this, "export", () => void this.exportReport());
  }

  async exportReport(issues?: NoteIssue[]): Promise<void> {
    if (!this.lastResult) {
      new Notice("Note Doctor: run a scan before exporting a report.");
      return;
    }
    const list = issues ?? this.visibleIssues();
    const profile = this.lastResult.profileId
      ? this.settings.savedProfiles.find((p) => p.id === this.lastResult?.profileId)
      : undefined;

    const markdown = buildMarkdownReport({
      scannedAt: new Date(this.lastResult.scannedAt).toLocaleString(),
      profileName: profile?.name,
      totalFiles: this.lastResult.totalFiles,
      issues: list,
    });

    try {
      const folder = normalizePath(REPORT_FOLDER);
      if (!this.app.vault.getAbstractFileByPath(folder)) {
        await this.app.vault.createFolder(folder);
      }
      const path = this.uniqueReportPath(folder);
      const file = await this.app.vault.create(path, markdown);
      await this.app.workspace.getLeaf(false).openFile(file);
      new Notice(`${PRODUCT_NAME}: report exported.`);
    } catch (err) {
      console.error("Note Doctor: report export failed", err);
      new Notice("Note Doctor: could not write the report. See the console for details.");
    }
  }

  /** A collision-free report path, stamped at export time. */
  private uniqueReportPath(folder: string): string {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    let path = normalizePath(`${folder}/Report ${stamp}.md`);
    let n = 2;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = normalizePath(`${folder}/Report ${stamp} (${n}).md`);
      n++;
    }
    return path;
  }
}

/** Palette/dashboard picker for choosing which saved profile to run. */
class ProfileSuggestModal extends FuzzySuggestModal<ScanProfile> {
  constructor(
    app: App,
    private profiles: ScanProfile[],
    private onChoose: (profile: ScanProfile) => void
  ) {
    super(app);
    this.setPlaceholder("Run which scan profile?");
  }

  getItems(): ScanProfile[] {
    return this.profiles;
  }

  getItemText(profile: ScanProfile): string {
    return profile.name;
  }

  onChooseItem(profile: ScanProfile): void {
    this.onChoose(profile);
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** Basename of a vault path, without the trailing `.md`. */
function basename(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.replace(/\.md$/, "");
}
