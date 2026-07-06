import type { NoteStat, DetectorHit } from "../../types";
import { hasProperty } from "../utils/frontmatter";

/**
 * Flags a note whose frontmatter is missing one or more required properties.
 * Returns a single combined hit listing every absent property, comma-separated,
 * in the order they were configured; the same list is echoed in `details`. An
 * empty `requiredProperties` list, or a note that has them all, yields `null`.
 *
 * Special case: `tags` counts as present when the note is tagged INLINE (`#tag`)
 * even without a frontmatter `tags:` key, so inline-tagged notes aren't false-flagged.
 */
export function missingPropertiesDetector(
  stat: NoteStat,
  requiredProperties: string[],
): DetectorHit | null {
  const missing = requiredProperties
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .filter((p) => {
      if (p.toLowerCase() === "tags" && stat.tags.length > 0) return false;
      return !hasProperty(stat.frontmatter, p);
    });
  if (missing.length === 0) return null;
  const list = missing.join(", ");
  return { reason: `Missing required properties: ${list}`, details: list };
}
