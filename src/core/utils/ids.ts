import type { IssueType } from "../../types";

/** Stable identity for an issue, so ignore/reviewed state survives re-scans. */
export function issueKey(
  notePath: string,
  issueType: IssueType,
  sourceRuleId?: string
): string {
  return sourceRuleId
    ? `${notePath}::${issueType}::${sourceRuleId}`
    : `${notePath}::${issueType}`;
}

/**
 * A short unique id for profiles and rules. Runs in the plugin runtime (not the
 * pure test path), so `crypto.randomUUID` / `Date.now` are available.
 */
export function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.floor(Math.random() * 0xffffffff).toString(36);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}
