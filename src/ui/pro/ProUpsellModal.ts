import { App, Modal, Notice } from "obsidian";
import { PRO_NAME, PRO_PRICE_LABEL, PRO_TAGLINE, PRO_UPSELL, PURCHASE_URL } from "../../product";

/**
 * An actionable upsell shown the moment a free user reaches for a Pro feature:
 * what they get, the price, a real buy link, and a shortcut to paste a key —
 * instead of a toast that fades with no next step.
 */
export class ProUpsellModal extends Modal {
  constructor(app: App, private feature: keyof typeof PRO_UPSELL) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.titleEl.setText(`${PRO_NAME} — ${PRO_PRICE_LABEL}`);

    contentEl.createDiv({ cls: "vault-triage-upsell-lead", text: PRO_UPSELL[this.feature] });
    contentEl.createDiv({ cls: "vault-triage-upsell-sub", text: PRO_TAGLINE });

    const actions = contentEl.createDiv({ cls: "vault-triage-upsell-actions" });
    actions.createEl("a", {
      text: `Get Pro — ${PRO_PRICE_LABEL}`,
      cls: "vault-triage-cta-link",
      href: PURCHASE_URL,
    });
    const haveKey = actions.createEl("button", { text: "I have a license key" });
    haveKey.addEventListener("click", () => {
      this.close();
      // Plain instruction instead of a private-API jump into settings.
      new Notice("Open Settings → Community plugins → Vault Triage → Pro license and paste your key.");
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
