import assert from "node:assert";
import type { CustomRule, NoteStat } from "../src/types";
import {
  ruleInScope,
  evaluateRule,
  runCustomRules,
} from "../src/core/rules/customRuleEngine";

const NOW = Date.parse("2026-07-05T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function makeStat(overrides: Partial<NoteStat> = {}): NoteStat {
  return {
    path: "notes/example.md",
    name: "example.md",
    mtime: NOW,
    charCount: 100,
    content: "# Example\n\nBody text here.",
    frontmatter: {},
    tags: [],
    inboundLinks: 0,
    outboundLinks: 0,
    ...overrides,
  };
}

function makeRule(overrides: Partial<CustomRule> = {}): CustomRule {
  return {
    id: "rule-1",
    name: "Rule 1",
    enabled: true,
    scope: {},
    condition: { type: "missing-property", property: "status" },
    severity: 3,
    message: "Flagged",
    ...overrides,
  };
}

// --- ruleInScope: empty scope matches all -----------------------------------
assert.strictEqual(ruleInScope(makeStat(), {}), true);
assert.strictEqual(ruleInScope(makeStat(), { folders: [], tags: [] }), true);

// --- ruleInScope: folders ---------------------------------------------------
assert.strictEqual(
  ruleInScope(makeStat({ path: "projects/a.md" }), { folders: ["projects"] }),
  true,
);
// exact folder-path prefix match (trailing slash on scope is tolerated)
assert.strictEqual(
  ruleInScope(makeStat({ path: "projects/a.md" }), { folders: ["projects/"] }),
  true,
);
// out of folder
assert.strictEqual(
  ruleInScope(makeStat({ path: "notes/a.md" }), { folders: ["projects"] }),
  false,
);
// prefix must be at a folder boundary, not a partial name
assert.strictEqual(
  ruleInScope(makeStat({ path: "projectsX/a.md" }), { folders: ["projects"] }),
  false,
);

// --- ruleInScope: tags (case-insensitive, leading # ignored) ----------------
assert.strictEqual(
  ruleInScope(makeStat({ tags: ["Work"] }), { tags: ["#work"] }),
  true,
);
assert.strictEqual(
  ruleInScope(makeStat({ tags: ["personal"] }), { tags: ["work"] }),
  false,
);

// --- ruleInScope: folders AND tags ------------------------------------------
assert.strictEqual(
  ruleInScope(makeStat({ path: "projects/a.md", tags: ["work"] }), {
    folders: ["projects"],
    tags: ["work"],
  }),
  true,
);
// in folder but wrong tag => out of scope
assert.strictEqual(
  ruleInScope(makeStat({ path: "projects/a.md", tags: ["home"] }), {
    folders: ["projects"],
    tags: ["work"],
  }),
  false,
);

// --- evaluateRule: disabled rule --------------------------------------------
assert.strictEqual(evaluateRule(makeStat(), makeRule({ enabled: false }), NOW), null);

// --- evaluateRule: out of scope ---------------------------------------------
assert.strictEqual(
  evaluateRule(
    makeStat({ path: "notes/a.md" }),
    makeRule({ scope: { folders: ["projects"] } }),
    NOW,
  ),
  null,
);

// --- missing-property: true & false -----------------------------------------
{
  const hit = evaluateRule(
    makeStat({ frontmatter: {} }),
    makeRule({ condition: { type: "missing-property", property: "status" } }),
    NOW,
  );
  assert.deepStrictEqual(hit, { ruleId: "rule-1", severity: 3, reason: "Flagged" });
}
assert.strictEqual(
  evaluateRule(
    makeStat({ frontmatter: { status: "done" } }),
    makeRule({ condition: { type: "missing-property", property: "status" } }),
    NOW,
  ),
  null,
);

// --- has-marker: true & false -----------------------------------------------
assert.notStrictEqual(
  evaluateRule(
    makeStat({ content: "# Title\n\nThis is a TODO item." }),
    makeRule({ condition: { type: "has-marker", marker: "TODO" } }),
    NOW,
  ),
  null,
);
assert.strictEqual(
  evaluateRule(
    makeStat({ content: "# Title\n\nAll finished." }),
    makeRule({ condition: { type: "has-marker", marker: "TODO" } }),
    NOW,
  ),
  null,
);

// --- older-than-days: true, false & boundary --------------------------------
assert.notStrictEqual(
  evaluateRule(
    makeStat({ mtime: NOW - 31 * DAY }),
    makeRule({ condition: { type: "older-than-days", days: 30 } }),
    NOW,
  ),
  null,
);
// exactly at the threshold is NOT older-than (strict >)
assert.strictEqual(
  evaluateRule(
    makeStat({ mtime: NOW - 30 * DAY }),
    makeRule({ condition: { type: "older-than-days", days: 30 } }),
    NOW,
  ),
  null,
);
// recent note
assert.strictEqual(
  evaluateRule(
    makeStat({ mtime: NOW - 5 * DAY }),
    makeRule({ condition: { type: "older-than-days", days: 30 } }),
    NOW,
  ),
  null,
);

// --- property-equals: true & false ------------------------------------------
assert.notStrictEqual(
  evaluateRule(
    makeStat({ frontmatter: { status: "draft" } }),
    makeRule({ condition: { type: "property-equals", property: "status", value: "draft" } }),
    NOW,
  ),
  null,
);
assert.strictEqual(
  evaluateRule(
    makeStat({ frontmatter: { status: "final" } }),
    makeRule({ condition: { type: "property-equals", property: "status", value: "draft" } }),
    NOW,
  ),
  null,
);

// --- empty message => synthesized reason ------------------------------------
{
  const hit = evaluateRule(
    makeStat({ frontmatter: {} }),
    makeRule({
      message: "   ",
      condition: { type: "missing-property", property: "status" },
    }),
    NOW,
  );
  assert.ok(hit);
  assert.strictEqual(hit.reason, 'Missing property "status"');
}

// --- runCustomRules: filters nulls, keeps order -----------------------------
{
  const rules: CustomRule[] = [
    makeRule({ id: "a", condition: { type: "missing-property", property: "status" } }),
    makeRule({ id: "b", enabled: false }),
    makeRule({
      id: "c",
      condition: { type: "property-equals", property: "status", value: "draft" },
    }),
  ];
  const stat = makeStat({ frontmatter: { status: "draft" } });
  const hits = runCustomRules(stat, rules, NOW);
  // "a" (missing status) => false because status present; "b" disabled; "c" true.
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].ruleId, "c");
}
{
  const hits = runCustomRules(makeStat(), [], NOW);
  assert.strictEqual(hits.length, 0);
}

console.log("customRuleEngine tests passed");
