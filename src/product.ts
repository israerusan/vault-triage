// Central product metadata and marketing copy. Keeping these in one place keeps
// the license binding, upsell surfaces, and settings copy consistent.

/** Signed into every license payload; a key only unlocks the product it names. */
export const PRODUCT_ID = "vault-triage";

/** Plugin-owned folder for exported reports; always skipped by scans. */
export const REPORT_FOLDER = "Vault Triage Reports";

export const PRODUCT_NAME = "Vault Triage";
export const PRO_NAME = "Vault Triage Pro";

/** Where "Unlock Pro" sends people. Confirm the real handle before release. */
export const PURCHASE_URL = "https://github.com/israerusan/vault-triage#pro";

/** One-time price. Kept in one place so every surface stays consistent. */
export const PRO_PRICE_LABEL = "$12 one-time";

/** One-line pitch for the Pro tier, reused across upsell surfaces. */
export const PRO_TAGLINE =
  "Saved audits, custom rules, bulk actions, and report export. $12 one-time, no subscription, no account.";

/** Contextual upsell copy, keyed by the feature the user reached for. */
export const PRO_UPSELL: Record<string, string> = {
  profiles: "Saved scan profiles are a Pro feature. " + PRO_TAGLINE,
  rules: "Custom rules are a Pro feature. " + PRO_TAGLINE,
  bulk: "Bulk actions are a Pro feature. " + PRO_TAGLINE,
  export: "Report export is a Pro feature. " + PRO_TAGLINE,
  review: "Adding missing frontmatter properties without leaving the review queue is a Pro feature. " + PRO_TAGLINE,
  severity: "Severity tuning is a Pro feature. " + PRO_TAGLINE,
};
