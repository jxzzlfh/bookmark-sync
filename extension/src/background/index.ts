/**
 * Background Service Worker for Bookmark Sync Extension
 * Handles bookmark events and HTTPS REST API sync
 * 
 * IMPORTANT: Service Worker can be killed after ~30s idle.
 * All state must be restored from storage on each wake.
 */

import { StorageManager } from '../utils/storage';

// Default config
const DEFAULT_SERVER_URL = 'https://syn.xue.ee';
const BATCH_SIZE = 50; // 批量上传大小

// State (will be restored from storage on each wake)
let isAuthenticated = false;
let authToken: string | null = null;
let isSyncing = false;

// ID mapping: local Chrome ID <-> remote server ID
let localToRemoteId = new Map<string, string>();
let remoteToLocalId = new Map<string, string>();

// Track if state has been restored this session
let stateRestored = false;

/**
 * Restore state from storage (called on every message/alarm)
 */
async function ensureStateRestored(): Promise<boolean> {
  if (stateRestored && authToken) {
    return isAuthenticated;
  }
  
  try {
    const settings = await StorageManager.getSettings();
    
    if (settings.authToken) {
      authToken = settings.authToken;
      isAuthenticated = true;
      
      // Restore ID mappings from storage
      const idMap = await StorageManager.getIdMap();
      localToRemoteId = new Map(Object.entries(idMap));
      remoteToLocalId = new Map(
        Object.entries(idMap).map(([local, remote]) => [remote, local])
      );
      
      // Re-setup bookmark listeners
      setupBookmarkListeners();
      
      console.log('[BookmarkSync] State restored, ID mappings:', localToRemoteId.size);
    }
    
    stateRestored = true;
    return isAuthenticated;
  } catch (error) {
    console.error('[BookmarkSync] Failed to restore state:', error);
    return false;
  }
}

// Initialize on install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[BookmarkSync] Extension installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    await StorageManager.init();
    console.log('[BookmarkSync] Initial setup complete');
  }
  
  // Set up periodic sync alarm (every 15 minutes)
  chrome.alarms.create('periodic-sync', { periodInMinutes: 15 });
});

// Handle startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('[BookmarkSync] Browser started');
  await ensureStateRestored();
});

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'periodic-sync') {
    console.log('[BookmarkSync] Periodic sync triggered');
    
    // Restore state first
    const authenticated = await ensureStateRestored();
    
    if (authenticated && authToken) {
      // 定时同步使用增量同步
      await performIncrementalSync();
    }
  }
});

// Handle messages from popup/options
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message, sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(
  message: { type: string; data?: unknown },
  sendResponse: (response: unknown) => void
) {
  // Always restore state first (handles service worker wake)
  await ensureStateRestored();
  
  switch (message.type) {
    case 'GET_STATUS':
      sendResponse({
        isConnected: isAuthenticated,
        isAuthenticated,
        lastSync: await StorageManager.getLastSyncTime(),
      });
      break;

    case 'LOGIN':
      try {
        const { email, password } = message.data as { email: string; password: string };
        const result = await loginWithCredentials(email, password);
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: String(error) });
      }
      break;

    case 'REGISTER':
      try {
        const { email, password } = message.data as { email: string; password: string };
        const result = await registerWithCredentials(email, password);
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: String(error) });
      }
      break;

    case 'LOGOUT':
      await handleLogout();
      sendResponse({ success: true });
      break;

    case 'SYNC_NOW':
      try {
        // 手动同步使用全量同步
        await performFullSync();
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: String(error) });
      }
      break;

    case 'SETTINGS_UPDATED':
      // Reload settings - reset state to force re-restore
      stateRestored = false;
      await ensureStateRestored();
      sendResponse({ success: true });
      break;

    case 'GET_BOOKMARKS':
      const bookmarks = await chrome.bookmarks.getTree();
      sendResponse({ bookmarks });
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }
}

