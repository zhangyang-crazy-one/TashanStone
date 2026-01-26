import { MemoryDocument, IndexedConversation } from './types';
import {
  calculateMemoryImportance,
  extractDecisions,
  extractKeyFindings,
  extractTopics,
  generateSessionSummary,
  type MemoryChatMessage,
  shouldPromoteToPermanentMemory
} from './persistentMemoryPromotion';
import { LANCEDB_MEMORY_FILE_ID_PREFIX } from '@/utils/lanceDbPrefixes';
import type { LanceDbVectorChunk } from '@/src/types/electronAPI';

export type { MemoryDocument } from './types';

export interface MemoryFileStorage {
  saveMemory(memory: MemoryDocument): Promise<void>;
  getMemory(id: string): Promise<MemoryDocument | null>;
  getAllMemories(): Promise<MemoryDocument[]>;
  deleteMemory(id: string): Promise<boolean>;
  updateMemory(id: string, updates: Partial<MemoryDocument>): Promise<boolean>;
  getIndexFilePath(): string;
}

export interface PersistentMemoryConfig {
  memoriesFolder: string;
  indexFileName: string;
}

export class FileMemoryStorage implements MemoryFileStorage {
  private memoriesFolder: string;
  private indexFileName: string;
  private memoriesCache: Map<string, MemoryDocument> = new Map();
  private isPackaged: boolean;

  constructor(config?: Partial<PersistentMemoryConfig>) {
    this.memoriesFolder = config?.memoriesFolder ?? '.memories';
    this.indexFileName = config?.indexFileName ?? '_memories_index.json';
    this.isPackaged = !(typeof process !== 'undefined' && process.env?.NODE_ENV === 'development');
  }

  private getMemoriesDir(): string {
    const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (electronAPI?.paths?.userData) {
      return electronAPI.paths.userData + '/.memories';
    }
    return this.memoriesFolder;
  }

  getIndexFilePath(): string {
    return `${this.getMemoriesDir()}/${this.indexFileName}`;
  }

  private getMemoryFilePath(fileName: string): string {
    return `${this.getMemoriesDir()}/${fileName}`;
  }

  async saveMemory(memory: MemoryDocument): Promise<void> {
    try {
      const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
      const fsAPI = electronAPI?.file ?? electronAPI?.fs;

      if (fsAPI?.writeFile) {
        const fileName = this.generateFileName(memory);
        const fullPath = this.getMemoryFilePath(fileName);

        // 确保目录存在 - 先用 ensureDir，如果不存在就尝试 writeFile（handler 会自动创建）
        const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
        if (fsAPI && 'ensureDir' in fsAPI && fsAPI.ensureDir) {
          try {
            await fsAPI.ensureDir(dirPath);
          } catch (ensureDirError) {
            console.warn('[FileMemoryStorage] ensureDir failed, will rely on writeFile handler:', ensureDirError);
          }
        }

        const content = this.formatMemoryAsMarkdown(memory);
        await fsAPI.writeFile(fullPath, content);

        memory.filePath = fullPath;
        this.memoriesCache.set(memory.id, memory);
        await this.updateIndex();

        console.log(`[FileMemoryStorage] Saved memory: ${fileName}`);
      }
    } catch (error) {
      console.error('[FileMemoryStorage] Failed to save memory:', error);
      throw error;
    }
  }

  async getMemory(id: string): Promise<MemoryDocument | null> {
    const cached = this.memoriesCache.get(id);
    if (cached) return cached;

    try {
      const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
      const fsAPI = electronAPI?.file ?? electronAPI?.fs;
      
      if (fsAPI?.readFile) {
        const indexPath = this.getIndexFilePath();
        const indexData = await fsAPI.readFile(indexPath);
        if (indexData) {
          const index = JSON.parse(indexData);
          const memoryInfo = index.memories.find((m: any) => m.id === id);
          if (memoryInfo) {
            const content = await fsAPI.readFile(memoryInfo.filePath);
            if (content) {
              const memory = this.parseMarkdownToMemory(content, memoryInfo);
              this.memoriesCache.set(id, memory);
              return memory;
            }
          }
        }
      }
    } catch (error) {
      console.error('[FileMemoryStorage] Failed to get memory:', error);
    }

    return null;
  }

