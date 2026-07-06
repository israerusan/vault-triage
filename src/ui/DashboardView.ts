import { ItemView, WorkspaceLeaf } from "obsidian";
import type NoteDoctorPlugin from "../main";
import type { IssueType, NoteIssue, SortMode } from "../types";
import { ISSUE_TYPE_LABELS, ISSUE_TYPES } from "../types";
import { countByType, sortIssues } from "../core/rules/severity";
import { renderResultsList } from "./ResultsList";
import { requirePro } from "./pro/ProGate";
import { PromptModal } from "./PromptModal";
import { PRO_PRICE_LABEL, PRO_TAGLINE, PURCHASE_URL } from "../product";

export const VIEW_TYPE_NOTE_DOCTOR = "note-doctor-dashboard";

type Filter = IssueType | "all";

const CHECK_BLURB =
  "Note Doctor scans for stale notes, thin notes, orphans, missing properties, and draft markers, then helps you clear them out one at a time.";

export class NoteDoctorView extends ItemView {
  private filter: Filter = "all";
  private sortMode: SortMode = "severity";
  private bulkMode = false;
  private selected = new Set<string>();

  private metaEl: HTMLElement | null = null;
  private summaryEl: HTMLElement | null = null;
  private progressEl: HTMLElement | null = null;
  private selCountEl: HTMLElement | null = null;
  /** So a fresh scan adopts its profile's sort once, without fighting user changes. */
  private lastSyncedScanAt: string | null = null;

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  constructor(leaf: WorkspaceLeaf, private plugin: NoteDoctorPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_NOTE_DOCTOR;
  }

  getDisplayText(): string {
    return "Note Doctor";
  }

  getIcon(): string {
    return "stethoscope";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  /** Cheap progress update during a scan — touches only the counter and bar. */
  showScanProgress(done: number, total: number): void {
    if (this.summaryEl) {
      this.summaryEl.setText(total > 0 ? `${done} / ${total} notes` : "");
    }
    if (this.progressEl) {
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      this.progressEl.setCssStyles({ width: `${pct}%` });
    }
  }

  render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("note-doctor-view");
    this.metaEl = null;
    this.summaryEl = null;
    this.progressEl = null;
    this.selCountEl = null;

    this.renderHeader(root);

    if (this.plugin.scanning) {
      this.metaEl = root.createDiv({ cls: "note-doctor-meta" });
      this.renderScanningMeta();
      return;
    }

    if (!this.plugin.lastResult) {
      if (!this.plugin.settings.onboardingDismissed) {
        // First run: let the scan prove value before any paywall.
        this.renderOnboarding(root);
      } else {
        this.metaEl = root.createDiv({ cls: "note-doctor-meta" });
        this.renderHydratedMeta(root);
        if (!this.plugin.isPro) this.renderProCta(root);
      }
      return;
    }

    const last = this.plugin.lastResult;
    // A newly-completed scan adopts its (profile's) sort mode once.
    if (last && last.scannedAt !== this.lastSyncedScanAt) {
      this.sortMode = last.sortMode;
      this.lastSyncedScanAt = last.scannedAt;
    }

    const issues = this.plugin.visibleIssues();
    // If the active filter's category has been fully cleared, fall back to All.
    if (this.filter !== "all" && (countByType(issues)[this.filter] ?? 0) === 0) {
      this.filter = "all";
    }

    this.metaEl = root.createDiv({ cls: "note-doctor-meta" });
    this.renderMeta(issues);
    this.renderToolbar(root);
    if (this.bulkMode) this.renderBulkBar(root);

    // When the whole vault is clean the hero stat already says so — don't stack a
    // second "nice and tidy" empty-state under it. (A filtered-empty view still
    // renders its own message.)
    if (issues.length > 0 || this.filter !== "all") {
      renderResultsList(root.createDiv(), this.plugin, this.applyView(issues), {
        bulkMode: this.bulkMode,
        selected: this.selected,
        onSelectionChange: () => this.updateSelCount(),
        onCountsChanged: () => this.refreshMeta(),
      });
    }

    if (!this.plugin.isPro) this.renderProCta(root);
  }

