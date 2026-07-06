import type { NoteStat, DetectorHit } from "../../types";

/**
 * Flags a truly-disconnected note: one with no inbound AND no outbound links. A
 * note that links out (an index / map-of-content / daily note) is participating
 * in the graph and is deliberately un-linked-to, so it is NOT flagged — this
 * keeps the orphan list actionable instead of full of healthy hub notes.
 */
export function orphanDetector(stat: NoteStat): DetectorHit | null {
  if (stat.inboundLinks <= 0 && stat.outboundLinks <= 0) {
    return { reason: "No links in or out" };
  }
  return null;
}
