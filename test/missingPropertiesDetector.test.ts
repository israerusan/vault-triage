import assert from "node:assert";
import { missingPropertiesDetector } from "../src/core/detectors/missingPropertiesDetector";
import type { NoteStat } from "../src/types";

const NOW = Date.parse("2026-07-05T00:00:00Z");

function makeStat(frontmatter: Record<string, unknown>): NoteStat {
  return {
    path: "notes/example.md",
    name: "example",
    mtime: NOW,
    charCount: 100,
    content: "some body text",
    frontmatter,
    tags: [],
    inboundLinks: 1,
  };
}

// False case: all required properties present => null.
assert.strictEqual(
  missingPropertiesDetector(makeStat({ title: "Hi", status: "done" }), [
    "title",
    "status",
  ]),
  null,
);

// True case: some missing => one combined hit, comma+space joined, in order.
const someHit = missingPropertiesDetector(
  makeStat({ title: "Hi" }),
  ["title", "status", "tags"],
);
assert.notStrictEqual(someHit, null);
assert.strictEqual(someHit?.reason, "Missing required properties: status, tags");
assert.strictEqual(someHit?.details, "status, tags");

// Single missing property => no trailing separator.
const oneHit = missingPropertiesDetector(makeStat({}), ["title"]);
assert.strictEqual(oneHit?.reason, "Missing required properties: title");
assert.strictEqual(oneHit?.details, "title");

// Empty/blank values count as missing (getMissingProperties treats them so).
const emptyHit = missingPropertiesDetector(
  makeStat({ title: "", tags: [], author: null }),
  ["title", "tags", "author"],
);
assert.strictEqual(
  emptyHit?.reason,
  "Missing required properties: title, tags, author",
);

// Boundary case: empty requiredProperties => null.
assert.strictEqual(
  missingPropertiesDetector(makeStat({ title: "Hi" }), []),
  null,
);

// Boundary case: only whitespace property names are ignored => null.
assert.strictEqual(missingPropertiesDetector(makeStat({}), ["   "]), null);

console.log("missingPropertiesDetector tests passed");
