/**
 * Background Service Worker for Bookmark Sync Extension
 * Handles bookmark events and HTTPS REST API sync
 */

import { StorageManager } from '../utils/storage';

// Default config
const DEFAULT_SERVER_URL = 'https://syn.xue.ee';

// State
let isAuthenticated = false;
let authToken: string | null = null;
let isSyncing = false;

// ID mapping: local Chrome ID <-> remote server ID
const localToRemoteId = new Map<string, string>();
const remoteToLocalId = new Map<string, string>();

// Initialize on install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[BookmarkSync] Extension installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    await StorageManager.init();
    console.log('[BookmarkSync] Initial setup complete');
  }
  
  // Set up periodic sync alarm (every 5 minutes)
  chrome.alarms.create('periodic-sync', { periodInMinutes: 5 });
});

// Handle startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('[BookmarkSync] Browser started');
  await initializeSync();
});

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'periodic-sync') {
    console.log('[BookmarkSync] Periodic sync triggered');
    if (isAuthenticated && authToken) {
      await performFullSync();
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
        await performFullSync();
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: String(error) });
      }
      break;

    case 'SETTINGS_UPDATED':
      // Reload settings
      await initializeSync();
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

async function initializeSync() {
  const settings = await StorageManager.getSettings();
  
  if (!settings.authToken) {
    console.log('[BookmarkSync] No auth token, waiting for login');
    return;
  }

  await handleLoginWithToken(settings.authToken);
}

async function handleLoginWithToken(token: string) {
  try {
    // Save token
    await StorageManager.saveSettings({ authToken: token });
    authToken = token;
    isAuthenticated = true;
    
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
  
  // Remove bookmark listeners
  removeBookmarkListeners();
  
  // Clear stored credentials
  await StorageManager.saveSettings({ authToken: undefined });
  
  // Clear ID mappings
  localToRemoteId.clear();
  remoteToLocalId.clear();
  
  console.log('[BookmarkSync] Logged out');
}

// ==================== Sync Functions ====================

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
    
    console.log('[BookmarkSync] Uploading', localBookmarks.length, 'bookmarks...');
    
    // Step 3: Upload each bookmark
    for (const bookmark of localBookmarks) {
      await uploadBookmark(apiUrl, bookmark);
    }
    
    // Step 4: Save last sync time
    await StorageManager.saveLastSyncTime(Date.now());
    
    console.log('[BookmarkSync] Full sync complete!');
  } catch (error) {
    console.error('[BookmarkSync] Sync failed:', error);
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

async function uploadBookmark(apiUrl: string, bookmark: FlatBookmark): Promise<void> {
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
        console.log('[BookmarkSync] Mapped', bookmark.id, '->', remoteId, ':', bookmark.title);
      }
    } else {
      console.warn('[BookmarkSync] Failed to upload bookmark:', bookmark.title, await response.text());
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
      }
    }
  } catch (error) {
    console.error('[BookmarkSync] Create sync failed:', error);
  }
}

async function onBookmarkChanged(id: string, changeInfo: chrome.bookmarks.BookmarkChangeInfo) {
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
    
    // Clear mappings
    localToRemoteId.delete(id);
    remoteToLocalId.delete(remoteId);
  } catch (error) {
    console.error('[BookmarkSync] Delete sync failed:', error);
  }
}

async function onBookmarkMoved(id: string, moveInfo: chrome.bookmarks.BookmarkMoveInfo) {
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
initializeSync();
