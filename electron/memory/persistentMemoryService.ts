import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';

export interface MemoryDocument {
  id: string;
  filePath: string;
  created: number;
  updated: number;
  topics: string[];
  importance: 'low' | 'medium' | 'high';
  sourceSessions: string[];
  content: string;
  // 永久记忆扩展字段
  title?: string;
  summary?: string;
  category?: string;
  isStarred?: boolean;
  accessCount?: number;
  promotedFrom?: string;
  promotedAt?: number;
  sourcePath?: string;
  sourceType?: 'file' | 'conversation' | 'manual';
  lastAccessedAt?: number;
}

interface MemoryIndex {
  version: string;
  updated: string;
  memories: Array<{
    id: string;
    filePath: string;
    created: string;
    updated: string;
    topics: string[];
    importance: string;
  }>;
}

export class MainProcessMemoryService {
  private memoriesDir: string;
  private indexPath: string;
  private initialized: boolean = false;

  constructor() {
    this.memoriesDir = path.join(app.getPath('userData'), '.memories');
    this.indexPath = path.join(this.memoriesDir, '_memories_index.json');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      if (!fs.existsSync(this.memoriesDir)) {
        fs.mkdirSync(this.memoriesDir, { recursive: true });
        logger.info('[MainProcessMemoryService] Created memories directory:', this.memoriesDir);

        // 开发模式：从项目目录复制测试记忆
        const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
        if (isDev) {
          const projectMemoriesDir = path.join(process.cwd(), '.memories');
          if (fs.existsSync(projectMemoriesDir)) {
            logger.info('[MainProcessMemoryService] Dev mode: Copying memories from project directory');
            await this.copyMemoriesFromProject(projectMemoriesDir);
          }
        }
      }
      this.initialized = true;
    } catch (error) {
      logger.error('[MainProcessMemoryService] Failed to initialize:', error);
      throw error;
    }
  }

  private async recoverIndexFromFiles(): Promise<MemoryIndex> {
    logger.warn('[MainProcessMemoryService] Index file corrupted, attempting recovery from memory files');

    const index: MemoryIndex = {
      version: '1.0',
      updated: new Date().toISOString(),
      memories: [],
    };

    try {
      const files = fs.readdirSync(this.memoriesDir);
      const mdFiles = files.filter(f => f.endsWith('.md') && f !== '_memories_index.json');

      for (const fileName of mdFiles) {
        try {
          const filePath = path.join(this.memoriesDir, fileName);
          const content = fs.readFileSync(filePath, 'utf-8');

          const memoryInfo = this.parseFileToIndexEntry(fileName, content);
          if (memoryInfo) {
            index.memories.push(memoryInfo);
          }
        } catch (fileError) {
          logger.warn('[MainProcessMemoryService] Failed to recover memory file:', fileName);
        }
      }

      // 保存恢复后的索引
      fs.writeFileSync(this.indexPath, JSON.stringify(index, null, 2), 'utf-8');
      logger.info('[MainProcessMemoryService] Index recovered successfully', { memoryCount: index.memories.length });

      return index;
    } catch (error) {
      logger.error('[MainProcessMemoryService] Failed to recover index:', error);
      return index;
    }
  }

  private parseFileToIndexEntry(fileName: string, content: string): MemoryIndex['memories'][0] | null {
    try {
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!frontmatterMatch) return null;

      const frontmatter = frontmatterMatch[1];

      const idMatch = frontmatter.match(/id:\s*(.+)/);
      const createdMatch = frontmatter.match(/created:\s*(.+)/);
      const updatedMatch = frontmatter.match(/updated:\s*(.+)/);
      const topicsMatch = frontmatter.match(/topics:\s*(\[[^\]]*\])/);
      const importanceMatch = frontmatter.match(/importance:\s*(.+)/);

      if (!idMatch) return null;

      const topicsStr = topicsMatch ? topicsMatch[1] : '[]';
      let topics: string[] = [];
      try {
        topics = JSON.parse(topicsStr);
      } catch {}

      return {
        id: idMatch[1].trim(),
        filePath: path.join(this.memoriesDir, fileName),
        created: createdMatch ? createdMatch[1].trim() : new Date().toISOString(),
        updated: updatedMatch ? updatedMatch[1].trim() : new Date().toISOString(),
        topics,
        importance: importanceMatch ? importanceMatch[1].trim() : 'medium',
      };
    } catch {
      return null;
    }
  }

  private parseIndexFile(content: string): MemoryIndex | null {
    try {
      const index: MemoryIndex = JSON.parse(content);
      if (!index.version || !Array.isArray(index.memories)) {
        return null;
      }
      return index;
    } catch {
      return null;
    }
  }

  private async copyMemoriesFromProject(projectDir: string): Promise<void> {
    try {
      const projectIndexPath = path.join(projectDir, '_memories_index.json');

      if (!fs.existsSync(projectIndexPath)) {
        logger.info('[MainProcessMemoryService] No project memories index found');
        return;
      }

      const projectIndexData = fs.readFileSync(projectIndexPath, 'utf-8');
      const projectIndex = JSON.parse(projectIndexData);

      for (const memoryInfo of projectIndex.memories || []) {
        if (fs.existsSync(memoryInfo.filePath)) {
          const content = fs.readFileSync(memoryInfo.filePath, 'utf-8');
          // 修复 Windows 路径问题：直接用 path.sep 分隔符获取最后一部分
          const pathParts = memoryInfo.filePath.split(/[\\/]/);
          const fileName = pathParts[pathParts.length - 1];
          const targetPath = path.join(this.memoriesDir, fileName);

          fs.writeFileSync(targetPath, content, 'utf-8');
          logger.info('[MainProcessMemoryService] Copied memory:', fileName);

          // 更新索引中的路径
          memoryInfo.filePath = targetPath;
        }
      }

      // 保存更新后的索引
      projectIndex.updated = new Date().toISOString();
      fs.writeFileSync(this.indexPath, JSON.stringify(projectIndex, null, 2), 'utf-8');
      logger.info('[MainProcessMemoryService] Memories copied and index updated');
    } catch (error) {
      logger.error('[MainProcessMemoryService] Failed to copy memories:', error);
    }
  }

  async saveMemory(memory: MemoryDocument): Promise<void> {
    await this.initialize();

    // Use existing filePath if available (for updates), otherwise generate new
    let filePath: string;
    if (memory.filePath && fs.existsSync(memory.filePath)) {
      filePath = memory.filePath;
      logger.info('[MainProcessMemoryService] Updating existing memory file:', path.basename(filePath));
    } else {
      const fileName = this.generateFileName(memory);
      filePath = path.join(this.memoriesDir, fileName);
      logger.info('[MainProcessMemoryService] Creating new memory file:', path.basename(filePath));
    }

    const content = this.formatAsMarkdown(memory);

    fs.writeFileSync(filePath, content, 'utf-8');

    // Verify write
    const written = fs.readFileSync(filePath, 'utf-8');

    logger.debug('[MainProcessMemoryService] Verified written content', {
      writtenLength: written.length,
      matches: written === content
    });

    memory.filePath = filePath;
    await this.updateIndex(memory);

    logger.info('[MainProcessMemoryService] Saved memory:', path.basename(filePath));
  }

  async searchMemories(query: string, limit: number = 5): Promise<MemoryDocument[]> {
    await this.initialize();

    if (!fs.existsSync(this.indexPath)) {
      logger.info('[MainProcessMemoryService] No index file found');
      return [];
    }

    let index: MemoryIndex;

    try {
      const indexData = fs.readFileSync(this.indexPath, 'utf-8');
      index = this.parseIndexFile(indexData) || await this.recoverIndexFromFiles();
    } catch (error) {
      logger.error('[MainProcessMemoryService] Failed to read index file:', error);
      index = await this.recoverIndexFromFiles();
    }

    const queryLower = query.toLowerCase();
    const results: MemoryDocument[] = [];
    const seenIds = new Set<string>();

    for (const memoryInfo of index.memories) {
      if (seenIds.has(memoryInfo.id)) continue;
      
      let matched = false;
      let matchType: 'content' | 'topics' | null = null;

      try {
        // 🔧 修复: 同时搜索 topics 和 content
        const content = fs.readFileSync(memoryInfo.filePath, 'utf-8');
        
        // 1. 搜索内容（更全面）
        if (content.toLowerCase().includes(queryLower)) {
          matched = true;
          matchType = 'content';
        }
        
        // 2. 搜索 topics（作为补充）
        const topicsMatch = memoryInfo.topics?.some(
          (t: string) => t.toLowerCase().includes(queryLower)
        );
        
        if (topicsMatch) {
          matched = true;
          matchType = 'topics';
        }

        if (matched) {
          const memory = this.parseMarkdownToMemory(content, memoryInfo);
          (memory as any)._matchType = matchType; // 记录匹配类型用于调试
          results.push(memory);
          seenIds.add(memoryInfo.id);
          logger.debug('[MainProcessMemoryService] Memory matched:', { 
            id: memoryInfo.id, 
            matchType,
            query 
          });
        }
      } catch {
        logger.warn('[MainProcessMemoryService] Failed to read memory file:', memoryInfo.filePath);
      }

      if (results.length >= limit) break;
    }

    logger.info('[MainProcessMemoryService] Search completed:', { 
      query, 
      resultCount: results.length,
      limit 
    });
    return results;
  }

  async getAllMemories(): Promise<MemoryDocument[]> {
    await this.initialize();

    if (!fs.existsSync(this.indexPath)) return [];

    let index: MemoryIndex;

    try {
      const indexData = fs.readFileSync(this.indexPath, 'utf-8');
      index = this.parseIndexFile(indexData) || await this.recoverIndexFromFiles();
    } catch (error) {
      logger.error('[MainProcessMemoryService] Failed to read index file:', error);
      index = await this.recoverIndexFromFiles();
    }

    const memories: MemoryDocument[] = [];

    for (const memoryInfo of index.memories) {
      try {
        const content = fs.readFileSync(memoryInfo.filePath, 'utf-8');
        memories.push(this.parseMarkdownToMemory(content, memoryInfo));
      } catch {
        continue;
      }
    }

    return memories.sort((a, b) => b.updated - a.updated);
  }

  async getMemoryById(id: string): Promise<MemoryDocument | null> {
    await this.initialize();

    if (!fs.existsSync(this.indexPath)) return null;

    let index: MemoryIndex;

    try {
      const indexData = fs.readFileSync(this.indexPath, 'utf-8');
      index = this.parseIndexFile(indexData) || await this.recoverIndexFromFiles();
    } catch (error) {
      logger.error('[MainProcessMemoryService] Failed to read index file:', error);
      index = await this.recoverIndexFromFiles();
    }

    const memoryInfo = index.memories.find(m => m.id === id);
    if (!memoryInfo) {
      logger.debug('[MainProcessMemoryService] Memory not found in index:', id);
      return null;
    }

    const content = fs.readFileSync(memoryInfo.filePath, 'utf-8');
    const memory = this.parseMarkdownToMemory(content, memoryInfo);

    logger.debug('[MainProcessMemoryService] Retrieved memory by id:', id);
    return memory;
  }

  private generateFileName(memory: MemoryDocument): string {
    const date = new Date(memory.created).toISOString().split('T')[0];
    const topicSlug = memory.topics[0]
      ? memory.topics[0].replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, '-').toLowerCase()
      : 'general';
    const shortId = memory.id.substring(memory.id.length - 6);
    return `memory_${date}_${topicSlug}_${shortId}.md`;
  }

  private formatAsMarkdown(memory: MemoryDocument): string {
    return `---
id: ${memory.id}
created: ${new Date(memory.created).toISOString()}
updated: ${new Date(memory.updated).toISOString()}
topics: ${JSON.stringify(memory.topics)}
importance: ${memory.importance}
source_sessions: ${JSON.stringify(memory.sourceSessions)}
---

${memory.content}`;
  }

  private parseMarkdownToMemory(content: string, metadata: any): MemoryDocument {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    let parsedContent = content;
    let topics: string[] = metadata.topics || [];

    if (frontmatterMatch) {
      parsedContent = frontmatterMatch[2];
      const frontmatter = frontmatterMatch[1];
      const topicMatch = frontmatter.match(/topics:\s*(\[[^\]]*\])/);
      if (topicMatch) {
        try {
          topics = JSON.parse(topicMatch[1]);
        } catch {}
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

  private async updateIndex(memory: MemoryDocument): Promise<void> {
    let index: MemoryIndex;

    try {
      if (fs.existsSync(this.indexPath)) {
        const data = fs.readFileSync(this.indexPath, 'utf-8');
        index = JSON.parse(data);
      } else {
        index = { version: '1.0', updated: '', memories: [] };
      }
    } catch (error) {
      logger.error('[MainProcessMemoryService] Failed to read index:', error);
      index = { version: '1.0', updated: '', memories: [] };
    }

    const existingIndex = index.memories.findIndex(m => m.id === memory.id);
    const memoryEntry = {
      id: memory.id,
      filePath: memory.filePath,
      created: new Date(memory.created).toISOString(),
      updated: new Date(memory.updated).toISOString(),
      topics: memory.topics,
      importance: memory.importance,
    };

    if (existingIndex >= 0) {
      index.memories[existingIndex] = memoryEntry;
    } else {
      index.memories.push(memoryEntry);
    }

    index.updated = new Date().toISOString();

    fs.writeFileSync(this.indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }
}

let memoryServiceInstance: MainProcessMemoryService | null = null;

export function getMainProcessMemoryService(): MainProcessMemoryService {
  if (!memoryServiceInstance) {
    memoryServiceInstance = new MainProcessMemoryService();
  }
  return memoryServiceInstance;
}
