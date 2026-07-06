import assert from "node:assert";
import { thinDetector } from "../src/core/detectors/thinDetector";
import type { NoteStat } from "../src/types";

const NOW = Date.parse("2026-07-05T00:00:00Z");

function makeStat(charCount: number): NoteStat {
  return {
    path: "notes/example.md",
    name: "example",
    mtime: NOW,
    charCount,
    content: "x".repeat(charCount),
    frontmatter: {},
    tags: [],
    inboundLinks: 0,
  };
}

// True case: below the minimum -> a hit with the expected reason.
const thin = thinDetector(makeStat(12), 50);
assert.ok(thin !== null);
assert.strictEqual(thin.reason, "Only 12 characters of content (min 50)");
assert.strictEqual(thin.details, undefined);

// Empty note is thin too.
const empty = thinDetector(makeStat(0), 50);
assert.ok(empty !== null);
assert.strictEqual(empty.reason, "Only 0 characters of content (min 50)");

// Boundary: charCount exactly equal to the minimum is NOT thin.
assert.strictEqual(thinDetector(makeStat(50), 50), null);

// Boundary: one below the minimum IS thin.
const oneBelow = thinDetector(makeStat(49), 50);
assert.ok(oneBelow !== null);
assert.strictEqual(oneBelow.reason, "Only 49 characters of content (min 50)");

// False case: comfortably above the minimum.
assert.strictEqual(thinDetector(makeStat(500), 50), null);

// Disabled: minNoteLength of zero always yields null, even for an empty note.
assert.strictEqual(thinDetector(makeStat(0), 0), null);

// Disabled: negative minNoteLength always yields null.
assert.strictEqual(thinDetector(makeStat(3), -10), null);

console.log("thinDetector tests passed");
