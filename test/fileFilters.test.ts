import assert from "node:assert";
import {
  isExcluded,
  includedByFolders,
  type ExclusionConfig,
} from "../src/core/scan/fileFilters";

const emptyConfig: ExclusionConfig = {
  excludedFolders: [],
  excludedPaths: [],
  excludedTags: [],
};

// --- isExcluded: nothing configured ---
assert.strictEqual(isExcluded("Notes/a.md", [], emptyConfig), false);

// --- isExcluded: exact path match ---
assert.strictEqual(
  isExcluded("Notes/a.md", [], { ...emptyConfig, excludedPaths: ["Notes/a.md"] }),
  true
);
// path that only shares a prefix with an excluded path is not excluded
assert.strictEqual(
  isExcluded("Notes/a.md.bak", [], {
    ...emptyConfig,
    excludedPaths: ["Notes/a.md"],
  }),
  false
);

// --- isExcluded: folder subtree ---
const folderConfig: ExclusionConfig = {
  ...emptyConfig,
  excludedFolders: ["Projects"],
};
// the folder itself
assert.strictEqual(isExcluded("Projects", [], folderConfig), true);
// a note inside the folder
assert.strictEqual(isExcluded("Projects/a.md", [], folderConfig), true);
// nested deeper
assert.strictEqual(isExcluded("Projects/sub/a.md", [], folderConfig), true);
// boundary: sibling folder that merely starts with the same string must NOT match
assert.strictEqual(isExcluded("ProjectsX/a.md", [], folderConfig), false);
assert.strictEqual(isExcluded("ProjectsX", [], folderConfig), false);

// --- isExcluded: tags (case-insensitive, ignore leading '#') ---
const tagConfig: ExclusionConfig = {
  ...emptyConfig,
  excludedTags: ["#Archive"],
};
assert.strictEqual(isExcluded("Notes/a.md", ["archive"], tagConfig), true);
assert.strictEqual(isExcluded("Notes/a.md", ["#ARCHIVE"], tagConfig), true);
assert.strictEqual(isExcluded("Notes/a.md", ["keep"], tagConfig), false);
assert.strictEqual(isExcluded("Notes/a.md", [], tagConfig), false);

// --- isExcluded: whitespace/empty config entries are ignored ---
assert.strictEqual(
  isExcluded("Notes/a.md", ["  "], {
    excludedFolders: ["  ", ""],
    excludedPaths: ["", "   "],
    excludedTags: [" ", "#"],
  }),
  false
);

// --- includedByFolders: empty list = no restriction ---
assert.strictEqual(includedByFolders("anywhere/a.md", []), true);
assert.strictEqual(includedByFolders("anywhere/a.md", ["   ", ""]), true);

// --- includedByFolders: inside one of the folders ---
assert.strictEqual(includedByFolders("Work/a.md", ["Work", "Personal"]), true);
assert.strictEqual(includedByFolders("Work", ["Work"]), true);
assert.strictEqual(includedByFolders("Personal/x/y.md", ["Work", "Personal"]), true);

// --- includedByFolders: boundary + outside ---
assert.strictEqual(includedByFolders("WorkX/a.md", ["Work"]), false);
assert.strictEqual(includedByFolders("Other/a.md", ["Work", "Personal"]), false);

console.log("fileFilters tests passed");
