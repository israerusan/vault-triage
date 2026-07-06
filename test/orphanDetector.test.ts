import assert from "node:assert";
import { orphanDetector } from "../src/core/detectors/orphanDetector";
import type { NoteStat } from "../src/types";

const NOW = Date.parse("2026-07-05T00:00:00Z");

function makeStat(inboundLinks: number): NoteStat {
  return {
    path: "notes/example.md",
    name: "example",
    mtime: NOW,
    charCount: 100,
    content: "some body text",
    frontmatter: {},
    tags: [],
    inboundLinks,
  };
}

// True case: zero inbound links is an orphan.
const zeroHit = orphanDetector(makeStat(0));
assert.notStrictEqual(zeroHit, null);
assert.strictEqual(zeroHit?.reason, "No notes link here");
assert.strictEqual(zeroHit?.details, undefined);

// Boundary case: exactly one inbound link is not an orphan.
assert.strictEqual(orphanDetector(makeStat(1)), null);

// False case: many inbound links is not an orphan.
assert.strictEqual(orphanDetector(makeStat(5)), null);

// Defensive case: negative link count is still treated as an orphan.
const negativeHit = orphanDetector(makeStat(-3));
assert.notStrictEqual(negativeHit, null);
assert.strictEqual(negativeHit?.reason, "No notes link here");

console.log("orphanDetector tests passed");
