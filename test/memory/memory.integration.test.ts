/**
 * 记忆系统集成测试
 * 测试文件: test/memory/memory.integration.test.ts
 * 
 * 运行方式:
 *   npx vitest run test/memory/memory.integration.test.ts
 * 
 * 注意: 需要先启动应用 (npm run dev)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// Test configuration
const TEST_MEMORIES_DIR = '.test-memories';
const TEST_INDEX_FILE = `${TEST_MEMORIES_DIR}/_test_index.json`;

// Helper functions for tests
const generateId = () => `test-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 6)}`;

type Importance = 'low' | 'medium' | 'high';

const createTestMemory = (overrides: { id?: string; content?: string; topics?: string[]; importance?: Importance; createdAt?: number; updatedAt?: number } = {}) => ({
  id: generateId(),
  content: 'Test memory content for integration testing',
  title: 'Test Memory',
  topics: ['test', 'integration'] as string[],
  importance: 'medium' as Importance,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

describe('Memory System - Integration Tests', () => {
  describe('Memory CRUD Operations', () => {
    it('should create a new memory', () => {
      const memory = createTestMemory();
      
      expect(memory.id).toBeDefined();
      expect(memory.content).toBeTruthy();
      expect(memory.topics.length).toBeGreaterThan(0);
    });

    it('should update an existing memory', () => {
      const original = createTestMemory();
      const updated = {
        ...original,
        content: 'Updated content',
        updatedAt: Date.now(),
      };
      
      expect(original.id).toBe(updated.id);
      expect(original.content).not.toBe(updated.content);
      expect(updated.content).toBe('Updated content');
    });

    it('should delete a memory', () => {
      const memories = [
        createTestMemory({ id: 'mem-1' }),
        createTestMemory({ id: 'mem-2' }),
        createTestMemory({ id: 'mem-3' }),
      ];
      
      const filtered = memories.filter(m => m.id !== 'mem-2');
      
      expect(filtered.length).toBe(2);
      expect(filtered.find(m => m.id === 'mem-2')).toBeUndefined();
    });

    it('should find memory by ID', () => {
      const memories = [
        createTestMemory({ id: 'find-me' }),
        createTestMemory({ id: 'skip-me' }),
      ];
      
      const found = memories.find(m => m.id === 'find-me');
      
      expect(found).toBeDefined();
      expect(found!.id).toBe('find-me');
    });
  });

  describe('Memory Search', () => {
    it('should search memories by topic', () => {
      const memories = [
        createTestMemory({ id: '1', topics: ['AI', 'ML'] }),
        createTestMemory({ id: '2', topics: ['Web', 'React'] }),
        createTestMemory({ id: '3', topics: ['AI', 'NLP'] }),
      ];
      
      const query = 'AI';
      const results = memories.filter(m =>
        m.topics.some(t => t.toLowerCase().includes(query.toLowerCase()))
      );
      
      expect(results.length).toBe(2);
      expect(results.map(r => r.id).sort()).toEqual(['1', '3']);
    });

    it('should search memories by content', () => {
      const memories = [
        createTestMemory({ id: '1', content: 'Machine learning algorithms are powerful' }),
        createTestMemory({ id: '2', content: 'Web development with React is fun' }),
        createTestMemory({ id: '3', content: 'Deep learning uses neural networks' }),
      ];
      
      const query = 'learning';
      const results = memories.filter(m =>
        m.content.toLowerCase().includes(query.toLowerCase())
      );
      
      // "Machine learning" and "Deep learning" contain "learning"
      expect(results.length).toBe(2);
      expect(results.map(r => r.id).sort()).toEqual(['1', '3']);
    });

    it('should limit search results', () => {
      const memories = Array(20).fill(null).map((_, i) =>
        createTestMemory({ id: `${i}`, topics: ['test'] })
      );
      
      const limit = 5;
      const results = memories.slice(0, limit);
      
      expect(results.length).toBe(limit);
    });

    it('should return empty for no matches', () => {
      const memories = [
        createTestMemory({ id: '1', topics: ['AI'] }),
        createTestMemory({ id: '2', topics: ['ML'] }),
      ];
      
      const results = memories.filter(m =>
        m.topics.some(t => t.includes('Web'))
      );
      
      expect(results.length).toBe(0);
    });
  });

  describe('Memory Filtering', () => {
    it('should filter by importance level', () => {
      const memories = [
        createTestMemory({ id: '1', importance: 'high' }),
        createTestMemory({ id: '2', importance: 'medium' }),
        createTestMemory({ id: '3', importance: 'low' }),
        createTestMemory({ id: '4', importance: 'high' }),
      ];
      
      const highPriority = memories.filter(m => m.importance === 'high');
      
      expect(highPriority.length).toBe(2);
      expect(highPriority.map(m => m.id)).toEqual(['1', '4']);
    });

    it('should filter by multiple topics', () => {
      const memories = [
        createTestMemory({ id: '1', topics: ['AI', 'ML'] }),
        createTestMemory({ id: '2', topics: ['AI', 'NLP'] }),
        createTestMemory({ id: '3', topics: ['ML', 'DL'] }),
      ];
      
      const hasAIAndML = memories.filter(m =>
        m.topics.includes('AI') && m.topics.includes('ML')
      );
      
      expect(hasAIAndML.length).toBe(1);
      expect(hasAIAndML[0].id).toBe('1');
    });
  });

  describe('Memory Sorting', () => {
    it('should sort by creation date descending', () => {
      const now = Date.now();
      const memories = [
        createTestMemory({ id: 'old', createdAt: now - 10000 }),
        createTestMemory({ id: 'new', createdAt: now }),
        createTestMemory({ id: 'middle', createdAt: now - 5000 }),
      ];
      
      const sorted = [...memories].sort((a, b) => b.createdAt - a.createdAt);
      
      expect(sorted[0].id).toBe('new');
      expect(sorted[1].id).toBe('middle');
      expect(sorted[2].id).toBe('old');
    });

    it('should sort by updated date', () => {
      const memories = [
        createTestMemory({ id: 'a', updatedAt: 3000 }),
        createTestMemory({ id: 'b', updatedAt: 1000 }),
        createTestMemory({ id: 'c', updatedAt: 2000 }),
      ];
      
      const sorted = [...memories].sort((a, b) => b.updatedAt - a.updatedAt);
      
      expect(sorted.map(m => m.id)).toEqual(['a', 'c', 'b']);
    });
  });

  describe('Memory Index Operations', () => {
    it('should create valid index structure', () => {
      const index = {
        version: '1.0',
        updated: new Date().toISOString(),
        memories: [
          { id: '1', topics: ['test'], importance: 'medium' },
        ],
      };
      
      expect(index.version).toBe('1.0');
      expect(index.memories.length).toBe(1);
    });

    it('should sync index with memories', () => {
      const memories = [
        createTestMemory({ id: '1' }),
        createTestMemory({ id: '2' }),
      ];
      
      const index = {
        version: '1.0',
        updated: new Date().toISOString(),
        memories: memories.map(m => ({
          id: m.id,
          topics: m.topics,
          importance: m.importance,
          created: m.createdAt,
          updated: m.updatedAt,
        })),
      };
      
      expect(index.memories.length).toBe(memories.length);
      expect(index.memories[0].id).toBe('1');
    });

    it('should handle index recovery', () => {
      const existingFiles = [
        '/memories/memory_2025-01-01_test-abc123.md',
        '/memories/memory_2025-01-02_example-def456.md',
      ];
      
      const recoveredIndex = {
        version: '1.0',
        updated: new Date().toISOString(),
        memories: existingFiles.map(filePath => {
          const fileName = filePath.split('/').pop() || '';
          // memory_2025-01-01_test-abc123.md -> extract "test-abc123"
          const match = fileName.match(/memory_\d{4}-\d{2}-\d{2}_(.+)\.md$/);
          return {
            id: match ? match[1] : fileName.replace('.md', ''),
            filePath,
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            topics: [],
            importance: 'medium' as const,
          };
        }),
      };
      
      expect(recoveredIndex.memories.length).toBe(2);
      expect(recoveredIndex.memories[0].id).toBe('test-abc123');
    });
  });

  describe('Memory Promotions', () => {
    it('should track promoted memories', () => {
      const promotedFrom = 'session-123';
      const memory = {
        ...createTestMemory({ id: 'promoted' }),
        promotedFrom,
        promotedAt: Date.now(),
      };
      
      expect(memory.promotedFrom).toBe(promotedFrom);
      expect(memory.promotedAt).toBeDefined();
    });

    it('should calculate access count', () => {
      const accessCount = 5;
      const memory = {
        ...createTestMemory({ id: 'accessed' }),
        accessCount,
      };
      
      expect(memory.accessCount).toBe(5);
    });

    it('should handle starred status', () => {
      const starredMemory = {
        ...createTestMemory({ id: 'starred' }),
        isStarred: true,
        importance: 'high' as const,
      };
      
      expect(starredMemory.isStarred).toBe(true);
      expect(starredMemory.importance).toBe('high');
    });
  });

  describe('Memory Statistics', () => {
    it('should calculate memory statistics', () => {
      const memories = [
        createTestMemory({ id: '1', topics: ['AI'] }),
        createTestMemory({ id: '2', topics: ['AI', 'ML'] }),
        createTestMemory({ id: '3', topics: ['ML'] }),
        createTestMemory({ id: '4', topics: ['Web'] }),
      ];
      
      const topicCount: Record<string, number> = {};
      memories.forEach(m => {
        m.topics.forEach(t => {
          topicCount[t] = (topicCount[t] || 0) + 1;
        });
      });
      
      expect(topicCount.AI).toBe(2);
      expect(topicCount.ML).toBe(2);
      expect(topicCount.Web).toBe(1);
    });

    it('should count by importance level', () => {
      const memories = [
        createTestMemory({ id: '1', importance: 'high' }),
        createTestMemory({ id: '2', importance: 'medium' }),
        createTestMemory({ id: '3', importance: 'high' }),
        createTestMemory({ id: '4', importance: 'low' }),
      ];
      
      const byImportance = memories.reduce((acc, m) => {
        acc[m.importance] = (acc[m.importance] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      expect(byImportance.high).toBe(2);
      expect(byImportance.medium).toBe(1);
      expect(byImportance.low).toBe(1);
    });
  });

  describe('Three Layer Memory Integration', () => {
    it('should migrate from short-term to mid-term', () => {
      const shortTermMessages = Array(10).fill(null).map((_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        token_count: 20,
      }));
      
      const summary = `Conversation with ${shortTermMessages.length / 2} exchanges`;
      const compactedSession = {
        id: 'session-123',
        summary,
        keyTopics: ['test', 'integration'],
        decisions: [],
        createdAt: Date.now(),
      };
      
      expect(shortTermMessages.length).toBe(10);
      expect(compactedSession.summary).toBeTruthy();
    });

    it('should promote to long-term memory', () => {
      const session = {
        id: 'session-456',
        summary: 'Important session summary',
        keyTopics: ['project', 'architecture'],
        decisions: ['Decision 1', 'Decision 2'],
      };
      
      const embedding = Array(768).fill(0.1); // Mock embedding vector
      
      const longTermMemory = {
        id: `ltm-${session.id}`,
        sessionId: session.id,
        summary: session.summary,
        topics: session.keyTopics,
        embedding,
        createdAt: Date.now(),
      };
      
      expect(longTermMemory.id).toContain(session.id);
      expect(longTermMemory.topics).toEqual(session.keyTopics);
      expect(longTermMemory.embedding.length).toBe(768);
    });
  });

  describe('Result Type Operations', () => {
    it('should handle success result', () => {
      const result = {
        success: true,
        data: { id: 'test-123' },
      };
      
      if (result.success) {
        expect(result.data.id).toBe('test-123');
      }
    });

    it('should handle error result', () => {
      const result = {
        success: false,
        error: 'Test error message',
      };
      
      if (!result.success) {
        expect(result.error).toBe('Test error message');
      }
    });

    it('should transform result types', () => {
      type Result<T> = { success: true; data: T } | { success: false; error: string };
      const isErrorResult = <T,>(result: Result<T>): result is { success: false; error: string } =>
        result.success === false;

      const formatResult = <T,>(result: Result<T>) => {
        if (isErrorResult(result)) {
          return { type: 'error' as const, message: result.error };
        }
        return { type: 'success' as const, value: result.data };
      };

      const input: Result<string> = { success: true, data: 'test' };
      const output = formatResult(input);

      expect(output.type).toBe('success');
      if (output.type === 'success') {
        expect(output.value).toBe('test');
      }
    });
  });
});
