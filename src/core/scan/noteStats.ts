// Scan boundary: turn raw per-note data into the normalized snapshot the pure
// detectors and rule engine read. No Obsidian API — this runs in tests too.

import type { RawNoteInput, NoteStat } from "../../types";
import { meaningfulLength } from "../utils/markdown";

/**
 * Normalize a {@link RawNoteInput} into a {@link NoteStat}. Fields pass through
 * unchanged; `charCount` is the meaningful body length (frontmatter stripped and
 * surrounding whitespace trimmed). The input is not mutated.
 */
export function buildNoteStat(input: RawNoteInput): NoteStat {
  return {
    path: input.path,
    name: input.name,
    mtime: input.mtime,
    charCount: meaningfulLength(input.content),
    content: input.content,
    frontmatter: input.frontmatter,
    tags: input.tags,
    inboundLinks: input.inboundLinks,
  };
}
