'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, X, Folder, ExternalLink, ArrowRight } from 'lucide-react';
import Fuse from 'fuse.js';
import type { Bookmark } from '@bookmark-sync/shared';
import { cn } from '@/lib/utils';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookmarks: Bookmark[];
  onSelect: (bookmark: Bookmark) => void;
}

export function SearchModal({ isOpen, onClose, bookmarks, onSelect }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fuse.js instance for fuzzy search
  const fuse = useMemo(() => {
    return new Fuse(bookmarks, {
      keys: ['title', 'url'],
      threshold: 0.4,
      includeScore: true,
    });
  }, [bookmarks]);

  // Search results
  const results = useMemo(() => {
    if (!query.trim()) {
      // Show recent/popular when no query
      return bookmarks
        .filter((b) => !b.isFolder)
        .sort((a, b) => b.dateModified - a.dateModified)
        .slice(0, 8);
    }
    return fuse.search(query).slice(0, 10).map((r) => r.item);
  }, [query, fuse, bookmarks]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        e.preventDefault();
        onSelect(results[selectedIndex]);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, onSelect]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 glass rounded-2xl overflow-hidden glow animate-scale-in">
        {/* Search Input */}
        <div className="flex items-center gap-4 p-4 border-b border-white/10">
          <Search className="w-5 h-5 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="搜索书签..."
            className="flex-1 bg-transparent text-lg text-white placeholder:text-slate-400 outline-none"
          />
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              {query ? '没有找到匹配的书签' : '输入关键词开始搜索'}
            </div>
          ) : (
            <div className="py-2">
              {!query && (
                <p className="px-4 py-2 text-xs text-slate-500 uppercase tracking-wider">
                  最近访问
                </p>
              )}
              {results.map((bookmark, index) => (
                <SearchResultItem
                  key={bookmark.id}
                  bookmark={bookmark}
                  isSelected={index === selectedIndex}
                  onClick={() => onSelect(bookmark)}
                  onMouseEnter={() => setSelectedIndex(index)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-3 border-t border-white/10 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">↑</kbd>
            <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">↓</kbd>
            导航
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">↵</kbd>
            打开
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">esc</kbd>
            关闭
          </span>
        </div>
      </div>
    </div>
  );
}

interface SearchResultItemProps {
  bookmark: Bookmark;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

function SearchResultItem({ bookmark, isSelected, onClick, onMouseEnter }: SearchResultItemProps) {
  const domain = bookmark.url ? new URL(bookmark.url).hostname : '';
  const faviconUrl = bookmark.favicon || `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
        isSelected ? 'bg-white/10' : 'hover:bg-white/5'
      )}
    >
      {/* Icon */}
      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
        {bookmark.isFolder ? (
          <Folder className="w-4 h-4 text-amber-400" />
        ) : (
          <img
            src={faviconUrl}
            alt=""
            className="w-4 h-4 object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-white truncate">{bookmark.title}</h4>
        {bookmark.url && (
          <p className="text-xs text-slate-400 truncate">{domain}</p>
        )}
      </div>

      {/* Action icon */}
      <div className={cn('transition-opacity', isSelected ? 'opacity-100' : 'opacity-0')}>
        {bookmark.isFolder ? (
          <ArrowRight className="w-4 h-4 text-slate-400" />
        ) : (
          <ExternalLink className="w-4 h-4 text-slate-400" />
        )}
      </div>
    </button>
  );
}
