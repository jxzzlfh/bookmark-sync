---
name: bookmark-sync-service
description: Build real-time bookmark synchronization backend services. Use when implementing WebSocket sync servers, conflict resolution, bookmark data APIs, or designing sync protocols. Covers data models, sync algorithms, and deployment patterns.
---

# Bookmark Sync Service

Build reliable backend services for real-time bookmark synchronization across devices.

## Architecture Overview

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│  Browser Ext 1  │◄──────────────────►│                 │
└─────────────────┘                    │   Sync Server   │
                                       │                 │
┌─────────────────┐     WebSocket      │  ┌───────────┐  │
│  Browser Ext 2  │◄──────────────────►│  │  Session  │  │
└─────────────────┘                    │  │  Manager  │  │
                                       │  └───────────┘  │
┌─────────────────┐     REST API       │                 │
│   Nav Website   │◄──────────────────►│  ┌───────────┐  │
└─────────────────┘                    │  │ Database  │  │
                                       │  └───────────┘  │
                                       └─────────────────┘
```

## Data Model

### Bookmark Entity

```typescript
interface Bookmark {
  id: string;              // UUID v4
  userId: string;          // Owner
  parentId: string | null; // Parent folder (null = root)
  title: string;
  url: string | null;      // null for folders
  favicon: string | null;  // Favicon URL or data URI
  dateAdded: number;       // Unix timestamp ms
  dateModified: number;    // Unix timestamp ms
  isFolder: boolean;
  sortOrder: number;       // Position within parent
  syncVersion: number;     // Optimistic locking version
  isDeleted: boolean;      // Soft delete flag
  deletedAt: number | null;
}
```

### Sync Event

```typescript
interface SyncEvent {
  id: string;
  userId: string;
  type: 'create' | 'update' | 'delete' | 'move';
  bookmarkId: string;
  data: Partial<Bookmark>;
  timestamp: number;
  clientId: string;        // Origin client identifier
  syncVersion: number;
}
```

## Sync Protocol

### Connection Flow

```
Client                              Server
  │                                    │
  ├──────── WS Connect ───────────────►│
  │                                    │
  │◄─────── Auth Challenge ────────────┤
  │                                    │
  ├──────── Auth Token ───────────────►│
  │                                    │
  │◄─────── Auth Success ──────────────┤
  │                                    │
  ├──────── Request Full Sync ────────►│
  │                                    │
  │◄─────── Full Bookmark Tree ────────┤
  │                                    │
  │         [Real-time sync loop]      │
  │                                    │
  ├──────── Bookmark Change ──────────►│
  │                                    │
  │◄─────── Ack + Broadcast ───────────┤
  │                                    │
```

### Message Types

```typescript
// Client → Server
type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'sync_request'; lastSyncVersion: number }
  | { type: 'bookmark_create'; data: Omit<Bookmark, 'id' | 'syncVersion'> }
  | { type: 'bookmark_update'; id: string; data: Partial<Bookmark>; expectedVersion: number }
  | { type: 'bookmark_delete'; id: string; expectedVersion: number }
  | { type: 'bookmark_move'; id: string; newParentId: string; newIndex: number; expectedVersion: number }
  | { type: 'ping' };

// Server → Client
type ServerMessage =
  | { type: 'auth_success'; userId: string }
  | { type: 'auth_error'; message: string }
  | { type: 'sync_full'; bookmarks: Bookmark[]; syncVersion: number }
  | { type: 'sync_incremental'; events: SyncEvent[] }
  | { type: 'bookmark_ack'; id: string; syncVersion: number }
  | { type: 'conflict'; id: string; serverVersion: Bookmark; clientVersion: Partial<Bookmark> }
  | { type: 'pong' }
  | { type: 'error'; code: string; message: string };
```

## Conflict Resolution

### Optimistic Locking

```typescript
async function updateBookmark(
  id: string,
  updates: Partial<Bookmark>,
  expectedVersion: number
): Promise<Bookmark | ConflictError> {
  const current = await db.bookmarks.findById(id);
  
  if (!current) {
    throw new NotFoundError(`Bookmark ${id} not found`);
  }
  
  if (current.syncVersion !== expectedVersion) {
    return {
      type: 'conflict',
      serverVersion: current,
      clientExpectedVersion: expectedVersion
    };
  }
  
  const updated = {
    ...current,
    ...updates,
    dateModified: Date.now(),
    syncVersion: current.syncVersion + 1
  };
  
  await db.bookmarks.update(id, updated);
  return updated;
}
```

### Last-Write-Wins (Fallback)

```typescript
function resolveConflict(
  server: Bookmark,
  client: Partial<Bookmark>,
  clientTimestamp: number
): Bookmark {
  // If client's change is newer, accept it
  if (clientTimestamp > server.dateModified) {
    return {
      ...server,
      ...client,
      dateModified: clientTimestamp,
      syncVersion: server.syncVersion + 1
    };
  }
  
  // Server version wins
  return server;
}
```

### Field-Level Merge (Advanced)

```typescript
function mergeBookmarks(
  server: Bookmark,
  client: Partial<Bookmark>,
  base: Bookmark // Common ancestor
): Bookmark {
  const merged = { ...server };
  
  for (const key of Object.keys(client) as (keyof Bookmark)[]) {
    // If client changed this field from base, and server didn't
    if (client[key] !== base[key] && server[key] === base[key]) {
      (merged as any)[key] = client[key];
    }
    // If both changed, use timestamp or prompt user
  }
  
  return merged;
}
```

## REST API Endpoints

### Authentication

```typescript
// POST /api/auth/login
interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  token: string;
  user: { id: string; email: string };
}

