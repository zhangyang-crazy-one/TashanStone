/**
 * Theme Service Tests
 * Tests for theme management functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_THEMES,
  applyTheme,
  getSavedThemeId,
  getLastUsedThemeIdForMode,
  getAllThemes,
  saveCustomTheme,
  deleteCustomTheme,
} from '../../services/themeService';

describe('ThemeService', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Reset document classes
    document.documentElement.classList.remove('dark');
    // Clear inline styles
    document.documentElement.style.cssText = '';
  });

  describe('DEFAULT_THEMES', () => {
    it('should have at least 5 default themes', () => {
      expect(DEFAULT_THEMES.length).toBeGreaterThanOrEqual(5);
    });

    it('should have both dark and light themes', () => {
      const darkThemes = DEFAULT_THEMES.filter(t => t.type === 'dark');
      const lightThemes = DEFAULT_THEMES.filter(t => t.type === 'light');
      
      expect(darkThemes.length).toBeGreaterThan(0);
      expect(lightThemes.length).toBeGreaterThan(0);
    });

    it('each theme should have required properties', () => {
      DEFAULT_THEMES.forEach(theme => {
        expect(theme).toHaveProperty('id');
        expect(theme).toHaveProperty('name');
        expect(theme).toHaveProperty('type');
        expect(theme).toHaveProperty('colors');
        expect(theme.colors).toHaveProperty('--bg-main');
        expect(theme.colors).toHaveProperty('--text-primary');
        expect(theme.colors).toHaveProperty('--primary-500');
      });
    });

    it('neon-cyber theme should exist and be dark', () => {
      const neonCyber = DEFAULT_THEMES.find(t => t.id === 'neon-cyber');
      expect(neonCyber).toBeDefined();
      expect(neonCyber?.type).toBe('dark');
    });

    it('clean-paper theme should exist and be light', () => {
      const cleanPaper = DEFAULT_THEMES.find(t => t.id === 'clean-paper');
      expect(cleanPaper).toBeDefined();
      expect(cleanPaper?.type).toBe('light');
    });
  });

  describe('applyTheme', () => {
    it('should apply CSS variables to document root', () => {
      const theme = DEFAULT_THEMES[0];
      applyTheme(theme);

      expect(document.documentElement.style.getPropertyValue('--bg-main')).toBe(theme.colors['--bg-main']);
    });

    it('should add dark class for dark themes', () => {
      const darkTheme = DEFAULT_THEMES.find(t => t.type === 'dark')!;
      applyTheme(darkTheme);

      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('should remove dark class for light themes', () => {
      document.documentElement.classList.add('dark');
      const lightTheme = DEFAULT_THEMES.find(t => t.type === 'light')!;
      applyTheme(lightTheme);

      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('should save theme id to localStorage', () => {
      const theme = DEFAULT_THEMES[0];
      applyTheme(theme);

      expect(localStorage.getItem('neon-active-theme-id')).toBe(theme.id);
    });

    it('should save last used theme for mode', () => {
      const darkTheme = DEFAULT_THEMES.find(t => t.type === 'dark')!;
      applyTheme(darkTheme);

      expect(localStorage.getItem('neon-last-dark-theme-id')).toBe(darkTheme.id);
    });
  });

  describe('getSavedThemeId', () => {
    it('should return default theme id when nothing saved', () => {
      expect(getSavedThemeId()).toBe('neon-cyber');
    });

    it('should return saved theme id', () => {
      localStorage.setItem('neon-active-theme-id', 'clean-paper');
      expect(getSavedThemeId()).toBe('clean-paper');
    });
  });

  describe('getLastUsedThemeIdForMode', () => {
    it('should return null when no theme saved for mode', () => {
      expect(getLastUsedThemeIdForMode('dark')).toBeNull();
      expect(getLastUsedThemeIdForMode('light')).toBeNull();
    });

    it('should return saved theme for mode', () => {
      localStorage.setItem('neon-last-dark-theme-id', 'midnight-dracula');
      expect(getLastUsedThemeIdForMode('dark')).toBe('midnight-dracula');
    });
  });

  describe('getAllThemes', () => {
    it('should return default themes when no custom themes', () => {
      const themes = getAllThemes();
      expect(themes.length).toBe(DEFAULT_THEMES.length);
    });

    it('should include custom themes', () => {
      const customTheme = {
        id: 'custom-test',
        name: 'Custom Test',
        type: 'dark' as const,
        colors: DEFAULT_THEMES[0].colors,
        isCustom: true,
      };
      localStorage.setItem('neon-custom-themes', JSON.stringify([customTheme]));

      const themes = getAllThemes();
      expect(themes.length).toBe(DEFAULT_THEMES.length + 1);
      expect(themes.find(t => t.id === 'custom-test')).toBeDefined();
    });

    it('should handle invalid JSON in custom themes gracefully', () => {
      localStorage.setItem('neon-custom-themes', 'invalid json');
      
      // Should not throw
      const themes = getAllThemes();
      expect(themes.length).toBe(DEFAULT_THEMES.length);
    });
  });

  describe('saveCustomTheme', () => {
    it('should save a new custom theme', () => {
      const customTheme = {
        id: 'my-theme',
        name: 'My Theme',
        type: 'light' as const,
        colors: DEFAULT_THEMES[0].colors,
      };
      
      saveCustomTheme(customTheme);
      
      const saved = JSON.parse(localStorage.getItem('neon-custom-themes') || '[]');
      expect(saved.length).toBe(1);
      expect(saved[0].id).toBe('my-theme');
      expect(saved[0].isCustom).toBe(true);
    });

    it('should update existing theme with same id', () => {
      const theme1 = { id: 'test', name: 'Test 1', type: 'dark' as const, colors: DEFAULT_THEMES[0].colors };
      const theme2 = { id: 'test', name: 'Test 2', type: 'dark' as const, colors: DEFAULT_THEMES[0].colors };
      
      saveCustomTheme(theme1);
      saveCustomTheme(theme2);
      
      const saved = JSON.parse(localStorage.getItem('neon-custom-themes') || '[]');
      expect(saved.length).toBe(1);
      expect(saved[0].name).toBe('Test 2');
    });
  });

  describe('deleteCustomTheme', () => {
    it('should delete a custom theme by id', () => {
      const customTheme = {
        id: 'to-delete',
        name: 'To Delete',
        type: 'dark' as const,
        colors: DEFAULT_THEMES[0].colors,
      };
      saveCustomTheme(customTheme);
      
      deleteCustomTheme('to-delete');
      
      const saved = JSON.parse(localStorage.getItem('neon-custom-themes') || '[]');
      expect(saved.length).toBe(0);
    });

    it('should not throw when deleting non-existent theme', () => {
      expect(() => deleteCustomTheme('non-existent')).not.toThrow();
    });
  });
});