  private renderHeader(root: HTMLElement): void {
    const header = root.createDiv({ cls: "note-doctor-header" });
    header.createEl("h2", { text: "Note Doctor" });
    const btn = header.createEl("button", {
      text: this.plugin.scanning ? "Scanning…" : "Run scan",
      cls: "mod-cta",
    });
    btn.disabled = this.plugin.scanning;
    btn.addEventListener("click", () => void this.plugin.runScan());

    const profiles = this.plugin.settings.savedProfiles;
    if (this.plugin.isPro && profiles.length > 0) {
      const select = header.createEl("select", { cls: "dropdown note-doctor-profile-select" });
      select.createEl("option", { text: "Run a profile…", value: "" });
      for (const p of profiles) select.createEl("option", { text: p.name, value: p.id });
      select.disabled = this.plugin.scanning;
      select.addEventListener("change", () => {
        if (select.value) void this.plugin.runScan(select.value);
        select.value = "";
      });
    }
  }

  private renderOnboarding(root: HTMLElement): void {
    const card = root.createDiv({ cls: "note-doctor-onboarding" });
    card.createEl("h3", { text: "Find what needs attention" });
    card.createDiv({ cls: "note-doctor-onboarding-blurb", text: CHECK_BLURB });
    card.createDiv({
      cls: "note-doctor-onboarding-hint",
      text: "Tip: to check for missing metadata, add fields under Required properties in settings.",
    });
    const btn = card.createEl("button", { text: "Run your first scan", cls: "mod-cta" });
    btn.addEventListener("click", () => void this.plugin.runScan());
  }

  private renderScanningMeta(): void {
    const host = this.metaEl;
    if (!host) return;
    host.empty();
    const stat = host.createDiv({ cls: "note-doctor-stat" });
    stat.createSpan({ cls: "note-doctor-stat-label", text: "Scanning your vault…" });
    this.summaryEl = host.createDiv({ cls: "note-doctor-summary" });
    const track = host.createDiv({ cls: "note-doctor-progress" });
    this.progressEl = track.createDiv({ cls: "note-doctor-progress-bar" });
    this.showScanProgress(this.plugin.scanDone, this.plugin.scanTotal);
  }

  /** After a restart there's no in-memory result; show the last scan's summary. */
  private renderHydratedMeta(root: HTMLElement): void {
    const host = this.metaEl;
    const summary = this.plugin.settings.lastScanSummary;
    if (!host || !summary) {
      this.renderOnboarding(root);
      return;
    }
    host.empty();
    const affected = summary.affectedNotes ?? summary.totalIssues;
    const stat = host.createDiv({ cls: "note-doctor-stat" });
    stat.createSpan({ cls: "note-doctor-stat-num", text: String(affected) });
    stat.createSpan({
      cls: "note-doctor-stat-label",
      text: affected === 1 ? "note needed attention" : "notes needed attention",
    });
    host
      .createDiv({ cls: "note-doctor-summary" })
      .setText(
        `Last scan ${relativeTime(summary.scannedAt)} · ${summary.totalIssues} issues · run a scan to review`
      );
    const tiles = host.createDiv({ cls: "note-doctor-tiles" });
    for (const type of ISSUE_TYPES) {
      const count = summary.byType[type] ?? 0;
      if (count === 0) continue;
      const tile = tiles.createDiv({ cls: "note-doctor-tile is-static" });
      tile.createDiv({ cls: "note-doctor-tile-count", text: String(count) });
      tile.createDiv({ cls: "note-doctor-tile-label", text: ISSUE_TYPE_LABELS[type] });
    }
  }

