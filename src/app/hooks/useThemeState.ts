import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AppTheme } from '@/types';
import {
  applyTheme,
  getAllThemes,
  getLastUsedThemeIdForMode,
  getSavedThemeId,
  saveCustomTheme,
  deleteCustomTheme,
  DEFAULT_THEMES
} from '@/services/themeService';

interface UseThemeStateResult {
  themes: AppTheme[];
  activeThemeId: string;
  themeType: 'light' | 'dark';
  handleThemeChange: (id: string) => void;
  toggleTheme: () => void;
  handleImportTheme: (theme: AppTheme) => void;
  handleDeleteTheme: (themeId: string) => void;
}

export const useThemeState = (): UseThemeStateResult => {
  const [themes, setThemes] = useState<AppTheme[]>(() => {
    const loaded = getAllThemes();
    return loaded.length > 0 ? loaded : DEFAULT_THEMES;
  });
  const [activeThemeId, setActiveThemeId] = useState<string>(() => getSavedThemeId());

  useEffect(() => {
    const currentTheme = themes.find(t => t.id === activeThemeId) || themes[0];
    if (currentTheme) {
      applyTheme(currentTheme);
    }
  }, [activeThemeId, themes]);

  const handleThemeChange = useCallback((id: string) => {
    const theme = themes.find(t => t.id === id);
    if (theme) {
      applyTheme(theme);
      setActiveThemeId(id);
    }
  }, [themes]);

  const toggleTheme = useCallback(() => {
    const currentTheme = themes.find(t => t.id === activeThemeId);
    if (!currentTheme) return;

    const targetType = currentTheme.type === 'dark' ? 'light' : 'dark';
    const lastUsedId = getLastUsedThemeIdForMode(targetType);
    const lastUsedTheme = lastUsedId ? themes.find(t => t.id === lastUsedId) : undefined;

    if (lastUsedTheme) {
      handleThemeChange(lastUsedTheme.id);
    } else {
      const targetTheme = themes.find(t => t.type === targetType);
      if (targetTheme) handleThemeChange(targetTheme.id);
    }
  }, [activeThemeId, handleThemeChange, themes]);

  const handleImportTheme = useCallback((theme: AppTheme) => {
    saveCustomTheme(theme);
    const updatedThemes = getAllThemes();
    setThemes(updatedThemes);
    handleThemeChange(theme.id);
  }, [handleThemeChange]);

  const handleDeleteTheme = useCallback((themeId: string) => {
    deleteCustomTheme(themeId);
    const updatedThemes = getAllThemes();
    setThemes(updatedThemes);
    if (activeThemeId === themeId && updatedThemes.length > 0) {
      handleThemeChange(updatedThemes[0].id);
    }
  }, [activeThemeId, handleThemeChange]);

  const themeType = useMemo(() => {
    const currentTheme = themes.find(t => t.id === activeThemeId) || themes[0];
    return currentTheme?.type || 'dark';
  }, [activeThemeId, themes]);

  return {
    themes,
    activeThemeId,
    themeType,
    handleThemeChange,
    toggleTheme,
    handleImportTheme,
    handleDeleteTheme
  };
};
