import { App, Modal, Notice, Setting } from "obsidian";
import type NoteDoctorPlugin from "../main";
import type { ScanProfile, IssueType, SortMode } from "../types";
import { ISSUE_TYPES, ISSUE_TYPE_LABELS } from "../types";
import { newId } from "../core/utils/ids";
import { parseList } from "../settings";

/** Create or edit a saved scan profile (Pro): a reusable set of enabled issue
 *  types, folder scope, threshold overrides, and which custom rules run. */
export class ProfileEditModal extends Modal {
  private name: string;
  private enabledTypes: Set<IssueType>;
  private includedFolders: string;
  private excludedFolders: string;
  private sortMode: SortMode;
  private staleDays: string;
  private minLength: string;
  private requiredProps: string;
  private draftMarkers: string;
  /** Custom-rule ids this profile runs; undefined means "all rules". */
  private ruleIds: Set<string> | null;

  constructor(
    app: App,
    private plugin: NoteDoctorPlugin,
    private existing: ScanProfile | null,
    private onSave: (profile: ScanProfile) => Promise<void>
  ) {
    super(app);
    this.name = existing?.name ?? "";
    this.enabledTypes = new Set(existing?.enabledIssueTypes ?? ISSUE_TYPES);
    this.includedFolders = (existing?.includedFolders ?? []).join(", ");
    this.excludedFolders = (existing?.excludedFolders ?? []).join(", ");
    this.sortMode = existing?.sortMode ?? "severity";
    this.staleDays = existing?.staleDaysThreshold != null ? String(existing.staleDaysThreshold) : "";
    this.minLength = existing?.minNoteLength != null ? String(existing.minNoteLength) : "";
    this.requiredProps = (existing?.requiredProperties ?? []).join(", ");
    this.draftMarkers = (existing?.draftMarkers ?? []).join(", ");
    this.ruleIds = existing?.customRuleIds ? new Set(existing.customRuleIds) : null;
  }

  onOpen(): void {
    const { contentEl } = this;
    this.titleEl.setText(this.existing ? "Edit profile" : "New profile");

    new Setting(contentEl).setName("Name").addText((t) =>
      t.setPlaceholder("Weekly Review").setValue(this.name).onChange((v) => (this.name = v))
    );

    new Setting(contentEl).setName("Issue types to include").setHeading();
    for (const type of ISSUE_TYPES) {
      new Setting(contentEl).setName(ISSUE_TYPE_LABELS[type]).addToggle((t) =>
        t.setValue(this.enabledTypes.has(type)).onChange((v) => {
          if (v) this.enabledTypes.add(type);
          else this.enabledTypes.delete(type);
        })
      );
    }

    new Setting(contentEl)
      .setName("Included folders")
      .setDesc("Comma-separated. Leave blank to scan the whole vault.")
      .addText((t) => t.setValue(this.includedFolders).onChange((v) => (this.includedFolders = v)));
    new Setting(contentEl)
      .setName("Excluded folders")
      .setDesc("Comma-separated. Overrides the global exclusions when set.")
      .addText((t) => t.setValue(this.excludedFolders).onChange((v) => (this.excludedFolders = v)));

    new Setting(contentEl).setName("Threshold overrides (blank = use global)").setHeading();
    new Setting(contentEl).setName("Stale after (days)").addText((t) =>
      t.setPlaceholder("global").setValue(this.staleDays).onChange((v) => (this.staleDays = v))
    );
    new Setting(contentEl).setName("Minimum note length").addText((t) =>
      t.setPlaceholder("global").setValue(this.minLength).onChange((v) => (this.minLength = v))
    );
    new Setting(contentEl)
      .setName("Required properties")
      .setDesc("Comma-separated. Blank = use global.")
      .addText((t) => t.setValue(this.requiredProps).onChange((v) => (this.requiredProps = v)));
    new Setting(contentEl)
      .setName("Draft markers")
      .setDesc("Comma-separated. Blank = use global.")
      .addText((t) => t.setValue(this.draftMarkers).onChange((v) => (this.draftMarkers = v)));

    const rules = this.plugin.settings.customRules;
    if (rules.length > 0) {
      new Setting(contentEl).setName("Custom rules to run (all if none selected)").setHeading();
      for (const rule of rules) {
        new Setting(contentEl).setName(rule.name || "Untitled rule").addToggle((t) =>
          t.setValue(this.ruleIds ? this.ruleIds.has(rule.id) : true).onChange((v) => {
            if (!this.ruleIds) this.ruleIds = new Set(rules.map((r) => r.id));
            if (v) this.ruleIds.add(rule.id);
            else this.ruleIds.delete(rule.id);
          })
        );
      }
    }

    new Setting(contentEl).setName("Sort").addDropdown((d) => {
      d.addOption("severity", "Severity");
      d.addOption("title", "Title");
      d.addOption("path", "Path");
      d.setValue(this.sortMode).onChange((v) => (this.sortMode = v as SortMode));
    });

    new Setting(contentEl).addButton((b) =>
      b.setButtonText("Save profile").setCta().onClick(() => void this.submit())
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async submit(): Promise<void> {
    const enabledIssueTypes = ISSUE_TYPES.filter((t) => this.enabledTypes.has(t));
    if (enabledIssueTypes.length === 0) {
      new Notice("Select at least one issue type for this profile.");
      return;
    }
    const staleDaysThreshold = toInt(this.staleDays);
    const minNoteLength = toInt(this.minLength);
    const requiredProperties = parseList(this.requiredProps);
    const draftMarkers = parseList(this.draftMarkers);

    const profile: ScanProfile = {
      ...this.existing,
      id: this.existing?.id ?? newId("profile"),
      name: this.name.trim() || "Untitled profile",
      enabledIssueTypes,
      includedFolders: parseList(this.includedFolders),
      excludedFolders: parseList(this.excludedFolders),
      sortMode: this.sortMode,
      staleDaysThreshold,
      minNoteLength,
      requiredProperties: requiredProperties.length > 0 ? requiredProperties : undefined,
      draftMarkers: draftMarkers.length > 0 ? draftMarkers : undefined,
      // Empty selection means "all rules", not "no rules".
      customRuleIds: this.ruleIds && this.ruleIds.size > 0 ? [...this.ruleIds] : undefined,
    };
    await this.onSave(profile);
    this.close();
  }
}

/** Parse an optional integer override; blank/invalid yields undefined (use global). */
function toInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number.parseInt(trimmed, 10);
  return Number.isNaN(n) ? undefined : n;
}