  private renderMeta(issues: NoteIssue[]): void {
    const host = this.metaEl;
    if (!host) return;
    host.empty();

    // Hero counts affected NOTES that still have UN-reviewed issues, so the
    // number visibly falls as the user works through the review loop.
    const outstanding = issues.filter((i) => !this.plugin.isReviewed(i));
    const affected = new Set(outstanding.map((i) => i.notePath)).size;
    const reviewedCount = issues.length - outstanding.length;
    const stat = host.createDiv({ cls: "note-doctor-stat" });
    stat.createSpan({ cls: "note-doctor-stat-num", text: String(affected) });
    stat.createSpan({
      cls: "note-doctor-stat-label",
      text:
        affected === 0
          ? issues.length === 0
            ? "your vault is clean"
            : "all reviewed — nicely done"
          : affected === 1
            ? "note needs attention"
            : "notes need attention",
    });

    this.summaryEl = host.createDiv({ cls: "note-doctor-summary" });
    const last = this.plugin.lastResult;
    if (last) {
      const issueWord = issues.length === 1 ? "issue" : "issues";
      const reviewed = reviewedCount > 0 ? ` · ${reviewedCount} reviewed` : "";
      this.summaryEl.setText(
        `${issues.length} ${issueWord}${reviewed} · scanned ${relativeTime(last.scannedAt)}`
      );
    }

    this.renderTiles(host, issues);

    if (issues.length > 0 && this.plugin.settings.requiredProperties.length === 0) {
      const nudge = host.createDiv({ cls: "note-doctor-nudge" });
      nudge.appendText("Also catch notes missing metadata? ");
      const link = nudge.createEl("button", {
        cls: "note-doctor-inline-link",
        text: "Check for a required property",
      });
      link.addEventListener("click", () => {
        this.plugin.settings.requiredProperties = ["tags"];
        void this.plugin.saveSettings().then(() => this.plugin.runScan(this.plugin.lastResult?.profileId));
      });
    }
  }

  private renderTiles(host: HTMLElement, issues: NoteIssue[]): void {
    const counts = countByType(issues);
    const tiles = host.createDiv({ cls: "note-doctor-tiles" });
    this.tile(tiles, "All", issues.length, this.filter === "all", () => {
      this.filter = "all";
      this.render();
    });
    for (const type of ISSUE_TYPES) {
      if (counts[type] === 0) continue;
      this.tile(tiles, ISSUE_TYPE_LABELS[type], counts[type], this.filter === type, () => {
        this.filter = type;
        this.render();
      });
    }
  }

  private tile(
    host: HTMLElement,
    label: string,
    count: number,
    active: boolean,
    onClick: () => void
  ): void {
    const tile = host.createEl("button", { cls: "note-doctor-tile" });
    if (active) tile.addClass("is-active");
    tile.createDiv({ cls: "note-doctor-tile-count", text: String(count) });
    tile.createDiv({ cls: "note-doctor-tile-label", text: label });
    tile.addEventListener("click", onClick);
  }

  /** Refresh only the stat/tiles/summary after an in-place row mutation. */
  private refreshMeta(): void {
    if (this.metaEl) this.renderMeta(this.plugin.visibleIssues());
  }

  private updateSelCount(): void {
    if (this.selCountEl) this.selCountEl.setText(`${this.selected.size} selected`);
  }

  private renderToolbar(root: HTMLElement): void {
    const bar = root.createDiv({ cls: "note-doctor-toolbar" });

    const sort = bar.createEl("select", { cls: "dropdown" });
    for (const [value, text] of [
      ["severity", "Sort: severity"],
      ["title", "Sort: title"],
      ["path", "Sort: path"],
    ] as [SortMode, string][]) {
      const opt = sort.createEl("option", { text, value });
      if (value === this.sortMode) opt.selected = true;
    }
    sort.addEventListener("change", () => {
      this.sortMode = sort.value as SortMode;
      // Persist so a plain re-scan keeps this choice instead of resetting.
      this.plugin.settings.sortMode = this.sortMode;
      this.plugin.queueSave();
      this.render();
    });

    // Reviewing the current view (all or a filtered subset) is free.
    const scoped = this.filter !== "all";
    const review = bar.createEl("button", {
      text: scoped ? `Review ${ISSUE_TYPE_LABELS[this.filter as IssueType]}` : "Review flagged",
    });
    review.addEventListener("click", () =>
      this.plugin.openReviewQueue(this.applyView(this.plugin.visibleIssues()))
    );

    const bulk = bar.createEl("button", { text: this.bulkMode ? "Exit bulk" : "Bulk actions" });
    if (!this.bulkMode && !this.plugin.isPro) {
      bulk.createSpan({ cls: "note-doctor-pro-pill", text: "Pro" });
    }
    bulk.addEventListener("click", () => {
      if (this.bulkMode) {
        this.bulkMode = false;
        this.selected.clear();
        this.render();
        return;
      }
      requirePro(this.plugin, "bulk", () => {
        this.bulkMode = true;
        this.render();
      });
    });
  }

