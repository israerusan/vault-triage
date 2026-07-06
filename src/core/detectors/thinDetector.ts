// Pure detector for thin notes. No Obsidian API — runs in tests under Node.

import type { NoteStat, DetectorHit } from "../../types";

/**
 * Flag a note as thin when its meaningful body length is below the configured
 * minimum. `stat.charCount` is the already-computed body length (frontmatter
 * stripped, trimmed). A `minNoteLength` of zero or less disables the check and
 * always returns `null`.
 */
export function thinDetector(
  stat: NoteStat,
  minNoteLength: number,
): DetectorHit | null {
  if (minNoteLength <= 0) return null;
  if (stat.charCount >= minNoteLength) return null;
  return {
    reason: `Only ${stat.charCount} characters of content (min ${minNoteLength})`,
  };
}
