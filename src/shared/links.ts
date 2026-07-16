import type { LinkStyle } from './types.ts';

/**
 * Builds a deep link to a page in another file.
 *
 * `desktop` uses the figma:// protocol handled by the desktop app, which
 * jumps straight to the file without a browser roundtrip. `web` is the
 * https fallback: the browser (or OS handler) redirects it into the app.
 */
export function buildPageUrl(fileKey: string, pageId: string, style: LinkStyle): string {
  const nodeId = encodeURIComponent(pageId);
  const key = encodeURIComponent(fileKey);
  if (style === 'desktop') {
    return `figma://file/${key}?node-id=${nodeId}`;
  }
  return `https://www.figma.com/design/${key}?node-id=${nodeId}`;
}
