/**
 * API tests for the bookmark sync server
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const API_URL = 'http://localhost:3000';

let authToken: string;
let userId: string;

describe('Auth API', () => {
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'testpassword123';

  it('should register a new user', async () => {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.token).toBeDefined();
    expect(data.user.email).toBe(testEmail);
    
    authToken = data.token;
    userId = data.user.id;
  });

  it('should not register with existing email', async () => {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });

    expect(response.status).toBe(400);
  });

  it('should login with correct credentials', async () => {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.token).toBeDefined();
    
    authToken = data.token;
  });

  it('should not login with wrong password', async () => {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'wrongpassword' }),
    });

    expect(response.status).toBe(401);
  });
});

describe('Bookmarks API', () => {
  let bookmarkId: string;
  let folderId: string;

  it('should require authentication', async () => {
    const response = await fetch(`${API_URL}/api/bookmarks`);
    expect(response.status).toBe(401);
  });

  it('should get empty bookmarks list', async () => {
    const response = await fetch(`${API_URL}/api/bookmarks`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.bookmarks).toEqual([]);
    expect(data.syncVersion).toBe(0);
  });

  it('should create a folder', async () => {
    const response = await fetch(`${API_URL}/api/bookmarks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        parentId: null,
        title: 'Test Folder',
        url: null,
        isFolder: true,
        sortOrder: 0,
      }),
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.bookmark.title).toBe('Test Folder');
    expect(data.bookmark.isFolder).toBe(true);
    
    folderId = data.bookmark.id;
  });

  it('should create a bookmark', async () => {
    const response = await fetch(`${API_URL}/api/bookmarks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        parentId: folderId,
        title: 'Test Bookmark',
        url: 'https://example.com',
        isFolder: false,
        sortOrder: 0,
      }),
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.bookmark.title).toBe('Test Bookmark');
    expect(data.bookmark.url).toBe('https://example.com');
    
    bookmarkId = data.bookmark.id;
  });

  it('should get bookmarks list with created items', async () => {
    const response = await fetch(`${API_URL}/api/bookmarks`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.bookmarks.length).toBe(2);
  });

  it('should update a bookmark', async () => {
    const response = await fetch(`${API_URL}/api/bookmarks/${bookmarkId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        title: 'Updated Bookmark',
        expectedVersion: 1,
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.bookmark.title).toBe('Updated Bookmark');
  });

  it('should detect version conflict', async () => {
    const response = await fetch(`${API_URL}/api/bookmarks/${bookmarkId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        title: 'Another Update',
        expectedVersion: 1, // Wrong version
      }),
    });

    expect(response.status).toBe(409);
  });

  it('should search bookmarks', async () => {
    const response = await fetch(`${API_URL}/api/bookmarks/search?q=Updated`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results.length).toBeGreaterThan(0);
    expect(data.results[0].title).toContain('Updated');
  });

  it('should delete a bookmark', async () => {
    const response = await fetch(`${API_URL}/api/bookmarks/${bookmarkId}?expectedVersion=2`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(response.status).toBe(200);
  });
});

describe('Health Check', () => {
  it('should return healthy status', async () => {
    const response = await fetch(`${API_URL}/health`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('ok');
  });
});