async function getApiUrl(): Promise<string> {
  const settings = await StorageManager.getSettings();
  let url = settings.serverUrl || DEFAULT_SERVER_URL;
  // Remove trailing slash
  url = url.replace(/\/+$/, '');
  // If it's a WebSocket URL, convert to HTTP
  if (url.startsWith('wss://')) {
    url = url.replace('wss://', 'https://').replace(/\/ws$/, '');
  } else if (url.startsWith('ws://')) {
    url = url.replace('ws://', 'http://').replace(/\/ws$/, '');
  }
  return url;
}

async function loginWithCredentials(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const apiUrl = await getApiUrl();
    console.log('[BookmarkSync] Logging in to:', apiUrl);
    
    const response = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.error || '登录失败' };
    }

    await handleLoginWithToken(data.token);
    return { success: true };
  } catch (error) {
    console.error('[BookmarkSync] Login error:', error);
    return { success: false, error: '网络错误，请检查服务器连接' };
  }
}

async function registerWithCredentials(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const apiUrl = await getApiUrl();
    console.log('[BookmarkSync] Registering at:', apiUrl);
    
    const response = await fetch(`${apiUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.error || '注册失败' };
    }

    await handleLoginWithToken(data.token);
    return { success: true };
  } catch (error) {
    console.error('[BookmarkSync] Register error:', error);
    return { success: false, error: '网络错误，请检查服务器连接' };
  }
}


async function handleLoginWithToken(token: string) {
  try {
    // Save token
    await StorageManager.saveSettings({ authToken: token });
    authToken = token;
    isAuthenticated = true;
    stateRestored = true;
    
    // Restore ID mappings from storage
    const idMap = await StorageManager.getIdMap();
    localToRemoteId = new Map(Object.entries(idMap));
    remoteToLocalId = new Map(
      Object.entries(idMap).map(([local, remote]) => [remote, local])
    );
    
    // Set up bookmark listeners
    setupBookmarkListeners();
    
    console.log('[BookmarkSync] Logged in successfully');
  } catch (error) {
    console.error('[BookmarkSync] Login failed:', error);
    throw error;
  }
}

async function handleLogout() {
  isAuthenticated = false;
  authToken = null;
  stateRestored = false;
  
  // Remove bookmark listeners
  removeBookmarkListeners();
  
  // Clear stored credentials and ID mappings
  await StorageManager.saveSettings({ authToken: undefined });
  await StorageManager.saveIdMap({});
  
  // Clear ID mappings
  localToRemoteId.clear();
  remoteToLocalId.clear();
  
  console.log('[BookmarkSync] Logged out');
}

// ==================== Sync Functions ====================

/**
 * 持久化ID映射到storage
 */
async function persistIdMappings(): Promise<void> {
  const idMap: Record<string, string> = {};
  localToRemoteId.forEach((remote, local) => {
    idMap[local] = remote;
  });
  await StorageManager.saveIdMap(idMap);
}

/**
 * 全量同步 - 手动触发时使用
 */
async function performFullSync() {
  if (isSyncing) {
    console.log('[BookmarkSync] Sync already in progress');
    return;
  }
  
  if (!authToken) {
    console.log('[BookmarkSync] Not authenticated');
    return;
  }
  
  isSyncing = true;
  console.log('[BookmarkSync] Starting full sync...');
  
  try {
    const apiUrl = await getApiUrl();
    
    // Step 1: Clear server data
    await fetch(`${apiUrl}/api/bookmarks/clear`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    // Clear ID mappings
    localToRemoteId.clear();
    remoteToLocalId.clear();
    
    // Step 2: Get all local bookmarks
    const tree = await chrome.bookmarks.getTree();
    const localBookmarks = flattenBookmarks(tree);
    
    // Sort by depth (parents first)
    localBookmarks.sort((a, b) => a.depth - b.depth);
    
    console.log('[BookmarkSync] Uploading', localBookmarks.length, 'bookmarks in batches...');
    
    // Step 3: Upload bookmarks in batches (按深度分组，确保父节点先创建)
    const depthGroups = new Map<number, FlatBookmark[]>();
    for (const bookmark of localBookmarks) {
      const group = depthGroups.get(bookmark.depth) || [];
      group.push(bookmark);
      depthGroups.set(bookmark.depth, group);
    }
    
    // 按深度顺序处理每组
    const depths = Array.from(depthGroups.keys()).sort((a, b) => a - b);
    for (const depth of depths) {
      const bookmarksAtDepth = depthGroups.get(depth)!;
      
      // 批量上传当前深度的书签
      for (let i = 0; i < bookmarksAtDepth.length; i += BATCH_SIZE) {
        const batch = bookmarksAtDepth.slice(i, i + BATCH_SIZE);
        await uploadBookmarkBatch(apiUrl, batch);
      }
    }
    
    // Step 4: Persist ID mappings and save last sync time
    await persistIdMappings();
    await StorageManager.saveLastSyncTime(Date.now());
    
    console.log('[BookmarkSync] Full sync complete! Total:', localBookmarks.length);
  } catch (error) {
    console.error('[BookmarkSync] Sync failed:', error);
  } finally {
    isSyncing = false;
  }
}

/**
 * 增量同步 - 定时触发时使用
 * 仅同步本地书签事件监听器未能同步的变更
 */
async function performIncrementalSync() {
  if (isSyncing) {
    console.log('[BookmarkSync] Sync already in progress');
    return;
  }
  
  if (!authToken) {
    console.log('[BookmarkSync] Not authenticated');
    return;
  }
  
  isSyncing = true;
  console.log('[BookmarkSync] Starting incremental sync...');
  
  try {
    const apiUrl = await getApiUrl();
    
    // 获取本地所有书签
    const tree = await chrome.bookmarks.getTree();
    const localBookmarks = flattenBookmarks(tree);
    
    // 找出未同步的书签（没有ID映射的）
    const unsyncedBookmarks = localBookmarks.filter(b => !localToRemoteId.has(b.id));
    
    if (unsyncedBookmarks.length === 0) {
      console.log('[BookmarkSync] No new bookmarks to sync');
      await StorageManager.saveLastSyncTime(Date.now());
      isSyncing = false;
      return;
    }
    
    // Sort by depth (parents first)
    unsyncedBookmarks.sort((a, b) => a.depth - b.depth);
    
    console.log('[BookmarkSync] Incremental sync:', unsyncedBookmarks.length, 'new bookmarks');
    
    // 按深度分组上传
    const depthGroups = new Map<number, FlatBookmark[]>();
    for (const bookmark of unsyncedBookmarks) {
      const group = depthGroups.get(bookmark.depth) || [];
      group.push(bookmark);
      depthGroups.set(bookmark.depth, group);
    }
    
    const depths = Array.from(depthGroups.keys()).sort((a, b) => a - b);
    for (const depth of depths) {
      const bookmarksAtDepth = depthGroups.get(depth)!;
      
      for (let i = 0; i < bookmarksAtDepth.length; i += BATCH_SIZE) {
        const batch = bookmarksAtDepth.slice(i, i + BATCH_SIZE);
        await uploadBookmarkBatch(apiUrl, batch);
      }
    }
    
    // Persist and save time
    await persistIdMappings();
    await StorageManager.saveLastSyncTime(Date.now());
    
    console.log('[BookmarkSync] Incremental sync complete!');
  } catch (error) {
    console.error('[BookmarkSync] Incremental sync failed:', error);
  } finally {
    isSyncing = false;
  }
}

interface FlatBookmark {
  id: string;
  parentId: string | undefined;
  title: string;
  url: string | undefined;
  index: number;
  depth: number;
}

function flattenBookmarks(nodes: chrome.bookmarks.BookmarkTreeNode[], depth = 0): FlatBookmark[] {
  const result: FlatBookmark[] = [];
  
  for (const node of nodes) {
    // Skip root nodes (id "0", "1", "2")
    if (node.id !== '0') {
      result.push({
        id: node.id,
        parentId: node.parentId,
        title: node.title,
        url: node.url,
        index: node.index ?? 0,
        depth,
      });
    }
    
    if (node.children) {
      result.push(...flattenBookmarks(node.children, depth + 1));
    }
  }
  
  return result;
}

/**
 * 批量上传书签
 */
async function uploadBookmarkBatch(apiUrl: string, bookmarks: FlatBookmark[]): Promise<void> {
  const payloads = bookmarks.map(bookmark => {
    let remoteParentId: string | null = null;
    if (bookmark.parentId && bookmark.parentId !== '0') {
      remoteParentId = localToRemoteId.get(bookmark.parentId) || null;
    }
    
    return {
      localId: bookmark.id,
      parentId: remoteParentId,
      title: bookmark.title,
      url: bookmark.url || null,
      isFolder: !bookmark.url,
      sortOrder: bookmark.index,
    };
  });
  
  try {
    const response = await fetch(`${apiUrl}/api/bookmarks/batch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookmarks: payloads }),
    });
    
    if (response.ok) {
      const data = await response.json();
      // data.bookmarks 是返回的书签数组，包含 id 和 localId
      if (data.bookmarks && Array.isArray(data.bookmarks)) {
        for (const item of data.bookmarks) {
          const remoteId = item.id;
          const localId = item.localId;
          if (remoteId && localId) {
            localToRemoteId.set(localId, remoteId);
            remoteToLocalId.set(remoteId, localId);
          }
        }
        console.log('[BookmarkSync] Batch uploaded', data.bookmarks.length, 'bookmarks');
      }
    } else {
      // 如果批量API不存在，回退到逐个上传
      console.warn('[BookmarkSync] Batch API failed, falling back to individual uploads');
      for (const bookmark of bookmarks) {
        await uploadBookmarkSingle(apiUrl, bookmark);
      }
    }
  } catch (error) {
    console.error('[BookmarkSync] Batch upload error, falling back:', error);
    // 回退到逐个上传
    for (const bookmark of bookmarks) {
      await uploadBookmarkSingle(apiUrl, bookmark);
    }
  }
}

