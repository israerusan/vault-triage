import assert from "node:assert";
import type { RawNoteInput } from "../src/types";
import { buildNoteStat } from "../src/core/scan/noteStats";

const NOW = Date.parse("2026-07-05T00:00:00Z");

function makeInput(overrides: Partial<RawNoteInput>): RawNoteInput {
  return {
    path: "notes/example.md",
    name: "example",
    mtime: NOW,
    content: "",
    frontmatter: {},
    tags: [],
    inboundLinks: 0,
  outboundLinks: 2,
    ...overrides,
  };
}

// Fields pass through unchanged.
const passInput = makeInput({
  path: "folder/note.md",
  name: "note",
  mtime: NOW,
  content: "Hello world",
  frontmatter: { status: "draft" },
  tags: ["project", "wip"],
  inboundLinks: 3,
  outboundLinks: 2,
});
const stat = buildNoteStat(passInput);
assert.strictEqual(stat.path, "folder/note.md");
assert.strictEqual(stat.name, "note");
assert.strictEqual(stat.mtime, NOW);
assert.strictEqual(stat.content, "Hello world");
assert.deepStrictEqual(stat.frontmatter, { status: "draft" });
assert.deepStrictEqual(stat.tags, ["project", "wip"]);
assert.strictEqual(stat.inboundLinks, 3);

// charCount is the meaningful body length of plain content.
assert.strictEqual(stat.charCount, "Hello world".length);

// charCount ignores frontmatter and surrounding whitespace.
const fmInput = makeInput({
  content: "---\ntitle: Example\ntags: [a, b]\n---\n\n  body  \n\n",
});
assert.strictEqual(buildNoteStat(fmInput).charCount, "body".length);

// Boundary: a note that is only frontmatter and whitespace has zero length.
const emptyBodyInput = makeInput({
  content: "---\ntitle: Only frontmatter\n---\n   \n",
});
assert.strictEqual(buildNoteStat(emptyBodyInput).charCount, 0);

// Boundary: empty content is zero length.
assert.strictEqual(buildNoteStat(makeInput({ content: "" })).charCount, 0);

// The input is not mutated.
const original = makeInput({ content: "Some text", tags: ["x"] });
const snapshot = JSON.stringify(original);
buildNoteStat(original);
assert.strictEqual(JSON.stringify(original), snapshot);

console.log("noteStats tests passed");
