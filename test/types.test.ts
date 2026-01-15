/**
 * Types Tests
 * Tests for TypeScript type definitions and enums
 */

import { describe, it, expect } from 'vitest';
import { ViewMode } from '../types';

describe('Types', () => {
  describe('ViewMode Enum', () => {
    it('should have Split mode', () => {
      expect(ViewMode.Split).toBe('SPLIT');
    });

    it('should have Editor mode', () => {
      expect(ViewMode.Editor).toBe('EDITOR');
    });

    it('should have Preview mode', () => {
      expect(ViewMode.Preview).toBe('PREVIEW');
    });

    it('should have Graph mode', () => {
      expect(ViewMode.Graph).toBe('GRAPH');
    });

    it('should have Quiz mode', () => {
      expect(ViewMode.Quiz).toBe('QUIZ');
    });

    it('should have MindMap mode', () => {
      expect(ViewMode.MindMap).toBe('MINDMAP');
    });

    it('should have Analytics mode', () => {
      expect(ViewMode.Analytics).toBe('ANALYTICS');
    });

    it('should have Diff mode', () => {
      expect(ViewMode.Diff).toBe('DIFF');
    });

    it('should have Roadmap mode', () => {
      expect(ViewMode.Roadmap).toBe('ROADMAP');
    });

    it('should have all expected view modes', () => {
      const modes = Object.values(ViewMode);
      expect(modes.length).toBeGreaterThanOrEqual(9);
    });
  });
});
