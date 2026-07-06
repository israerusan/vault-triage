import { App, Modal, Setting } from "obsidian";

export interface PromptField {
  key: string;
  label: string;
  placeholder?: string;
}

/**
 * A tiny reusable input modal. Collects one or more text fields and resolves
 * them to the caller. Used for bulk "add property" / "add tag" actions.
 */
export class PromptModal extends Modal {
  private values: Record<string, string> = {};

  constructor(
    app: App,
    private title: string,
    private fields: PromptField[],
    private onSubmit: (values: Record<string, string>) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });

    for (const field of this.fields) {
      this.values[field.key] = "";
      new Setting(contentEl).setName(field.label).addText((t) =>
        t.setPlaceholder(field.placeholder ?? "").onChange((v) => {
          this.values[field.key] = v;
        })
      );
    }

    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText("Apply")
        .setCta()
        .onClick(() => {
          this.close();
          this.onSubmit(this.values);
        })
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
