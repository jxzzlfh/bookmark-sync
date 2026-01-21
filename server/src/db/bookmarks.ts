/**
 * Bookmark database operations
 */

import { getDb, saveDatabase } from './index.js';
import { incrementSyncVersion } from './users.js';
import type { Bookmark, BookmarkCreateData, SyncEvent } from '@bookmark-sync/shared';

interface DbBookmark {
  id: string;
  user_id: string;
  parent_id: string | null;
  title: string;
  url: string | null;
  favicon: string | null;
  date_added: number;
  date_modified: number;
  is_folder: number;
  sort_order: number;
  sync_version: number;
  is_deleted: number;
  deleted_at: number | null;
}

function toBookmark(row: DbBookmark): Bookmark {
  return {
    id: row.id,
    userId: row.user_id,
    parentId: row.parent_id,
    title: row.title,
    url: row.url,
    favicon: row.favicon,
    dateAdded: row.date_added,
    dateModified: row.date_modified,
    isFolder: row.is_folder === 1,
    sortOrder: row.sort_order,
    syncVersion: row.sync_version,
    isDeleted: row.is_deleted === 1,
    deletedAt: row.deleted_at,
  };
}

function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  
  if (stmt.step()) {
    const row = stmt.getAsObject() as T;
    stmt.free();
    return row;
  }
  
  stmt.free();
  return undefined;
}

function execute(sql: string, params: unknown[] = []): void {
  const db = getDb();
  db.run(sql, params);
}

export function clearAllBookmarks(userId: string): void {
  const db = getDb();
  
  // Delete all bookmarks for this user
  db.run(`DELETE FROM bookmarks WHERE user_id = ?`, [userId]);
  
  // Delete all sync events for this user
  db.run(`DELETE FROM sync_events WHERE user_id = ?`, [userId]);
  
  // Reset sync version
  db.run(`UPDATE sync_versions SET current_version = 0 WHERE user_id = ?`, [userId]);
  
  saveDatabase();
  console.log('[DB] Cleared all bookmarks for user:', userId);
}

export function getAllBookmarks(userId: string): Bookmark[] {
  const rows = queryAll<DbBookmark>(`
    SELECT * FROM bookmarks 
    WHERE user_id = ? AND is_deleted = 0
    ORDER BY sort_order
  `, [userId]);

  return rows.map(toBookmark);
}

export function getBookmarkById(id: string, userId: string): Bookmark | undefined {
  const row = queryOne<DbBookmark>(`
    SELECT * FROM bookmarks 
    WHERE id = ? AND user_id = ?
  `, [id, userId]);

  return row ? toBookmark(row) : undefined;
}

export function createBookmark(
  userId: string,
  data: BookmarkCreateData,
  clientId: string
): { bookmark: Bookmark; syncVersion: number } {
  const now = Date.now();
  const id = crypto.randomUUID();

  execute(`
    INSERT INTO bookmarks (
      id, user_id, parent_id, title, url, favicon, 
      date_added, date_modified, is_folder, sort_order, sync_version
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `, [
    id,
    userId,
    data.parentId,
    data.title,
    data.url,
    data.favicon ?? null,
    now,
    now,
    data.isFolder ? 1 : 0,
    data.sortOrder
  ]);

  // Increment global sync version
  const syncVersion = incrementSyncVersion(userId);

  // Record sync event
  recordSyncEvent(userId, 'create', id, { ...data, id }, clientId, syncVersion);

  saveDatabase();

  const bookmark = getBookmarkById(id, userId)!;
  return { bookmark, syncVersion };
}

export function updateBookmark(
  id: string,
  userId: string,
  data: Partial<Bookmark>,
  expectedVersion: number,
  clientId: string
): { bookmark: Bookmark; syncVersion: number } | { conflict: true; serverVersion: Bookmark } {
  const existing = getBookmarkById(id, userId);

  if (!existing) {
    throw new Error('Bookmark not found');
  }

  // Check for conflict
  if (existing.syncVersion !== expectedVersion) {
    return { conflict: true, serverVersion: existing };
  }

  const now = Date.now();
  const updateFields: string[] = [];
  const values: unknown[] = [];

  if (data.title !== undefined) {
    updateFields.push('title = ?');
    values.push(data.title);
  }
  if (data.url !== undefined) {
    updateFields.push('url = ?');
    values.push(data.url);
  }
  if (data.favicon !== undefined) {
    updateFields.push('favicon = ?');
    values.push(data.favicon);
  }
  if (data.sortOrder !== undefined) {
    updateFields.push('sort_order = ?');
    values.push(data.sortOrder);
  }

  updateFields.push('date_modified = ?');
  values.push(now);

  updateFields.push('sync_version = sync_version + 1');

  values.push(id, userId);
  
  execute(`
    UPDATE bookmarks 
    SET ${updateFields.join(', ')}
    WHERE id = ? AND user_id = ?
  `, values);

  // Increment global sync version
  const syncVersion = incrementSyncVersion(userId);

  // Record sync event
  recordSyncEvent(userId, 'update', id, data, clientId, syncVersion);

  saveDatabase();

  const bookmark = getBookmarkById(id, userId)!;
  return { bookmark, syncVersion };
}