  async getAllMemories(): Promise<MemoryDocument[]> {
    try {
      const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
      console.log('[FileMemoryStorage] electronAPI keys:', electronAPI ? Object.keys(electronAPI).join(', ') : 'null');
      console.log('[FileMemoryStorage] electronAPI.fs exists:', !!electronAPI?.fs);
      console.log('[FileMemoryStorage] electronAPI.file exists:', !!electronAPI?.file);
      console.log('[FileMemoryStorage] Memories dir:', this.getMemoriesDir());
      console.log('[FileMemoryStorage] Index path:', this.getIndexFilePath());
      
      const fsAPI = electronAPI?.fs || electronAPI?.file;
      if (fsAPI?.readFile) {
        const indexPath = this.getIndexFilePath();
        const indexData = await fsAPI.readFile(indexPath);
        if (indexData) {
          const index = JSON.parse(indexData);
          const memories: MemoryDocument[] = [];
          
          for (const memoryInfo of index.memories) {
            try {
              const content = await fsAPI.readFile(memoryInfo.filePath);
              if (content) {
                const memory = this.parseMarkdownToMemory(content, memoryInfo);
                memories.push(memory);
                this.memoriesCache.set(memory.id, memory);
              }
            } catch {
              console.warn(`[FileMemoryStorage] Failed to read memory: ${memoryInfo.filePath}`);
            }
          }
          
          return memories.sort((a, b) => b.updated - a.updated);
        }
      }
    } catch (error) {
      console.error('[FileMemoryStorage] Failed to get all memories:', error);
    }
    
    return [];
  }

  async deleteMemory(id: string): Promise<boolean> {
    try {
      const memory = this.memoriesCache.get(id);
      if (!memory) return false;

      const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
      const fsAPI = electronAPI?.fs || electronAPI?.file;
      
      if (fsAPI && 'deleteFile' in fsAPI && fsAPI.deleteFile) {
        await fsAPI.deleteFile(memory.filePath);
        this.memoriesCache.delete(id);
        await this.updateIndex();
        
        console.log(`[FileMemoryStorage] Deleted memory: ${memory.filePath}`);
        return true;
      }
    } catch (error) {
      console.error('[FileMemoryStorage] Failed to delete memory:', error);
    }

    return false;
  }

  async updateMemory(id: string, updates: Partial<MemoryDocument>): Promise<boolean> {
    const memory = this.memoriesCache.get(id);
    if (!memory) return false;

    try {
      const updatedMemory = {
        ...memory,
        ...updates,
        updated: Date.now(),
      };

      const content = this.formatMemoryAsMarkdown(updatedMemory);
      const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
      const fsAPI = electronAPI?.fs || electronAPI?.file;
      
      if (fsAPI?.writeFile) {
        await fsAPI.writeFile(memory.filePath, content);
        this.memoriesCache.set(id, updatedMemory);
        await this.updateIndex();
        
        console.log(`[FileMemoryStorage] Updated memory: ${memory.filePath}`);
        return true;
      }
    } catch (error) {
      console.error('[FileMemoryStorage] Failed to update memory:', error);
    }

    return false;
  }

