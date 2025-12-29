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
  private isPackaged: boolean;

  constructor(config?: Partial<PersistentMemoryConfig>) {
    this.memoriesFolder = config?.memoriesFolder ?? '.memories';
    this.indexFileName = config?.indexFileName ?? '_memories_index.json';
    this.isPackaged = !(typeof process !== 'undefined' && process.env?.NODE_ENV === 'development');
  }

  private getMemoriesDir(): string {
    const electronAPI = (window as any).electronAPI;
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
      const electronAPI = (window as any).electronAPI;
      const fsAPI = electronAPI?.fs || electronAPI?.file;
      
      if (fsAPI?.writeFile) {
        const fileName = this.generateFileName(memory);
        const fullPath = this.getMemoryFilePath(fileName);
        
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
      const electronAPI = (window as any).electronAPI;
      const fsAPI = electronAPI?.fs || electronAPI?.file;
      
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
      const electronAPI = (window as any).electronAPI;
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

      const electronAPI = (window as any).electronAPI;
      const fsAPI = electronAPI?.fs || electronAPI?.file;
      
      if (fsAPI?.deleteFile) {
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
      const electronAPI = (window as any).electronAPI;
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

      const electronAPI = (window as any).electronAPI;
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

    // Save original state for potential rollback
    const originalContent = memory.content;
    const originalUpdated = memory.updated;

    memory.content = content;
    memory.updated = Date.now();

    const success = await this.fileStorage.updateMemory(id, { content });
    if (!success) {
      console.error('[PersistentMemoryService] Failed to update memory file');
      return false;
    }

    // Index update with transaction-like guarantee
    if (this.embeddingService) {
      let indexUpdateSuccess = false;
      let deleteSuccess = false;

      try {
        if (typeof window !== 'undefined' && (window as any).electronAPI?.lancedb) {
          // Step 1: Delete old index entry
          try {
            await (window as any).electronAPI.lancedb.deleteById(id);
            deleteSuccess = true;
          } catch (deleteError) {
            console.warn('[PersistentMemoryService] Failed to delete old index (may not exist):', deleteError);
            // Continue even if delete fails - the entry might not exist
            deleteSuccess = true; // Treat as success since we're creating new
          }

          // Step 2: Create new embedding and index
          const embedding = await this.embeddingService(content);
          await this.indexMemoryToLanceDB(memory, embedding);

          // Step 3: Verify the index was created successfully
          try {
            const searchResults = await (window as any).electronAPI.lancedb.search(embedding, 1);
            indexUpdateSuccess = searchResults?.some((r: any) => r.id === id);

            if (!indexUpdateSuccess) {
              console.warn('[PersistentMemoryService] Index verification failed - entry not found after indexing');
            }
          } catch (verifyError) {
            console.warn('[PersistentMemoryService] Failed to verify index update:', verifyError);
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
          console.log('[PersistentMemoryService] Rolled back file changes after index failure');
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

export interface PromotionCriteria {
  hasCodeFix: boolean;
  hasLearning: boolean;
  hasTechStack: boolean;
  userMarkedImportant: boolean;
  mentionCount: number;
  sessionLength: number;
}

export function shouldPromoteToPermanentMemory(
  decisions: string[],
  keyFindings: string[],
  topics: string[],
  sessionLength: number,
  criteria?: Partial<PromotionCriteria>
): boolean {
  const {
    hasCodeFix = decisions.some(d =>
      /\b(fix|bug|error|issue|repair|solve|resolve)\b/i.test(d)
    ),
    hasLearning = keyFindings.some(f =>
      /\b(learn|discover|understand|realize|notice)\b/i.test(f)
    ),
    hasTechStack = topics.some(t =>
      /\b(react|typescript|electron|node|python|api|database|server|client)\b/i.test(t)
    ),
    userMarkedImportant = false,
    mentionCount = 0,
    sessionLength: minSessionLength = 10,
  } = criteria || {};

  const score = (hasCodeFix ? 3 : 0) +
                (hasLearning ? 2 : 0) +
                (hasTechStack ? 1 : 0) +
                (userMarkedImportant ? 5 : 0) +
                Math.min(mentionCount, 3);

  return score >= 3 || sessionLength >= minSessionLength;
}

export async function autoCreateMemoryFromSession(
  service: PersistentMemoryService,
  sessionId: string,
  messages: any[],
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

function generateSessionSummary(messages: any[]): string {
  const userMsgs = messages.filter(m => m.role === 'user').slice(-5);
  const assistantMsgs = messages.filter(m => m.role === 'assistant').slice(-5);

  const recentConversation = userMsgs.map((u, i) => {
    const a = assistantMsgs[i];
    return `User: ${u.content.substring(0, 200)}...\nAssistant: ${a?.content?.substring(0, 200) || 'N/A'}...`;
  }).join('\n\n---\n\n');

  return `会话包含 ${messages.length} 条消息。\n\n最近对话：\n${recentConversation}`;
}

function extractTopics(messages: any[]): string[] {
  const topics: Set<string> = new Set();
  const topicKeywords = [
    'React', 'TypeScript', 'Electron', 'Node.js', 'API', 'Database',
    'AI', 'Claude', 'MCP', 'RAG', '向量数据库', 'Context',
    'Bug', 'Fix', 'Error', '性能', '优化', '架构', '设计',
    '组件', '状态管理', '内存', '存储', '文件', '搜索',
  ];

  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : '';
    for (const keyword of topicKeywords) {
      if (content.toLowerCase().includes(keyword.toLowerCase())) {
        topics.add(keyword);
      }
    }
  }

  return Array.from(topics).slice(0, 5);
}

function extractDecisions(messages: any[]): string[] {
  const decisions: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      const content = typeof msg.content === 'string' ? msg.content : '';
      const decisionPatterns = [
        /(?:we decided|decided to|decision was|chose to|will use|using)\s+([^.]+)/gi,
        /(?:解决方案|solution|方法|approach)[:\s]+([^.]+)/gi,
      ];

      for (const pattern of decisionPatterns) {
        const matches = content.matchAll(pattern);
        for (const match of matches) {
          if (match[1]) {
            decisions.push(match[1].trim().substring(0, 150));
          }
        }
      }
    }
  }

  return [...new Set(decisions)].slice(0, 5);
}

function extractKeyFindings(messages: any[]): string[] {
  const findings: string[] = [];

  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : '';
    const findingPatterns = [
      /(?:found|discovered|learned|noticed|realized|important|critical|key)[s]?[:\s]+([^.]+)/gi,
      /(?:发现|重要|关键|注意)[:\s]+([^.]+)/gi,
    ];

    for (const pattern of findingPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          findings.push(match[1].trim().substring(0, 200));
        }
      }
    }
  }

  return [...new Set(findings)].slice(0, 5);
}
