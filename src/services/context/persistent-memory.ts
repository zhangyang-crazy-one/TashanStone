import { MemoryDocument, IndexedConversation } from './types';

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

  constructor(config?: Partial<PersistentMemoryConfig>) {
    this.memoriesFolder = config?.memoriesFolder ?? '.memories';
    this.indexFileName = config?.indexFileName ?? '_memories_index.json';
  }

  getIndexFilePath(): string {
    return `${this.memoriesFolder}/${this.indexFileName}`;
  }

  async saveMemory(memory: MemoryDocument): Promise<void> {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const fileName = this.generateFileName(memory);
        const fullPath = `${this.memoriesFolder}/${fileName}`;
        
        const content = this.formatMemoryAsMarkdown(memory);
        await (window as any).electronAPI.file.writeFile(fullPath, content);
        
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
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const indexPath = this.getIndexFilePath();
        const indexData = await (window as any).electronAPI.file.readFile(indexPath);
        if (indexData) {
          const index = JSON.parse(indexData);
          const memoryInfo = index.memories.find((m: any) => m.id === id);
          if (memoryInfo) {
            const content = await (window as any).electronAPI.file.readFile(memoryInfo.filePath);
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
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const indexPath = this.getIndexFilePath();
        const indexData = await (window as any).electronAPI.file.readFile(indexPath);
        if (indexData) {
          const index = JSON.parse(indexData);
          const memories: MemoryDocument[] = [];
          
          for (const memoryInfo of index.memories) {
            try {
              const content = await (window as any).electronAPI.file.readFile(memoryInfo.filePath);
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

      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        await (window as any).electronAPI.file.deleteFile(memory.filePath);
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
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        await (window as any).electronAPI.file.writeFile(memory.filePath, content);
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
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    
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

      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const indexPath = this.getIndexFilePath();
        await (window as any).electronAPI.file.writeFile(indexPath, JSON.stringify(index, null, 2));
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
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const memoriesFolder = this.fileStorage['memoriesFolder'];
        await (window as any).electronAPI.file.ensureDir(memoriesFolder);
        this.initialized = true;
        console.log('[PersistentMemoryService] Initialized');
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
      console.warn('[PersistentMemoryService] No embedding service configured');
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
      importance: this.calculateImportance(topics, decisions, keyFindings),
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
    if (!this.embeddingService) {
      const all = await this.getAllMemories();
      return all.filter(m => 
        m.content.toLowerCase().includes(query.toLowerCase()) ||
        m.topics.some(t => t.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, limit);
    }

    try {
      const embedding = await this.embeddingService(query);
      
      if (typeof window !== 'undefined' && (window as any).electronAPI?.lancedb) {
        const results = await (window as any).electronAPI.lancedb.search(embedding, limit);
        
        const memories: MemoryDocument[] = [];
        for (const result of results) {
          try {
            const metadata = JSON.parse(result.metadata || '{}');
            if (metadata.type === 'memory_document') {
              const memory = await this.fileStorage.getMemory(result.id);
              if (memory) memories.push(memory);
            }
          } catch {
            continue;
          }
        }
        
        return memories;
      }
    } catch (error) {
      console.error('[PersistentMemoryService] Search failed:', error);
    }

    return [];
  }

  async updateMemory(id: string, content: string): Promise<boolean> {
    const memory = await this.fileStorage.getMemory(id);
    if (!memory) return false;

    memory.content = content;
    memory.updated = Date.now();

    const success = await this.fileStorage.updateMemory(id, { content });
    if (success && this.embeddingService) {
      const embedding = await this.embeddingService(content);
      await this.indexMemoryToLanceDB(memory, embedding);
    }

    return success;
  }

  async deleteMemory(id: string): Promise<boolean> {
    return this.fileStorage.deleteMemory(id);
  }

  private generateMemoryContent(
    summary: string,
    topics: string[],
    decisions: string[],
    keyFindings: string[]
  ): string {
    let content = `# ${topics[0] || '会话记忆'}\n\n`;
    content += `## 摘要\n\n${summary}\n\n`;

    if (topics.length > 0) {
      content += `## 主题标签\n\n${topics.map(t => `- ${t}`).join('\n')}\n\n`;
    }

    if (decisions.length > 0) {
      content += `## 关键决策\n\n${decisions.map(d => `- ${d}`).join('\n')}\n\n`;
    }

    if (keyFindings.length > 0) {
      content += `## 重要发现\n\n${keyFindings.map(f => `- ${f}`).join('\n')}\n\n`;
    }

    content += `---\n\n## 用户笔记\n\n<!-- 在此添加您的注释和思考 -->\n`;

    return content;
  }

  private calculateImportance(
    topics: string[],
    decisions: string[],
    keyFindings: string[]
  ): 'low' | 'medium' | 'high' {
    let score = 0;
    score += decisions.length * 2;
    score += keyFindings.length * 1.5;
    score += topics.length * 0.5;

    const highImportanceKeywords = ['bug', 'fix', '修复', '问题', 'error', '优化', '性能', '安全'];
    if (topics.some(t => highImportanceKeywords.some(k => t.toLowerCase().includes(k)))) {
      score += 3;
    }

    if (score >= 5) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }

  private async indexMemoryToLanceDB(memory: MemoryDocument, embedding: number[]): Promise<void> {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.lancedb) {
        const chunk = {
          id: memory.id,
          file_id: memory.id,
          text: memory.content,
          embedding,
          chunk_start: 0,
          chunk_end: memory.content.length,
          file_name: memory.filePath.split('/').pop() || memory.id,
          file_last_modified: memory.updated,
          metadata: JSON.stringify({
            topics: memory.topics,
            type: 'memory_document',
            importance: memory.importance,
          }),
        };

        await (window as any).electronAPI.lancedb.add([chunk]);
        console.log(`[PersistentMemoryService] Indexed memory: ${memory.id}`);
      }
    } catch (error) {
      console.error('[PersistentMemoryService] Failed to index memory:', error);
    }
  }
}

export function createPersistentMemoryService(config?: Partial<PersistentMemoryConfig>): PersistentMemoryService {
  return new PersistentMemoryService(config);
}
