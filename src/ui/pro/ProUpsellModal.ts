import { App, Modal } from "obsidian";
import { PRO_NAME, PRO_PRICE_LABEL, PRO_TAGLINE, PRO_UPSELL, PURCHASE_URL } from "../../product";

/** Obsidian's internal settings window — used to jump to the license field. */
interface SettingApi {
  open: () => void;
  openTabById: (id: string) => void;
}

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

    contentEl.createDiv({ cls: "note-doctor-upsell-lead", text: PRO_UPSELL[this.feature] });
    contentEl.createDiv({ cls: "note-doctor-upsell-sub", text: PRO_TAGLINE });

    const actions = contentEl.createDiv({ cls: "note-doctor-upsell-actions" });
    actions.createEl("a", {
      text: `Get Pro — ${PRO_PRICE_LABEL}`,
      cls: "note-doctor-cta-link",
      href: PURCHASE_URL,
    });
    const haveKey = actions.createEl("button", { text: "I have a license key" });
    haveKey.addEventListener("click", () => {
      this.close();
      this.openLicenseSettings();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private openLicenseSettings(): void {
    // No public API opens a specific settings tab; feature-detected + optional so
    // it degrades to a no-op if the internal shape ever changes.
    const setting = (this.app as unknown as { setting?: SettingApi }).setting;
    setting?.open();
    setting?.openTabById("note-doctor");
  }
}
