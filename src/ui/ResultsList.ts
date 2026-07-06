import { setIcon } from "obsidian";
import type NoteDoctorPlugin from "../main";
import type { NoteIssue } from "../types";
import { ISSUE_TYPE_LABELS } from "../types";

export interface ResultsListOptions {
  bulkMode: boolean;
  selected: Set<string>;
  onSelectionChange: () => void;
  onChanged: () => void;
}

/**
 * Render a flat, already-sorted list of issues into `container`. Each row opens
 * its note and exposes reveal / ignore / exclude / mark-reviewed actions. In
 * bulk mode (Pro) a checkbox per row feeds the selection set.
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
  for (const issue of issues) {
    const row = list.createDiv({ cls: "note-doctor-row" });
    if (plugin.isReviewed(issue)) row.addClass("is-reviewed");

    if (opts.bulkMode) {
      const check = row.createEl("input", { type: "checkbox", cls: "note-doctor-check" });
      check.checked = opts.selected.has(issue.id);
      check.addEventListener("change", () => {
        if (check.checked) opts.selected.add(issue.id);
        else opts.selected.delete(issue.id);
        opts.onSelectionChange();
      });
    }

    const badge = row.createSpan({
      cls: `note-doctor-badge is-${issue.issueType}`,
      text: ISSUE_TYPE_LABELS[issue.issueType],
    });
    badge.setAttribute("aria-label", `Severity ${issue.severity}`);

    const main = row.createDiv({ cls: "note-doctor-row-main" });
    const title = main.createDiv({ cls: "note-doctor-row-title", text: issue.noteName });
    title.addEventListener("click", () => void plugin.openNote(issue.notePath));
    main.createDiv({ cls: "note-doctor-row-reason", text: issue.reason });

    const actions = row.createDiv({ cls: "note-doctor-row-actions" });
    iconButton(actions, "file-search", "Open note", () => void plugin.openNote(issue.notePath));
    iconButton(actions, "folder-open", "Reveal in file explorer", () =>
      void plugin.revealNote(issue.notePath)
    );
    iconButton(
      actions,
      plugin.isReviewed(issue) ? "rotate-ccw" : "check",
      plugin.isReviewed(issue) ? "Mark not reviewed" : "Mark reviewed",
      () => {
        void plugin.setReviewed(issue, !plugin.isReviewed(issue)).then(opts.onChanged);
      }
    );
    iconButton(actions, "eye-off", "Ignore this result", () => {
      void plugin.setIgnored(issue, true).then(opts.onChanged);
    });
    iconButton(actions, "ban", "Exclude note from future scans", () => {
      void plugin.excludeNote(issue.notePath).then(opts.onChanged);
    });
  }
}

function iconButton(
  parent: HTMLElement,
  icon: string,
  tooltip: string,
  onClick: () => void
): void {
  const btn = parent.createDiv({ cls: "note-doctor-icon-btn" });
  setIcon(btn, icon);
  btn.setAttribute("aria-label", tooltip);
  btn.addEventListener("click", onClick);
}
