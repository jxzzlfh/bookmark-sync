/**
 * Bookmarks REST API routes
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from './auth.js';
import {
  getAllBookmarks,
  getBookmarkById,
  createBookmark,
  updateBookmark,
  deleteBookmark,
  searchBookmarks,
  clearAllBookmarks,
  moveBookmark,
} from '../db/bookmarks.js';
import { getSyncVersion } from '../db/users.js';

const router: Router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get all bookmarks
router.get('/', (req: any, res) => {
  try {
    const bookmarks = getAllBookmarks(req.userId);
    const syncVersion = getSyncVersion(req.userId);
    res.json({ bookmarks, syncVersion });
  } catch (error) {
    console.error('Get bookmarks error:', error);
    res.status(500).json({ error: 'Failed to get bookmarks' });
  }
});

// Clear all bookmarks (for full sync)
router.post('/clear', (req: any, res) => {
  try {
    clearAllBookmarks(req.userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Clear bookmarks error:', error);
    res.status(500).json({ error: 'Failed to clear bookmarks' });
  }
});

// Batch create bookmarks (for optimized sync)
const batchCreateSchema = z.object({
  bookmarks: z.array(z.object({
    localId: z.string().optional(),
    parentId: z.string().nullable(),
    title: z.string(),
    url: z.string().nullable(),
    isFolder: z.boolean(),
    sortOrder: z.number().int(),
    favicon: z.string().nullable().optional(),
  })),
});

router.post('/batch', (req: any, res) => {
  try {
    const data = batchCreateSchema.parse(req.body);
    const results: Array<{ id: string; localId?: string }> = [];
    
    for (const bookmark of data.bookmarks) {
      const result = createBookmark(req.userId, {
        parentId: bookmark.parentId,
        title: bookmark.title || '(无标题)',
        url: bookmark.url,
        isFolder: bookmark.isFolder,
        sortOrder: bookmark.sortOrder,
        favicon: bookmark.favicon,
      }, 'api');
      
      results.push({
        id: result.bookmark.id,
        localId: bookmark.localId,
      });
    }
    
    res.status(201).json({ bookmarks: results, count: results.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Batch create error:', error);
    res.status(500).json({ error: 'Failed to create bookmarks' });
  }
});

// Search bookmarks
router.get('/search', (req: any, res) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }

    const results = searchBookmarks(req.userId, query);
    res.json({ results, total: results.length });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get single bookmark
router.get('/:id', (req: any, res) => {
  try {
    const bookmark = getBookmarkById(req.params.id, req.userId);
    if (!bookmark) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }
    res.json(bookmark);
  } catch (error) {
    console.error('Get bookmark error:', error);
    res.status(500).json({ error: 'Failed to get bookmark' });
  }
});

const createSchema = z.object({
  localId: z.string().optional(),
  parentId: z.string().nullable(),
  title: z.string(),
  url: z.string().nullable(),
  isFolder: z.boolean(),
  sortOrder: z.number().int(),
  favicon: z.string().nullable().optional(),
});

// Create bookmark
router.post('/', (req: any, res) => {
  try {
    const data = createSchema.parse(req.body);
    const result = createBookmark(req.userId, {
      parentId: data.parentId,
      title: data.title || '(无标题)',
      url: data.url,
      isFolder: data.isFolder,
      sortOrder: data.sortOrder,
      favicon: data.favicon,
    }, 'api');
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Create bookmark error:', error);
    res.status(500).json({ error: 'Failed to create bookmark' });
  }
});

const updateSchema = z.object({
  title: z.string().optional(),
  url: z.string().nullable().optional(),
  favicon: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  expectedVersion: z.number().int().optional(),
});

// Update bookmark (PUT for REST compatibility)
router.put('/:id', (req: any, res) => {
  try {
    const data = updateSchema.parse(req.body);
    const expectedVersion = data.expectedVersion ?? 0;
    const result = updateBookmark(req.params.id, req.userId, data, expectedVersion, 'api');

    if ('conflict' in result) {
      // For simple sync, just return success anyway
      res.json({ success: true });
      return;
    }

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    if ((error as Error).message === 'Bookmark not found') {
      return res.status(404).json({ error: 'Bookmark not found' });
    }
    console.error('Update bookmark error:', error);
    res.status(500).json({ error: 'Failed to update bookmark' });
  }
});

// Update bookmark (PATCH)
router.patch('/:id', (req: any, res) => {
  try {
    const data = updateSchema.parse(req.body);
    const expectedVersion = data.expectedVersion ?? 0;
    const result = updateBookmark(req.params.id, req.userId, data, expectedVersion, 'api');

    if ('conflict' in result) {
      res.json({ success: true });
      return;
    }

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    if ((error as Error).message === 'Bookmark not found') {
      return res.status(404).json({ error: 'Bookmark not found' });
    }
    console.error('Update bookmark error:', error);
    res.status(500).json({ error: 'Failed to update bookmark' });
  }
});

// Move bookmark
router.put('/:id/move', (req: any, res) => {
  try {
    const { parentId, sortOrder } = req.body;
    const result = moveBookmark(req.params.id, req.userId, parentId, sortOrder ?? 0, 0, 'api');
    
    if ('conflict' in result) {
      res.json({ success: true });
      return;
    }
    
    res.json(result);
  } catch (error) {
    if ((error as Error).message === 'Bookmark not found') {
      return res.status(404).json({ error: 'Bookmark not found' });
    }
    console.error('Move bookmark error:', error);
    res.status(500).json({ error: 'Failed to move bookmark' });
  }
});

// Delete bookmark
router.delete('/:id', (req: any, res) => {
  try {
    const expectedVersion = parseInt(req.query.expectedVersion as string) || 0;
    const result = deleteBookmark(req.params.id, req.userId, expectedVersion, 'api');

    if ('conflict' in result) {
      res.json({ success: true });
      return;
    }

    res.json(result);
  } catch (error) {
    if ((error as Error).message === 'Bookmark not found') {
      // Already deleted, return success
      return res.json({ success: true });
    }
    console.error('Delete bookmark error:', error);
    res.status(500).json({ error: 'Failed to delete bookmark' });
  }
});

export { router as bookmarksRouter };
