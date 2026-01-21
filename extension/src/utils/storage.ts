/**
 * Storage Manager for Chrome Extension
 * Handles persistent storage operations
 */

interface Settings {
  authToken?: string;
  serverUrl?: string;
  syncEnabled?: boolean;
  lastSyncTime?: number;
  syncVersion?: number;
}

const DEFAULT_SETTINGS: Settings = {
  syncEnabled: true,
  serverUrl: 'https://syn.xue.ee',
};

export class StorageManager {
  private static KEYS = {
    SETTINGS: 'settings',
    SYNC_VERSION: 'syncVersion',
    LAST_SYNC: 'lastSync',
    ID_MAP: 'idMap',
  };

  static async init(): Promise<void> {
    const existing = await chrome.storage.local.get(this.KEYS.SETTINGS);
    if (!existing[this.KEYS.SETTINGS]) {
      await chrome.storage.local.set({
        [this.KEYS.SETTINGS]: DEFAULT_SETTINGS,
      });
    }
  }

  static async getSettings(): Promise<Settings> {
    const result = await chrome.storage.local.get(this.KEYS.SETTINGS);
    return { ...DEFAULT_SETTINGS, ...result[this.KEYS.SETTINGS] };
  }

  static async saveSettings(settings: Partial<Settings>): Promise<void> {
    const current = await this.getSettings();
    await chrome.storage.local.set({
      [this.KEYS.SETTINGS]: { ...current, ...settings },
    });
  }

  static async getLastSyncTime(): Promise<number | null> {
    const result = await chrome.storage.local.get(this.KEYS.LAST_SYNC);
    return result[this.KEYS.LAST_SYNC] ?? null;
  }

  static async saveLastSyncTime(time: number): Promise<void> {
    await chrome.storage.local.set({
      [this.KEYS.LAST_SYNC]: time,
    });
  }

  static async getSyncVersion(): Promise<number> {
    const result = await chrome.storage.local.get(this.KEYS.SYNC_VERSION);
    return result[this.KEYS.SYNC_VERSION] ?? 0;
  }

  static async saveSyncVersion(version: number): Promise<void> {
    await chrome.storage.local.set({
      [this.KEYS.SYNC_VERSION]: version,
    });
  }

  static async getIdMap(): Promise<Record<string, string>> {
    const result = await chrome.storage.local.get(this.KEYS.ID_MAP);
    return result[this.KEYS.ID_MAP] ?? {};
  }

  static async saveIdMap(map: Record<string, string>): Promise<void> {
    await chrome.storage.local.set({
      [this.KEYS.ID_MAP]: map,
    });
  }

  static async clear(): Promise<void> {
    await chrome.storage.local.clear();
    await this.init();
  }
}
