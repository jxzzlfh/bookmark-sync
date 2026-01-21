---
name: browser-extension-builder
description: Build browser extensions for Chrome (Manifest V3) and Firefox. Use when creating extensions that interact with browser APIs like bookmarks, tabs, storage, or require WebSocket connections from service workers. Covers extension architecture, permissions, service worker lifecycle, and cross-browser compatibility.
---

# Browser Extension Builder

Build production-ready browser extensions with Manifest V3 for Chrome and WebExtensions API for Firefox.

## Quick Start

### Manifest V3 Template (Chrome)

```json
{
  "manifest_version": 3,
  "name": "Extension Name",
  "version": "1.0.0",
  "minimum_chrome_version": "116",
  "permissions": ["bookmarks", "storage"],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  }
}
```

### Required Permissions by Feature

| Feature | Permission | Notes |
|---------|------------|-------|
| Bookmarks | `bookmarks` | Read/write bookmark tree |
| Local Storage | `storage` | Persist data locally |
| Sync Storage | `storage` | Sync across devices (Chrome account) |
| Active Tab | `activeTab` | Access current tab only |
| All URLs | `host_permissions: ["<all_urls>"]` | For content scripts |

## Service Worker Lifecycle

### Key Constraints

- **Idle timeout**: ~30 seconds of inactivity kills the worker
- **Max execution**: ~5 minutes for long-running tasks
- **No DOM access**: Service workers cannot access `document` or `window`

### Keeping Service Worker Alive

```typescript
// WebSocket messages reset the idle timer (Chrome 116+)
const KEEPALIVE_INTERVAL = 20_000; // 20 seconds

function startKeepalive(ws: WebSocket) {
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    } else {
      clearInterval(interval);
    }
  }, KEEPALIVE_INTERVAL);
  return interval;
}
```

## Bookmark API

### Event Listeners

```typescript
// Listen to all bookmark changes
chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  console.log('Created:', id, bookmark);
});

chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
  console.log('Changed:', id, changeInfo);
});

chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  console.log('Removed:', id, removeInfo);
});

chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
  console.log('Moved:', id, moveInfo);
});

chrome.bookmarks.onChildrenReordered.addListener((id, reorderInfo) => {
  console.log('Reordered:', id, reorderInfo);
});
```

### Getting Bookmark Tree

```typescript
// Get entire bookmark tree
const tree = await chrome.bookmarks.getTree();

// Get specific subtree
const subtree = await chrome.bookmarks.getSubTree(folderId);

// Search bookmarks
const results = await chrome.bookmarks.search({ query: 'keyword' });
```

### Modifying Bookmarks

```typescript
// Create bookmark
const newBookmark = await chrome.bookmarks.create({
  parentId: '1', // Bookmarks bar
  title: 'Example',
  url: 'https://example.com'
});

// Create folder
const newFolder = await chrome.bookmarks.create({
  parentId: '1',
  title: 'My Folder'
});

// Update bookmark
await chrome.bookmarks.update(id, { title: 'New Title', url: 'https://new.url' });

// Move bookmark
await chrome.bookmarks.move(id, { parentId: newParentId, index: 0 });

// Remove bookmark/folder
await chrome.bookmarks.remove(id);
await chrome.bookmarks.removeTree(folderId); // Remove folder with contents
```

## WebSocket in Service Worker

### Connection Management

```typescript
class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private keepaliveInterval: number | null = null;

  constructor(private url: string) {}

  connect(): void {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.startKeepalive();
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };

    this.ws.onclose = () => {
      this.stopKeepalive();
      this.scheduleReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  private startKeepalive(): void {
    this.keepaliveInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 20_000);
  }

  private stopKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    setTimeout(() => this.connect(), delay);
  }

  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private handleMessage(data: unknown): void {
    // Override in subclass or pass callback
  }
}
```

## Storage API

### Local vs Sync Storage

```typescript
// Local storage (unlimited, device-specific)
await chrome.storage.local.set({ key: 'value' });
const { key } = await chrome.storage.local.get('key');

// Sync storage (100KB limit, syncs across devices)
await chrome.storage.sync.set({ settings: { theme: 'dark' } });
const { settings } = await chrome.storage.sync.get('settings');

// Listen for changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  for (const [key, { oldValue, newValue }] of Object.entries(changes)) {
    console.log(`${areaName}.${key}: ${oldValue} → ${newValue}`);
  }
});
```

## Project Structure

```
extension/
├── manifest.json
├── src/
│   ├── background.ts          # Service Worker
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.tsx
│   │   └── popup.css
│   ├── content/               # Content scripts (if needed)
│   │   └── content.ts
│   └── utils/
│       ├── bookmarks.ts       # Bookmark utilities
│       ├── storage.ts         # Storage utilities
│       └── websocket.ts       # WebSocket manager
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── package.json
├── tsconfig.json
└── vite.config.ts             # Or webpack.config.js
```

## Build Tools

### Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        popup: 'src/popup/popup.html',
      },
    },
  },
});
```

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "types": ["chrome"]
  },
  "include": ["src/**/*"]
}
```

## Cross-Browser Compatibility

### Firefox Differences

- Use `browser.*` API (Promise-based) vs Chrome's `chrome.*` (callback-based)
- Firefox requires `browser_specific_settings` in manifest
- Service workers not fully supported; use background scripts

### Polyfill

```typescript
// Use webextension-polyfill for cross-browser support
import browser from 'webextension-polyfill';

// Works in both Chrome and Firefox
const tree = await browser.bookmarks.getTree();
```

## Additional Resources

- [Manifest V3 Guide](reference/manifest-v3-guide.md)
- [WebSocket Keepalive Patterns](reference/websocket-keepalive.md)