/**
 * 单个上传书签（作为批量上传的回退方案）
 */
async function uploadBookmarkSingle(apiUrl: string, bookmark: FlatBookmark): Promise<void> {
  // Determine remote parent ID
  let remoteParentId: string | null = null;
  if (bookmark.parentId && bookmark.parentId !== '0') {
    remoteParentId = localToRemoteId.get(bookmark.parentId) || null;
  }
  
  const payload = {
    localId: bookmark.id,
    parentId: remoteParentId,
    title: bookmark.title,
    url: bookmark.url || null,
    isFolder: !bookmark.url,
    sortOrder: bookmark.index,
  };
  
  try {
    const response = await fetch(`${apiUrl}/api/bookmarks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    if (response.ok) {
      const data = await response.json();
      // Save ID mapping - server returns { bookmark: {...}, syncVersion }
      const remoteId = data.bookmark?.id || data.id;
      if (remoteId) {
        localToRemoteId.set(bookmark.id, remoteId);
        remoteToLocalId.set(remoteId, bookmark.id);
      }
    } else {
      console.warn('[BookmarkSync] Failed to upload bookmark:', bookmark.title);
    }
  } catch (error) {
    console.error('[BookmarkSync] Upload error:', error);
  }
}

// ==================== Bookmark Listeners ====================

function setupBookmarkListeners() {
  chrome.bookmarks.onCreated.addListener(onBookmarkCreated);
  chrome.bookmarks.onChanged.addListener(onBookmarkChanged);
  chrome.bookmarks.onRemoved.addListener(onBookmarkRemoved);
  chrome.bookmarks.onMoved.addListener(onBookmarkMoved);
}

function removeBookmarkListeners() {
  chrome.bookmarks.onCreated.removeListener(onBookmarkCreated);
  chrome.bookmarks.onChanged.removeListener(onBookmarkChanged);
  chrome.bookmarks.onRemoved.removeListener(onBookmarkRemoved);
  chrome.bookmarks.onMoved.removeListener(onBookmarkMoved);
}

async function onBookmarkCreated(id: string, bookmark: chrome.bookmarks.BookmarkTreeNode) {
  // Ensure state is restored first
  await ensureStateRestored();
  
  if (!authToken || isSyncing) return;
  
  console.log('[BookmarkSync] Bookmark created:', id, bookmark.title);
  
  const apiUrl = await getApiUrl();
  let remoteParentId: string | null = null;
  if (bookmark.parentId && bookmark.parentId !== '0') {
    remoteParentId = localToRemoteId.get(bookmark.parentId) || null;
  }
  
  try {
    const response = await fetch(`${apiUrl}/api/bookmarks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        localId: id,
        parentId: remoteParentId,
        title: bookmark.title,
        url: bookmark.url || null,
        isFolder: !bookmark.url,
        sortOrder: bookmark.index ?? 0,
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      const remoteId = data.bookmark?.id || data.id;
      if (remoteId) {
        localToRemoteId.set(id, remoteId);
        remoteToLocalId.set(remoteId, id);
        // Persist mapping immediately
        await persistIdMappings();
      }
    }
  } catch (error) {
    console.error('[BookmarkSync] Create sync failed:', error);
  }
}

