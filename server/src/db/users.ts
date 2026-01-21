/**
 * User database operations
 */

import { getDb, saveDatabase } from './index.js';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  created_at: number;
  updated_at: number;
}

export function createUser(email: string, passwordHash: string): User {
  const db = getDb();
  const now = Date.now();
  const id = crypto.randomUUID();

  db.run(`
    INSERT INTO users (id, email, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `, [id, email, passwordHash, now, now]);

  // Initialize sync version
  db.run(`
    INSERT INTO sync_versions (user_id, current_version)
    VALUES (?, 0)
  `, [id]);

  saveDatabase();

  return {
    id,
    email,
    password_hash: passwordHash,
    created_at: now,
    updated_at: now,
  };
}

export function findUserByEmail(email: string): User | undefined {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM users WHERE email = ?
  `);

  stmt.bind([email]);
  
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row as unknown as User;
  }
  
  stmt.free();
  return undefined;
}

export function findUserById(id: string): User | undefined {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM users WHERE id = ?
  `);

  stmt.bind([id]);
  
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row as unknown as User;
  }
  
  stmt.free();
  return undefined;
}

export function getSyncVersion(userId: string): number {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT current_version FROM sync_versions WHERE user_id = ?
  `);

  stmt.bind([userId]);
  
  if (stmt.step()) {
    const row = stmt.getAsObject() as { current_version: number };
    stmt.free();
    return row.current_version;
  }
  
  stmt.free();
  return 0;
}

export function incrementSyncVersion(userId: string): number {
  const db = getDb();
  
  // Get current version
  const current = getSyncVersion(userId);
  const newVersion = current + 1;
  
  // Update version
  db.run(`
    UPDATE sync_versions 
    SET current_version = ? 
    WHERE user_id = ?
  `, [newVersion, userId]);

  saveDatabase();
  return newVersion;
}
