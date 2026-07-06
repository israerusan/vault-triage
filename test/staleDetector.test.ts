import assert from "node:assert";
import type { NoteStat } from "../src/types";
import { staleDetector } from "../src/core/detectors/staleDetector";

const NOW = Date.parse("2026-07-05T00:00:00Z");
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Build a NoteStat with a given mtime; other fields are irrelevant here. */
function noteAt(mtime: number): NoteStat {
  return {
    path: "notes/example.md",
    name: "example",
    mtime,
    charCount: 100,
    content: "body",
    frontmatter: {},
    tags: [],
    inboundLinks: 0,
  };
}

// True case: modified 40 days ago, threshold 30 -> stale.
const staleHit = staleDetector(noteAt(NOW - 40 * MS_PER_DAY), 30, NOW);
assert.notStrictEqual(staleHit, null);
assert.strictEqual(staleHit?.reason, "Not modified in 40 days");

// False case: modified 10 days ago, threshold 30 -> not stale.
assert.strictEqual(staleDetector(noteAt(NOW - 10 * MS_PER_DAY), 30, NOW), null);

// Boundary: exactly 30 days old with threshold 30 -> not older-than, so null.
assert.strictEqual(staleDetector(noteAt(NOW - 30 * MS_PER_DAY), 30, NOW), null);

// Boundary: just past 30 days (30 days + 1ms) -> stale, reports 30 days.
const justPast = staleDetector(noteAt(NOW - (30 * MS_PER_DAY + 1)), 30, NOW);
assert.strictEqual(justPast?.reason, "Not modified in 30 days");

// Threshold <= 0 disables the check.
assert.strictEqual(staleDetector(noteAt(NOW - 999 * MS_PER_DAY), 0, NOW), null);
assert.strictEqual(staleDetector(noteAt(NOW - 999 * MS_PER_DAY), -5, NOW), null);

// Future mtime (clock skew) is never stale.
assert.strictEqual(staleDetector(noteAt(NOW + 10 * MS_PER_DAY), 30, NOW), null);

console.log("staleDetector tests passed");