async function onBookmarkChanged(id: string, changeInfo: chrome.bookmarks.BookmarkChangeInfo) {
  await ensureStateRestored();
  
  if (!authToken || isSyncing) return;
  
  console.log('[BookmarkSync] Bookmark changed:', id, changeInfo);
  
  const remoteId = localToRemoteId.get(id);
  if (!remoteId) return;
  
  const apiUrl = await getApiUrl();
  
  try {
    await fetch(`${apiUrl}/api/bookmarks/${remoteId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: changeInfo.title,
        url: changeInfo.url,
      }),
    });
  } catch (error) {
    console.error('[BookmarkSync] Update sync failed:', error);
  }
}

async function onBookmarkRemoved(id: string, _removeInfo: chrome.bookmarks.BookmarkRemoveInfo) {
  await ensureStateRestored();
  
  if (!authToken || isSyncing) return;
  
  console.log('[BookmarkSync] Bookmark removed:', id);
  
  const remoteId = localToRemoteId.get(id);
  if (!remoteId) return;
  
  const apiUrl = await getApiUrl();
  
  try {
    await fetch(`${apiUrl}/api/bookmarks/${remoteId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });
    
    // Clear mappings and persist
    localToRemoteId.delete(id);
    remoteToLocalId.delete(remoteId);
    await persistIdMappings();
  } catch (error) {
    console.error('[BookmarkSync] Delete sync failed:', error);
  }
}

async function onBookmarkMoved(id: string, moveInfo: chrome.bookmarks.BookmarkMoveInfo) {
  await ensureStateRestored();
  
  if (!authToken || isSyncing) return;
  
  console.log('[BookmarkSync] Bookmark moved:', id, moveInfo);
  
  const remoteId = localToRemoteId.get(id);
  if (!remoteId) return;
  
  const apiUrl = await getApiUrl();
  let remoteParentId: string | null = null;
  if (moveInfo.parentId && moveInfo.parentId !== '0') {
    remoteParentId = localToRemoteId.get(moveInfo.parentId) || null;
  }
  
  try {
    await fetch(`${apiUrl}/api/bookmarks/${remoteId}/move`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parentId: remoteParentId,
        sortOrder: moveInfo.index,
      }),
    });
  } catch (error) {
    console.error('[BookmarkSync] Move sync failed:', error);
  }
}

// Initialize on load
ensureStateRestored();
