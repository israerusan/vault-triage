import type { NoteStat, DetectorHit } from "../../types";

/**
 * Flags an orphan note: one that has no resolved inbound links pointing at it.
 * Returns a hit when `inboundLinks` is zero (or, defensively, negative);
 * otherwise `null`.
 */
export function orphanDetector(stat: NoteStat): DetectorHit | null {
  if (stat.inboundLinks <= 0) {
    return { reason: "No notes link here" };
  }
  return null;
}
