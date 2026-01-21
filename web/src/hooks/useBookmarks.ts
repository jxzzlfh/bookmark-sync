'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Bookmark } from '@bookmark-sync/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Demo data for development/testing
const DEMO_BOOKMARKS: Bookmark[] = [
  {
    id: '1',
    userId: 'demo',
    parentId: null,
    title: '工作',
    url: null,
    favicon: null,
    dateAdded: Date.now(),
    dateModified: Date.now(),
    isFolder: true,
    sortOrder: 0,
    syncVersion: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: '2',
    userId: 'demo',
    parentId: null,
    title: '学习资料',
    url: null,
    favicon: null,
    dateAdded: Date.now(),
    dateModified: Date.now(),
    isFolder: true,
    sortOrder: 1,
    syncVersion: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: '3',
    userId: 'demo',
    parentId: null,
    title: '娱乐',
    url: null,
    favicon: null,
    dateAdded: Date.now(),
    dateModified: Date.now(),
    isFolder: true,
    sortOrder: 2,
    syncVersion: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: '4',
    userId: 'demo',
    parentId: '1',
    title: 'GitHub',
    url: 'https://github.com',
    favicon: 'https://github.com/favicon.ico',
    dateAdded: Date.now(),
    dateModified: Date.now(),
    isFolder: false,
    sortOrder: 0,
    syncVersion: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: '5',
    userId: 'demo',
    parentId: '1',
    title: 'Vercel',
    url: 'https://vercel.com',
    favicon: 'https://vercel.com/favicon.ico',
    dateAdded: Date.now(),
    dateModified: Date.now(),
    isFolder: false,
    sortOrder: 1,
    syncVersion: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: '6',
    userId: 'demo',
    parentId: '2',
    title: 'MDN Web Docs',
    url: 'https://developer.mozilla.org',
    favicon: 'https://developer.mozilla.org/favicon.ico',
    dateAdded: Date.now(),
    dateModified: Date.now(),
    isFolder: false,
    sortOrder: 0,
    syncVersion: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: '7',
    userId: 'demo',
    parentId: '2',
    title: 'React Documentation',
    url: 'https://react.dev',
    favicon: 'https://react.dev/favicon.ico',
    dateAdded: Date.now(),
    dateModified: Date.now(),
    isFolder: false,
    sortOrder: 1,
    syncVersion: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: '8',
    userId: 'demo',
    parentId: '2',
    title: 'TypeScript Handbook',
    url: 'https://www.typescriptlang.org/docs/',
    favicon: 'https://www.typescriptlang.org/favicon.ico',
    dateAdded: Date.now(),
    dateModified: Date.now(),
    isFolder: false,
    sortOrder: 2,
    syncVersion: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: '9',
    userId: 'demo',
    parentId: '3',
    title: 'YouTube',
    url: 'https://youtube.com',
    favicon: 'https://youtube.com/favicon.ico',
    dateAdded: Date.now(),
    dateModified: Date.now(),
    isFolder: false,
    sortOrder: 0,
    syncVersion: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: '10',
    userId: 'demo',
    parentId: '3',
    title: 'Bilibili',
    url: 'https://bilibili.com',
    favicon: 'https://bilibili.com/favicon.ico',
    dateAdded: Date.now(),
    dateModified: Date.now(),
    isFolder: false,
    sortOrder: 1,
    syncVersion: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: '11',
    userId: 'demo',
    parentId: null,
    title: 'Google',
    url: 'https://google.com',
    favicon: 'https://google.com/favicon.ico',
    dateAdded: Date.now(),
    dateModified: Date.now(),
    isFolder: false,
    sortOrder: 3,
    syncVersion: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: '12',
    userId: 'demo',
    parentId: null,
    title: 'OpenAI',
    url: 'https://openai.com',
    favicon: 'https://openai.com/favicon.ico',
    dateAdded: Date.now(),
    dateModified: Date.now(),
    isFolder: false,
    sortOrder: 4,
    syncVersion: 1,
    isDeleted: false,
    deletedAt: null,
  },
];

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBookmarks = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Try to fetch from API
      const token = localStorage.getItem('auth_token');
      
      if (!token) {
        // Use demo data if not authenticated
        setBookmarks(DEMO_BOOKMARKS);
        return;
      }

      const response = await fetch(`${API_URL}/api/bookmarks`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, use demo data
          localStorage.removeItem('auth_token');
          setBookmarks(DEMO_BOOKMARKS);
          return;
        }
        throw new Error('Failed to fetch bookmarks');
      }

      const data = await response.json();
      setBookmarks(data.bookmarks);
    } catch (e) {
      console.error('Failed to fetch bookmarks:', e);
      // Fall back to demo data
      setBookmarks(DEMO_BOOKMARKS);
      setError(null); // Don't show error for demo mode
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  return {
    bookmarks,
    isLoading,
    error,
    refresh: fetchBookmarks,
  };
}
