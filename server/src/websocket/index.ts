/**
 * WebSocket server for real-time sync
 */

import { WebSocketServer, WebSocket } from 'ws';
import { verifyToken } from '../routes/auth.js';
import {
  getAllBookmarks,
  createBookmark,
  updateBookmark,
  deleteBookmark,
  moveBookmark,
  getSyncEventsSince,
  clearAllBookmarks,
} from '../db/bookmarks.js';
import { getSyncVersion } from '../db/users.js';
import type { ClientMessage, ServerMessage } from '@bookmark-sync/shared';

const HEARTBEAT_INTERVAL = parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000');
const CLIENT_TIMEOUT = parseInt(process.env.WS_CLIENT_TIMEOUT || '60000');

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  clientId?: string;
  isAlive: boolean;
  lastActivity: number;
}

// User connections map
const userConnections = new Map<string, Set<AuthenticatedWebSocket>>();

export function setupWebSocket(wss: WebSocketServer): void {
  // Heartbeat check
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const client = ws as AuthenticatedWebSocket;
      if (!client.isAlive) {
        console.log('[WS] Terminating inactive client');
        return client.terminate();
      }
      client.isAlive = false;
      client.ping();
    });
  }, HEARTBEAT_INTERVAL);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  wss.on('connection', (ws: AuthenticatedWebSocket) => {
    ws.isAlive = true;
    ws.lastActivity = Date.now();

    console.log('[WS] New connection');

    // Send auth required message
    sendMessage(ws, { type: 'auth_required' });

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (data) => {
      ws.lastActivity = Date.now();

      try {
        const message = JSON.parse(data.toString()) as ClientMessage;
        await handleMessage(ws, message);
      } catch (error) {
        console.error('[WS] Error handling message:', error);
        sendMessage(ws, {
          type: 'error',
          code: 'INVALID_REQUEST',
          message: 'Invalid message format',
        });
      }
    });

    ws.on('close', () => {
      console.log('[WS] Client disconnected');
      if (ws.userId) {
        const connections = userConnections.get(ws.userId);
        connections?.delete(ws);
        if (connections?.size === 0) {
          userConnections.delete(ws.userId);
        }
      }
    });

    ws.on('error', (error) => {
      console.error('[WS] Socket error:', error);
    });
  });
}

async function handleMessage(ws: AuthenticatedWebSocket, message: ClientMessage): Promise<void> {
  switch (message.type) {
    case 'auth':
      await handleAuth(ws, message.token, message.clientId);
      break;

    case 'ping':
      sendMessage(ws, { type: 'pong', timestamp: Date.now() });
      break;

    case 'sync_request':
      if (!ws.userId) {
        sendMessage(ws, { type: 'error', code: 'AUTH_REQUIRED', message: 'Not authenticated' });
        return;
      }
      await handleSyncRequest(ws, message.lastSyncVersion);
      break;

    case 'sync_clear':
      if (!ws.userId) {
        sendMessage(ws, { type: 'error', code: 'AUTH_REQUIRED', message: 'Not authenticated' });
        return;
      }
      clearAllBookmarks(ws.userId);
      console.log('[WS] Cleared all bookmarks for user:', ws.userId);
      break;

    case 'bookmark_create':
      if (!ws.userId) {
        sendMessage(ws, { type: 'error', code: 'AUTH_REQUIRED', message: 'Not authenticated' });
        return;
      }
      await handleBookmarkCreate(ws, message);
      break;

    case 'bookmark_update':
      if (!ws.userId) {
        sendMessage(ws, { type: 'error', code: 'AUTH_REQUIRED', message: 'Not authenticated' });
        return;
      }
      await handleBookmarkUpdate(ws, message);
      break;

    case 'bookmark_delete':
      if (!ws.userId) {
        sendMessage(ws, { type: 'error', code: 'AUTH_REQUIRED', message: 'Not authenticated' });
        return;
      }
      await handleBookmarkDelete(ws, message);
      break;

    case 'bookmark_move':
      if (!ws.userId) {
        sendMessage(ws, { type: 'error', code: 'AUTH_REQUIRED', message: 'Not authenticated' });
        return;
      }
      await handleBookmarkMove(ws, message);
      break;

    default:
      sendMessage(ws, { type: 'error', code: 'INVALID_REQUEST', message: 'Unknown message type' });
  }
}

async function handleAuth(ws: AuthenticatedWebSocket, token: string, clientId: string): Promise<void> {
  const payload = verifyToken(token);

  if (!payload) {
    sendMessage(ws, { type: 'auth_error', message: 'Invalid token' });
    ws.close(4001, 'Authentication failed');
    return;
  }

  ws.userId = payload.userId;
  ws.clientId = clientId;

  // Add to user connections
  if (!userConnections.has(ws.userId)) {
    userConnections.set(ws.userId, new Set());
  }
  userConnections.get(ws.userId)!.add(ws);

  sendMessage(ws, {
    type: 'auth_success',
    userId: ws.userId,
    serverTime: Date.now(),
  });

  console.log('[WS] Client authenticated:', ws.userId);
}

async function handleSyncRequest(ws: AuthenticatedWebSocket, lastSyncVersion: number): Promise<void> {
  const currentVersion = getSyncVersion(ws.userId!);

  if (lastSyncVersion === 0 || lastSyncVersion >= currentVersion) {
    // Full sync
    const bookmarks = getAllBookmarks(ws.userId!);
    sendMessage(ws, {
      type: 'sync_full',
      bookmarks,
      syncVersion: currentVersion,
    });
  } else {
    // Incremental sync
    const events = getSyncEventsSince(ws.userId!, lastSyncVersion);
    sendMessage(ws, {
      type: 'sync_incremental',
      events,
      currentVersion,
    });
  }
}

