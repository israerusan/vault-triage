import type { NoteStat, DetectorHit } from "../../types";
import { daysBetween, isOlderThanDays } from "../utils/dates";

/**
 * Flags a note that has not been modified for a long time. Returns a hit when
 * the note's `mtime` is older than `staleDaysThreshold` days before `now`, with
 * a reason naming how many whole days it has been. A threshold `<= 0` disables
 * the check, and a future `mtime` (clock skew) is never stale.
 */
export function staleDetector(
  stat: NoteStat,
  staleDaysThreshold: number,
  now: number,
): DetectorHit | null {
  if (staleDaysThreshold <= 0) return null;
  if (!isOlderThanDays(stat.mtime, staleDaysThreshold, now)) return null;
  const days = daysBetween(stat.mtime, now);
  return { reason: `Not modified in ${days} days` };
}