  private generateFileName(memory: MemoryDocument): string {
    const date = new Date(memory.created).toISOString().split('T')[0];
    const topicSlug = memory.topics[0]
      ? memory.topics[0].replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, '-').toLowerCase()
      : 'general';
    const shortId = memory.id.substring(memory.id.length - 6);
    return `memory_${date}_${topicSlug}_${shortId}.md`;
  }

  private formatMemoryAsMarkdown(memory: MemoryDocument): string {
    const frontmatter = `---
id: ${memory.id}
created: ${new Date(memory.created).toISOString()}
updated: ${new Date(memory.updated).toISOString()}
topics: ${JSON.stringify(memory.topics)}
importance: ${memory.importance}
source_sessions: ${JSON.stringify(memory.sourceSessions)}
---

`;

    return frontmatter + memory.content;
  }

  private parseMarkdownToMemory(content: string, metadata: any): MemoryDocument {
    let actualContent = content;
    
    try {
      const parsed = JSON.parse(content);
      if (parsed.success && parsed.content) {
        actualContent = parsed.content;
      }
    } catch {
    }
    
    const frontmatterMatch = actualContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    
    let topics: string[] = [];
    let parsedContent = content;

    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      parsedContent = frontmatterMatch[2];

      const topicMatch = frontmatter.match(/topics:\s*(\[[^\]]*\])/);
      if (topicMatch) {
        try {
          topics = JSON.parse(topicMatch[1]);
        } catch {
          topics = metadata.topics || [];
        }
      }
    }

    return {
      id: metadata.id,
      filePath: metadata.filePath,
      created: new Date(metadata.created).getTime(),
      updated: new Date(metadata.updated).getTime(),
      topics,
      importance: metadata.importance || 'medium',
      sourceSessions: metadata.sourceSessions || [],
      content: parsedContent.trim(),
    };
  }

  private async updateIndex(): Promise<void> {
    try {
      const memories = Array.from(this.memoriesCache.values()).map(m => ({
        id: m.id,
        filePath: m.filePath,
        created: new Date(m.created).toISOString(),
        updated: new Date(m.updated).toISOString(),
        topics: m.topics,
        importance: m.importance,
      }));

      const index = {
        version: '1.0',
        updated: new Date().toISOString(),
        memories,
      };

      const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
      const fsAPI = electronAPI?.fs || electronAPI?.file;
      
      if (fsAPI?.writeFile) {
        const indexPath = this.getIndexFilePath();
        await fsAPI.writeFile(indexPath, JSON.stringify(index, null, 2));
      }
    } catch (error) {
      console.error('[FileMemoryStorage] Failed to update index:', error);
    }
  }
}

export class PersistentMemoryService {
  private fileStorage: FileMemoryStorage;
  private embeddingService: ((text: string) => Promise<number[]>) | null = null;
  private initialized: boolean = false;

