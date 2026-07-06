import { Notice } from "obsidian";
import { PRO_UPSELL } from "../../product";

/** Anything carrying the resolved Pro entitlement. The plugin satisfies this. */
export interface ProHost {
  isPro: boolean;
}

export function isPro(host: ProHost): boolean {
  return host.isPro;
}

/**
 * The one place Pro features are gated. Runs `action` when Pro is active,
 * otherwise shows a contextual upsell for `feature`. Keeping every gate here
 * avoids scattered `if (isPro)` checks drifting out of sync.
 */
export function requirePro(
  host: ProHost,
  feature: keyof typeof PRO_UPSELL,
  action: () => void
): boolean {
  if (host.isPro) {
    action();
    return true;
  }
  new Notice(PRO_UPSELL[feature] ?? "This is a Note Doctor Pro feature.");
  return false;
}
