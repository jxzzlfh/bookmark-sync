'use client';

import { Folder, ExternalLink, Globe } from 'lucide-react';
import type { Bookmark } from '@bookmark-sync/shared';
import { cn } from '@/lib/utils';

interface BookmarkGridProps {
  bookmarks: Bookmark[];
  onFolderClick: (id: string) => void;
  linksFirst?: boolean;
}

export function BookmarkGrid({ bookmarks, onFolderClick, linksFirst = false }: BookmarkGridProps) {
  // Separate folders and bookmarks
  const folders = bookmarks.filter((b) => b.isFolder);
  const links = bookmarks.filter((b) => !b.isFolder);

  const FoldersSection = folders.length > 0 && (
    <section>
      <h2 className="text-sm font-medium text-foreground-secondary mb-4 flex items-center gap-2">
        <Folder className="w-4 h-4" />
        文件夹
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {folders.map((folder) => (
          <FolderCard
            key={folder.id}
            folder={folder}
            onClick={() => onFolderClick(folder.id)}
          />
        ))}
      </div>
    </section>
  );

  const LinksSection = links.length > 0 && (
    <section>
      <h2 className="text-sm font-medium text-foreground-secondary mb-4 flex items-center gap-2">
        <Globe className="w-4 h-4" />
        书签
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {links.map((bookmark) => (
          <BookmarkCard key={bookmark.id} bookmark={bookmark} />
        ))}
      </div>
    </section>
  );

  return (
    <div className="space-y-8">
      {linksFirst ? (
        <>
          {LinksSection}
          {FoldersSection}
        </>
      ) : (
        <>
          {FoldersSection}
          {LinksSection}
        </>
      )}
    </div>
  );
}

interface FolderCardProps {
  folder: Bookmark;
  onClick: () => void;
}

function FolderCard({ folder, onClick }: FolderCardProps) {
  return (
    <button
      onClick={onClick}
      className="group card rounded-2xl p-4 text-left transition-all duration-300 hover:scale-[1.02]"
    >
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
        <Folder className="w-6 h-6 text-amber-500" />
      </div>
      <h3 className="font-medium text-foreground truncate mb-1">{folder.title}</h3>
      <p className="text-xs text-foreground-secondary">点击查看</p>
    </button>
  );
}

interface BookmarkCardProps {
  bookmark: Bookmark;
}

function BookmarkCard({ bookmark }: BookmarkCardProps) {
  const domain = bookmark.url ? new URL(bookmark.url).hostname : '';
  const faviconUrl = bookmark.favicon || `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  return (
    <a
      href={bookmark.url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="group card rounded-2xl p-4 transition-all duration-300 hover:scale-[1.02] block relative overflow-hidden"
    >
      <div className="flex items-start gap-3">
        {/* Favicon */}
        <div className="w-10 h-10 rounded-xl bg-[var(--card-hover)] flex items-center justify-center flex-shrink-0 overflow-hidden">
          <img
            src={faviconUrl}
            alt=""
            className="w-6 h-6 object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '';
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-foreground truncate group-hover:text-blue-500 transition-colors flex items-center gap-2">
            {bookmark.title}
            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </h3>
          <p className="text-xs text-foreground-secondary truncate mt-1">{domain}</p>
        </div>
      </div>

      {/* Hover gradient line */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left rounded-b-2xl" />
    </a>
  );
}
