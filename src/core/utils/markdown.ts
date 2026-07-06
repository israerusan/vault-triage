// Pure Markdown text helpers. No Obsidian API — these run in tests under Node.

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const BOM = 0xfeff;

/** Remove a leading BOM and YAML frontmatter block, if present. */
export function stripFrontmatter(content: string): string {
  const body = content.charCodeAt(0) === BOM ? content.slice(1) : content;
  return body.replace(FRONTMATTER_RE, "");
}

/**
 * Meaningful body length in characters: frontmatter removed and surrounding
 * whitespace trimmed. Used by the thin-note detector so a note that is mostly
 * frontmatter or blank lines still reads as thin.
 */
export function meaningfulLength(content: string): number {
  return stripFrontmatter(content).trim().length;
}

// The whole-word matcher for a marker depends only on the marker string, so it
// is compiled once and reused across every note in a scan (a large vault × many
// markers would otherwise recompile the same patterns tens of thousands of times).
const markerCache = new Map<string, RegExp>();

function markerRegex(marker: string): RegExp {
  let re = markerCache.get(marker);
  if (!re) {
    re = new RegExp(`(^|[^\\w])${escapeRegExp(marker)}([^\\w]|$)`, "i");
    markerCache.set(marker, re);
  }
  return re;
}

/**
 * Draft markers found in the body, as whole words, case-insensitive, de-duped
 * in the order the markers were configured. Frontmatter is ignored so a
 * `status: draft` property doesn't count (the missing-property check owns that).
 */
export function findMarkers(content: string, markers: string[]): string[] {
  const body = stripFrontmatter(content);
  const found: string[] = [];
  for (const marker of markers) {
    const trimmed = marker.trim();
    if (!trimmed) continue;
    // `.test()` on a non-global regex keeps no state, so a shared instance is safe.
    if (markerRegex(trimmed).test(body) && !found.includes(trimmed)) {
      found.push(trimmed);
    }
  }
  return found;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
