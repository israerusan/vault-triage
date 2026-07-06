import { App, Modal, Notice, Setting } from "obsidian";
import type NoteDoctorPlugin from "../main";
import type { ScanProfile, IssueType, SortMode } from "../types";
import { ISSUE_TYPES, ISSUE_TYPE_LABELS } from "../types";
import { newId } from "../core/utils/ids";
import { parseList } from "../settings";

/** Create or edit a saved scan profile (Pro): a reusable set of enabled issue
 *  types, folder scope, and threshold overrides. */
export class ProfileEditModal extends Modal {
  private name: string;
  private enabledTypes: Set<IssueType>;
  private includedFolders: string;
  private excludedFolders: string;
  private sortMode: SortMode;

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
  }

  onOpen(): void {
    const { contentEl } = this;
    this.setTitle(this.existing ? "Edit profile" : "New profile");

    new Setting(contentEl).setName("Name").addText((t) =>
      t.setPlaceholder("Weekly Review").setValue(this.name).onChange((v) => (this.name = v))
    );

    contentEl.createEl("p", { text: "Issue types to include", cls: "note-doctor-modal-label" });
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
      .addText((t) =>
        t.setValue(this.includedFolders).onChange((v) => (this.includedFolders = v))
      );
    new Setting(contentEl)
      .setName("Excluded folders")
      .setDesc("Comma-separated. Overrides the global exclusions when set.")
      .addText((t) =>
        t.setValue(this.excludedFolders).onChange((v) => (this.excludedFolders = v))
      );

    new Setting(contentEl).setName("Sort").addDropdown((d) => {
      d.addOption("severity", "Severity");
      d.addOption("title", "Title");
      d.addOption("path", "Path");
      d.setValue(this.sortMode).onChange((v) => (this.sortMode = v as SortMode));
    });

    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText("Save profile")
        .setCta()
        .onClick(() => void this.submit())
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
    const profile: ScanProfile = {
      id: this.existing?.id ?? newId("profile"),
      name: this.name.trim() || "Untitled profile",
      enabledIssueTypes,
      includedFolders: parseList(this.includedFolders),
      excludedFolders: parseList(this.excludedFolders),
      sortMode: this.sortMode,
    };
    await this.onSave(profile);
    this.close();
  }
}