  private renderBulkBar(root: HTMLElement): void {
    const bar = root.createDiv({ cls: "note-doctor-bulk-bar" });
    this.selCountEl = bar.createSpan({ text: `${this.selected.size} selected` });

    const selectedIssues = (): NoteIssue[] =>
      this.plugin.visibleIssues().filter((i) => this.selected.has(i.id));

    this.bulkButton(bar, "Ignore", () =>
      void this.plugin.bulkIgnore(selectedIssues()).then(() => this.afterBulk())
    );
    this.bulkButton(bar, "Mark reviewed", () =>
      void this.plugin.bulkMarkReviewed(selectedIssues()).then(() => this.afterBulk())
    );
    this.bulkButton(bar, "Add property", () => {
      new PromptModal(
        this.app,
        "Add property to selected notes",
        [
          { key: "key", label: "Property", placeholder: "status" },
          { key: "value", label: "Value", placeholder: "review" },
        ],
        (v) => {
          if (v.key.trim()) {
            const paths = selectedIssues().map((i) => i.notePath);
            void this.plugin
              .bulkAddProperty(paths, v.key.trim(), v.value)
              .then((changed) => this.afterBulkMutate(changed));
          }
        }
      ).open();
    });
    this.bulkButton(bar, "Add tag", () => {
      new PromptModal(
        this.app,
        "Add tag to selected notes",
        [{ key: "tag", label: "Tag", placeholder: "review" }],
        (v) => {
          if (v.tag.trim()) {
            const paths = selectedIssues().map((i) => i.notePath);
            void this.plugin.bulkAddTag(paths, v.tag.trim()).then((changed) => this.afterBulkMutate(changed));
          }
        }
      ).open();
    });
    this.bulkButton(bar, "Export selected", () => void this.plugin.exportReport(selectedIssues()));
  }

  private bulkButton(bar: HTMLElement, label: string, onClick: () => void): void {
    const btn = bar.createEl("button", { text: label });
    btn.addEventListener("click", onClick);
  }

  private afterBulk(): void {
    this.selected.clear();
    this.render();
  }

  /** After a file-mutating bulk action, wait for the cache then re-scan so the
   *  fixed notes drop off. Skips the rescan when nothing actually changed. */
  private afterBulkMutate(changed: string[]): void {
    this.selected.clear();
    this.bulkMode = false;
    if (changed.length === 0) {
      this.render();
      return;
    }
    void this.plugin.settleCacheThenRescan(changed);
  }

  private renderProCta(root: HTMLElement): void {
    const card = root.createDiv({ cls: "note-doctor-pro-cta" });
    card.createEl("strong", { text: `Note Doctor Pro — ${PRO_PRICE_LABEL}` });
    card.createDiv({ text: PRO_TAGLINE });
    card.createEl("a", {
      text: `Get Pro — ${PRO_PRICE_LABEL}`,
      cls: "note-doctor-cta-link",
      href: PURCHASE_URL,
    });
  }

  /** Apply the active filter and sort mode to the visible issues. */
  private applyView(issues: NoteIssue[]): NoteIssue[] {
    const filtered =
      this.filter === "all" ? issues : issues.filter((i) => i.issueType === this.filter);
    return sortIssues(filtered, this.sortMode);
  }
}

/** Compact "x ago" label without pulling in a date library. */
function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "just now";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
