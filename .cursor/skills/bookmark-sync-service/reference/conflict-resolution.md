# Conflict Resolution Strategies

## Overview

Conflicts occur when multiple clients modify the same bookmark before syncing. This guide covers strategies to detect and resolve conflicts.

## Conflict Detection

### Version-Based Detection

```typescript
interface VersionedBookmark {
  id: string;
  syncVersion: number;  // Incremented on each change
  // ... other fields
}

function hasConflict(
  serverVersion: number,
  clientExpectedVersion: number
): boolean {
  return serverVersion !== clientExpectedVersion;
}
```

### Timestamp-Based Detection

```typescript
interface TimestampedBookmark {
  id: string;
  dateModified: number;  // Unix timestamp in ms
  // ... other fields
}

function hasConflict(
  serverModified: number,
  clientBaseModified: number
): boolean {
  return serverModified > clientBaseModified;
}
```

## Resolution Strategies

### 1. Last-Write-Wins (LWW)

Simplest strategy: the most recent change wins.

```typescript
function resolveLWW(
  server: Bookmark,
  client: Bookmark
): Bookmark {
  return client.dateModified > server.dateModified ? client : server;
}
```

**Pros:**
- Simple to implement
- No user interaction required
- Deterministic

**Cons:**
- Data loss possible
- Clock skew can cause issues
- Doesn't consider semantic meaning

### 2. Server-Wins

Server version always takes precedence.

```typescript
function resolveServerWins(
  server: Bookmark,
  _client: Bookmark
): Bookmark {
  return server;
}
```

**Use when:**
- Server is authoritative source
- Client changes are expendable
- Simplicity is paramount

### 3. Client-Wins

Client version always takes precedence.

```typescript
function resolveClientWins(
  _server: Bookmark,
  client: Bookmark
): Bookmark {
  return {
    ...client,
    syncVersion: _server.syncVersion + 1
  };
}
```

**Use when:**
- User's local changes are critical
- Server is just a backup

### 4. Field-Level Merge (Three-Way Merge)

Merge individual fields based on what changed from common ancestor.

```typescript
interface MergeResult<T> {
  merged: T;
  hasManualConflicts: boolean;
  manualConflicts: Partial<Record<keyof T, { server: unknown; client: unknown }>>;
}

function fieldLevelMerge(
  base: Bookmark,     // Common ancestor
  server: Bookmark,   // Server's current version
  client: Bookmark    // Client's version
): MergeResult<Bookmark> {
  const merged = { ...server };
  const manualConflicts: Record<string, { server: unknown; client: unknown }> = {};
  
  const fields: (keyof Bookmark)[] = ['title', 'url', 'parentId', 'sortOrder'];
  
  for (const field of fields) {
    const baseValue = base[field];
    const serverValue = server[field];
    const clientValue = client[field];
    
    // No conflict: both same or only one changed
    if (serverValue === clientValue) {
      continue;
    }
    
    if (serverValue === baseValue && clientValue !== baseValue) {
      // Only client changed - use client value
      (merged as any)[field] = clientValue;
    } else if (clientValue === baseValue && serverValue !== baseValue) {
      // Only server changed - use server value (already in merged)
      continue;
    } else {
      // Both changed differently - conflict!
      manualConflicts[field] = {
        server: serverValue,
        client: clientValue
      };
    }
  }
  
  return {
    merged,
    hasManualConflicts: Object.keys(manualConflicts).length > 0,
    manualConflicts
  };
}
```

**Pros:**
- Minimizes data loss
- Preserves non-conflicting changes
- More intuitive for users

**Cons:**
- More complex implementation
- Requires storing base version
- Some conflicts still need manual resolution

### 5. Operational Transformation (OT)

Transform operations based on concurrent operations. Complex but powerful.

