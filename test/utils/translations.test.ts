/**
 * Translations Utility Tests
 * Tests for i18n translation system
 */

import { describe, it, expect } from 'vitest';
import { translations } from '../../utils/translations';

describe('Translations', () => {
  describe('Structure', () => {
    it('should have English translations', () => {
      expect(translations).toHaveProperty('en');
    });

    it('should have Chinese translations', () => {
      expect(translations).toHaveProperty('zh');
    });
  });

  describe('English Translations', () => {
    const en = translations.en;

    it('should have navigation labels', () => {
      expect(en.explorer).toBe('Explorer');
      expect(en.settings).toBe('Settings');
      expect(en.chat).toBe('AI Chat');
    });

    it('should have file operation labels', () => {
      expect(en.newFile).toBe('New File');
      expect(en.openDir).toBe('Open Dir');
      expect(en.importFiles).toBe('Import Files');
      expect(en.save).toBe('Save');
    });

    it('should have view mode labels', () => {
      expect(en.editor).toBe('Editor');
      expect(en.preview).toBe('Preview');
      expect(en.split).toBe('Split');
      expect(en.graph).toBe('Graph');
    });

    it('should have AI feature labels', () => {
      expect(en.polish).toBe('Polish');
      expect(en.expand).toBe('Expand');
      expect(en.mindMap).toBe('Mind Map');
      expect(en.quiz).toBe('Quiz');
    });

    it('should have settings labels', () => {
      expect(en.aiConfig).toBe('AI Config');
      expect(en.appearance).toBe('Appearance');
      expect(en.provider).toBe('Provider Type');
      expect(en.apiKey).toBe('API Key');
    });

    it('should have action labels', () => {
      expect(en.cancel).toBe('Cancel');
      expect(en.close).toBe('Close');
      expect(en.download).toBe('Download');
    });
  });

  describe('Chinese Translations', () => {
    const zh = translations.zh;

    it('should have navigation labels', () => {
      expect(zh.explorer).toBeDefined();
      expect(zh.settings).toBeDefined();
      expect(zh.chat).toBeDefined();
    });

    it('should have file operation labels', () => {
      expect(zh.newFile).toBeDefined();
      expect(zh.openDir).toBeDefined();
      expect(zh.save).toBeDefined();
    });

    it('should have view mode labels', () => {
      expect(zh.editor).toBeDefined();
      expect(zh.preview).toBeDefined();
      expect(zh.split).toBeDefined();
    });
  });

  describe('Translation Parity', () => {
    it('should have same keys in both languages', () => {
      const enKeys = Object.keys(translations.en);
      const zhKeys = Object.keys(translations.zh);

      // Check if all English keys exist in Chinese
      enKeys.forEach(key => {
        expect(translations.zh).toHaveProperty(key);
      });

      // Check if all Chinese keys exist in English
      zhKeys.forEach(key => {
        expect(translations.en).toHaveProperty(key);
      });
    });

    it('should have no empty translations', () => {
      Object.entries(translations.en).forEach(([key, value]) => {
        expect(value).not.toBe('');
        expect(value).toBeDefined();
      });

      Object.entries(translations.zh).forEach(([key, value]) => {
        expect(value).not.toBe('');
        expect(value).toBeDefined();
      });
    });
  });
});
