# Bookmark Sync Protocol Specification

## Protocol Version

Current version: `1.0`

## Transport

- WebSocket for real-time bidirectional communication
- REST API for batch operations and initial sync

## Authentication

### WebSocket Authentication Flow

1. Client connects to WebSocket endpoint
2. Server sends authentication challenge
3. Client sends JWT token
4. Server validates token and associates connection with user
5. On failure, server closes connection with code 4001

```typescript
// Server challenge
{ "type": "auth_required" }

// Client response
{ "type": "auth", "token": "eyJhbG..." }

// Server success
{ "type": "auth_success", "userId": "uuid", "serverTime": 1234567890 }

// Server failure
{ "type": "auth_error", "message": "Invalid token" }
// Connection closed with code 4001
```

## Synchronization

### Initial Sync

After authentication, client requests full sync:

```typescript
// Client request
{ 
  "type": "sync_request",
  "lastSyncVersion": 0  // 0 for first sync
}

// Server response
{
  "type": "sync_full",
  "bookmarks": [...],
  "syncVersion": 42
}
```

### Incremental Sync

For subsequent syncs, request only changes since last version:

```typescript
// Client request
{ 
  "type": "sync_request",
  "lastSyncVersion": 42
}

// Server response (if changes exist)
{
  "type": "sync_incremental",
  "events": [
    {
      "id": "event-uuid",
      "type": "create",
      "bookmarkId": "bookmark-uuid",
      "data": { ... },
      "timestamp": 1234567890,
      "syncVersion": 43
    }
  ],
  "currentVersion": 45
}

// Server response (if no changes)
{
  "type": "sync_incremental",
  "events": [],
  "currentVersion": 42
}
```

## Operations

### Create Bookmark

```typescript
// Client → Server
{
  "type": "bookmark_create",
  "requestId": "req-uuid",  // For matching response
  "data": {
    "parentId": "folder-uuid",
    "title": "Example Site",
    "url": "https://example.com",
    "isFolder": false,
    "sortOrder": 0
  }
}

// Server → Client (success)
{
  "type": "bookmark_ack",
  "requestId": "req-uuid",
  "id": "new-bookmark-uuid",
  "syncVersion": 43
}

// Server → Other clients (broadcast)
{
  "type": "sync_incremental",
  "events": [{
    "type": "create",
    "bookmarkId": "new-bookmark-uuid",
    "data": { ... },
    "syncVersion": 43
  }]
}
```

### Update Bookmark

```typescript
// Client → Server
{
  "type": "bookmark_update",
  "requestId": "req-uuid",
  "id": "bookmark-uuid",
  "data": {
    "title": "Updated Title",
    "url": "https://new-url.com"
  },
  "expectedVersion": 42
}

// Server → Client (success)
{
  "type": "bookmark_ack",
  "requestId": "req-uuid",
  "id": "bookmark-uuid",
  "syncVersion": 43
}

// Server → Client (conflict)
{
  "type": "conflict",
  "requestId": "req-uuid",
  "id": "bookmark-uuid",
  "serverVersion": {
    "title": "Server Title",
    "url": "https://server-url.com",
    "syncVersion": 43
  },
  "clientVersion": {
    "title": "Updated Title",
    "url": "https://new-url.com"
  }
}
```

### Delete Bookmark

```typescript
// Client → Server
{
  "type": "bookmark_delete",
  "requestId": "req-uuid",
  "id": "bookmark-uuid",
  "expectedVersion": 42
}

// Server → Client (success)
{
  "type": "bookmark_ack",
  "requestId": "req-uuid",
  "id": "bookmark-uuid",
  "syncVersion": 43
}
```

### Move Bookmark

```typescript
// Client → Server
{
  "type": "bookmark_move",
  "requestId": "req-uuid",
  "id": "bookmark-uuid",
  "newParentId": "target-folder-uuid",
  "newIndex": 2,
  "expectedVersion": 42
}

// Server → Client (success)
{
  "type": "bookmark_ack",
  "requestId": "req-uuid",
  "id": "bookmark-uuid",
  "syncVersion": 43
}
```

## Keepalive

```typescript
// Client → Server (every 20 seconds)
{ "type": "ping", "timestamp": 1234567890 }

// Server → Client
{ "type": "pong", "timestamp": 1234567891 }
```

## Error Handling

### Error Response Format

```typescript
{
  "type": "error",
  "requestId": "req-uuid",  // If applicable
  "code": "ERROR_CODE",
  "message": "Human readable message"
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `AUTH_REQUIRED` | Not authenticated |
| `AUTH_FAILED` | Authentication failed |
| `NOT_FOUND` | Bookmark not found |
| `CONFLICT` | Version conflict |
| `INVALID_REQUEST` | Malformed request |
| `RATE_LIMITED` | Too many requests |
| `SERVER_ERROR` | Internal server error |

## Connection Close Codes

| Code | Meaning |
|------|---------|
| 1000 | Normal closure |
| 4001 | Authentication failed |
| 4002 | Session expired |
| 4003 | Rate limited |
| 4004 | Server maintenance |

## Ordering Guarantees

1. Events from the same client are processed in order
2. `syncVersion` provides total ordering across all events
3. Clients must apply events in `syncVersion` order
4. If a gap in `syncVersion` is detected, request full sync

## Offline Support

When client reconnects after being offline:

1. Send `sync_request` with last known `syncVersion`
2. Apply all events in order
3. Send queued local changes
4. Handle any conflicts

```typescript
// Reconnection flow
{
  "type": "sync_request",
  "lastSyncVersion": 42,
  "pendingChanges": [
    // Changes made while offline
    { "type": "bookmark_create", ... },
    { "type": "bookmark_update", ... }
  ]
}
```
