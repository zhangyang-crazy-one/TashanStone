/**
 * Wiki Link Extraction Tests
 * test/wiki/wikiLink.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  extractWikiLinks,
  extractBlockReferences,
  extractBlockReferencesWithContent,
  extractTags,
  preprocessWikiLinks,
  formatBlockReference
} from '../../src/types/wiki';

describe('WikiLink Extraction', () => {
  describe('extractWikiLinks', () => {
    it('should extract basic wiki links', () => {
      const content = 'Check [[PageName]] for details';
      const links = extractWikiLinks(content);
      
      expect(links).toHaveLength(1);
      expect(links[0].target).toBe('PageName');
      expect(links[0].alias).toBeUndefined();
      expect(links[0].position.start).toBe(6);
      // end is the position after the closing brackets, i.e., match.index + match[0].length = 6 + 12 = 18
      expect(links[0].position.end).toBe(18);
    });

    it('should extract wiki links with aliases', () => {
      const content = 'See [[PageName|this page]] for info';
      const links = extractWikiLinks(content);
      
      expect(links).toHaveLength(1);
      expect(links[0].target).toBe('PageName');
      expect(links[0].alias).toBe('this page');
    });

    it('should extract multiple wiki links', () => {
      const content = 'Links: [[Page1]], [[Page2]], and [[Page3]]';
      const links = extractWikiLinks(content);
      
      expect(links).toHaveLength(3);
      expect(links.map(l => l.target)).toEqual(['Page1', 'Page2', 'Page3']);
    });

    it('should handle Chinese page names', () => {
      const content = '参考 [[中文页面]] 了解更多';
      const links = extractWikiLinks(content);
      
      expect(links).toHaveLength(1);
      expect(links[0].target).toBe('中文页面');
    });

    it('should extract exam and question links', () => {
      const content = 'See [[Exam:Quiz1]] and [[Question:Q123]]';
      const links = extractWikiLinks(content);
      
      expect(links).toHaveLength(2);
      expect(links[0].target).toBe('Exam:Quiz1');
      expect(links[1].target).toBe('Question:Q123');
    });

    it('should return empty array for content without links', () => {
      const content = 'No links here';
      const links = extractWikiLinks(content);
      
      expect(links).toHaveLength(0);
    });
  });

  describe('extractBlockReferences', () => {
    it('should extract basic block references', () => {
      const content = 'See (((PageName#10))) for details';
      const refs = extractBlockReferences(content);

      expect(refs).toHaveLength(1);
      expect(refs[0].target).toBe('PageName');
      expect(refs[0].startLine).toBe(10);
      expect(refs[0].endLine).toBeUndefined();
    });

    it('should extract block references with range', () => {
      const content = 'See (((PageName#5-10))) for context';
      const refs = extractBlockReferences(content);

      expect(refs).toHaveLength(1);
      expect(refs[0].target).toBe('PageName');
      expect(refs[0].startLine).toBe(5);
      expect(refs[0].endLine).toBe(10);
    });

    it('should extract multiple block references', () => {
      const content = 'Ref1: (((Page1#1))), Ref2: (((Page2#5-8)))';
      const refs = extractBlockReferences(content);

      expect(refs).toHaveLength(2);
      expect(refs[0].target).toBe('Page1');
      expect(refs[1].target).toBe('Page2');
    });

    it('should return empty array for content without refs', () => {
      const content = 'No block references';
      const refs = extractBlockReferences(content);

      expect(refs).toHaveLength(0);
    });
  });

  describe('extractBlockReferencesWithContent', () => {
    const mockFiles = [
      {
        name: 'test.md',
        path: '/docs/test.md',
        content: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10'
      }
    ];

    it('should extract block reference with content', () => {
      const content = 'See (((test.md#2))) for context';
      const refs = extractBlockReferencesWithContent(content, mockFiles);

      expect(refs).toHaveLength(1);
      expect(refs[0].blockContent).toBe('Line 2');
    });

    it('should extract block reference range with content', () => {
      const content = 'See (((test.md#3-5))) for details';
      const refs = extractBlockReferencesWithContent(content, mockFiles);

      expect(refs).toHaveLength(1);
      expect(refs[0].blockContent).toBe('Line 3\nLine 4\nLine 5');
    });

    it('should handle missing files gracefully', () => {
      const content = 'See (((missing#1))) for context';
      const refs = extractBlockReferencesWithContent(content, mockFiles);

      expect(refs).toHaveLength(1);
      expect(refs[0].blockContent).toBe('');
    });

    it('should handle out-of-range line numbers', () => {
      const content = 'See (((test.md#999))) for context';
      const refs = extractBlockReferencesWithContent(content, mockFiles);

      expect(refs).toHaveLength(1);
      expect(refs[0].blockContent).toBe('');
    });
  });

  describe('extractTags', () => {
    it('should extract basic tags', () => {
      const content = 'Content with #[tag1] and #[tag2]';
      const tags = extractTags(content);
      
      expect(tags).toHaveLength(2);
      expect(tags).toContain('tag1');
      expect(tags).toContain('tag2');
    });

    it('should extract nested tags', () => {
      const content = 'Tag: #[nested/tag] and #[another/nested/deep]';
      const tags = extractTags(content);
      
      expect(tags).toHaveLength(2);
      expect(tags).toContain('nested/tag');
      expect(tags).toContain('another/nested/deep');
    });

    it('should extract Chinese tags', () => {
      const content = '标签: #[中文标签] and #[测试标签]';
      const tags = extractTags(content);
      
      expect(tags).toHaveLength(2);
      expect(tags).toContain('中文标签');
      expect(tags).toContain('测试标签');
    });

    it('should return empty array for content without tags', () => {
      const content = 'No tags here';
      const tags = extractTags(content);
      
      expect(tags).toHaveLength(0);
    });

    it('should handle tags at start of content', () => {
      const content = '#[firsttag] is here';
      const tags = extractTags(content);
      
      expect(tags).toHaveLength(1);
      expect(tags[0]).toBe('firsttag');
    });
  });

  describe('preprocessWikiLinks', () => {
    it('should convert wiki links to markdown', () => {
      const content = 'See [[PageName]] for info';
      const processed = preprocessWikiLinks(content);
      
      expect(processed).toBe('See [PageName](?wiki=PageName) for info');
    });

    it('should convert wiki links with aliases', () => {
      const content = 'See [[PageName|this page]]';
      const processed = preprocessWikiLinks(content);
      
      expect(processed).toBe('See [this page](?wiki=PageName)');
    });

    it('should handle multiple wiki links', () => {
      const content = '[[Link1]] and [[Link2]]';
      const processed = preprocessWikiLinks(content);
      
      expect(processed).toContain('[Link1](?wiki=Link1)');
      expect(processed).toContain('[Link2](?wiki=Link2)');
    });
  });

  describe('formatBlockReference', () => {
    it('should format basic block reference', () => {
      const result = formatBlockReference('Page', 10);
      expect(result).toBe('(((Page#10)))');
    });

    it('should format block reference with range', () => {
      const result = formatBlockReference('Page', 5, 10);
      expect(result).toBe('(((Page#5-10)))');
    });
  });
});