```typescript
type Operation =
  | { type: 'set_title'; value: string }
  | { type: 'set_url'; value: string }
  | { type: 'move'; parentId: string; index: number };

function transform(
  op1: Operation,  // Operation to transform
  op2: Operation   // Concurrent operation
): Operation {
  // If operations affect different fields, no transformation needed
  if (op1.type !== op2.type) {
    return op1;
  }
  
  // Both set same field - later one wins (or merge logic)
  if (op1.type === 'set_title' && op2.type === 'set_title') {
    // Could implement custom merge logic here
    return op1;
  }
  
  // Move operations need index adjustment
  if (op1.type === 'move' && op2.type === 'move') {
    // If moving to same parent, adjust index
    if (op1.parentId === op2.parentId) {
      if (op1.index > op2.index) {
        return { ...op1, index: op1.index + 1 };
      }
    }
  }
  
  return op1;
}
```

### 6. CRDT (Conflict-free Replicated Data Type)

Design data structures that automatically resolve conflicts.

```typescript
// LWW-Register CRDT for single values
interface LWWRegister<T> {
  value: T;
  timestamp: number;
  nodeId: string;  // Tiebreaker for same timestamp
}

function mergeLWWRegister<T>(
  a: LWWRegister<T>,
  b: LWWRegister<T>
): LWWRegister<T> {
  if (a.timestamp > b.timestamp) return a;
  if (b.timestamp > a.timestamp) return b;
  // Same timestamp: use nodeId as tiebreaker
  return a.nodeId > b.nodeId ? a : b;
}

// LWW-Map CRDT for bookmark
interface CRDTBookmark {
  id: string;
  title: LWWRegister<string>;
  url: LWWRegister<string | null>;
  parentId: LWWRegister<string | null>;
  sortOrder: LWWRegister<number>;
  isDeleted: LWWRegister<boolean>;
}

function mergeCRDTBookmarks(
  a: CRDTBookmark,
  b: CRDTBookmark
): CRDTBookmark {
  return {
    id: a.id,
    title: mergeLWWRegister(a.title, b.title),
    url: mergeLWWRegister(a.url, b.url),
    parentId: mergeLWWRegister(a.parentId, b.parentId),
    sortOrder: mergeLWWRegister(a.sortOrder, b.sortOrder),
    isDeleted: mergeLWWRegister(a.isDeleted, b.isDeleted),
  };
}
```

## Implementation Recommendations

### For This Project

Recommended approach: **Optimistic Locking + LWW Fallback**

```typescript
async function handleBookmarkUpdate(
  id: string,
  updates: Partial<Bookmark>,
  expectedVersion: number,
  clientTimestamp: number
): Promise<UpdateResult> {
  const server = await db.bookmarks.findById(id);
  
  if (!server) {
    throw new NotFoundError();
  }
  
  // No conflict
  if (server.syncVersion === expectedVersion) {
    return applyUpdate(server, updates);
  }
  
  // Conflict detected - use LWW
  if (clientTimestamp > server.dateModified) {
    // Client wins
    return applyUpdate(server, updates);
  }
  
  // Server wins - notify client
  return {
    type: 'conflict_resolved',
    winner: 'server',
    currentVersion: server
  };
}
```

### Conflict Notification

Always notify clients about conflict resolution:

```typescript
{
  "type": "conflict_resolved",
  "bookmarkId": "uuid",
  "resolution": "server_wins",  // or "client_wins", "merged"
  "finalVersion": { ... },
  "discardedChanges": { ... }  // What was lost
}
```

## Best Practices

1. **Store timestamps with high precision** - Use milliseconds minimum
2. **Use server time** - Don't trust client clocks
3. **Log conflicts** - For debugging and analytics
4. **Notify users** - Optionally show conflict notifications
5. **Provide undo** - Let users recover from bad resolutions
6. **Test extensively** - Simulate concurrent edits in tests

## Testing Conflict Scenarios

```typescript
describe('Conflict Resolution', () => {
  it('handles concurrent title updates', async () => {
    const bookmark = await createBookmark({ title: 'Original' });
    
    // Simulate two clients updating simultaneously
    const client1Update = updateBookmark(bookmark.id, { title: 'Client 1' }, bookmark.syncVersion);
    const client2Update = updateBookmark(bookmark.id, { title: 'Client 2' }, bookmark.syncVersion);
    
    await Promise.all([client1Update, client2Update]);
    
    const final = await getBookmark(bookmark.id);
    // Verify deterministic resolution
    expect(final.title).toBe('Client 2'); // Assuming LWW
  });
});
```
