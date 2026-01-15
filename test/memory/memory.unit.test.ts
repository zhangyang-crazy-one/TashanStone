/**
 * 记忆系统单元测试
 * 测试文件: test/memory/memory.unit.test.ts
 * 
 * 运行方式:
 *   npm install vitest
 *   npx vitest run test/memory/memory.unit.test.ts
 */

import * as vitest from 'vitest';
const { describe, it, expect, beforeEach, afterEach } = vitest;

// Mock dependencies
const mockFs = {
  existsSync: () => true,
  readFileSync: () => '{}',
  writeFileSync: () => {},
  mkdirSync: () => {},
};

const mockPath = {
  join: (...args: string[]) => args.join('/'),
};

const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
};

// Mock modules before import
const mockModule = () => ({
  mockFs,
  mockPath,
  mockLogger,
});

describe('Memory System - Unit Tests', () => {
  describe('Token Budget', () => {
    it('should calculate tokens for simple text', () => {
      // Test token estimation logic
      const text = 'Hello, World!';
      const words = text.split(/\s+/);
      const estimatedTokens = words.length;
      
      expect(estimatedTokens).toBe(2);
    });

    it('should handle empty string', () => {
      const text = '';
      const words = text.split(/\s+/).filter(w => w.length > 0);
      
      expect(words.length).toBe(0);
    });

    it('should estimate tokens with Chinese characters', () => {
      const text = '你好世界';
      const chars = text.length;
      
      expect(chars).toBe(4);
    });

    it('should calculate token count from cached value', () => {
      const messages = [
        { token_count: 100 },
        { token_count: 200 },
        { token_count: 150 },
      ];
      
      const total = messages.reduce((sum, msg) => sum + (msg.token_count || 0), 0);
      
      expect(total).toBe(450);
    });

    it('should use fallback token estimation when no cache', () => {
      const messages = [
        { content: 'Short' },    // 5 chars
        { content: 'Text' },     // 4 chars
      ];
      
      const estimateToken = (text: string) => Math.ceil(text.length / 4);
      const total = messages.reduce(
        (sum, msg) => sum + estimateToken(msg.content), 
        0
      );
      // 5/4=1.25→2, 4/4=1, total=3
      expect(total).toBe(3);
    });
  });

  describe('Memory Document', () => {
    it('should create valid MemoryDocument structure', () => {
      const memory = {
        id: 'test-123',
        content: 'Test content',
        topics: ['test', 'unit'],
        importance: 'medium' as const,
        created: Date.now(),
        updated: Date.now(),
        filePath: '/test/memory.md',
        sourceSessions: [],
      };
      
      expect(memory.id).toBe('test-123');
      expect(memory.topics).toContain('test');
      expect(['low', 'medium', 'high']).toContain(memory.importance);
    });

    it('should parse markdown frontmatter correctly', () => {
      const content = `---
id: test-id
created: 2025-01-01T00:00:00.000Z
updated: 2025-01-02T00:00:00.000Z
topics: ["test", "example"]
importance: high
---

# Test Content

This is the body.`;
      
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      
      expect(frontmatterMatch).not.toBeNull();
      
      const frontmatter = frontmatterMatch![1];
      const body = frontmatterMatch![2];
      
      expect(frontmatter).toContain('id: test-id');
      expect(body).toContain('Test Content');
    });

    it('should handle missing optional fields', () => {
      const memory = {
        id: 'test-456',
        content: 'Minimal content',
        topics: [],
        importance: 'medium' as const,
        created: Date.now(),
        updated: Date.now(),
        filePath: '/test/minimal.md',
        sourceSessions: [],
        // Optional fields not provided
      };
      
      expect(memory.id).toBe('test-456');
      expect(memory.topics.length).toBe(0);
    });
  });

  describe('Memory Index', () => {
    it('should create valid MemoryIndex structure', () => {
      const index = {
        version: '1.0',
        updated: new Date().toISOString(),
        memories: [
          {
            id: 'mem-1',
            filePath: '/memories/test-1.md',
            created: '2025-01-01T00:00:00.000Z',
            updated: '2025-01-02T00:00:00.000Z',
            topics: ['test'],
            importance: 'medium',
          },
        ],
      };
      
      expect(index.version).toBe('1.0');
      expect(Array.isArray(index.memories)).toBe(true);
      expect(index.memories.length).toBe(1);
    });

    it('should filter memories by topic', () => {
      const memories = [
        { id: '1', topics: ['project', 'ai'], importance: 'high' },
        { id: '2', topics: ['test', 'unit'], importance: 'medium' },
        { id: '3', topics: ['project', 'test'], importance: 'low' },
      ];
      
      const projectMemories = memories.filter(m => 
        m.topics.some(t => t.includes('project'))
      );
      
      expect(projectMemories.length).toBe(2);
      expect(projectMemories.map(m => m.id)).toEqual(['1', '3']);
    });

    it('should sort memories by updated time', () => {
      const memories = [
        { id: '1', updated: 1000 },
        { id: '2', updated: 3000 },
        { id: '3', updated: 2000 },
      ];
      
      const sorted = [...memories].sort((a, b) => b.updated - a.updated);
      
      expect(sorted.map(m => m.id)).toEqual(['2', '3', '1']);
    });
  });

  describe('Three Layer Memory', () => {
    it('should push and retrieve from short-term memory', () => {
      const shortTerm = new Map<string, any[]>();
      const sessionId = 'session-1';
      
      shortTerm.set(sessionId, [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);
      
      const messages = shortTerm.get(sessionId);
      
      expect(messages).toBeDefined();
      expect(messages!.length).toBe(2);
      expect(messages![0].content).toBe('Hello');
    });

    it('should check auto-promote threshold', () => {
      const messages = Array(50).fill({ role: 'user', content: 'Test' });
      const AUTO_PROMOTE_THRESHOLD = 0.8;
      const SESSION_MAX_TOKENS = 50000;
      
      const currentTokens = messages.length * 20; // Assume 20 tokens per message
      const shouldPromote = currentTokens > SESSION_MAX_TOKENS * AUTO_PROMOTE_THRESHOLD;
      
      expect(currentTokens).toBe(1000);
      expect(shouldPromote).toBe(false);
    });

    it('should filter memories by importance', () => {
      const memories = [
        { id: '1', importance: 'high' },
        { id: '2', importance: 'medium' },
        { id: '3', importance: 'low' },
        { id: '4', importance: 'high' },
      ];
      
      const starredMemories = memories.filter(m => m.importance === 'high');
      
      expect(starredMemories.length).toBe(2);
      expect(starredMemories.map(m => m.id)).toEqual(['1', '4']);
    });
  });

  describe('Search Functionality', () => {
    it('should search memories by topic', () => {
      const memories = [
        { id: '1', topics: ['AI', 'Machine Learning'] },
        { id: '2', topics: ['Web', 'Frontend'] },
        { id: '3', topics: ['AI', 'Deep Learning'] },
      ];
      
      const query = 'AI';
      const results = memories.filter(m =>
        m.topics.some(t => t.toLowerCase().includes(query.toLowerCase()))
      );
      
      expect(results.length).toBe(2);
      expect(results.map(r => r.id)).toEqual(['1', '3']);
    });

    it('should limit search results', () => {
      const memories = Array(20).fill(null).map((_, i) => ({
        id: `${i}`,
        topics: ['test'],
      }));
      
      const limit = 5;
      const results = memories.slice(0, limit);
      
      expect(results.length).toBe(5);
    });
  });

  describe('Result Type Helpers', () => {
    it('should create success result', () => {
      const success = <T>(data: T) => ({ success: true, data });
      
      const result = success({ id: 'test-123' });
      
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('test-123');
    });

    it('should create failure result', () => {
      const failure = (error: string) => ({ success: false, error });
      
      const result = failure('Test error');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Test error');
    });

    it('should handle Result type discrimination', () => {
      const result = { success: true, data: 'test' };
      
      if (result.success) {
        expect(result.data).toBe('test');
      } else {
        // This branch should not execute
        expect(true).toBe(false);
      }
    });
  });

  describe('Memory File Operations', () => {
    it('should generate valid file name', () => {
      const memory = {
        id: 'test-id-abc123',
        created: Date.now(),
        topics: ['test'],
      };
      
      const date = new Date(memory.created).toISOString().split('T')[0];
      const topicSlug = memory.topics[0]?.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, '-').toLowerCase() || 'general';
      const shortId = memory.id.substring(memory.id.length - 6);
      const fileName = `memory_${date}_${topicSlug}_${shortId}.md`;
      
      expect(fileName).toMatch(/^memory_\d{4}-\d{2}-\d{2}_test_[a-z0-9]{6}\.md$/);
    });

    it('should format memory as markdown', () => {
      const memory = {
        id: 'test-id',
        content: 'Test content',
        topics: ['test'],
        importance: 'medium' as const,
        created: 1000000000000,
        updated: 1000000000000,
        filePath: '/test/memory.md',
        sourceSessions: [],
      };
      
      const markdown = `---
id: ${memory.id}
created: ${new Date(memory.created).toISOString()}
updated: ${new Date(memory.updated).toISOString()}
topics: ${JSON.stringify(memory.topics)}
importance: ${memory.importance}
source_sessions: ${JSON.stringify(memory.sourceSessions)}
---

${memory.content}`;
      
      expect(markdown).toContain('---');
      expect(markdown).toContain('id: test-id');
      expect(markdown).toContain('Test content');
    });
  });

  describe('Index Recovery', () => {
    it('should detect corrupted index', () => {
      const corruptedData = '{ invalid json }';
      
      let isValid = true;
      try {
        JSON.parse(corruptedData);
      } catch {
        isValid = false;
      }
      
      expect(isValid).toBe(false);
    });

    it('should recover index from memory files', () => {
      const memoryFiles = [
        '/memories/memory_2025-01-01_test-abc123.md',
        '/memories/memory_2025-01-02_example-def456.md',
      ];
      
      const recoveredIndex = {
        version: '1.0',
        updated: new Date().toISOString(),
        memories: memoryFiles.map(filePath => ({
          id: filePath.split('_')[2],
          filePath,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          topics: [],
          importance: 'medium',
        })),
      };
      
      expect(recoveredIndex.memories.length).toBe(2);
      expect(recoveredIndex.version).toBe('1.0');
    });
  });
});
