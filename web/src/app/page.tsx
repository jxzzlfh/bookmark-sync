'use client';

import { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { BookmarkGrid } from '@/components/BookmarkGrid';
import { SearchModal } from '@/components/SearchModal';
import { EmptyState } from '@/components/EmptyState';
import { AuthModal } from '@/components/AuthModal';
import { useBookmarks } from '@/hooks/useBookmarks';
import { useTheme } from '@/hooks/useTheme';
import type { BookmarkTreeNode } from '@bookmark-sync/shared';

// 需要隐藏的文件夹名称
const HIDDEN_FOLDERS = ['其他书签', 'Other Bookmarks', 'Other bookmarks'];

// 书签栏的名称（首页直接展示其内容）
const BOOKMARK_BAR_NAMES = ['书签栏', 'Bookmarks Bar', 'Bookmarks bar'];

export default function Home() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { bookmarks, isLoading, error, refresh } = useBookmarks();
  const { theme, setTheme } = useTheme();

  // Check login status on mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    setIsLoggedIn(!!token);
  }, []);

  function handleLogout() {
    localStorage.removeItem('auth_token');
    setIsLoggedIn(false);
    refresh();
  }

  function handleLoginSuccess(_token: string) {
    setIsLoggedIn(true);
    refresh();
  }

  // Keyboard shortcut for search (Ctrl+0)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Find the bookmark bar folder ID
  const bookmarkBarId = useMemo(() => {
    const bookmarkBar = bookmarks.find(b => 
      b.isFolder && BOOKMARK_BAR_NAMES.includes(b.title) && b.parentId === null
    );
    return bookmarkBar?.id || null;
  }, [bookmarks]);

  // Filter out hidden folders
  const filteredBookmarks = useMemo(() => {
    // Get IDs of hidden folders
    const hiddenFolderIds = new Set<string>();
    
    function markHiddenRecursively(parentId: string) {
      bookmarks.forEach(b => {
        if (b.parentId === parentId) {
          hiddenFolderIds.add(b.id);
          if (b.isFolder) {
            markHiddenRecursively(b.id);
          }
        }
      });
    }

    // Find hidden folders and all their children
    bookmarks.forEach(b => {
      if (b.isFolder && HIDDEN_FOLDERS.includes(b.title)) {
        hiddenFolderIds.add(b.id);
        markHiddenRecursively(b.id);
      }
    });

    // Also hide the bookmark bar folder itself (but not its contents)
    if (bookmarkBarId) {
      hiddenFolderIds.add(bookmarkBarId);
    }

    return bookmarks.filter(b => !hiddenFolderIds.has(b.id) && !HIDDEN_FOLDERS.includes(b.title));
  }, [bookmarks, bookmarkBarId]);

  // Get current folder's bookmarks with custom sorting
  const currentBookmarks = useMemo(() => {
    if (!filteredBookmarks.length) return [];

    let items;
    if (!selectedFolderId) {
      // Homepage: show contents of bookmark bar directly
      if (bookmarkBarId) {
        items = filteredBookmarks.filter((b) => b.parentId === bookmarkBarId);
      } else {
        // Fallback: show root level items
        items = filteredBookmarks.filter((b) => b.parentId === null);
      }
    } else {
      // Items in selected folder
      items = filteredBookmarks.filter((b) => b.parentId === selectedFolderId);
    }

    // Separate folders and bookmarks
    const folders = items.filter(b => b.isFolder);
    const links = items.filter(b => !b.isFolder);

    // Homepage: links at top (reverse order), folders below (reverse order)
    // Inside folder: folders at top (reverse order), links below (normal order)
    if (!selectedFolderId) {
      // Homepage: Links first, then folders, both in reverse order
      folders.sort((a, b) => b.sortOrder - a.sortOrder);
      links.sort((a, b) => b.sortOrder - a.sortOrder);
      return [...links, ...folders];
    } else {
      // Inside folder: folders first (reverse), links second (normal)
      folders.sort((a, b) => b.sortOrder - a.sortOrder);
      links.sort((a, b) => a.sortOrder - b.sortOrder);
      return [...folders, ...links];
    }
  }, [filteredBookmarks, selectedFolderId, bookmarkBarId]);

  // Get folder tree for sidebar (reverse order)
  // Start from bookmark bar contents, not root
  const folderTree = useMemo(() => {
    const folders = filteredBookmarks.filter((b) => b.isFolder);
    
    function buildTree(parentId: string | null): BookmarkTreeNode[] {
      return folders
        .filter((f) => f.parentId === parentId)
        .map((f) => ({
          ...f,
          children: buildTree(f.id),
        }))
        .sort((a, b) => b.sortOrder - a.sortOrder); // Reverse order
    }

    // Start from bookmark bar contents if exists
    const startId = bookmarkBarId || null;
    return buildTree(startId);
  }, [filteredBookmarks, bookmarkBarId]);

  // Get current folder info
  const currentFolder = useMemo(() => {
    if (!selectedFolderId) return null;
    return filteredBookmarks.find((b) => b.id === selectedFolderId);
  }, [filteredBookmarks, selectedFolderId]);

  // Get breadcrumb path
  const breadcrumbs = useMemo(() => {
    if (!selectedFolderId) return [];

    const path: typeof filteredBookmarks = [];
    let current = filteredBookmarks.find((b) => b.id === selectedFolderId);

    while (current) {
      path.unshift(current);
      current = current.parentId ? filteredBookmarks.find((b) => b.id === current!.parentId) : undefined;
    }

    return path;
  }, [filteredBookmarks, selectedFolderId]);

  return (
    <div className="min-h-screen noise">
      {/* Header */}
      <Header
        onSearchClick={() => setSearchOpen(true)}
        onMenuClick={() => setSidebarOpen(!sidebarOpen)}
        onRefresh={refresh}
        onLoginClick={() => setAuthOpen(true)}
        onLogout={handleLogout}
        isLoading={isLoading}
        isLoggedIn={isLoggedIn}
        theme={theme}
        onThemeChange={setTheme}
      />

      <div className="flex">
        {/* Sidebar */}
        <Sidebar
          folders={folderTree}
          selectedId={selectedFolderId}
          onSelect={setSelectedFolderId}
          isOpen={sidebarOpen}
        />

        {/* Main Content */}
        <main className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
          <div className="p-6 lg:p-8">
            {/* Breadcrumbs */}
            {breadcrumbs.length > 0 && (
              <nav className="mb-6">
                <ol className="flex items-center gap-2 text-sm">
                  <li>
                    <button
                      onClick={() => setSelectedFolderId(null)}
                      className="text-slate-400 hover:text-white dark:hover:text-white transition-colors"
                    >
                      首页
                    </button>
                  </li>
                  {breadcrumbs.map((folder, index) => (
                    <li key={folder.id} className="flex items-center gap-2">
                      <span className="text-slate-600">/</span>
                      <button
                        onClick={() => setSelectedFolderId(folder.id)}
                        className={`transition-colors ${
                          index === breadcrumbs.length - 1
                            ? 'text-foreground font-medium'
                            : 'text-slate-400 hover:text-foreground'
                        }`}
                      >
                        {folder.title}
                      </button>
                    </li>
                  ))}
                </ol>
              </nav>
            )}

            {/* Page Title */}
            <div className="mb-8">
              <h1 className="text-3xl font-display font-bold gradient-text mb-2">
                {currentFolder?.title || '我的书签'}
              </h1>
              <p className="text-slate-400">
                {currentBookmarks.length} 个项目
              </p>
            </div>

            {/* Content */}
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="w-12 h-12 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : error ? (
              <div className="glass rounded-2xl p-8 text-center">
                <p className="text-red-400 mb-4">加载失败: {error}</p>
                <button
                  onClick={refresh}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
                >
                  重试
                </button>
              </div>
            ) : currentBookmarks.length === 0 ? (
              <EmptyState
                title={selectedFolderId ? '此文件夹为空' : '还没有书签'}
                description={selectedFolderId ? '这个文件夹中没有任何书签' : '安装浏览器扩展开始同步你的书签'}
              />
            ) : (
              <BookmarkGrid
                bookmarks={currentBookmarks}
                onFolderClick={(id) => setSelectedFolderId(id)}
                linksFirst={!selectedFolderId}
              />
            )}
          </div>
        </main>
      </div>

      {/* Search Modal */}
      <SearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        bookmarks={filteredBookmarks}
        onSelect={(bookmark) => {
          if (bookmark.isFolder) {
            setSelectedFolderId(bookmark.id);
          } else if (bookmark.url) {
            window.open(bookmark.url, '_blank');
          }
          setSearchOpen(false);
        }}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={handleLoginSuccess}
      />
    </div>
  );
}
