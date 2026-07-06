import type { NoteStat, DetectorHit } from "../../types";
import { getMissingProperties } from "../utils/frontmatter";

/**
 * Flags a note whose frontmatter is missing one or more required properties.
 * Returns a single combined hit listing every absent property, comma-separated,
 * in the order they were configured; the same list is echoed in `details`. An
 * empty `requiredProperties` list, or a note that has them all, yields `null`.
 */
export function missingPropertiesDetector(
  stat: NoteStat,
  requiredProperties: string[],
): DetectorHit | null {
  const missing = getMissingProperties(stat.frontmatter, requiredProperties);
  if (missing.length === 0) return null;
  const list = missing.join(", ");
  return { reason: `Missing required properties: ${list}`, details: list };
}
