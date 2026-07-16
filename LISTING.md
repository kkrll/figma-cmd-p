# Community listing copy

Draft text for the Figma Community publish flow. Paste each section into the
matching field.

## Name

**Quick Switcher — jump to any page**

(Avoid "Cmd+P" in the name: plugins can't register global shortcuts, and
review may flag names that imply one.)

## Tagline

Fuzzy-search every page across all your team's files and jump there — no
mouse, no file browser.

## Category

Design tools

## Description

**The VS Code-style quick switcher, for Figma.** One input, one list: type a
few characters and jump to any page — in your current file or in any file
across your teams.

**How it works**

- Launch the plugin and just type. Results filter as you go with fuzzy
  matching ("dsbtn" finds "Design System / Buttons").
- ↑ ↓ to navigate, Enter to jump, Esc to close. No mouse needed.
- Pages in your current file switch instantly and always rank first.
  Pages in other files open via a deep link straight into the desktop app.
- An empty input shows your recent jumps, so bouncing between the same few
  pages is two keystrokes.

**Cross-file search (optional, 2-minute setup)**

Current-file search works out of the box. To search across files, open
settings (⌘ ,) and add a personal access token and your team ID — the plugin
builds an index of your teams' files and page names through the Figma REST
API. Pick which projects to include, refresh manually whenever you want, and
re-index a single project in seconds when it changes.

**Private by design**

- Your token is stored only on your device, in Figma's plugin storage. It is
  never sent anywhere except to Figma's own REST API (api.figma.com) — the
  plugin's network access is locked to that domain in its manifest.
- Read-only scopes are enough: File content (read) and Projects (read).
- No analytics, no external servers, no accounts. Open source:
  https://github.com/kkrll/figma-cmd-p

**Good to know**

- Figma plugins can't register a global keyboard shortcut. On macOS you can
  bind one yourself: System Settings → Keyboard → Keyboard Shortcuts → App
  Shortcuts → add the plugin's exact menu title for Figma.
- The index refreshes only when you ask it to; the footer shows how fresh it
  is.
- The REST API can't see personal Drafts or Figma Slides decks, so those
  don't appear in cross-file results. Branches aren't indexed either.

## Support contact

tododoteam@gmail.com

## Network access reasoning (shown from manifest)

Fetches the user's projects, files, and page names via the Figma REST API to
build the cross-file jump index.

## Image checklist (not text — still needed)

- Icon 128×128
- Cover 1920×1080
- 2–3 screenshots: the switcher mid-search (current + cross-file results),
  the recents view, the settings/projects view
