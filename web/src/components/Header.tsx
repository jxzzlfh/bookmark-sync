'use client';

import { Menu, Search, RefreshCw, BookmarkIcon, LogIn, LogOut, Sun, Moon, Monitor } from 'lucide-react';
import type { Theme } from '@/hooks/useTheme';

interface HeaderProps {
  onSearchClick: () => void;
  onMenuClick: () => void;
  onRefresh: () => void;
  onLoginClick: () => void;
  onLogout: () => void;
  isLoading: boolean;
  isLoggedIn: boolean;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

export function Header({ 
  onSearchClick, 
  onMenuClick, 
  onRefresh, 
  onLoginClick, 
  onLogout, 
  isLoading, 
  isLoggedIn,
  theme,
  onThemeChange,
}: HeaderProps) {
  // Cycle through themes: auto -> light -> dark -> auto
  function cycleTheme() {
    const next: Record<Theme, Theme> = {
      auto: 'light',
      light: 'dark',
      dark: 'auto',
    };
    onThemeChange(next[theme]);
  }

  function getThemeIcon() {
    switch (theme) {
      case 'light':
        return <Sun className="w-4 h-4" />;
      case 'dark':
        return <Moon className="w-4 h-4" />;
      default:
        return <Monitor className="w-4 h-4" />;
    }
  }

  function getThemeLabel() {
    switch (theme) {
      case 'light':
        return '亮色';
      case 'dark':
        return '暗色';
      default:
        return '自动';
    }
  }

  return (
    <header className="sticky top-0 z-50 glass border-b border-white/10 dark:border-white/10">
      <div className="flex items-center justify-between px-4 lg:px-6 h-16">
        {/* Left */}
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors lg:hidden"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center glow-sm">
              <BookmarkIcon className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="font-display font-bold text-lg">星痕导航</h1>
              <p className="text-xs text-slate-400">书签触手可及</p>
            </div>
          </div>
        </div>

        {/* Center - Search */}
        <button
          onClick={onSearchClick}
          className="flex-1 max-w-xl mx-4 lg:mx-8"
        >
          <div className="flex items-center gap-3 px-4 py-2.5 glass rounded-xl hover:bg-white/10 transition-all group cursor-pointer">
            <Search className="w-4 h-4 text-slate-400 group-hover:text-foreground transition-colors" />
            <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
              搜索书签...
            </span>
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-xs text-slate-500 bg-slate-800/50 rounded border border-slate-700">
              <span className="text-[10px]">⌘</span>0
            </kbd>
          </div>
        </button>

        {/* Right */}
        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
          <button
            onClick={cycleTheme}
            className="flex items-center gap-1.5 px-3 py-2 hover:bg-white/10 rounded-lg transition-colors text-sm text-slate-400 hover:text-foreground"
            title={`当前: ${getThemeLabel()}模式`}
          >
            {getThemeIcon()}
            <span className="hidden sm:inline">{getThemeLabel()}</span>
          </button>

          {/* Refresh */}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2.5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
            title="刷新"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {/* Auth */}
          {isLoggedIn ? (
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded-lg transition-colors text-sm text-slate-400 hover:text-foreground"
              title="退出登录"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">退出</span>
            </button>
          ) : (
            <button
              onClick={onLoginClick}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 rounded-lg transition-all text-sm font-medium"
            >
              <LogIn className="w-4 h-4" />
              <span className="hidden sm:inline">登录</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
