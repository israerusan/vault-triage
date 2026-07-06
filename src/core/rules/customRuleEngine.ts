import type { CustomRule, NoteStat } from "../../types";
import { hasProperty, propertyEquals } from "../utils/frontmatter";
import { findMarkers } from "../utils/markdown";
import { isOlderThanDays } from "../utils/dates";

/** A custom rule that fired on a note: which rule, its weight, and why. */
export interface CustomRuleHit {
  ruleId: string;
  severity: number;
  reason: string;
}

/**
 * True when a note falls within a rule's scope. Folders and tags are ANDed: the
 * note must match a folder (when any are set) AND carry a scope tag (when any
 * are set). An empty scope (no folders, no tags) matches every note. Folder
 * matching is by path prefix followed by `/`, or an exact folder-path match.
 * Tag matching is case-insensitive and ignores a leading `#` on either side.
 */
export function ruleInScope(stat: NoteStat, scope: CustomRule["scope"]): boolean {
  const folders = scope.folders ?? [];
  const tags = scope.tags ?? [];

  if (folders.length > 0) {
    const inFolder = folders.some((folder) => {
      const trimmed = folder.trim().replace(/\/+$/, "");
      if (trimmed.length === 0) return false;
      return stat.path === trimmed || stat.path.startsWith(`${trimmed}/`);
    });
    if (!inFolder) return false;
  }

  if (tags.length > 0) {
    const noteTags = stat.tags.map((t) => normalizeTag(t));
    const hasTag = tags.some((tag) => {
      const norm = normalizeTag(tag);
      return norm.length > 0 && noteTags.includes(norm);
    });
    if (!hasTag) return false;
  }

  return true;
}

/**
 * Evaluate one custom rule against a note. Returns a hit when the rule is
 * enabled, the note is in scope, and the condition is TRUE (the condition being
 * true means the note has the problem the rule flags). Otherwise returns `null`.
 * When the rule's `message` is empty, a short reason is synthesized from the
 * condition.
 */
export function evaluateRule(
  stat: NoteStat,
  rule: CustomRule,
  now: number,
): CustomRuleHit | null {
  if (!rule.enabled) return null;
  if (!ruleInScope(stat, rule.scope)) return null;

  const condition = rule.condition;
  let triggered = false;
  switch (condition.type) {
    case "missing-property":
      triggered = !hasProperty(stat.frontmatter, condition.property);
      break;
    case "has-marker":
      triggered = findMarkers(stat.content, [condition.marker]).length > 0;
      break;
    case "older-than-days":
      triggered = isOlderThanDays(stat.mtime, condition.days, now);
      break;
    case "property-equals":
      triggered = propertyEquals(stat.frontmatter, condition.property, condition.value);
      break;
  }

  if (!triggered) return null;

  const reason = rule.message.trim().length > 0
    ? rule.message
    : synthesizeReason(condition);
  return { ruleId: rule.id, severity: rule.severity, reason };
}

/** Run every rule against a note, returning the hits in rule order. */
export function runCustomRules(
  stat: NoteStat,
  rules: CustomRule[],
  now: number,
): CustomRuleHit[] {
  const hits: CustomRuleHit[] = [];
  for (const rule of rules) {
    const hit = evaluateRule(stat, rule, now);
    if (hit) hits.push(hit);
  }
  return hits;
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, "").toLowerCase();
}

function synthesizeReason(condition: CustomRule["condition"]): string {
  switch (condition.type) {
    case "missing-property":
      return `Missing property "${condition.property}"`;
    case "has-marker":
      return `Contains marker "${condition.marker}"`;
    case "older-than-days":
      return `Older than ${condition.days} days`;
    case "property-equals":
      return `Property "${condition.property}" equals "${condition.value}"`;
  }
}
