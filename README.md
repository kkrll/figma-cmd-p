# Cmd+P — Quick Switcher for Figma

A VS Code-style quick switcher plugin: one input, fuzzy-filtered list of pages
across your current file and (optionally) every file in your teams. Keyboard-only.

## Setup

```sh
npm install
npm run build
```

Then in the Figma desktop app: **Plugins → Development → Import plugin from manifest…**
and pick `manifest.json` in this folder.

`npm run watch` rebuilds on change; `npm test` runs the unit tests (Node ≥ 23,
uses native TypeScript type stripping); `npm run typecheck` runs tsc.

## Usage

- Launch the plugin (Figma menu, or bind it to a macOS App Shortcut — a global
  hotkey is not possible through the plugin API).
- Empty input shows your recent jumps, most recent first.
- Type to fuzzy-filter. Current-file pages always rank above cross-file results.
  `↑`/`↓` (or `ctrl+n`/`ctrl+p`) to navigate, `Enter` to jump, `Esc` to close.
- Current-file pages switch in place; cross-file entries open via a
  `figma://file/<key>?node-id=<pageId>` deep link into the desktop app
  (switchable to a browser URL in settings).

## Cross-file index

Open settings with the gear button or `Cmd/Ctrl+,`:

1. **Personal access token** — figma.com → Settings → Security → Personal access
   tokens. It needs read access to file content and projects.
2. **Team IDs** — the REST API cannot enumerate your teams, so paste them
   manually (comma-separated). The ID is in the URL when you open a team:
   `figma.com/files/team/<id>/…`.
3. **Refresh index** — fetches projects → files → page names
   (`GET /v1/projects/:id/files`, then `GET /v1/files/:key?depth=1` per file)
   and caches everything in `clientStorage`. Refresh is always manual; the
   footer shows how stale the index is (red after 24h).

All REST calls run from the UI iframe (the plugin sandbox has no network
access); `manifest.json` allowlists only `https://api.figma.com`.

## Notes & limitations

- **Recents** persist across files (plugin-scoped `clientStorage`), capped at 30,
  deduped by file + page.
- **`figma.fileKey` is undefined** for unpublished development plugins, so
  "current file" detection for recents/index falls back to comparing file
  names. Once published as a private org plugin, the key is available and
  matching is exact.
- If the `figma://` protocol link is rejected, the plugin falls back to the
  `https://www.figma.com` URL automatically.
- Out of scope by design: global keyboard shortcut, OAuth, auto-refresh.
