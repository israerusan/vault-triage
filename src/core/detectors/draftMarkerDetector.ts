import type { NoteStat, DetectorHit } from "../../types";
import { findMarkers } from "../utils/markdown";

/**
 * Flags a note that still carries draft markers (e.g. `TODO`, `FIXME`) in its
 * body. Uses {@link findMarkers} so matches are whole-word, case-insensitive,
 * and frontmatter is ignored. Returns a single hit listing the found markers in
 * configured order, or `null` when none are present (or none are configured).
 */
export function draftMarkerDetector(
  stat: NoteStat,
  draftMarkers: string[]
): DetectorHit | null {
  const found = findMarkers(stat.content, draftMarkers);
  if (found.length === 0) {
    return null;
  }
  return { reason: `Contains draft markers: ${found.join(", ")}` };
}
