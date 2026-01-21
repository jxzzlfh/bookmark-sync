// Shared types and utilities for bookmark-sync project

// ============ Data Models ============

export interface Bookmark {
  id: string;
  userId: string;
  parentId: string | null;
  title: string;
  url: string | null;
  favicon: string | null;
  dateAdded: number;
  dateModified: number;
  isFolder: boolean;
  sortOrder: number;
  syncVersion: number;
  isDeleted: boolean;
  deletedAt: number | null;
}

export interface BookmarkTreeNode extends Bookmark {
  children?: BookmarkTreeNode[];
}

export interface User {
  id: string;
  email: string;
  createdAt: number;
  updatedAt: number;
}

// ============ Sync Protocol Messages ============

// Client -> Server
export type ClientMessage =
  | { type: 'auth'; token: string; clientId: string }
  | { type: 'sync_request'; lastSyncVersion: number }
  | { type: 'sync_clear' }  // Clear all bookmarks for this user (for one-way sync)
  | { type: 'bookmark_create'; requestId: string; data: BookmarkCreateData }
  | { type: 'bookmark_update'; requestId: string; id: string; data: Partial<Bookmark>; expectedVersion: number }
  | { type: 'bookmark_delete'; requestId: string; id: string; expectedVersion: number }
  | { type: 'bookmark_move'; requestId: string; id: string; newParentId: string; newIndex: number; expectedVersion: number }
  | { type: 'ping'; timestamp: number };

// Server -> Client
export type ServerMessage =
  | { type: 'auth_required' }
  | { type: 'auth_success'; userId: string; serverTime: number }
  | { type: 'auth_error'; message: string }
  | { type: 'sync_full'; bookmarks: Bookmark[]; syncVersion: number }
  | { type: 'sync_incremental'; events: SyncEvent[]; currentVersion: number }
  | { type: 'bookmark_ack'; requestId: string; id: string; syncVersion: number }
  | { type: 'conflict'; requestId: string; id: string; serverVersion: Bookmark; clientVersion: Partial<Bookmark> }
  | { type: 'pong'; timestamp: number }
  | { type: 'error'; requestId?: string; code: ErrorCode; message: string };

export interface BookmarkCreateData {
  parentId: string | null;
  title: string;
  url: string | null;
  isFolder: boolean;
  sortOrder: number;
  favicon?: string | null;
}

export interface SyncEvent {
  id: string;
  type: 'create' | 'update' | 'delete' | 'move';
  bookmarkId: string;
  data: Partial<Bookmark>;
  timestamp: number;
  clientId: string;
  syncVersion: number;
}

export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_REQUEST'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR';

// ============ API Types ============

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: Pick<User, 'id' | 'email'>;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface GetBookmarksResponse {
  bookmarks: Bookmark[];
  syncVersion: number;
}

export interface SearchRequest {
  query: string;
  limit?: number;
  offset?: number;
}

export interface SearchResponse {
  results: Bookmark[];
  total: number;
}

// ============ Utilities ============

export function generateId(): string {
  return crypto.randomUUID();
}

export function buildBookmarkTree(bookmarks: Bookmark[]): BookmarkTreeNode[] {
  const bookmarkMap = new Map<string, BookmarkTreeNode>();
  const rootNodes: BookmarkTreeNode[] = [];

  // First pass: create nodes
  for (const bookmark of bookmarks) {
    bookmarkMap.set(bookmark.id, { ...bookmark, children: bookmark.isFolder ? [] : undefined });
  }

  // Second pass: build tree
  for (const bookmark of bookmarks) {
    const node = bookmarkMap.get(bookmark.id)!;
    if (bookmark.parentId === null) {
      rootNodes.push(node);
    } else {
      const parent = bookmarkMap.get(bookmark.parentId);
      if (parent && parent.children) {
        parent.children.push(node);
      } else {
        // Orphan node, add to root
        rootNodes.push(node);
      }
    }
  }

  // Sort children by sortOrder
  function sortChildren(nodes: BookmarkTreeNode[]) {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const node of nodes) {
      if (node.children) {
        sortChildren(node.children);
      }
    }
  }

  sortChildren(rootNodes);
  return rootNodes;
}

export function flattenBookmarkTree(tree: BookmarkTreeNode[]): Bookmark[] {
  const result: Bookmark[] = [];

  function traverse(nodes: BookmarkTreeNode[]) {
    for (const node of nodes) {
      const { children, ...bookmark } = node;
      result.push(bookmark);
      if (children) {
        traverse(children);
      }
    }
  }

  traverse(tree);
  return result;
}

export function searchBookmarks(bookmarks: Bookmark[], query: string): Bookmark[] {
  const lowerQuery = query.toLowerCase();
  return bookmarks.filter(
    (b) =>
      !b.isDeleted &&
      (b.title.toLowerCase().includes(lowerQuery) ||
        (b.url && b.url.toLowerCase().includes(lowerQuery)))
  );
}
