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
    const re = new RegExp(`(^|[^\\w])${escapeRegExp(trimmed)}([^\\w]|$)`, "i");
    if (re.test(body) && !found.includes(trimmed)) {
      found.push(trimmed);
    }
  }
  return found;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
