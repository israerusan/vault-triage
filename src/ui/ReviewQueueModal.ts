import { App, Modal, Notice, setIcon } from "obsidian";
import type NoteDoctorPlugin from "../main";
import type { NoteIssue } from "../types";
import { ISSUE_TYPE_LABELS } from "../types";
import { PromptModal } from "./PromptModal";
import { requirePro } from "./pro/ProGate";

/**
 * Work through flagged notes one at a time. Arrow keys move between issues;
 * r = mark reviewed, i = ignore, e = exclude, o = open the note.
 */
export class ReviewQueueModal extends Modal {
  private index = 0;

  constructor(
    app: App,
    private plugin: NoteDoctorPlugin,
    private queue: NoteIssue[]
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Review flagged notes");
    this.modalEl.addClass("note-doctor-review-modal");
    this.registerKeys();
    this.renderCurrent();
  }

  onClose(): void {
    this.contentEl.empty();
    // Flush debounced review marks and reflect them on the dashboard.
    this.plugin.flushPendingSave();
    this.plugin.refreshViews();
  }

  private registerKeys(): void {
    this.scope.register([], "ArrowRight", () => this.move(1));
    this.scope.register([], "ArrowLeft", () => this.move(-1));
    this.scope.register([], "r", () => void this.toggleReviewed());
    this.scope.register([], "i", () => void this.ignoreCurrent());
    this.scope.register([], "e", () => void this.excludeCurrent());
    this.scope.register([], "o", () => void this.openCurrent());
    this.scope.register([], "p", () => this.quickAddProperty());
  }

  private current(): NoteIssue | null {
    return this.queue[this.index] ?? null;
  }

  private move(delta: number): void {
    const next = this.index + delta;
    if (next < 0 || next >= this.queue.length) return;
    this.index = next;
    this.renderCurrent();
  }

  private renderCurrent(): void {
    const { contentEl } = this;
    contentEl.empty();
    const issue = this.current();
    if (!issue) {
      this.close();
      return;
    }

    contentEl.createDiv({
      cls: "note-doctor-review-count",
      text: `${this.index + 1} of ${this.queue.length}`,
    });

    const header = contentEl.createDiv({ cls: "note-doctor-review-header" });
    header.createSpan({
      cls: `note-doctor-badge is-${issue.issueType}`,
      text: ISSUE_TYPE_LABELS[issue.issueType],
    });
    if (this.plugin.isReviewed(issue)) {
      header.createSpan({ cls: "note-doctor-reviewed-tag", text: "Reviewed" });
    }

    contentEl.createEl("h3", { text: issue.noteName, cls: "note-doctor-review-title" });
    contentEl.createDiv({ cls: "note-doctor-review-reason", text: issue.reason });
    contentEl.createDiv({ cls: "note-doctor-review-path", text: issue.notePath });

    const actions = contentEl.createDiv({ cls: "note-doctor-review-actions" });
    this.actionButton(actions, "file-search", "Open note (o)", () => void this.openCurrent());
    this.actionButton(
      actions,
      "check",
      this.plugin.isReviewed(issue) ? "Mark not reviewed (r)" : "Mark reviewed (r)",
      () => void this.toggleReviewed()
    );
    this.actionButton(actions, "eye-off", "Ignore (i)", () => void this.ignoreCurrent());
    this.actionButton(actions, "ban", "Exclude note (e)", () => void this.excludeCurrent());
    // Pro: fix the note without leaving the queue.
    const proSuffix = this.plugin.isPro ? "" : " — Pro";
    // "Add missing" is honest: it fills absent/empty properties, never overwrites.
    this.actionButton(actions, "wand-2", `Add missing property (p)${proSuffix}`, () =>
      this.quickAddProperty()
    );

    contentEl.createDiv({
      cls: "note-doctor-review-legend",
      text: "← → navigate · r review · i ignore · e exclude · o open · p add property",
    });

    const nav = contentEl.createDiv({ cls: "note-doctor-review-nav" });
    const prev = nav.createEl("button", { text: "Previous" });
    prev.disabled = this.index === 0;
    prev.addEventListener("click", () => this.move(-1));
    const next = nav.createEl("button", { text: "Next", cls: "mod-cta" });
    next.disabled = this.index >= this.queue.length - 1;
    next.addEventListener("click", () => this.move(1));
  }

  private actionButton(
    parent: HTMLElement,
    icon: string,
    tooltip: string,
    onClick: () => void
  ): void {
    // Labelled (icon + text) — a modal has room, and it makes shortcuts and the
    // "— Pro" suffix visible without hovering.
    const btn = parent.createEl("button", { cls: "note-doctor-review-action" });
    const iconEl = btn.createSpan();
    setIcon(iconEl, icon);
    btn.createSpan({ text: tooltip });
    btn.setAttribute("aria-label", tooltip);
    btn.addEventListener("click", onClick);
  }

  private async openCurrent(): Promise<void> {
    const issue = this.current();
    if (issue) await this.plugin.openNote(issue.notePath);
  }

  /** Pro: set a frontmatter property on the current note, then advance. */
  private quickAddProperty(): void {
    const issue = this.current();
    if (!issue) return;
    requirePro(this.plugin, "review", () => {
      new PromptModal(
        this.app,
        `Add a property to "${issue.noteName}"`,
        [
          { key: "key", label: "Property", placeholder: "status" },
          { key: "value", label: "Value", placeholder: "reviewed" },
        ],
        (v) => {
          if (!v.key.trim()) return;
          void this.plugin
            .bulkAddProperty([issue.notePath], v.key.trim(), v.value)
            .then((changed) => {
              if (changed.length > 0) {
                // Drop it from the queue and reconcile the dashboard (rescan runs
                // behind the modal and refreshes it on close).
                this.dropCurrent();
                void this.plugin.settleCacheThenRescan(changed);
              }
            });
        }
      ).open();
    });
  }

  private async toggleReviewed(): Promise<void> {
    const issue = this.current();
    if (!issue) return;
    await this.plugin.setReviewed(issue, !this.plugin.isReviewed(issue));
    this.renderCurrent();
  }

  private async ignoreCurrent(): Promise<void> {
    const issue = this.current();
    if (!issue) return;
    await this.plugin.setIgnored(issue, true);
    this.dropCurrent();
  }

  private async excludeCurrent(): Promise<void> {
    const issue = this.current();
    if (!issue) return;
    const path = issue.notePath;
    await this.plugin.excludeNote(path);
    this.queue = this.queue.filter((i) => i.notePath !== path);
    if (this.index >= this.queue.length) this.index = Math.max(0, this.queue.length - 1);
    if (this.queue.length === 0) {
      new Notice("Note Doctor: review complete.");
      this.close();
      return;
    }
    this.renderCurrent();
  }

  private dropCurrent(): void {
    this.queue.splice(this.index, 1);
    if (this.index >= this.queue.length) this.index = Math.max(0, this.queue.length - 1);
    if (this.queue.length === 0) {
      new Notice("Note Doctor: review complete.");
      this.close();
      return;
    }
    this.renderCurrent();
  }
}
