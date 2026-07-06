import assert from "node:assert";
import { orphanDetector } from "../src/core/detectors/orphanDetector";
import type { NoteStat } from "../src/types";

const NOW = Date.parse("2026-07-05T00:00:00Z");

function makeStat(inboundLinks: number, outboundLinks: number): NoteStat {
  return {
    path: "notes/example.md",
    name: "example",
    mtime: NOW,
    charCount: 100,
    content: "some body text",
    frontmatter: {},
    tags: [],
    inboundLinks,
    outboundLinks,
  };
}

// True case: no inbound AND no outbound links is a (truly disconnected) orphan.
const isolated = orphanDetector(makeStat(0, 0));
assert.notStrictEqual(isolated, null);
assert.strictEqual(isolated?.reason, "No links in or out");
assert.strictEqual(isolated?.details, undefined);

// A note that links OUT (index / map-of-content) is not an orphan even with no inbound.
assert.strictEqual(orphanDetector(makeStat(0, 4)), null);

// A note that is linked to is not an orphan.
assert.strictEqual(orphanDetector(makeStat(1, 0)), null);
assert.strictEqual(orphanDetector(makeStat(5, 2)), null);

// Defensive: negative counts are still treated as zero.
assert.notStrictEqual(orphanDetector(makeStat(-3, 0)), null);

console.log("orphanDetector tests passed");
