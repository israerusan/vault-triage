import { Menu, Notice, setIcon } from "obsidian";
import type NoteDoctorPlugin from "../main";
import type { IssueType, NoteIssue } from "../types";

/** Short badge labels so the type chip doesn't starve the title in the sidebar. */
const BADGE_LABELS: Record<IssueType, string> = {
  stale: "Stale",
  thin: "Thin",
  orphan: "Orphan",
  "missing-properties": "Missing",
  "draft-marker": "Draft",
  custom: "Custom",
};

export interface ResultsListOptions {
  bulkMode: boolean;
  selected: Set<string>;
  /** Hide the per-row type badge (redundant when a single type is filtered). */
  showBadge: boolean;
  onSelectionChange: () => void;
  /** Called after an in-place mutation so the header counts can refresh cheaply. */
  onCountsChanged: () => void;
}

interface SeverityTier {
  cls: string;
  label: string;
}

/** High (>=3) is reachable on a default scan (draft-marker weight is 3). */
function severityTier(severity: number): SeverityTier {
  if (severity >= 3) return { cls: "is-high", label: "High" };
  if (severity >= 2) return { cls: "is-med", label: "Medium" };
  return { cls: "is-low", label: "Low" };
}

/** How many rows to build up front; the rest load on demand to bound first paint. */
const INITIAL_ROWS = 200;

/**
 * Render an already-sorted list of issues. Each row opens its note and exposes
 * mark-reviewed / ignore inline, with reveal + exclude in an overflow menu.
 * Rows load incrementally (large lists paginate on demand via "show more") and
 * toggling reviewed/ignore/exclude updates only the affected rows — the whole
 * view is never rebuilt.
 */
export function renderResultsList(
  container: HTMLElement,
  plugin: NoteDoctorPlugin,
  issues: NoteIssue[],
  opts: ResultsListOptions
): void {
  if (issues.length === 0) {
    container.createDiv({ cls: "vault-triage-empty", text: "No issues here. Nice and tidy." });
    return;
  }

  const list = container.createDiv({ cls: "vault-triage-results" });
  const footer = container.createDiv({ cls: "vault-triage-results-footer" });
  // Track every row per note path so "exclude note" can remove them all at once.
  const rowsByPath = new Map<string, HTMLElement[]>();
  let shown = 0;

  const renderMore = (): void => {
    const slice = issues.slice(shown, shown + INITIAL_ROWS);
    for (const issue of slice) renderRow(list, plugin, issue, opts, rowsByPath);
    shown += slice.length;

    footer.empty();
    const remaining = issues.length - shown;
    if (remaining > 0) {
      const more = footer.createEl("button", {
        text: `Show ${Math.min(remaining, INITIAL_ROWS)} more (${remaining} left)`,
      });
      more.addEventListener("click", renderMore);
    }
  };

  renderMore();
}

function renderRow(
  list: HTMLElement,
  plugin: NoteDoctorPlugin,
  issue: NoteIssue,
  opts: ResultsListOptions,
  rowsByPath: Map<string, HTMLElement[]>
): void {
  const row = list.createDiv({ cls: "vault-triage-row" });
  if (plugin.isReviewed(issue)) row.addClass("is-reviewed");
  const bucket = rowsByPath.get(issue.notePath) ?? [];
  bucket.push(row);
  rowsByPath.set(issue.notePath, bucket);

  if (opts.bulkMode) {
    const check = row.createEl("input", { type: "checkbox", cls: "vault-triage-check" });
    check.checked = opts.selected.has(issue.id);
    check.setAttribute("aria-label", `Select ${issue.noteName}`);
    check.addEventListener("change", () => {
      if (check.checked) opts.selected.add(issue.id);
      else opts.selected.delete(issue.id);
      opts.onSelectionChange();
    });
  }

  // Severity as a letter tier (H/M/L), not color alone — colorblind-safe.
  const tier = severityTier(issue.severity);
  const tierEl = row.createSpan({ cls: `vault-triage-sev ${tier.cls}`, text: tier.label[0] });
  tierEl.setAttribute("aria-label", `${tier.label} severity`);

  if (opts.showBadge) {
    row.createSpan({
      cls: `vault-triage-badge is-${issue.issueType}`,
      text: BADGE_LABELS[issue.issueType],
    });
  }

  const main = row.createDiv({ cls: "vault-triage-row-main" });
  const title = main.createEl("button", { cls: "vault-triage-row-title", text: issue.noteName });
  // Full path as the accessible name (Obsidian shows it on hover) so long or
  // duplicate basenames are readable and disambiguated.
  title.setAttribute("aria-label", issue.notePath);
  title.addEventListener("click", () => void plugin.openNote(issue.notePath));
  const slash = issue.notePath.lastIndexOf("/");
  if (slash > 0) {
    main.createDiv({ cls: "vault-triage-row-folder", text: issue.notePath.slice(0, slash) });
  }
  const reasonEl = main.createDiv({ cls: "vault-triage-row-reason", text: issue.reason });
  reasonEl.setAttribute("aria-label", issue.reason);

  // The title already opens the note; the action strip focuses on triage.
  const actions = row.createDiv({ cls: "vault-triage-row-actions" });
  // Rows shown here are outstanding; marking reviewed files it away (recover via
  // the review queue's "mark not reviewed"). One-way keeps the list honest.
  iconButton(actions, "check", "Mark reviewed", () => {
    void plugin.setReviewed(issue, true).then(() => {
      row.remove();
      opts.onCountsChanged();
    });
  });

  const ignoreBtn = iconButton(actions, "eye-off", "Ignore this result", () => {
    void plugin.setIgnored(issue, true).then(() => {
      row.remove();
      opts.onCountsChanged();
      // Offer a one-click undo so an accidental ignore isn't a silent one-way trip.
      const frag = createFragment((f) => {
        f.appendText(`Ignored "${issue.noteName}". `);
        const undo = f.createEl("a", { text: "Undo", cls: "vault-triage-inline-link" });
        undo.addEventListener("click", () => {
          void plugin.setIgnored(issue, false).then(() => plugin.refreshViews());
        });
      });
      new Notice(frag, 6000);
    });
  });
  ignoreBtn.addClass("is-danger");

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

function iconButton(
  parent: HTMLElement,
  icon: string,
  tooltip: string,
  onClick?: (evt: MouseEvent) => void
): HTMLButtonElement {
  const btn = parent.createEl("button", { cls: "vault-triage-icon-btn clickable-icon" });
  setIcon(btn, icon);
  if (tooltip) btn.setAttribute("aria-label", tooltip);
  if (onClick) btn.addEventListener("click", onClick);
  return btn;
}