  constructor(config?: Partial<PersistentMemoryConfig>) {
    this.fileStorage = new FileMemoryStorage(config);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      if (typeof window !== 'undefined' && window.electronAPI) {
        const memoriesFolder = this.fileStorage['memoriesFolder'];
        await window.electronAPI.file.ensureDir(memoriesFolder);
        this.initialized = true;
      }
    } catch (error) {
      console.error('[PersistentMemoryService] Failed to initialize:', error);
    }
  }

  setEmbeddingService(service: (text: string) => Promise<number[]>): void {
    this.embeddingService = service;
  }

  async createMemoryFromSession(
    sessionId: string,
    summary: string,
    topics: string[],
    decisions: string[],
    keyFindings: string[]
  ): Promise<MemoryDocument | null> {
    if (!this.embeddingService) {
      return null;
    }

    const id = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const content = this.generateMemoryContent(summary, topics, decisions, keyFindings);

    const memory: MemoryDocument = {
      id,
      filePath: '',
      created: Date.now(),
      updated: Date.now(),
      topics,
      importance: calculateMemoryImportance(topics, decisions, keyFindings),
      sourceSessions: [sessionId],
      content,
    };

    await this.fileStorage.saveMemory(memory);

    const embedding = await this.embeddingService(content);
    await this.indexMemoryToLanceDB(memory, embedding);

    return memory;
  }

  async getMemory(id: string): Promise<MemoryDocument | null> {
    return this.fileStorage.getMemory(id);
  }

  async getAllMemories(): Promise<MemoryDocument[]> {
    return this.fileStorage.getAllMemories();
  }

  async searchMemories(query: string, limit: number = 5): Promise<MemoryDocument[]> {
    // 🔧 修复: 简单情况 - 无 embedding 服务时使用关键词搜索
    if (!this.embeddingService) {
      console.log('[PersistentMemoryService] Using keyword search (no embedding service)');
      const all = await this.getAllMemories();
      return all.filter(m => 
        m.content.toLowerCase().includes(query.toLowerCase()) ||
        m.topics.some(t => t.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, limit);
    }

    try {
      const embedding = await this.embeddingService(query);

      const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
      if (electronAPI?.lancedb) {
        console.log('[PersistentMemoryService] Using LanceDB vector search');
        const results = await electronAPI.lancedb.search(embedding, limit);
        const memoryResults = results.filter((result: LanceDbVectorChunk) =>
          result.fileId.startsWith(LANCEDB_MEMORY_FILE_ID_PREFIX)
        );

        const memories: MemoryDocument[] = [];
        const missingIds: string[] = [];

        for (const result of memoryResults) {
          const memory = await this.fileStorage.getMemory(result.id);
          if (memory) {
            memories.push(memory);
          } else {
            missingIds.push(result.id);
            console.warn('[PersistentMemoryService] Memory file not found:', result.id);
          }
        }
        
        // 🔧 修复: 如果有缺失的记忆文件，尝试回退到关键词搜索
        if (missingIds.length > 0 && memories.length < limit) {
          console.log('[PersistentMemoryService] Fallback to keyword search for missing results');
          const keywordResults = await this.keywordSearchFallback(query, limit - memories.length);
          memories.push(...keywordResults);
        }
        
        // 🔧 修复: 如果 LanceDB 结果为空，回退到关键词搜索
        if (memories.length === 0 && memoryResults.length === 0) {
          console.log('[PersistentMemoryService] LanceDB returned empty, using keyword search');
          return await this.keywordSearchFallback(query, limit);
        }
        
        return memories.slice(0, limit);
      }
    } catch (error) {
      console.error('[PersistentMemoryService] LanceDB search failed:', error);
      console.log('[PersistentMemoryService] Falling back to keyword search...');
      
      // 🔧 修复: 错误时回退到关键词搜索
      return await this.keywordSearchFallback(query, limit);
    }

    // 最后回退：关键词搜索
    return await this.keywordSearchFallback(query, limit);
  }

  // 🔧 新增: 关键词搜索回退方法
  private async keywordSearchFallback(query: string, limit: number): Promise<MemoryDocument[]> {
    console.log('[PersistentMemoryService] Keyword search fallback for:', query);
    
    try {
      const all = await this.getAllMemories();
      const queryLower = query.toLowerCase();
      
      const results = all.filter(m => {
        const contentMatch = m.content.toLowerCase().includes(queryLower);
        const topicsMatch = m.topics?.some(t => t.toLowerCase().includes(queryLower));
        // MemoryDocument 没有 title 字段，移除 titleMatch
        return contentMatch || topicsMatch;
      }).slice(0, limit);
      
      console.log('[PersistentMemoryService] Keyword search found:', results.length, 'results');
      return results;
    } catch (error) {
      console.error('[PersistentMemoryService] Keyword search fallback failed:', error);
      return [];
    }
  }

  async updateMemory(id: string, content: string): Promise<boolean> {
    const memory = await this.fileStorage.getMemory(id);
    if (!memory) return false;

    // Save original state for potential rollback
    const originalContent = memory.content;
    const originalUpdated = memory.updated;

    memory.content = content;
    memory.updated = Date.now();

    const success = await this.fileStorage.updateMemory(id, { content });
    if (!success) {
      return false;
    }

    // Index update with transaction-like guarantee
    if (this.embeddingService) {
      let indexUpdateSuccess = false;
      let deleteSuccess = false;

      try {
        const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
        if (electronAPI?.lancedb) {
          // Step 1: Delete old index entry
          try {
            await electronAPI.lancedb.deleteById(id);
            deleteSuccess = true;
          } catch (deleteError) {
            // Continue even if delete fails - the entry might not exist
            deleteSuccess = true; // Treat as success since we're creating new
          }

          // Step 2: Create new embedding and index
          const embedding = await this.embeddingService(content);
          await this.indexMemoryToLanceDB(memory, embedding);

          // Step 3: Verify the index was created successfully
          try {
            const searchResults = await electronAPI.lancedb.search(embedding, 5);
            indexUpdateSuccess = searchResults.some((result: LanceDbVectorChunk) =>
              result.id === id && result.fileId.startsWith(LANCEDB_MEMORY_FILE_ID_PREFIX)
            );
          } catch (verifyError) {
            // Assume success if verification fails but indexing didn't throw
            indexUpdateSuccess = true;
          }
        }
      } catch (error) {
        console.error('[PersistentMemoryService] Index update failed:', error);

        // Rollback file changes if index update failed
        try {
          await this.fileStorage.updateMemory(id, {
            content: originalContent
          });
          memory.content = originalContent;
          memory.updated = originalUpdated;
        } catch (rollbackError) {
          console.error('[PersistentMemoryService] Rollback failed - inconsistent state:', rollbackError);
        }

        return false;
      }

      if (!indexUpdateSuccess) {
        console.warn('[PersistentMemoryService] Index update may have failed, but file was updated');
      }
    }

    return success;
  }

  async deleteMemory(id: string): Promise<boolean> {
    return this.fileStorage.deleteMemory(id);
  }

  // Internationalized memory templates
  private memoryTemplates: Record<string, {
    title: (topic: string) => string;
    summary: string;
    topics: string;
    decisions: string;
    findings: string;
    notesHeader: string;
    notesPlaceholder: string;
  }> = {
    zh: {
      title: (topic) => `# ${topic || '会话记忆'}`,
      summary: '## 摘要',
      topics: '## 主题标签',
      decisions: '## 关键决策',
      findings: '## 重要发现',
      notesHeader: '---\n\n## 用户笔记',
      notesPlaceholder: '<!-- 在此添加您的注释和思考 -->',
    },
    en: {
      title: (topic) => `# ${topic || 'Session Memory'}`,
      summary: '## Summary',
      topics: '## Topics',
      decisions: '## Key Decisions',
      findings: '## Key Findings',
      notesHeader: '---\n\n## User Notes',
      notesPlaceholder: '<!-- Add your notes and thoughts here -->',
    },
  };

  private generateMemoryContent(
    summary: string,
    topics: string[],
    decisions: string[],
    keyFindings: string[],
    language: string = 'en'
  ): string {
    const t = this.memoryTemplates[language] || this.memoryTemplates.en;
    
    let content = `${t.title(topics[0])}\n\n`;
    content += `${t.summary}\n\n${summary}\n\n`;

    if (topics.length > 0) {
      content += `${t.topics}\n\n${topics.map(t => `- ${t}`).join('\n')}\n\n`;
    }

    if (decisions.length > 0) {
      content += `${t.decisions}\n\n${decisions.map(d => `- ${d}`).join('\n')}\n\n`;
    }

    if (keyFindings.length > 0) {
      content += `${t.findings}\n\n${keyFindings.map(f => `- ${f}`).join('\n')}\n\n`;
    }

    content += `${t.notesHeader}\n\n${t.notesPlaceholder}\n`;

    return content;
  }

  private async indexMemoryToLanceDB(memory: MemoryDocument, embedding: number[]): Promise<void> {
    try {
      const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
      if (electronAPI?.lancedb) {
        const fileName = memory.filePath ? memory.filePath.split('/').pop() || memory.id : memory.id;
        const chunk: LanceDbVectorChunk = {
          id: memory.id,
          fileId: `${LANCEDB_MEMORY_FILE_ID_PREFIX}${memory.id}`,
          fileName,
          content: memory.content,
          vector: embedding,
          chunkIndex: 0,
          lastModified: memory.updated
        };

        await electronAPI.lancedb.add([chunk]);
      }
    } catch (error) {
      console.error('[PersistentMemoryService] Failed to index memory:', error);
    }
  }
}

