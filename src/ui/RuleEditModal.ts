import { App, Modal, Notice, Setting } from "obsidian";
import type { CustomRule, CustomRuleCondition } from "../types";
import { newId } from "../core/utils/ids";
import { parseList } from "../settings";

type ConditionType = CustomRuleCondition["type"];

/** Create or edit a single custom rule (Pro). Intentionally simple: one scope,
 *  one condition, one severity — no nested logic. */
export class RuleEditModal extends Modal {
  private name: string;
  private enabled: boolean;
  private folders: string;
  private tags: string;
  private conditionType: ConditionType;
  private property: string;
  private marker: string;
  private days: number;
  private value: string;
  private severity: number;
  private message: string;
  private paramHost: HTMLElement | null = null;

  constructor(
    app: App,
    private existing: CustomRule | null,
    private onSave: (rule: CustomRule) => Promise<void>
  ) {
    super(app);
    const c = existing?.condition;
    this.name = existing?.name ?? "";
    this.enabled = existing?.enabled ?? true;
    this.folders = (existing?.scope.folders ?? []).join(", ");
    this.tags = (existing?.scope.tags ?? []).join(", ");
    this.conditionType = c?.type ?? "missing-property";
    this.property = c && "property" in c ? c.property : "";
    this.marker = c && c.type === "has-marker" ? c.marker : "";
    this.days = c && c.type === "older-than-days" ? c.days : 30;
    this.value = c && c.type === "property-equals" ? c.value : "";
    this.severity = existing?.severity ?? 3;
    this.message = existing?.message ?? "";
  }

  onOpen(): void {
    const { contentEl } = this;
    this.setTitle(this.existing ? "Edit rule" : "New rule");

    new Setting(contentEl).setName("Name").addText((t) =>
      t.setValue(this.name).onChange((v) => (this.name = v))
    );
    new Setting(contentEl).setName("Enabled").addToggle((t) =>
      t.setValue(this.enabled).onChange((v) => (this.enabled = v))
    );

    new Setting(contentEl)
      .setName("Scope: folders")
      .setDesc("Comma-separated. Leave blank for the whole vault.")
      .addText((t) => t.setValue(this.folders).onChange((v) => (this.folders = v)));
    new Setting(contentEl)
      .setName("Scope: tags")
      .setDesc("Comma-separated, without #. Leave blank for any.")
      .addText((t) => t.setValue(this.tags).onChange((v) => (this.tags = v)));

    new Setting(contentEl).setName("Condition").addDropdown((d) => {
      d.addOption("missing-property", "Is missing property");
      d.addOption("has-marker", "Contains marker");
      d.addOption("older-than-days", "Older than N days");
      d.addOption("property-equals", "Property equals value");
      d.setValue(this.conditionType).onChange((v) => {
        this.conditionType = v as ConditionType;
        this.renderParams();
      });
    });

    this.paramHost = contentEl.createDiv();
    this.renderParams();

    new Setting(contentEl)
      .setName("Severity")
      .addSlider((s) =>
        s
          .setLimits(1, 5, 1)
          .setValue(this.severity)
          .setDynamicTooltip()
          .onChange((v) => (this.severity = v))
      );

    new Setting(contentEl)
      .setName("Message")
      .setDesc("Shown as the issue reason.")
      .addText((t) => t.setValue(this.message).onChange((v) => (this.message = v)));

    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText("Save rule")
        .setCta()
        .onClick(() => void this.submit())
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderParams(): void {
    const host = this.paramHost;
    if (!host) return;
    host.empty();
    if (this.conditionType === "missing-property") {
      new Setting(host).setName("Property").addText((t) =>
        t.setPlaceholder("status").setValue(this.property).onChange((v) => (this.property = v))
      );
    } else if (this.conditionType === "has-marker") {
      new Setting(host).setName("Marker").addText((t) =>
        t.setPlaceholder("draft").setValue(this.marker).onChange((v) => (this.marker = v))
      );
    } else if (this.conditionType === "older-than-days") {
      new Setting(host).setName("Days").addText((t) =>
        t.setValue(String(this.days)).onChange((v) => {
          const n = Number.parseInt(v, 10);
          if (!Number.isNaN(n)) this.days = n;
        })
      );
    } else {
      new Setting(host).setName("Property").addText((t) =>
        t.setPlaceholder("status").setValue(this.property).onChange((v) => (this.property = v))
      );
      new Setting(host).setName("Equals value").addText((t) =>
        t.setPlaceholder("done").setValue(this.value).onChange((v) => (this.value = v))
      );
    }
  }

  private buildCondition(): CustomRuleCondition | null {
    switch (this.conditionType) {
      case "missing-property":
        return this.property.trim() ? { type: "missing-property", property: this.property.trim() } : null;
      case "has-marker":
        return this.marker.trim() ? { type: "has-marker", marker: this.marker.trim() } : null;
      case "older-than-days":
        return { type: "older-than-days", days: this.days };
      case "property-equals":
        return this.property.trim()
          ? { type: "property-equals", property: this.property.trim(), value: this.value }
          : null;
    }
  }

  private async submit(): Promise<void> {
    const condition = this.buildCondition();
    if (!condition) {
      new Notice("Please fill in the condition field.");
      return;
    }
    const rule: CustomRule = {
      id: this.existing?.id ?? newId("rule"),
      name: this.name.trim() || "Untitled rule",
      enabled: this.enabled,
      scope: { folders: parseList(this.folders), tags: parseList(this.tags) },
      condition,
      severity: this.severity,
      message: this.message.trim() || defaultMessage(condition),
    };
    await this.onSave(rule);
    this.close();
  }
}

function defaultMessage(condition: CustomRuleCondition): string {
  switch (condition.type) {
    case "missing-property":
      return `Missing property: ${condition.property}`;
    case "has-marker":
      return `Contains marker: ${condition.marker}`;
    case "older-than-days":
      return `Older than ${condition.days} days`;
    case "property-equals":
      return `${condition.property} is ${condition.value}`;
  }
}
