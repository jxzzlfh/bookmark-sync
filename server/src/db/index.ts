/**
 * Database initialization and access using sql.js
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

const DB_PATH = process.env.DATABASE_PATH || './data/bookmarks.db';

let db: SqlJsDatabase;

export function getDb(): SqlJsDatabase {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

// Save database to file
export function saveDatabase(): void {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(DB_PATH, buffer);
  }
}

export async function initDatabase(): Promise<void> {
  // Ensure data directory exists
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Initialize sql.js
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Bookmarks table
    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      parent_id TEXT,
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
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES bookmarks(id) ON DELETE SET NULL
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_parent ON bookmarks(parent_id);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_sync_version ON bookmarks(user_id, sync_version);

    -- Sync events table (for incremental sync)
    CREATE TABLE IF NOT EXISTS sync_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      bookmark_id TEXT NOT NULL,
      data TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      client_id TEXT NOT NULL,
      sync_version INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sync_events_user_version ON sync_events(user_id, sync_version);

    -- Sync version tracking
    CREATE TABLE IF NOT EXISTS sync_versions (
      user_id TEXT PRIMARY KEY,
      current_version INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Save initial database
  saveDatabase();

  console.log('Database initialized');
}

export function closeDatabase(): void {
  if (db) {
    saveDatabase();
    db.close();
  }
}
