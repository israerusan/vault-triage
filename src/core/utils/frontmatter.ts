// Pure helpers over a parsed frontmatter object. A property counts as "present"
// only when it has a meaningful value — an empty string, empty array, null, or
// undefined is treated as missing so "required properties" checks are useful.

/**
 * Whether a frontmatter value counts as "present". Empty string, empty array,
 * null, and undefined are NOT meaningful — shared by the missing-properties
 * detector and the bulk fixer so they can never disagree about emptiness.
 */
export function isMeaningful(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function hasProperty(
  frontmatter: Record<string, unknown>,
  property: string
): boolean {
  return isMeaningful(frontmatter[property]);
}

/** Required property names that are absent or empty, preserving input order. */
export function getMissingProperties(
  frontmatter: Record<string, unknown>,
  required: string[]
): string[] {
  return required
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .filter((p) => !hasProperty(frontmatter, p));
}

/** True when a property's scalar value equals `value` (case-sensitive). Object
 *  and array values never match a scalar comparison. */
export function propertyEquals(
  frontmatter: Record<string, unknown>,
  property: string,
  value: string
): boolean {
  const actual = frontmatter[property];
  if (typeof actual === "string") return actual === value;
  if (typeof actual === "number" || typeof actual === "boolean" || typeof actual === "bigint") {
    return String(actual) === value;
  }
  return false;
}
