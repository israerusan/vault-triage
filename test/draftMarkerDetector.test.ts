import assert from "node:assert";
import type { NoteStat } from "../src/types";
import { draftMarkerDetector } from "../src/core/detectors/draftMarkerDetector";

const NOW = Date.parse("2026-07-05T00:00:00Z");

function makeStat(content: string): NoteStat {
  return {
    path: "notes/example.md",
    name: "example",
    mtime: NOW,
    charCount: content.trim().length,
    content,
    frontmatter: {},
    tags: [],
    inboundLinks: 0,
    outboundLinks: 0,
  };
}

const MARKERS = ["TODO", "FIXME", "DRAFT"];

// True case: a single marker present in the body.
const single = draftMarkerDetector(
  makeStat("# Heading\n\nStill need to write this. TODO finish."),
  MARKERS
);
assert(single !== null);
assert.strictEqual(single.reason, "Contains draft markers: TODO");

// True case: multiple markers, listed in configured order and de-duped.
const multi = draftMarkerDetector(
  makeStat("FIXME the intro. Also todo the outro. Another TODO here."),
  MARKERS
);
assert(multi !== null);
assert.strictEqual(multi.reason, "Contains draft markers: TODO, FIXME");

// False case: no markers anywhere in the body.
assert.strictEqual(
  draftMarkerDetector(makeStat("A perfectly finished note."), MARKERS),
  null
);

// False case: marker appears only as a substring, not a whole word.
assert.strictEqual(
  draftMarkerDetector(makeStat("The METODOLOGY section is complete."), MARKERS),
  null
);

// Boundary: markers only in frontmatter are ignored.
assert.strictEqual(
  draftMarkerDetector(
    makeStat("---\nstatus: TODO\n---\n\nBody is done."),
    MARKERS
  ),
  null
);

// Boundary: empty marker list yields null even when body has TODO-like text.
assert.strictEqual(
  draftMarkerDetector(makeStat("TODO everything here."), []),
  null
);

console.log("draftMarkerDetector tests passed");
