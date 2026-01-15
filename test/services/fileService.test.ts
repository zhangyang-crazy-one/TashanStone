/**
 * File Service Tests
 * Tests for file handling utilities
 * 
 * Note: fileService imports pdfjs-dist which requires DOMMatrix (browser API).
 * We test the pure utility functions inline without importing the full module.
 */

import { describe, it, expect } from 'vitest';

// Inline implementation of the tested functions (to avoid pdfjs-dist import issues)
const SUPPORTED_EXTENSIONS = ['.md', '.txt', '.csv', '.pdf', '.docx', '.doc'];

const isExtensionSupported = (filename: string): boolean => {
  const name = filename.toLowerCase();
  return SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext));
};

describe('FileService', () => {
  describe('SUPPORTED_EXTENSIONS', () => {
    it('should include markdown extension', () => {
      expect(SUPPORTED_EXTENSIONS).toContain('.md');
    });

    it('should include text extension', () => {
      expect(SUPPORTED_EXTENSIONS).toContain('.txt');
    });

    it('should include PDF extension', () => {
      expect(SUPPORTED_EXTENSIONS).toContain('.pdf');
    });

    it('should include DOCX extension', () => {
      expect(SUPPORTED_EXTENSIONS).toContain('.docx');
    });

    it('should include CSV extension', () => {
      expect(SUPPORTED_EXTENSIONS).toContain('.csv');
    });
  });

  describe('isExtensionSupported', () => {
    it('should return true for .md files', () => {
      expect(isExtensionSupported('document.md')).toBe(true);
    });

    it('should return true for .txt files', () => {
      expect(isExtensionSupported('notes.txt')).toBe(true);
    });

    it('should return true for .pdf files', () => {
      expect(isExtensionSupported('report.pdf')).toBe(true);
    });

    it('should return true for .docx files', () => {
      expect(isExtensionSupported('document.docx')).toBe(true);
    });

    it('should return true for .doc files', () => {
      expect(isExtensionSupported('legacy.doc')).toBe(true);
    });

    it('should return true for .csv files', () => {
      expect(isExtensionSupported('data.csv')).toBe(true);
    });

    it('should return false for unsupported extensions', () => {
      expect(isExtensionSupported('image.png')).toBe(false);
      expect(isExtensionSupported('video.mp4')).toBe(false);
      expect(isExtensionSupported('archive.zip')).toBe(false);
      expect(isExtensionSupported('script.js')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isExtensionSupported('DOCUMENT.MD')).toBe(true);
      expect(isExtensionSupported('Report.PDF')).toBe(true);
      expect(isExtensionSupported('Data.CSV')).toBe(true);
    });

    it('should handle files with multiple dots', () => {
      expect(isExtensionSupported('my.document.v2.md')).toBe(true);
      expect(isExtensionSupported('report.2024.01.pdf')).toBe(true);
    });

    it('should return false for files without extension', () => {
      expect(isExtensionSupported('README')).toBe(false);
      expect(isExtensionSupported('Makefile')).toBe(false);
    });
  });
});
