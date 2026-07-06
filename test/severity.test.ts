import assert from "node:assert";
import type { IssueType, NoteIssue } from "../src/types";
import { ISSUE_TYPES } from "../src/types";
import {
  countByType,
  groupByType,
  sortIssues,
  totalSeverity,
} from "../src/core/rules/severity";

function issue(
  overrides: Partial<NoteIssue> & Pick<NoteIssue, "notePath" | "noteName" | "issueType" | "severity">
): NoteIssue {
  return {
    id: `${overrides.notePath}::${overrides.issueType}`,
    reason: "reason",
    ...overrides,
  };
}

const a = issue({ notePath: "a.md", noteName: "Alpha", issueType: "stale", severity: 3 });
const b = issue({ notePath: "b.md", noteName: "Bravo", issueType: "thin", severity: 5 });
const c = issue({ notePath: "c.md", noteName: "Charlie", issueType: "stale", severity: 5 });
// Same name as `c`, later path — for name/path tie-breaks.
const c2 = issue({ notePath: "z.md", noteName: "Charlie", issueType: "orphan", severity: 5 });

// --- sortIssues: severity DESC, then noteName ASC, then notePath ASC ---------
{
  const input = [a, b, c, c2];
  const result = sortIssues(input, "severity");
  // Top three all have severity 5: Bravo < Charlie(c.md) < Charlie(z.md).
  assert.deepStrictEqual(
    result.map((i) => i.notePath),
    ["b.md", "c.md", "z.md", "a.md"]
  );
  // Input not mutated.
  assert.deepStrictEqual(
    input.map((i) => i.notePath),
    ["a.md", "b.md", "c.md", "z.md"]
  );
  // New array instance.
  assert.notStrictEqual(result, input);
}

// --- sortIssues: title => noteName ASC then path -----------------------------
{
  const result = sortIssues([c2, c, b, a], "title");
  assert.deepStrictEqual(
    result.map((i) => i.notePath),
    ["a.md", "b.md", "c.md", "z.md"]
  );
}

// --- sortIssues: path => notePath ASC ----------------------------------------
{
  const result = sortIssues([c2, b, c, a], "path");
  assert.deepStrictEqual(
    result.map((i) => i.notePath),
    ["a.md", "b.md", "c.md", "z.md"]
  );
}

// --- sortIssues: empty input --------------------------------------------------
{
  assert.deepStrictEqual(sortIssues([], "severity"), []);
}

// --- groupByType: all keys present, input order preserved --------------------
{
  const grouped = groupByType([a, b, c, c2]);
  for (const type of ISSUE_TYPES) {
    assert.ok(Object.prototype.hasOwnProperty.call(grouped, type));
  }
  assert.deepStrictEqual(grouped.stale.map((i) => i.notePath), ["a.md", "c.md"]);
  assert.deepStrictEqual(grouped.thin.map((i) => i.notePath), ["b.md"]);
  assert.deepStrictEqual(grouped.orphan.map((i) => i.notePath), ["z.md"]);
  assert.deepStrictEqual(grouped["missing-properties"], []);
  assert.deepStrictEqual(grouped["draft-marker"], []);
  assert.deepStrictEqual(grouped.custom, []);
}

// --- groupByType: empty input still has every key ----------------------------
{
  const grouped = groupByType([]);
  const keys = Object.keys(grouped).sort();
  assert.deepStrictEqual(keys, ISSUE_TYPES.slice().sort());
  for (const type of ISSUE_TYPES) {
    assert.deepStrictEqual(grouped[type as IssueType], []);
  }
}

// --- countByType: all keys present, correct counts ---------------------------
{
  const counts = countByType([a, b, c, c2]);
  assert.strictEqual(counts.stale, 2);
  assert.strictEqual(counts.thin, 1);
  assert.strictEqual(counts.orphan, 1);
  assert.strictEqual(counts["missing-properties"], 0);
  assert.strictEqual(counts["draft-marker"], 0);
  assert.strictEqual(counts.custom, 0);
}

// --- countByType: empty input => every key 0 ---------------------------------
{
  const counts = countByType([]);
  for (const type of ISSUE_TYPES) {
    assert.strictEqual(counts[type], 0);
  }
}

// --- totalSeverity ------------------------------------------------------------
{
  assert.strictEqual(totalSeverity([a, b, c, c2]), 18);
  assert.strictEqual(totalSeverity([]), 0);
}

console.log("severity tests passed");
