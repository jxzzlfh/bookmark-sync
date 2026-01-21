'use client';

import { useState } from 'react';
import { ChevronRight, Folder, FolderOpen, Home } from 'lucide-react';
import type { BookmarkTreeNode } from '@bookmark-sync/shared';
import { cn } from '@/lib/utils';

interface SidebarProps {
  folders: BookmarkTreeNode[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  isOpen: boolean;
}

export function Sidebar({ folders, selectedId, onSelect, isOpen }: SidebarProps) {
  return (
    <aside
      className={cn(
        'fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 overflow-y-auto transition-transform duration-300 z-40',
        'bg-background-secondary/80 backdrop-blur-lg border-r border-[var(--border)]',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      <div className="p-4">
        {/* Home button */}
        <button
          onClick={() => onSelect(null)}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all mb-2',
            selectedId === null
              ? 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-foreground border border-[var(--border)]'
              : 'hover:bg-[var(--card-hover)] text-foreground-secondary'
          )}
        >
          <Home className="w-4 h-4" />
          <span className="text-sm font-medium">全部书签</span>
        </button>

        {/* Divider */}
        <div className="h-px bg-[var(--border)] my-4" />

        {/* Folder list */}
        <div className="space-y-1">
          <p className="px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
            文件夹
          </p>
          {folders.map((folder) => (
            <FolderItem
              key={folder.id}
              folder={folder}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={0}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

interface FolderItemProps {
  folder: BookmarkTreeNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth: number;
}

function FolderItem({ folder, selectedId, onSelect, depth }: FolderItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = folder.children && folder.children.length > 0;
  const isSelected = selectedId === folder.id;

  return (
    <div>
      <button
        onClick={() => {
          onSelect(folder.id);
          if (hasChildren) {
            setIsExpanded(!isExpanded);
          }
        }}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-all text-left',
          isSelected
            ? 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-foreground border border-[var(--border)]'
            : 'hover:bg-[var(--card-hover)] text-foreground-secondary'
        )}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {hasChildren && (
          <ChevronRight
            className={cn(
              'w-3 h-3 text-slate-500 transition-transform',
              isExpanded && 'rotate-90'
            )}
          />
        )}
        {!hasChildren && <span className="w-3" />}
        
        {isExpanded || isSelected ? (
          <FolderOpen className="w-4 h-4 text-blue-400" />
        ) : (
          <Folder className="w-4 h-4 text-slate-400" />
        )}
        
        <span className="text-sm truncate flex-1">{folder.title}</span>
        
        {folder.children && folder.children.length > 0 && (
          <span className="text-xs text-slate-500">
            {folder.children.length}
          </span>
        )}
      </button>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div className="mt-1">
          {folder.children!.map((child) => (
            <FolderItem
              key={child.id}
              folder={child}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
