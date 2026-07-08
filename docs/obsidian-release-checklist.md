# Obsidian Release & Review Checklist

A pre-flight for shipping a new version of Vault Triage so it cleanly passes
Obsidian's automated review (and stays listed). A failed review can delist the
plugin, and restoring it is slow.

> The automated review runs [`eslint-plugin-obsidianmd`](https://github.com/obsidianmd/eslint-plugin-obsidianmd)
> plus manifest/release validation. The highest-leverage safeguard is to run those
> same checks locally — which this repo does.

## 0. Local == the review bot

`npm run lint` runs `tsc --noEmit` then `eslint . --max-warnings 0` with
`eslint-plugin-obsidianmd`'s recommended config (see `eslint.config.mjs`). A
warning can still block review, so the gate is zero warnings. `npm test` also runs
`test/manifest-contract.test.mjs`, which covers the manifest checks eslint can't
lint (it can't parse `manifest.json`).

## 1. Ship sequence (every release)

1. `npm run lint` — clean.
2. `npm test` — full gate green (lint + unit tests + manifest + license).
3. `npm run build` — produces `main.js` (production, no inline sourcemap).
4. Bump the version in **both** `manifest.json` and `package.json`.
5. Add a `versions.json` entry: `"<version>": "<minAppVersion>"`.
6. Update `CHANGELOG.md`.
7. Commit → merge to `main`.
8. Tag it: `git tag <version>` where `<version>` **exactly equals** the manifest
   version (no `v` prefix).
9. `git push origin <version>` — push the **specific tag**. **Never** `git push --tags`
   (a stale local tag can publish itself as Latest over the real release).
10. `gh release create <version> main.js manifest.json styles.css` (+ `versions.json`).
    Verify it published as Latest with those assets.

## 2. manifest.json

- `description`: must **not** contain "Obsidian" or "plugin"; sentence case, ends
  with a period. (The bot does a blunt case-insensitive substring check — no
  exceptions.)
- `name` / `id`: no "Obsidian", no "plugin"; `id` is lowercase-hyphenated and never
  changes after release.
- `version`: valid semver, equals the release tag, has a `versions.json` entry.
- `minAppVersion`, `author`, `authorUrl`: present and real. `isDesktopOnly`: accurate.

## 3. Source code

- No `innerHTML` / `outerHTML` / `insertAdjacentHTML` — build DOM with
  `createEl` / `createDiv` / `setText`.
- No inline JS styles (`el.style.x = …`) — use a CSS class in `styles.css`.
- No unnecessary type assertions; no `var`; no floating promises (`await` or `void`).
- Register listeners/commands so they're auto-released on unload.
- Use `this.app`, not a global `app`. `instanceof TFile` for file checks.
  `normalizePath()` on any user-supplied path.
- No default hotkeys. Minimal `console` output. Feature-detect Node APIs (mobile).

## 4. Settings & commands

- No "General" heading; don't put the plugin name or "settings" in a heading.
- Setting and command names in sentence case; command names don't repeat the plugin
  name (Obsidian prefixes it).

## 5. Styling

- All CSS in `styles.css`; theme-safe via Obsidian CSS variables; viewport-safe
  sizing so nothing overflows on mobile.

## 6. Privacy

- No telemetry, no phone-home. License verification is fully offline.

## Delisting recovery

1. Fix the exact flagged items.
2. Bump a patch version (+ `versions.json`, changelog).
3. Re-release via the ship sequence.
4. If a bad release exists: `gh release delete <bad> --cleanup-tag --yes` then
   `gh release edit <good> --latest`.