export function createPersistentMemoryService(config?: Partial<PersistentMemoryConfig>): PersistentMemoryService {
  return new PersistentMemoryService(config);
}

export async function autoCreateMemoryFromSession(
  service: PersistentMemoryService,
  sessionId: string,
  messages: MemoryChatMessage[],
  embeddingService: (text: string) => Promise<number[]>
): Promise<MemoryDocument | null> {
  if (!embeddingService) {
    console.warn('[AutoMemory] No embedding service available');
    return null;
  }

  const userMessages = messages.filter(m => m.role === 'user');
  const assistantMessages = messages.filter(m => m.role === 'assistant');

  if (userMessages.length < 5) {
    console.log('[AutoMemory] Session too short, skipping');
    return null;
  }

  const summary = generateSessionSummary(messages);
  const topics = extractTopics(messages);
  const decisions = extractDecisions(messages);
  const keyFindings = extractKeyFindings(messages);

  const shouldPromote = shouldPromoteToPermanentMemory(
    decisions,
    keyFindings,
    topics,
    messages.length
  );

  if (!shouldPromote) {
    console.log('[AutoMemory] Does not meet promotion criteria');
    return null;
  }

  return service.createMemoryFromSession(sessionId, summary, topics, decisions, keyFindings);
}

export type { PromotionCriteria } from './persistentMemoryPromotion';
export { shouldPromoteToPermanentMemory } from './persistentMemoryPromotion';
