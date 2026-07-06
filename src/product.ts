// Central product metadata and marketing copy. Keeping these in one place keeps
// the license binding, upsell surfaces, and settings copy consistent.

/** Signed into every license payload; a key only unlocks the product it names. */
export const PRODUCT_ID = "note-doctor";

export const PRODUCT_NAME = "Note Doctor";
export const PRO_NAME = "Note Doctor Pro";

/** Where "Unlock Pro" sends people. Confirm the real handle before release. */
export const PURCHASE_URL = "https://buymeacoffee.com/notedoctor";

/** One-line pitch for the Pro tier, reused across upsell surfaces. */
export const PRO_TAGLINE =
  "Pro unlocks saved audits, custom rules, bulk actions, and report export.";

/** Contextual upsell copy, keyed by the feature the user reached for. */
export const PRO_UPSELL: Record<string, string> = {
  profiles: "Saved scan profiles are a Pro feature. " + PRO_TAGLINE,
  rules: "Custom rules are a Pro feature. " + PRO_TAGLINE,
  bulk: "Bulk actions are a Pro feature. " + PRO_TAGLINE,
  export: "Report export is a Pro feature. " + PRO_TAGLINE,
  review: "Advanced review workflows are a Pro feature. " + PRO_TAGLINE,
  severity: "Severity tuning is a Pro feature. " + PRO_TAGLINE,
};