// POST /api/auth/register
interface RegisterRequest {
  email: string;
  password: string;
}
```

### Bookmarks

```typescript
// GET /api/bookmarks
// Returns full bookmark tree
interface GetBookmarksResponse {
  bookmarks: Bookmark[];
  syncVersion: number;
}

// POST /api/bookmarks/sync
// Batch sync endpoint for offline changes
interface SyncRequest {
  changes: SyncEvent[];
  lastSyncVersion: number;
}

interface SyncResponse {
  applied: string[];           // IDs of applied changes
  conflicts: ConflictInfo[];   // Conflicts to resolve
  serverChanges: SyncEvent[];  // Changes from other clients
  newSyncVersion: number;
}

// GET /api/bookmarks/search?q=keyword
interface SearchResponse {
  results: Bookmark[];
  total: number;
}
```

## Database Schema

### SQLite

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  parent_id TEXT REFERENCES bookmarks(id),
  title TEXT NOT NULL,
  url TEXT,
  favicon TEXT,
  date_added INTEGER NOT NULL,
  date_modified INTEGER NOT NULL,
  is_folder INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  sync_version INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_bookmarks_user ON bookmarks(user_id);
CREATE INDEX idx_bookmarks_parent ON bookmarks(parent_id);
CREATE INDEX idx_bookmarks_sync_version ON bookmarks(user_id, sync_version);

CREATE TABLE sync_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  bookmark_id TEXT NOT NULL,
  data TEXT NOT NULL,  -- JSON
  timestamp INTEGER NOT NULL,
  client_id TEXT NOT NULL,
  sync_version INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_sync_events_user_version ON sync_events(user_id, sync_version);
```

## Server Implementation

### Express + ws Setup

```typescript
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyToken } from './auth';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// REST routes
app.use('/api/auth', authRouter);
app.use('/api/bookmarks', bookmarksRouter);

// WebSocket handling
interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  clientId?: string;
  isAlive: boolean;
}

const userConnections = new Map<string, Set<AuthenticatedWebSocket>>();

wss.on('connection', (ws: AuthenticatedWebSocket) => {
  ws.isAlive = true;
  
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      await handleMessage(ws, message);
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
    }
  });
  
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
  ws.on('close', () => {
    if (ws.userId) {
      const connections = userConnections.get(ws.userId);
      connections?.delete(ws);
    }
  });
});

// Heartbeat
setInterval(() => {
  wss.clients.forEach((ws: AuthenticatedWebSocket) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Broadcast to user's other devices
function broadcastToUser(userId: string, message: unknown, excludeClient?: string) {
  const connections = userConnections.get(userId);
  if (!connections) return;
  
  const data = JSON.stringify(message);
  connections.forEach((ws) => {
    if (ws.clientId !== excludeClient && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

server.listen(3000);
```

## Deployment Considerations

### Self-Hosted (VPS)

- **Reverse proxy**: Nginx for SSL termination and WebSocket proxying
- **Process manager**: PM2 for Node.js process management
- **Database**: SQLite for simplicity, PostgreSQL for scale
- **Backups**: Automated daily database backups

### Cloudflare Workers

- Use Durable Objects for WebSocket connections
- D1 for SQLite-compatible database
- See [Cloudflare deployment guide](reference/cloudflare-deployment.md)

### Vercel

- Serverless functions for REST API
- No native WebSocket support; use polling or external service
- Vercel KV or external database

## Security Checklist

- [ ] JWT tokens with short expiry (15 min) + refresh tokens
- [ ] HTTPS/WSS only in production
- [ ] Rate limiting on all endpoints
- [ ] Input validation with Zod/Joi
- [ ] SQL injection prevention (parameterized queries)
- [ ] CORS configuration for allowed origins
- [ ] Audit logging for sensitive operations

## Additional Resources

- [Sync Protocol Specification](reference/sync-protocol.md)
- [Conflict Resolution Strategies](reference/conflict-resolution.md)
