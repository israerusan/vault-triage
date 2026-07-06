// Scan boundary: turn raw per-note data into the normalized snapshot the pure
// detectors and rule engine read. No Obsidian API — this runs in tests too.

import type { RawNoteInput, NoteStat } from "../../types";
import { meaningfulLength } from "../utils/markdown";

/**
 * Normalize a {@link RawNoteInput} into a {@link NoteStat}. Fields pass through
 * unchanged; `charCount` is the meaningful body length (frontmatter stripped and
 * surrounding whitespace trimmed). Pass `computeCharCount=false` to skip that
 * work when the thin detector is inactive (thinDetector guards on the threshold,
 * so a 0 is never observed then). The input is not mutated.
 */
export function buildNoteStat(input: RawNoteInput, computeCharCount = true): NoteStat {
  return {
    path: input.path,
    name: input.name,
    mtime: input.mtime,
    charCount: computeCharCount ? meaningfulLength(input.content) : 0,
    content: input.content,
    frontmatter: input.frontmatter,
    tags: input.tags,
    inboundLinks: input.inboundLinks,
    outboundLinks: input.outboundLinks,
  };
}
