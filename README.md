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
3. **Load projects** — lists the teams' projects as checkboxes. Untick any
   you don't want indexed (selection persists; new projects default to
   included).
4. **Refresh index** — fetches files → page names for the ticked projects
   (`GET /v1/projects/:id/files`, then `GET /v1/files/:key?depth=1` per file)
   and caches everything in `clientStorage`. Each project row also has a **↻**
   button to re-index just that project, merging into the existing index —
   much faster than a full refresh on large teams. Refresh is always manual;
   the footer shows how stale the index is (red after 24h).

Requests are throttled (~2/sec, shared backoff on 429) to stay inside the
Figma REST rate limits; files that still fail to index are listed in the
refresh status instead of being dropped silently.

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
