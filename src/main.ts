import {
  App,
  FuzzySuggestModal,
  Notice,
  Plugin,
  TFile,
  WorkspaceLeaf,
  normalizePath,
} from "obsidian";
import type { NoteDoctorSettings, NoteIssue, CustomRule, ScanProfile } from "./types";
import { DEFAULT_SETTINGS, NoteDoctorSettingTab } from "./settings";
import { NoteDoctorView, VIEW_TYPE_NOTE_DOCTOR } from "./ui/DashboardView";
import { ReviewQueueModal } from "./ui/ReviewQueueModal";
import { scanVault, resolveScanConfig } from "./core/scan/scanVault";
import { countByType } from "./core/rules/severity";
import { buildMarkdownReport } from "./core/reports/markdownReport";
import { hasProperty } from "./core/utils/frontmatter";
import { LicenseManager } from "./core/license/LicenseManager";
import { requirePro } from "./ui/pro/ProGate";
import { PRODUCT_NAME } from "./product";

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
}

const REPORT_FOLDER = "Note Doctor Reports";

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

    // Keep dismissed/excluded state attached to notes as they move or disappear.
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (this.migratePath(oldPath, file.path)) void this.saveSettings();
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (this.dropPath(file.path)) void this.saveSettings();
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
    await this.saveData(this.settings);
  }

  private rebuildKeySets(): void {
    this.ignoredSet = new Set(this.settings.ignoredIssueKeys);
    this.reviewedSet = new Set(this.settings.reviewedIssueKeys);
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

      this.lastResult = { issues, totalFiles, scannedAt, profileId };
      this.settings.lastScanSummary = {
        scannedAt,
        totalFiles,
        totalIssues: issues.length,
        byType: countByType(issues),
        profileId,
      };
      this.settings.onboardingDismissed = true;
      await this.saveSettings();

      const visible = this.visibleIssues().length;
      new Notice(`${PRODUCT_NAME}: ${visible} issue(s) across ${totalFiles} note(s).`);
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

  /** Persist an ignore/reviewed toggle. Callers update their own UI in place. */
  async setIgnored(issue: NoteIssue, ignored: boolean): Promise<void> {
    this.applyKey(this.ignoredSet, "ignoredIssueKeys", issue.id, ignored);
    await this.saveSettings();
  }

  async setReviewed(issue: NoteIssue, reviewed: boolean): Promise<void> {
    this.applyKey(this.reviewedSet, "reviewedIssueKeys", issue.id, reviewed);
    await this.saveSettings();
  }

  private applyKey(
    set: Set<string>,
    field: "ignoredIssueKeys" | "reviewedIssueKeys",
    key: string,
    on: boolean
  ): void {
    if (on) set.add(key);
    else set.delete(key);
    this.settings[field] = [...set];
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
    const remapKey = (key: string): string => {
      const sep = key.indexOf("::");
      const p = sep === -1 ? key : key.slice(0, sep);
      const rest = sep === -1 ? "" : key.slice(sep);
      if (p === oldPath) return newPath + rest;
      if (p.startsWith(oldPath + "/")) return newPath + p.slice(oldPath.length) + rest;
      return key;
    };
    const remapPath = (p: string): string =>
      p === oldPath ? newPath : p.startsWith(oldPath + "/") ? newPath + p.slice(oldPath.length) : p;

    const before = JSON.stringify([
      this.settings.ignoredIssueKeys,
      this.settings.reviewedIssueKeys,
      this.settings.excludedPaths,
    ]);
    this.settings.ignoredIssueKeys = this.settings.ignoredIssueKeys.map(remapKey);
    this.settings.reviewedIssueKeys = this.settings.reviewedIssueKeys.map(remapKey);
    this.settings.excludedPaths = this.settings.excludedPaths.map(remapPath);
    this.rebuildKeySets();
    return (
      JSON.stringify([
        this.settings.ignoredIssueKeys,
        this.settings.reviewedIssueKeys,
        this.settings.excludedPaths,
      ]) !== before
    );
  }

  /** Drop stored keys/paths for a deleted note so data.json doesn't accrete cruft. */
  private dropPath(path: string): boolean {
    const keepKey = (key: string): boolean => {
      const sep = key.indexOf("::");
      return (sep === -1 ? key : key.slice(0, sep)) !== path;
    };
    const beforeLen =
      this.settings.ignoredIssueKeys.length +
      this.settings.reviewedIssueKeys.length +
      this.settings.excludedPaths.length;
    this.settings.ignoredIssueKeys = this.settings.ignoredIssueKeys.filter(keepKey);
    this.settings.reviewedIssueKeys = this.settings.reviewedIssueKeys.filter(keepKey);
    this.settings.excludedPaths = this.settings.excludedPaths.filter((p) => p !== path);
    this.rebuildKeySets();
    const afterLen =
      this.settings.ignoredIssueKeys.length +
      this.settings.reviewedIssueKeys.length +
      this.settings.excludedPaths.length;
    return afterLen !== beforeLen;
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
    const commands = (this.app as unknown as AppInternals).commands;
    if (!commands) return;
    const id = "file-explorer:reveal-active-file";
    const available = commands.commandExists ? commands.commandExists(id) : true;
    if (available) commands.executeCommandById(id);
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
    this.settings.ignoredIssueKeys = [...this.ignoredSet];
    await this.saveSettings();
    this.refreshViews();
    new Notice(`${PRODUCT_NAME}: ignored ${issues.length} result(s).`);
  }

  async bulkMarkReviewed(issues: NoteIssue[]): Promise<void> {
    for (const issue of issues) this.reviewedSet.add(issue.id);
    this.settings.reviewedIssueKeys = [...this.reviewedSet];
    await this.saveSettings();
    this.refreshViews();
    new Notice(`${PRODUCT_NAME}: marked ${issues.length} result(s) reviewed.`);
  }

  /**
   * Add a frontmatter property to notes that don't already have it. Existing
   * values are never overwritten — a cleanup tool must not clobber user data.
   * Returns how many were set vs. skipped.
   */
  async bulkAddProperty(paths: string[], key: string, value: string): Promise<void> {
    let set = 0;
    let skipped = 0;
    for (const path of unique(paths)) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        if (hasProperty(fm, key)) {
          skipped++;
        } else {
          fm[key] = value;
          set++;
        }
      });
    }
    const tail = skipped > 0 ? ` (${skipped} already had it)` : "";
    new Notice(`${PRODUCT_NAME}: set "${key}" on ${set} note(s)${tail}.`);
  }

  async bulkAddTag(paths: string[], tag: string): Promise<void> {
    const clean = tag.replace(/^#/, "").trim();
    if (!clean) return;
    let count = 0;
    for (const path of unique(paths)) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        const existing = fm.tags;
        const tags: string[] = Array.isArray(existing)
          ? existing.map((t) => String(t))
          : typeof existing === "string" && existing.length > 0
            ? [existing]
            : [];
        if (!tags.includes(clean)) tags.push(clean);
        fm.tags = tags;
      });
      count++;
    }
    new Notice(`${PRODUCT_NAME}: added #${clean} to ${count} note(s).`);
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
