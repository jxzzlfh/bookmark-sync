'use client';

import { useState, useEffect } from 'react';

export type Theme = 'light' | 'dark' | 'auto';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('auto');
  const [mounted, setMounted] = useState(false);

  // Load theme from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('theme') as Theme | null;
    if (saved && ['light', 'dark', 'auto'].includes(saved)) {
      setThemeState(saved);
    }
  }, []);

  // Apply theme to document
  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    
    if (theme === 'auto') {
      // Use system preference
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const applySystemTheme = () => {
        if (mediaQuery.matches) {
          root.classList.add('dark');
          root.classList.remove('light');
        } else {
          root.classList.add('light');
          root.classList.remove('dark');
        }
      };
      
      applySystemTheme();
      mediaQuery.addEventListener('change', applySystemTheme);
      
      return () => {
        mediaQuery.removeEventListener('change', applySystemTheme);
      };
    } else {
      root.classList.remove('light', 'dark');
      root.classList.add(theme);
    }
  }, [theme, mounted]);

  function setTheme(newTheme: Theme) {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
  }

  return { theme, setTheme, mounted };
}
