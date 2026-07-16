import { buildPageUrl } from './shared/links.ts';
import {
  DEFAULT_SETTINGS,
  type CrossFileIndex,
  type MsgToMain,
  type MsgToUI,
  type RecentEntry,
  type Settings,
} from './shared/types.ts';

const KEYS = {
  settings: 'settings',
  index: 'index',
  recents: 'recents',
} as const;

const RECENTS_CAP = 30;

let settings: Settings = DEFAULT_SETTINGS;

function currentFileKey(): string {
  return figma.fileKey ?? '';
}

async function loadRecents(): Promise<RecentEntry[]> {
  return ((await figma.clientStorage.getAsync(KEYS.recents)) as RecentEntry[] | undefined) ?? [];
}

async function recordRecent(entry: RecentEntry): Promise<void> {
  const identity = (e: RecentEntry) => `${e.fileKey || e.fileName}::${e.pageId}`;
  const recents = await loadRecents();
  const next = [entry, ...recents.filter((e) => identity(e) !== identity(entry))].slice(0, RECENTS_CAP);
  await figma.clientStorage.setAsync(KEYS.recents, next);
}

function openExternalLink(fileKey: string, pageId: string): void {
  if (settings.linkStyle === 'desktop') {
    try {
      figma.openExternal(buildPageUrl(fileKey, pageId, 'desktop'));
      return;
    } catch (_) {
      // Protocol link rejected — fall through to the https URL.
    }
  }
  figma.openExternal(buildPageUrl(fileKey, pageId, 'web'));
}

async function handleMessage(msg: MsgToMain): Promise<void> {
  switch (msg.type) {
    case 'ui-ready': {
      await sendInit();
      break;
    }
    case 'resize': {
      figma.ui.resize(msg.width, msg.height);
      break;
    }
    case 'jump-local': {
      const page = figma.root.children.find((p) => p.id === msg.pageId);
      if (!page) {
        figma.notify('Page not found — it may have been deleted', { error: true });
        return;
      }
      await figma.setCurrentPageAsync(page);
      await recordRecent({
        fileKey: currentFileKey(),
        fileName: figma.root.name,
        pageId: page.id,
        pageName: page.name,
        ts: Date.now(),
      });
      figma.closePlugin();
      break;
    }
    case 'open-external': {
      openExternalLink(msg.fileKey, msg.pageId);
      await recordRecent({
        fileKey: msg.fileKey,
        fileName: msg.fileName,
        pageId: msg.pageId,
        pageName: msg.pageName,
        ts: Date.now(),
      });
      figma.closePlugin();
      break;
    }
    case 'save-settings': {
      settings = msg.settings;
      await figma.clientStorage.setAsync(KEYS.settings, settings);
      post({ type: 'settings-saved' });
      break;
    }
    case 'save-index': {
      await figma.clientStorage.setAsync(KEYS.index, msg.index);
      post({ type: 'index-saved' });
      break;
    }
    case 'notify': {
      figma.notify(msg.message, { error: msg.error ?? false });
      break;
    }
    case 'close': {
      figma.closePlugin();
      break;
    }
  }
}

function post(msg: MsgToUI): void {
  figma.ui.postMessage(msg);
}

async function sendInit(): Promise<void> {
  const [storedSettings, index, recents] = await Promise.all([
    figma.clientStorage.getAsync(KEYS.settings) as Promise<Settings | undefined>,
    figma.clientStorage.getAsync(KEYS.index) as Promise<CrossFileIndex | undefined>,
    loadRecents(),
  ]);
  settings = { ...DEFAULT_SETTINGS, ...storedSettings };

  post({
    type: 'init',
    currentFileKey: currentFileKey(),
    currentFileName: figma.root.name,
    currentPages: figma.root.children.map((p) => ({ id: p.id, name: p.name })),
    recents,
    index: index ?? null,
    settings,
  });
}

figma.showUI(__html__, { width: 520, height: 460, themeColors: true });

// The message handler is installed synchronously: init is only sent once the
// UI posts 'ui-ready', since messages posted before the iframe finishes
// loading are silently dropped.
figma.ui.onmessage = (msg: MsgToMain) => {
  handleMessage(msg).catch((err) => {
    figma.notify(String(err), { error: true });
  });
};