export function deleteBookmark(
  id: string,
  userId: string,
  expectedVersion: number,
  clientId: string
): { success: true; syncVersion: number } | { conflict: true; serverVersion: Bookmark } {
  const existing = getBookmarkById(id, userId);

  if (!existing) {
    throw new Error('Bookmark not found');
  }

  // Check for conflict
  if (existing.syncVersion !== expectedVersion) {
    return { conflict: true, serverVersion: existing };
  }

  const now = Date.now();

  // Soft delete
  execute(`
    UPDATE bookmarks 
    SET is_deleted = 1, deleted_at = ?, date_modified = ?
    WHERE id = ? AND user_id = ?
  `, [now, now, id, userId]);

  // Increment global sync version
  const syncVersion = incrementSyncVersion(userId);

  // Record sync event
  recordSyncEvent(userId, 'delete', id, {}, clientId, syncVersion);

  saveDatabase();

  return { success: true, syncVersion };
}

export function moveBookmark(
  id: string,
  userId: string,
  newParentId: string | null,
  newIndex: number,
  expectedVersion: number,
  clientId: string
): { bookmark: Bookmark; syncVersion: number } | { conflict: true; serverVersion: Bookmark } {
  const existing = getBookmarkById(id, userId);

  if (!existing) {
    throw new Error('Bookmark not found');
  }

  // Check for conflict
  if (existing.syncVersion !== expectedVersion) {
    return { conflict: true, serverVersion: existing };
  }

  const now = Date.now();

  execute(`
    UPDATE bookmarks 
    SET parent_id = ?, sort_order = ?, date_modified = ?, sync_version = sync_version + 1
    WHERE id = ? AND user_id = ?
  `, [newParentId, newIndex, now, id, userId]);

  // Increment global sync version
  const syncVersion = incrementSyncVersion(userId);

  // Record sync event
  recordSyncEvent(userId, 'move', id, { parentId: newParentId, sortOrder: newIndex }, clientId, syncVersion);

  saveDatabase();

  const bookmark = getBookmarkById(id, userId)!;
  return { bookmark, syncVersion };
}

export function searchBookmarks(userId: string, query: string): Bookmark[] {
  const pattern = `%${query}%`;
  const rows = queryAll<DbBookmark>(`
    SELECT * FROM bookmarks 
    WHERE user_id = ? AND is_deleted = 0
      AND (title LIKE ? OR url LIKE ?)
    ORDER BY date_modified DESC
    LIMIT 100
  `, [userId, pattern, pattern]);

  return rows.map(toBookmark);
}

function recordSyncEvent(
  userId: string,
  type: SyncEvent['type'],
  bookmarkId: string,
  data: unknown,
  clientId: string,
  syncVersion: number
): void {
  execute(`
    INSERT INTO sync_events (id, user_id, type, bookmark_id, data, timestamp, client_id, sync_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    crypto.randomUUID(),
    userId,
    type,
    bookmarkId,
    JSON.stringify(data),
    Date.now(),
    clientId,
    syncVersion
  ]);
}

export function getSyncEventsSince(userId: string, sinceVersion: number): SyncEvent[] {
  const rows = queryAll<{
    id: string;
    user_id: string;
    type: string;
    bookmark_id: string;
    data: string;
    timestamp: number;
    client_id: string;
    sync_version: number;
  }>(`
    SELECT * FROM sync_events 
    WHERE user_id = ? AND sync_version > ?
    ORDER BY sync_version ASC
    LIMIT 1000
  `, [userId, sinceVersion]);

  return rows.map((row) => ({
    id: row.id,
    type: row.type as SyncEvent['type'],
    bookmarkId: row.bookmark_id,
    data: JSON.parse(row.data),
    timestamp: row.timestamp,
    clientId: row.client_id,
    syncVersion: row.sync_version,
  }));
}
