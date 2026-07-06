import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type NoteDoctorPlugin from "./main";
import type { NoteDoctorSettings, IssueType } from "./types";
import { ISSUE_TYPES, ISSUE_TYPE_LABELS } from "./types";
import { LicenseManager } from "./core/license/LicenseManager";
import { PRO_NAME, PRO_TAGLINE, PURCHASE_URL } from "./product";
import { RuleEditModal } from "./ui/RuleEditModal";
import { ProfileEditModal } from "./ui/ProfileEditModal";

export const DEFAULT_SETTINGS: NoteDoctorSettings = {
  version: 1,
  staleDaysThreshold: 90,
  minNoteLength: 150,
  requiredProperties: [],
  draftMarkers: ["TODO", "FIXME", "draft", "incomplete"],
  excludedFolders: [],
  excludedPaths: [],
  excludedTags: [],
  ignoredIssueKeys: [],
  reviewedIssueKeys: [],
  licenseKey: "",
  licenseStatus: "free",
  severityWeights: {
    stale: 2,
    thin: 1,
    orphan: 2,
    "missing-properties": 3,
    "draft-marker": 2,
    custom: 3,
  },
  savedProfiles: [],
  customRules: [],
  onboardingDismissed: false,
};

/** Split a comma/newline separated field into trimmed, non-empty entries. */
export function parseList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export class NoteDoctorSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: NoteDoctorPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.renderScanSection();
    this.renderExclusionsSection();
    this.renderLicenseSection();
    this.renderSeveritySection();
    this.renderRulesSection();
    this.renderProfilesSection();
  }

  private async save(): Promise<void> {
    await this.plugin.saveSettings();
  }

  // --- Scan thresholds ------------------------------------------------------

  private renderScanSection(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    new Setting(containerEl).setName("Scan").setHeading();

    new Setting(containerEl)
      .setName("Stale after (days)")
      .setDesc("Flag notes not modified within this many days. Set 0 to disable.")
      .addText((t) =>
        t
          .setPlaceholder("90")
          .setValue(String(s.staleDaysThreshold))
          .onChange(async (v) => {
            s.staleDaysThreshold = clampInt(v, 0, s.staleDaysThreshold);
            await this.save();
          })
      );

    new Setting(containerEl)
      .setName("Minimum note length")
      .setDesc("Flag notes with fewer characters of content than this. Set 0 to disable.")
      .addText((t) =>
        t
          .setPlaceholder("150")
          .setValue(String(s.minNoteLength))
          .onChange(async (v) => {
            s.minNoteLength = clampInt(v, 0, s.minNoteLength);
            await this.save();
          })
      );

    new Setting(containerEl)
      .setName("Required properties")
      .setDesc("Comma-separated frontmatter fields every note should have (e.g. status, tags).")
      .addText((t) =>
        t
          .setPlaceholder("status, tags")
          .setValue(s.requiredProperties.join(", "))
          .onChange(async (v) => {
            s.requiredProperties = parseList(v);
            await this.save();
          })
      );

    new Setting(containerEl)
      .setName("Draft markers")
      .setDesc("Comma-separated words that mark an unfinished note.")
      .addText((t) =>
        t
          .setPlaceholder("TODO, FIXME, draft, incomplete")
          .setValue(s.draftMarkers.join(", "))
          .onChange(async (v) => {
            s.draftMarkers = parseList(v);
            await this.save();
          })
      );
  }

  // --- Exclusions -----------------------------------------------------------

  private renderExclusionsSection(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    new Setting(containerEl).setName("Exclusions").setHeading();

    new Setting(containerEl)
      .setName("Excluded folders")
      .setDesc("Folders to skip entirely. One per line or comma-separated.")
      .addTextArea((t) =>
        t
          .setPlaceholder("Templates\nArchive")
          .setValue(s.excludedFolders.join("\n"))
          .onChange(async (v) => {
            s.excludedFolders = parseList(v);
            await this.save();
          })
      );

    new Setting(containerEl)
      .setName("Excluded paths")
      .setDesc("Individual note paths to skip. One per line or comma-separated.")
      .addTextArea((t) =>
        t
          .setValue(s.excludedPaths.join("\n"))
          .onChange(async (v) => {
            s.excludedPaths = parseList(v);
            await this.save();
          })
      );

    new Setting(containerEl)
      .setName("Excluded tags")
      .setDesc("Skip notes carrying any of these tags. One per line or comma-separated.")
      .addTextArea((t) =>
        t
          .setPlaceholder("#archive")
          .setValue(s.excludedTags.join("\n"))
          .onChange(async (v) => {
            s.excludedTags = parseList(v);
            await this.save();
          })
      );
  }

  // --- License --------------------------------------------------------------

  private renderLicenseSection(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    new Setting(containerEl).setName("Pro license").setHeading();

    if (this.plugin.isPro) {
      new Setting(containerEl)
        .setName(`${PRO_NAME} unlocked`)
        .setDesc(this.plugin.licenseEmail ? `Licensed to ${this.plugin.licenseEmail}.` : "Thank you!")
        .addButton((b) =>
          b.setButtonText("Clear license").onClick(async () => {
            s.licenseKey = "";
            this.plugin.refreshLicense();
            await this.save();
            this.display();
          })
        );
      return;
    }

    let draft = s.licenseKey;
    new Setting(containerEl)
      .setName("License key")
      .setDesc(this.plugin.licenseError ?? "Paste your Pro license key to unlock all Pro features.")
      .addText((t) =>
        t
          .setPlaceholder("payload.signature")
          .setValue(s.licenseKey)
          .onChange((v) => {
            draft = v.trim();
          })
      );

    const actions = new Setting(containerEl).addButton((b) =>
      b
        .setButtonText("Validate")
        .setCta()
        .onClick(async () => {
          const result = LicenseManager.verify(draft);
          if (!result.valid) {
            new Notice(result.error);
            return;
          }
          s.licenseKey = draft;
          this.plugin.refreshLicense();
          await this.save();
          new Notice(`${PRO_NAME} unlocked.`);
          this.display();
        })
    );
    // Anchor (not window.open) so Obsidian routes it to the OS on desktop and mobile.
    actions.controlEl.createEl("a", {
      text: "Get Pro",
      cls: "note-doctor-external-btn",
      href: PURCHASE_URL,
    });
  }

  // --- Pro: severity tuning -------------------------------------------------

  private renderSeveritySection(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    this.proHeading("Severity tuning");
    if (!this.plugin.isPro) return;

    for (const type of ISSUE_TYPES) {
      new Setting(containerEl)
        .setName(ISSUE_TYPE_LABELS[type])
        .setDesc(`Weight for ${ISSUE_TYPE_LABELS[type].toLowerCase()} when sorting by severity.`)
        .addSlider((sl) =>
          sl
            .setLimits(1, 5, 1)
            .setValue(s.severityWeights[type])
            .setDynamicTooltip()
            .onChange(async (v) => {
              s.severityWeights[type] = v;
              await this.save();
            })
        );
    }
  }

  // --- Pro: custom rules ----------------------------------------------------

  private renderRulesSection(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    this.proHeading("Custom rules");
    if (!this.plugin.isPro) return;

    for (const rule of s.customRules) {
      new Setting(containerEl)
        .setName(rule.name || "Untitled rule")
        .setDesc(describeRule(rule))
        .addToggle((tg) =>
          tg.setValue(rule.enabled).onChange(async (v) => {
            rule.enabled = v;
            await this.save();
          })
        )
        .addExtraButton((b) =>
          b
            .setIcon("pencil")
            .setTooltip("Edit")
            .onClick(() => {
              new RuleEditModal(this.app, rule, async (updated) => {
                await this.plugin.saveRule(updated);
                this.display();
              }).open();
            })
        )
        .addExtraButton((b) =>
          b
            .setIcon("trash")
            .setTooltip("Delete")
            .onClick(async () => {
              await this.plugin.deleteRule(rule.id);
              this.display();
            })
        );
    }

    new Setting(containerEl).addButton((b) =>
      b.setButtonText("Add rule").onClick(() => {
        new RuleEditModal(this.app, null, async (created) => {
          await this.plugin.saveRule(created);
          this.display();
        }).open();
      })
    );
  }

  // --- Pro: profiles --------------------------------------------------------

  private renderProfilesSection(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    this.proHeading("Saved scan profiles");
    if (!this.plugin.isPro) return;

    for (const profile of s.savedProfiles) {
      new Setting(containerEl)
        .setName(profile.name || "Untitled profile")
        .setDesc(describeProfile(profile))
        .addButton((b) =>
          b.setButtonText("Run").onClick(async () => {
            await this.plugin.runScan(profile.id);
            await this.plugin.activateView();
          })
        )
        .addExtraButton((b) =>
          b
            .setIcon("pencil")
            .setTooltip("Edit")
            .onClick(() => {
              new ProfileEditModal(this.app, this.plugin, profile, async (updated) => {
                await this.plugin.saveProfile(updated);
                this.display();
              }).open();
            })
        )
        .addExtraButton((b) =>
          b
            .setIcon("trash")
            .setTooltip("Delete")
            .onClick(async () => {
              await this.plugin.deleteProfile(profile.id);
              this.display();
            })
        );
    }

    new Setting(containerEl).addButton((b) =>
      b.setButtonText("Add profile").onClick(() => {
        new ProfileEditModal(this.app, this.plugin, null, async (created) => {
          await this.plugin.saveProfile(created);
          this.display();
        }).open();
      })
    );
  }

  /** A section heading that shows a Pro pill and, for free users, an upsell row. */
  private proHeading(title: string): void {
    const { containerEl } = this;
    const heading = new Setting(containerEl).setName(title).setHeading();
    heading.nameEl.createSpan({ text: "Pro", cls: "note-doctor-pro-pill" });
    if (!this.plugin.isPro) {
      const upsell = new Setting(containerEl).setDesc(PRO_TAGLINE);
      upsell.settingEl.addClass("note-doctor-locked");
      upsell.controlEl.createEl("a", {
        text: "Unlock Pro",
        cls: "note-doctor-external-btn",
        href: PURCHASE_URL,
      });
    }
  }
}

function clampInt(value: string, min: number, fallback: number): number {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, n);
}

function describeRule(rule: { condition: { type: string }; scope: { folders?: string[]; tags?: string[] } }): string {
  const scope: string[] = [];
  if (rule.scope.folders?.length) scope.push(`folders: ${rule.scope.folders.join(", ")}`);
  if (rule.scope.tags?.length) scope.push(`tags: ${rule.scope.tags.join(", ")}`);
  const where = scope.length ? scope.join("; ") : "all notes";
  return `${rule.condition.type} — ${where}`;
}

function describeProfile(profile: {
  enabledIssueTypes: IssueType[];
  includedFolders: string[];
}): string {
  const types = profile.enabledIssueTypes.length
    ? profile.enabledIssueTypes.map((t) => ISSUE_TYPE_LABELS[t]).join(", ")
    : "all issue types";
  const folders = profile.includedFolders.length
    ? ` in ${profile.includedFolders.join(", ")}`
    : "";
  return `${types}${folders}`;
}
