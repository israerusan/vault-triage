import { Menu, setIcon } from "obsidian";
import type NoteDoctorPlugin from "../main";
import type { NoteIssue } from "../types";
import { ISSUE_TYPE_LABELS } from "../types";

export interface ResultsListOptions {
  bulkMode: boolean;
  selected: Set<string>;
  onSelectionChange: () => void;
  /** Called after an in-place mutation so the header counts can refresh cheaply. */
  onCountsChanged: () => void;
}

interface SeverityTier {
  cls: string;
  label: string;
}

function severityTier(severity: number): SeverityTier {
  if (severity >= 4) return { cls: "is-high", label: "High" };
  if (severity >= 2) return { cls: "is-med", label: "Medium" };
  return { cls: "is-low", label: "Low" };
}

/**
 * Render an already-sorted list of issues. Each row opens its note and exposes
 * mark-reviewed / ignore inline, with reveal + exclude in an overflow menu.
 * Toggling reviewed/ignore/exclude updates only the affected rows — the whole
 * view is never rebuilt for a single interaction.
 */
export function renderResultsList(
  container: HTMLElement,
  plugin: NoteDoctorPlugin,
  issues: NoteIssue[],
  opts: ResultsListOptions
): void {
  if (issues.length === 0) {
    container.createDiv({ cls: "note-doctor-empty", text: "No issues here. Nice and tidy." });
    return;
  }

  const list = container.createDiv({ cls: "note-doctor-results" });
  // Track every row per note path so "exclude note" can remove them all at once.
  const rowsByPath = new Map<string, HTMLElement[]>();

  for (const issue of issues) {
    const row = list.createDiv({ cls: "note-doctor-row" });
    if (plugin.isReviewed(issue)) row.addClass("is-reviewed");
    const bucket = rowsByPath.get(issue.notePath) ?? [];
    bucket.push(row);
    rowsByPath.set(issue.notePath, bucket);

    if (opts.bulkMode) {
      const check = row.createEl("input", { type: "checkbox", cls: "note-doctor-check" });
      check.checked = opts.selected.has(issue.id);
      check.addEventListener("change", () => {
        if (check.checked) opts.selected.add(issue.id);
        else opts.selected.delete(issue.id);
        opts.onSelectionChange();
      });
    }

    const tier = severityTier(issue.severity);
    const dot = row.createSpan({ cls: `note-doctor-sev-dot ${tier.cls}` });
    dot.setAttribute("aria-label", `${tier.label} severity`);

    row.createSpan({
      cls: `note-doctor-badge is-${issue.issueType}`,
      text: ISSUE_TYPE_LABELS[issue.issueType],
    });

    const main = row.createDiv({ cls: "note-doctor-row-main" });
    const title = main.createDiv({ cls: "note-doctor-row-title", text: issue.noteName });
    title.addEventListener("click", () => void plugin.openNote(issue.notePath));
    main.createDiv({ cls: "note-doctor-row-reason", text: issue.reason });

    const actions = row.createDiv({ cls: "note-doctor-row-actions" });
    iconButton(actions, "file-search", "Open note", () => void plugin.openNote(issue.notePath));

    const reviewBtn = iconButton(actions, "check", "", () => {});
    const paintReviewed = (): void => {
      const on = plugin.isReviewed(issue);
      setIcon(reviewBtn, on ? "rotate-ccw" : "check");
      reviewBtn.setAttribute("aria-label", on ? "Mark not reviewed" : "Mark reviewed");
      reviewBtn.toggleClass("is-active", on);
    };
    paintReviewed();
    reviewBtn.addEventListener("click", () => {
      void plugin.setReviewed(issue, !plugin.isReviewed(issue)).then(() => {
        row.toggleClass("is-reviewed", plugin.isReviewed(issue));
        paintReviewed();
        opts.onCountsChanged();
      });
    });

    iconButton(actions, "eye-off", "Ignore this result", () => {
      void plugin.setIgnored(issue, true).then(() => {
        row.remove();
        opts.onCountsChanged();
      });
    });

    iconButton(actions, "more-horizontal", "More actions", (evt) => {
      const menu = new Menu();
      menu.addItem((item) =>
        item
          .setTitle("Reveal in file explorer")
          .setIcon("folder-open")
          .onClick(() => void plugin.revealNote(issue.notePath))
      );
      menu.addItem((item) =>
        item
          .setTitle("Exclude note from future scans")
          .setIcon("ban")
          .onClick(() => {
            void plugin.excludeNote(issue.notePath).then(() => {
              for (const r of rowsByPath.get(issue.notePath) ?? []) r.remove();
              opts.onCountsChanged();
            });
          })
      );
      menu.showAtMouseEvent(evt);
    });
  }
}

function iconButton(
  parent: HTMLElement,
  icon: string,
  tooltip: string,
  onClick: (evt: MouseEvent) => void
): HTMLElement {
  const btn = parent.createDiv({ cls: "note-doctor-icon-btn" });
  setIcon(btn, icon);
  if (tooltip) btn.setAttribute("aria-label", tooltip);
  btn.addEventListener("click", onClick);
  return btn;
}