async function handleBookmarkCreate(
  ws: AuthenticatedWebSocket,
  message: Extract<ClientMessage, { type: 'bookmark_create' }>
): Promise<void> {
  try {
    const result = createBookmark(ws.userId!, message.data, ws.clientId!);

    sendMessage(ws, {
      type: 'bookmark_ack',
      requestId: message.requestId,
      id: result.bookmark.id,
      syncVersion: result.syncVersion,
    });

    // Broadcast to other clients
    broadcastToUser(ws.userId!, {
      type: 'sync_incremental',
      events: [{
        id: crypto.randomUUID(),
        type: 'create',
        bookmarkId: result.bookmark.id,
        data: result.bookmark,
        timestamp: Date.now(),
        clientId: ws.clientId!,
        syncVersion: result.syncVersion,
      }],
      currentVersion: result.syncVersion,
    }, ws.clientId);
  } catch (error) {
    sendMessage(ws, {
      type: 'error',
      requestId: message.requestId,
      code: 'SERVER_ERROR',
      message: (error as Error).message,
    });
  }
}

async function handleBookmarkUpdate(
  ws: AuthenticatedWebSocket,
  message: Extract<ClientMessage, { type: 'bookmark_update' }>
): Promise<void> {
  try {
    const result = updateBookmark(
      message.id,
      ws.userId!,
      message.data,
      message.expectedVersion,
      ws.clientId!
    );

    if ('conflict' in result) {
      sendMessage(ws, {
        type: 'conflict',
        requestId: message.requestId,
        id: message.id,
        serverVersion: result.serverVersion,
        clientVersion: message.data,
      });
      return;
    }

    sendMessage(ws, {
      type: 'bookmark_ack',
      requestId: message.requestId,
      id: result.bookmark.id,
      syncVersion: result.syncVersion,
    });

    // Broadcast to other clients
    broadcastToUser(ws.userId!, {
      type: 'sync_incremental',
      events: [{
        id: crypto.randomUUID(),
        type: 'update',
        bookmarkId: result.bookmark.id,
        data: message.data,
        timestamp: Date.now(),
        clientId: ws.clientId!,
        syncVersion: result.syncVersion,
      }],
      currentVersion: result.syncVersion,
    }, ws.clientId);
  } catch (error) {
    sendMessage(ws, {
      type: 'error',
      requestId: message.requestId,
      code: 'SERVER_ERROR',
      message: (error as Error).message,
    });
  }
}

async function handleBookmarkDelete(
  ws: AuthenticatedWebSocket,
  message: Extract<ClientMessage, { type: 'bookmark_delete' }>
): Promise<void> {
  try {
    const result = deleteBookmark(message.id, ws.userId!, message.expectedVersion, ws.clientId!);

    if ('conflict' in result) {
      sendMessage(ws, {
        type: 'conflict',
        requestId: message.requestId,
        id: message.id,
        serverVersion: result.serverVersion,
        clientVersion: {},
      });
      return;
    }

    sendMessage(ws, {
      type: 'bookmark_ack',
      requestId: message.requestId,
      id: message.id,
      syncVersion: result.syncVersion,
    });

    // Broadcast to other clients
    broadcastToUser(ws.userId!, {
      type: 'sync_incremental',
      events: [{
        id: crypto.randomUUID(),
        type: 'delete',
        bookmarkId: message.id,
        data: {},
        timestamp: Date.now(),
        clientId: ws.clientId!,
        syncVersion: result.syncVersion,
      }],
      currentVersion: result.syncVersion,
    }, ws.clientId);
  } catch (error) {
    sendMessage(ws, {
      type: 'error',
      requestId: message.requestId,
      code: 'SERVER_ERROR',
      message: (error as Error).message,
    });
  }
}

async function handleBookmarkMove(
  ws: AuthenticatedWebSocket,
  message: Extract<ClientMessage, { type: 'bookmark_move' }>
): Promise<void> {
  try {
    const result = moveBookmark(
      message.id,
      ws.userId!,
      message.newParentId || null,
      message.newIndex,
      message.expectedVersion,
      ws.clientId!
    );

    if ('conflict' in result) {
      sendMessage(ws, {
        type: 'conflict',
        requestId: message.requestId,
        id: message.id,
        serverVersion: result.serverVersion,
        clientVersion: { parentId: message.newParentId, sortOrder: message.newIndex },
      });
      return;
    }

    sendMessage(ws, {
      type: 'bookmark_ack',
      requestId: message.requestId,
      id: result.bookmark.id,
      syncVersion: result.syncVersion,
    });

    // Broadcast to other clients
    broadcastToUser(ws.userId!, {
      type: 'sync_incremental',
      events: [{
        id: crypto.randomUUID(),
        type: 'move',
        bookmarkId: result.bookmark.id,
        data: { parentId: message.newParentId, sortOrder: message.newIndex },
        timestamp: Date.now(),
        clientId: ws.clientId!,
        syncVersion: result.syncVersion,
      }],
      currentVersion: result.syncVersion,
    }, ws.clientId);
  } catch (error) {
    sendMessage(ws, {
      type: 'error',
      requestId: message.requestId,
      code: 'SERVER_ERROR',
      message: (error as Error).message,
    });
  }
}

function sendMessage(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function broadcastToUser(userId: string, message: ServerMessage, excludeClientId?: string): void {
  const connections = userConnections.get(userId);
  if (!connections) return;

  const data = JSON.stringify(message);
  connections.forEach((ws) => {
    if (ws.clientId !== excludeClientId && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}
