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
    this.titleEl.setText(this.title);

    const submit = (): void => {
      this.close();
      this.onSubmit(this.values);
    };

    const inputs: HTMLInputElement[] = [];
    for (const field of this.fields) {
      this.values[field.key] = "";
      new Setting(contentEl).setName(field.label).addText((t) => {
        t.setPlaceholder(field.placeholder ?? "").onChange((v) => {
          this.values[field.key] = v;
        });
        inputs.push(t.inputEl);
        // Enter (without Shift) submits from any field.
        t.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
          if (evt.key === "Enter" && !evt.shiftKey) {
            evt.preventDefault();
            submit();
          }
        });
      });
    }

    new Setting(contentEl).addButton((b) => b.setButtonText("Apply").setCta().onClick(submit));

    // Focus the first field so the flow is type-and-Enter.
    if (inputs.length > 0) inputs[0].focus();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
