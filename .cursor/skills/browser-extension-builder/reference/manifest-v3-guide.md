# Manifest V3 Complete Guide

## Migration from Manifest V2

### Key Changes

| Feature | MV2 | MV3 |
|---------|-----|-----|
| Background | Persistent page | Service Worker |
| Remote code | Allowed | Blocked |
| `webRequest` | Blocking | `declarativeNetRequest` |
| Host permissions | In `permissions` | Separate `host_permissions` |

### Service Worker vs Background Page

**MV2 (background page):**
```json
{
  "background": {
    "scripts": ["background.js"],
    "persistent": false
  }
}
```

**MV3 (service worker):**
```json
{
  "background": {
    "service_worker": "background.js",
    "type": "module"
  }
}
```

## Complete Manifest Example

```json
{
  "manifest_version": 3,
  "name": "Bookmark Sync",
  "version": "1.0.0",
  "description": "Sync your bookmarks to the cloud",
  "minimum_chrome_version": "116",
  
  "permissions": [
    "bookmarks",
    "storage",
    "alarms"
  ],
  
  "host_permissions": [
    "https://your-api.example.com/*"
  ],
  
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  
  "action": {
    "default_popup": "popup.html",
    "default_title": "Bookmark Sync",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  
  "options_page": "options.html",
  
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

## Permission Best Practices

### Minimal Permissions

Only request permissions you actually need:

```json
{
  "permissions": ["bookmarks"],
  "optional_permissions": ["history"]
}
```

### Optional Permissions

Request additional permissions at runtime:

```typescript
const granted = await chrome.permissions.request({
  permissions: ['history']
});

if (granted) {
  // Use history API
}
```

## Service Worker Patterns

### Initialization

```typescript
// background.ts
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // First install
    initializeExtension();
  } else if (details.reason === 'update') {
    // Extension updated
    migrateData(details.previousVersion);
  }
});

chrome.runtime.onStartup.addListener(() => {
  // Browser started with extension already installed
  restoreState();
});
```

### Alarm-Based Tasks

```typescript
// Use alarms instead of setInterval for periodic tasks
chrome.alarms.create('sync', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sync') {
    performSync();
  }
});
```

### Message Passing

```typescript
// In service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getStatus') {
    sendResponse({ status: 'synced', lastSync: Date.now() });
  }
  return true; // Keep channel open for async response
});

// In popup
const response = await chrome.runtime.sendMessage({ type: 'getStatus' });
console.log(response.status);
```

## Debugging

### Service Worker DevTools

1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Service worker" link under your extension
4. Opens DevTools for service worker

### Logging Best Practices

```typescript
const DEBUG = true;

function log(...args: unknown[]) {
  if (DEBUG) {
    console.log('[BookmarkSync]', ...args);
  }
}
```

## Publishing

### Chrome Web Store Requirements

1. Create developer account ($5 one-time fee)
2. Prepare store listing:
   - 128x128 icon
   - 1280x800 or 640x400 screenshots
   - Detailed description
   - Privacy policy URL
3. Upload ZIP file (not CRX)
4. Submit for review (1-3 days typically)

### Version Updates

```json
{
  "version": "1.0.1"
}
```

Increment version for each upload. Use semantic versioning.
