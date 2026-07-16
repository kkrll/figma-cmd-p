export interface PageInfo {
  id: string;
  name: string;
}

export interface RecentEntry {
  fileKey: string;
  fileName: string;
  pageId: string;
  pageName: string;
  ts: number;
}

export interface FileIndexEntry {
  key: string;
  name: string;
  pages: PageInfo[];
}

export interface CrossFileIndex {
  fetchedAt: number;
  files: FileIndexEntry[];
}

export type LinkStyle = 'desktop' | 'web';

export interface Settings {
  token: string;
  teamIds: string;
  linkStyle: LinkStyle;
}

export const DEFAULT_SETTINGS: Settings = {
  token: '',
  teamIds: '',
  linkStyle: 'desktop',
};

export type MsgToMain =
  | { type: 'ui-ready' }
  | { type: 'jump-local'; pageId: string; pageName: string }
  | { type: 'open-external'; fileKey: string; fileName: string; pageId: string; pageName: string }
  | { type: 'save-settings'; settings: Settings }
  | { type: 'save-index'; index: CrossFileIndex }
  | { type: 'notify'; message: string; error?: boolean }
  | { type: 'close' };

export type MsgToUI =
  | {
      type: 'init';
      currentFileKey: string;
      currentFileName: string;
      currentPages: PageInfo[];
      recents: RecentEntry[];
      index: CrossFileIndex | null;
      settings: Settings;
    }
  | { type: 'settings-saved' }
  | { type: 'index-saved' };
