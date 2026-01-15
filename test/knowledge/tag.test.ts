/**
 * Tag Extraction Tests
 * test/knowledge/tag.test.ts
 * 
 * Note: Tag format is #[tag-name] (with brackets)
 * extractTags returns the content inside brackets without #[ and ]
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { extractTags } from '../../src/types/wiki';

describe('Tag Extraction', () => {
  describe('Basic Tags', () => {
    it('should extract single tag', () => {
      const content = 'Content with #[tag]';
      const tags = extractTags(content);
      
      expect(tags).toHaveLength(1);
      expect(tags[0]).toBe('tag');
    });

    it('should extract multiple tags', () => {
      const content = 'Tags: #[first], #[second], #[third]';
      const tags = extractTags(content);
      
      expect(tags).toHaveLength(3);
      expect(tags).toContain('first');
      expect(tags).toContain('second');
      expect(tags).toContain('third');
    });

    it('should extract tags with numbers', () => {
      const content = 'Tags: #[tag1], #[tag2-test]';
      const tags = extractTags(content);
      
      expect(tags).toHaveLength(2);
      expect(tags).toContain('tag1');
      expect(tags).toContain('tag2-test');
    });

    it('should extract tags with underscores', () => {
      const content = 'Tags: #[under_score], #[test_tag]';
      const tags = extractTags(content);
      
      expect(tags).toHaveLength(2);
    });
  });

  describe('Nested Tags', () => {
    it('should extract nested tags', () => {
      const content = 'Topic: #[machine-learning]';
      const tags = extractTags(content);
      
      expect(tags).toHaveLength(1);
      expect(tags[0]).toBe('machine-learning');
    });

    it('should extract deeply nested tags', () => {
      const content = 'Deep: #[a/b/c/d/e]';
      const tags = extractTags(content);
      
      expect(tags).toHaveLength(1);
      expect(tags[0]).toBe('a/b/c/d/e');
    });

    it('should extract multiple nested tags', () => {
      const content = 'Tags: #[python/requests], #[javascript/react]';
      const tags = extractTags(content);
      
      expect(tags).toHaveLength(2);
    });
  });

  describe('Chinese Tags', () => {
    it('should extract Chinese tags', () => {
      const content = '中文标签: #[中文标签]';
      const tags = extractTags(content);
      
      expect(tags).toHaveLength(1);
      expect(tags[0]).toBe('中文标签');
    });

    it('should extract Chinese nested tags', () => {
      const content = 'Nested: #[编程/人工智能/机器学习]';
      const tags = extractTags(content);
      
      expect(tags).toHaveLength(1);
      expect(tags[0]).toBe('编程/人工智能/机器学习');
    });

    it('should extract mixed Chinese and English tags', () => {
      const content = 'Mixed: #[中文标签] and #[english-tag]';
      const tags = extractTags(content);
      
      expect(tags).toHaveLength(2);
    });
  });

  describe('Edge Cases', () => {
    it('should return empty array for no tags', () => {
      const content = 'No tags in this content';
      const tags = extractTags(content);
      
      expect(tags).toHaveLength(0);
    });

    it('should not extract invalid tags', () => {
      // Old #tag format should not be extracted anymore
      const content = 'Invalid: #123 (old format without brackets)';
      const tags = extractTags(content);
      
      expect(tags).toHaveLength(0);
    });

    it('should handle tags at start of line', () => {
      const content = '#[start-tag]\nmiddle #[middle-tag]\n#[end-tag]';
      const tags = extractTags(content);
      
      expect(tags).toHaveLength(3);
    });

    it('should handle consecutive tags', () => {
      const content = '#[tag1] #[tag2] #[tag3]';
      const tags = extractTags(content);
      
      expect(tags).toHaveLength(3);
    });

    it('should handle tags with hyphens', () => {
      const content = 'Hyphens: #[my-long-tag-name]';
      const tags = extractTags(content);
      
      expect(tags).toHaveLength(1);
      expect(tags[0]).toBe('my-long-tag-name');
    });
  });
});
