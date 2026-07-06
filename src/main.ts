import {
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
import { issueKey } from "./core/utils/ids";
import { LicenseManager } from "./core/license/LicenseManager";
import { requirePro } from "./ui/pro/ProGate";
import { PRODUCT_NAME } from "./product";

/** Obsidian's internal command runner — not in the public typings. */
interface CommandsApi {
  executeCommandById: (id: string) => boolean;
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
  settings: NoteDoctorSettings = DEFAULT_SETTINGS;

  /** Pro entitlement, derived from the license key on load / change. */
  isPro = false;
  licenseEmail?: string;
  licenseError?: string;

  /** The most recent scan, held in memory for the dashboard and export. */
  lastResult: ScanRun | null = null;

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

    this.addSettingTab(new NoteDoctorSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<NoteDoctorSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    // Defensive: make sure array fields are arrays and weights are complete.
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
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
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
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_NOTE_DOCTOR)) {
      const view = leaf.view;
      if (view instanceof NoteDoctorView) view.render();
    }
  }

  // --- Scanning -------------------------------------------------------------

  async runScan(profileId?: string): Promise<void> {
    const profile = profileId
      ? this.settings.savedProfiles.find((p) => p.id === profileId)
      : undefined;
    if (profileId && !profile) {
      new Notice("Note Doctor: saved profile not found.");
      return;
    }

    const config = resolveScanConfig(this.settings, profile);
    const now = Date.now();
    const { issues, totalFiles } = await scanVault(this.app, config, this.isPro, now);
    const scannedAt = new Date(now).toISOString();

    this.lastResult = { issues, totalFiles, scannedAt, profileId };
    this.settings.lastScanSummary = {
      scannedAt,
      totalFiles,
      totalIssues: issues.length,
      byType: countByType(issues),
      profileId,
    };
    await this.saveSettings();
    this.refreshViews();

    const visible = this.visibleIssues().length;
    new Notice(`${PRODUCT_NAME}: ${visible} issue(s) across ${totalFiles} note(s).`);
  }

  private async runScanAndReveal(): Promise<void> {
    await this.runScan();
    await this.activateView();
  }

  /** Issues from the last scan minus the ones the user has ignored. */
  visibleIssues(): NoteIssue[] {
    if (!this.lastResult) return [];
    const ignored = new Set(this.settings.ignoredIssueKeys);
    return this.lastResult.issues.filter((i) => !ignored.has(i.id));
  }

  // --- Ignore / reviewed / exclude ------------------------------------------

  isIgnored(issue: NoteIssue): boolean {
    return this.settings.ignoredIssueKeys.includes(issue.id);
  }

  isReviewed(issue: NoteIssue): boolean {
    return this.settings.reviewedIssueKeys.includes(issue.id);
  }

  async setIgnored(issue: NoteIssue, ignored: boolean): Promise<void> {
    await this.toggleKey("ignoredIssueKeys", issue.id, ignored);
    this.refreshViews();
  }

  async setReviewed(issue: NoteIssue, reviewed: boolean): Promise<void> {
    await this.toggleKey("reviewedIssueKeys", issue.id, reviewed);
    this.refreshViews();
  }

  private async toggleKey(
    field: "ignoredIssueKeys" | "reviewedIssueKeys",
    key: string,
    on: boolean
  ): Promise<void> {
    const set = new Set(this.settings[field]);
    if (on) set.add(key);
    else set.delete(key);
    this.settings[field] = [...set];
    await this.saveSettings();
  }

  /** Exclude a note's path from all future scans. */
  async excludeNote(path: string): Promise<void> {
    if (!this.settings.excludedPaths.includes(path)) {
      this.settings.excludedPaths = [...this.settings.excludedPaths, path];
      await this.saveSettings();
    }
    if (this.lastResult) {
      this.lastResult.issues = this.lastResult.issues.filter((i) => i.notePath !== path);
    }
    this.refreshViews();
    new Notice(`${PRODUCT_NAME}: excluded ${path} from future scans.`);
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
    const commands = (this.app as unknown as AppInternals).commands;
    commands?.executeCommandById("file-explorer:reveal-active-file");
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
      // The command runs the first saved profile; the dashboard offers a picker.
      void (async () => {
        await this.runScan(profiles[0].id);
        await this.activateView();
      })();
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
    const set = new Set(this.settings.ignoredIssueKeys);
    for (const issue of issues) set.add(issue.id);
    this.settings.ignoredIssueKeys = [...set];
    await this.saveSettings();
    this.refreshViews();
    new Notice(`${PRODUCT_NAME}: ignored ${issues.length} result(s).`);
  }

  async bulkMarkReviewed(issues: NoteIssue[]): Promise<void> {
    const set = new Set(this.settings.reviewedIssueKeys);
    for (const issue of issues) set.add(issue.id);
    this.settings.reviewedIssueKeys = [...set];
    await this.saveSettings();
    this.refreshViews();
    new Notice(`${PRODUCT_NAME}: marked ${issues.length} result(s) reviewed.`);
  }

  async bulkAddProperty(paths: string[], key: string, value: string): Promise<void> {
    let count = 0;
    for (const path of unique(paths)) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        fm[key] = value;
      });
      count++;
    }
    new Notice(`${PRODUCT_NAME}: set "${key}" on ${count} note(s).`);
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

    const folder = normalizePath(REPORT_FOLDER);
    if (!this.app.vault.getAbstractFileByPath(folder)) {
      await this.app.vault.createFolder(folder);
    }
    const stamp = new Date(this.lastResult.scannedAt)
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, "-");
    const path = normalizePath(`${folder}/Report ${stamp}.md`);
    const file = await this.app.vault.create(path, markdown);
    await this.app.workspace.getLeaf(false).openFile(file);
    new Notice(`${PRODUCT_NAME}: report exported.`);
  }

  /** Stable key for an issue (exposed for the review queue and bulk helpers). */
  keyOf(issue: NoteIssue): string {
    return issueKey(issue.notePath, issue.issueType, issue.sourceRuleId);
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
