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

export class NoteDoctorView extends ItemView {
  private filter: Filter = "all";
  private sortMode: SortMode = "severity";
  private bulkMode = false;
  private selected = new Set<string>();

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

  render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("note-doctor-view");

    this.renderHeader(root);
    this.renderSummary(root);

    const issues = this.plugin.visibleIssues();
    if (issues.length > 0 || this.plugin.lastResult) {
      this.renderFilters(root, issues);
      this.renderToolbar(root);
      if (this.bulkMode) this.renderBulkBar(root);
    }

    const filtered = this.applyView(issues);
    renderResultsList(root.createDiv(), this.plugin, filtered, {
      bulkMode: this.bulkMode,
      selected: this.selected,
      onSelectionChange: () => this.render(),
      onChanged: () => this.render(),
    });

    if (!this.plugin.isPro) this.renderProCta(root);
  }

  private renderHeader(root: HTMLElement): void {
    const header = root.createDiv({ cls: "note-doctor-header" });
    header.createEl("h2", { text: "Note Doctor" });
    const btn = header.createEl("button", { text: "Run scan", cls: "mod-cta" });
    btn.addEventListener("click", () => void this.plugin.runScan());

    const profiles = this.plugin.settings.savedProfiles;
    if (this.plugin.isPro && profiles.length > 0) {
      const select = header.createEl("select", { cls: "dropdown note-doctor-profile-select" });
      select.createEl("option", { text: "Run a profile…", value: "" });
      for (const p of profiles) select.createEl("option", { text: p.name, value: p.id });
      select.addEventListener("change", () => {
        if (select.value) void this.plugin.runScan(select.value);
        select.value = "";
      });
    }
  }

  private renderSummary(root: HTMLElement): void {
    const last = this.plugin.lastResult;
    const summary = root.createDiv({ cls: "note-doctor-summary" });
    if (!last) {
      summary.setText("Run a scan to find notes that need attention.");
      return;
    }
    const visible = this.plugin.visibleIssues().length;
    summary.setText(
      `Scanned ${relativeTime(last.scannedAt)} · ${last.totalFiles} notes · ${visible} open issues`
    );
  }

  private renderFilters(root: HTMLElement, issues: NoteIssue[]): void {
    const counts = countByType(issues);
    const bar = root.createDiv({ cls: "note-doctor-filters" });

    this.filterChip(bar, "All", issues.length, this.filter === "all", () => {
      this.filter = "all";
      this.render();
    });

    for (const type of ISSUE_TYPES) {
      if (counts[type] === 0) continue;
      this.filterChip(bar, ISSUE_TYPE_LABELS[type], counts[type], this.filter === type, () => {
        this.filter = type;
        this.render();
      });
    }
  }

  private filterChip(
    bar: HTMLElement,
    label: string,
    count: number,
    active: boolean,
    onClick: () => void
  ): void {
    const chip = bar.createDiv({ cls: "note-doctor-chip", text: `${label} ${count}` });
    if (active) chip.addClass("is-active");
    chip.addEventListener("click", onClick);
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

    const review = bar.createEl("button", { text: "Review flagged" });
    review.addEventListener("click", () => this.plugin.openReviewQueue(this.applyView(this.plugin.visibleIssues())));

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

    this.bulkButton(bar, "Ignore", () => void this.plugin.bulkIgnore(selectedIssues()).then(() => this.afterBulk()));
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
    this.bulkButton(bar, "Export selected", () =>
      void this.plugin.exportReport(selectedIssues())
    );
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
    const btn = card.createEl("button", { text: "Unlock Pro", cls: "mod-cta" });
    btn.addEventListener("click", () => window.open(PURCHASE_URL, "_blank"));
  }

  /** Apply the active filter and sort mode to the visible issues. */
  private applyView(issues: NoteIssue[]): NoteIssue[] {
    const filtered = this.filter === "all" ? issues : issues.filter((i) => i.issueType === this.filter);
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
