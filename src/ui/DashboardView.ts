import { ItemView, WorkspaceLeaf } from "obsidian";
import type NoteDoctorPlugin from "../main";
import type { IssueType, NoteIssue, SortMode } from "../types";
import { ISSUE_TYPE_LABELS, ISSUE_TYPES } from "../types";
import { countByType, sortIssues } from "../core/rules/severity";
import { renderResultsList } from "./ResultsList";
import { requirePro } from "./pro/ProGate";
import { PromptModal } from "./PromptModal";
import { PRO_TAGLINE, PURCHASE_URL } from "../product";

export const VIEW_TYPE_NOTE_DOCTOR = "note-doctor-dashboard";

type Filter = IssueType | "all";

const CHECK_BLURB =
  "Note Doctor scans for stale notes, thin notes, orphans, missing properties, and draft markers, then helps you clear them out one at a time.";

export class NoteDoctorView extends ItemView {
  private filter: Filter = "all";
  private sortMode: SortMode = "severity";
  private bulkMode = false;
  private selected = new Set<string>();

  /** Region holding the summary stat + category tiles, refreshed in place. */
  private metaEl: HTMLElement | null = null;
  private summaryEl: HTMLElement | null = null;

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

  /** Cheap progress update during a scan — touches only the summary line. */
  showScanProgress(done: number, total: number): void {
    if (this.summaryEl) {
      this.summaryEl.setText(total > 0 ? `Scanning ${done} / ${total}…` : "Scanning…");
    }
  }

  render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("note-doctor-view");
    this.metaEl = null;
    this.summaryEl = null;

    this.renderHeader(root);

    if (!this.plugin.lastResult && !this.plugin.scanning) {
      this.summaryEl = root.createDiv({ cls: "note-doctor-summary" });
      this.renderOnboarding(root);
      if (!this.plugin.isPro) this.renderProCta(root);
      return;
    }

    const issues = this.plugin.visibleIssues();
    this.metaEl = root.createDiv({ cls: "note-doctor-meta" });
    this.renderMeta(issues);

    this.renderToolbar(root);
    if (this.bulkMode) this.renderBulkBar(root);

    renderResultsList(root.createDiv(), this.plugin, this.applyView(issues), {
      bulkMode: this.bulkMode,
      selected: this.selected,
      onSelectionChange: () => this.render(),
      onCountsChanged: () => this.refreshMeta(),
    });

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
    if (this.summaryEl) this.summaryEl.setText("");
    const card = root.createDiv({ cls: "note-doctor-onboarding" });
    card.createEl("h3", { text: "Find what needs attention" });
    card.createDiv({ cls: "note-doctor-onboarding-blurb", text: CHECK_BLURB });
    const btn = card.createEl("button", { text: "Run your first scan", cls: "mod-cta" });
    btn.addEventListener("click", () => void this.plugin.runScan());
  }

  private renderMeta(issues: NoteIssue[]): void {
    const host = this.metaEl;
    if (!host) return;
    host.empty();

    const stat = host.createDiv({ cls: "note-doctor-stat" });
    if (issues.length === 0) {
      stat.createSpan({ cls: "note-doctor-stat-num", text: "0" });
      stat.createSpan({ cls: "note-doctor-stat-label", text: "Your vault is clean." });
    } else {
      stat.createSpan({ cls: "note-doctor-stat-num", text: String(issues.length) });
      stat.createSpan({
        cls: "note-doctor-stat-label",
        text: issues.length === 1 ? "note needs attention" : "notes need attention",
      });
    }

    this.summaryEl = host.createDiv({ cls: "note-doctor-summary" });
    const last = this.plugin.lastResult;
    if (this.plugin.scanning) {
      this.summaryEl.setText(
        this.plugin.scanTotal > 0 ? `Scanning ${this.plugin.scanDone} / ${this.plugin.scanTotal}…` : "Scanning…"
      );
    } else if (last) {
      this.summaryEl.setText(`Scanned ${relativeTime(last.scannedAt)} · ${last.totalFiles} notes`);
    }

    this.renderTiles(host, issues);
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
    const tile = host.createDiv({ cls: "note-doctor-tile" });
    if (active) tile.addClass("is-active");
    tile.createDiv({ cls: "note-doctor-tile-count", text: String(count) });
    tile.createDiv({ cls: "note-doctor-tile-label", text: label });
    tile.addEventListener("click", onClick);
  }

  /** Refresh only the stat/tiles/summary after an in-place row mutation. */
  private refreshMeta(): void {
    if (this.metaEl) this.renderMeta(this.plugin.visibleIssues());
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
      this.render();
    });

    const scoped = this.filter !== "all";
    const review = bar.createEl("button", {
      text: scoped ? `Review ${ISSUE_TYPE_LABELS[this.filter as IssueType]}` : "Review flagged",
    });
    review.addEventListener("click", () => {
      const subset = this.applyView(this.plugin.visibleIssues());
      // Reviewing everything is free; reviewing a scoped/filtered subset is a Pro
      // "advanced review workflow".
      if (scoped) {
        requirePro(this.plugin, "review", () => this.plugin.openReviewQueue(subset));
      } else {
        this.plugin.openReviewQueue(subset);
      }
    });

    const bulk = bar.createEl("button", { text: this.bulkMode ? "Exit bulk" : "Bulk actions" });
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
    bar.createSpan({ text: `${this.selected.size} selected` });

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
            void this.plugin
              .bulkAddProperty(selectedIssues().map((i) => i.notePath), v.key.trim(), v.value)
              .then(() => this.afterBulk());
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
            void this.plugin
              .bulkAddTag(selectedIssues().map((i) => i.notePath), v.tag.trim())
              .then(() => this.afterBulk());
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

  private renderProCta(root: HTMLElement): void {
    const card = root.createDiv({ cls: "note-doctor-pro-cta" });
    card.createEl("strong", { text: "Note Doctor Pro" });
    card.createDiv({ text: PRO_TAGLINE });
    card.createEl("a", {
      text: "Unlock Pro",
      cls: "mod-cta note-doctor-cta-link",
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
