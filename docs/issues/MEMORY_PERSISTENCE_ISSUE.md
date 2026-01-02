# 永久记忆文件持久化问题

## 问题概述

**日期**: 2024-12-29
**状态**: ✅ 已修复（2025-12-29）
**优先级**: 高 (核心功能)
**影响模块**: 三层记忆系统 - 永久记忆层

### 错误现象

1. `.memories/` 目录未被创建
2. 永久记忆 Markdown 文件未生成
3. Chat 面板中的记忆搜索按钮（Brain 图标）点击后无响应
4. AI Agent 只能记住对话内容，但无法感知上下文注入

### 环境信息

- Electron: 33.4.11
- LanceDB: 0.17.0
- Node.js: v20.x
- 相关文件:
  - `electron/ipc/lancedbHandlers.ts`
  - `src/services/context/persistent-memory.ts`
  - `components/ChatPanel.tsx`
  - `electron/preload.ts`

---

## 根本原因分析

### 1. IPC 处理器导入路径错误

**问题位置**: `electron/ipc/lancedbHandlers.ts:165`

```typescript
// 当前代码（错误）
ipcMain.handle('memory:search', async (_, query: string, limit: number = 5) => {
  try {
    const { createPersistentMemoryService } = await import('../lancedb/index.js');
    // ❌ 错误路径！createPersistentMemoryService 位于 src/services/context/persistent-memory.ts
    const service = createPersistentMemoryService();
    // ...
  }
});
```

**问题**:
- `createPersistentMemoryService` 函数实际位于 `src/services/context/persistent-memory.ts`
- 但 IPC handler 尝试从 `../lancedb/index.js` 导入，该位置不存在此函数

### 2. 架构不兼容问题

**核心矛盾**: 渲染进程代码无法在主进程中运行

```
PersistentMemoryService (src/services/context/persistent-memory.ts)
  ├── 依赖 window.electronAPI.file.* API
  ├── 依赖 window.electronAPI.lancedb.* API
  └── 设计为在渲染进程中运行

IPC Handler (electron/ipc/lancedbHandlers.ts)
  ├── 运行在主进程中
  ├── 无法访问 window 对象
  └── 无法直接使用渲染进程的服务
```

### 3. 调用链断裂

```
ChatPanel.handleMemorySearch()
    ↓
window.electronAPI.memory.search(query, limit)
    ↓ IPC invoke
lancedbHandlers.ts: ipcMain.handle('memory:search', ...)
    ↓ 尝试导入（失败）
createPersistentMemoryService() ← 路径错误 + 架构不兼容
    ↓
异常被捕获，返回空数组，无日志输出
```

---

## 解决方案

### 方案 A: 在主进程重新实现持久记忆服务（推荐）

在 Electron 主进程中创建独立的持久记忆服务实现：

#### 步骤 1: 创建主进程版本的服务

**文件**: `electron/memory/persistentMemoryService.ts`

```typescript
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
      }
      this.initialized = true;
    } catch (error) {
      logger.error('[MainProcessMemoryService] Failed to initialize:', error);
      throw error;
    }
  }

  async saveMemory(memory: MemoryDocument): Promise<void> {
    await this.initialize();

    const fileName = this.generateFileName(memory);
    const filePath = path.join(this.memoriesDir, fileName);

    const content = this.formatAsMarkdown(memory);
    fs.writeFileSync(filePath, content, 'utf-8');

    memory.filePath = filePath;
    await this.updateIndex(memory);

    logger.info('[MainProcessMemoryService] Saved memory:', fileName);
  }

  async searchMemories(query: string, limit: number = 5): Promise<MemoryDocument[]> {
    await this.initialize();

    if (!fs.existsSync(this.indexPath)) {
      logger.info('[MainProcessMemoryService] No index file found');
      return [];
    }

    try {
      const indexData = fs.readFileSync(this.indexPath, 'utf-8');
      const index: MemoryIndex = JSON.parse(indexData);
      const queryLower = query.toLowerCase();
      const results: MemoryDocument[] = [];

      for (const memoryInfo of index.memories) {
        // 匹配 topics
        const topicsMatch = memoryInfo.topics?.some(
          (t: string) => t.toLowerCase().includes(queryLower)
        );

        if (topicsMatch) {
          // 读取完整内容
          try {
            const content = fs.readFileSync(memoryInfo.filePath, 'utf-8');
            const memory = this.parseMarkdownToMemory(content, memoryInfo);
            results.push(memory);
          } catch {
            logger.warn('[MainProcessMemoryService] Failed to read memory file:', memoryInfo.filePath);
          }
        }

        if (results.length >= limit) break;
      }

      logger.info('[MainProcessMemoryService] Search completed:', { query, resultCount: results.length });
      return results;
    } catch (error) {
      logger.error('[MainProcessMemoryService] Search failed:', error);
      return [];
    }
  }

  async getAllMemories(): Promise<MemoryDocument[]> {
    await this.initialize();

    if (!fs.existsSync(this.indexPath)) return [];

    try {
      const indexData = fs.readFileSync(this.indexPath, 'utf-8');
      const index: MemoryIndex = JSON.parse(indexData);
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
    } catch (error) {
      logger.error('[MainProcessMemoryService] Failed to get all memories:', error);
      return [];
    }
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
    } catch {
      index = { version: '1.0', updated: '', memories: [] };
    }

    // 更新或添加记忆
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

// 单例
let memoryServiceInstance: MainProcessMemoryService | null = null;

export function getMainProcessMemoryService(): MainProcessMemoryService {
  if (!memoryServiceInstance) {
    memoryServiceInstance = new MainProcessMemoryService();
  }
  return memoryServiceInstance;
}
```

#### 步骤 2: 修改 IPC 处理器

**文件**: `electron/ipc/lancedbHandlers.ts`

```typescript
import { getMainProcessMemoryService } from '../memory/persistentMemoryService.js';

// 替换现有的 memory:search 处理器
ipcMain.handle('memory:search', async (_, query: string, limit: number = 5) => {
  try {
    const service = getMainProcessMemoryService();
    const results = await service.searchMemories(query, limit);
    logger.info('[LanceDBHandlers] Memory search completed', { query, resultCount: results.length });
    return results;
  } catch (error) {
    logger.error('[LanceDBHandlers] Memory search failed', { query, error });
    return [];
  }
});

// 添加新的处理器
ipcMain.handle('memory:save', async (_, memory: any) => {
  try {
    const service = getMainProcessMemoryService();
    await service.saveMemory(memory);
    return { success: true };
  } catch (error) {
    logger.error('[LanceDBHandlers] Memory save failed', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('memory:getAll', async () => {
  try {
    const service = getMainProcessMemoryService();
    return await service.getAllMemories();
  } catch (error) {
    logger.error('[LanceDBHandlers] Get all memories failed', error);
    return [];
  }
});
```

#### 步骤 3: 更新 Preload API

**文件**: `electron/preload.ts`

```typescript
// 扩展 memory API
memory: {
  search: (query: string, limit?: number): Promise<any[]> =>
    ipcRenderer.invoke('memory:search', query, limit),
  save: (memory: any): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('memory:save', memory),
  getAll: (): Promise<any[]> =>
    ipcRenderer.invoke('memory:getAll'),
  checkSyncStatus: (): Promise<{ needsSync: boolean; outdatedFiles: string[] }> =>
    ipcRenderer.invoke('memory:checkSyncStatus')
},
```

---

### 方案 B: 保持渲染进程架构（备选）

如果不想重构主进程，可以修改 ChatPanel 直接使用渲染进程的服务：

**文件**: `components/ChatPanel.tsx`

```typescript
const handleMemorySearch = async () => {
  if (!memorySearchQuery.trim()) return;

  setIsSearchingMemories(true);
  try {
    let results: any[] = [];

    // 优先使用渲染进程的搜索函数（通过 App.tsx 暴露）
    if ((window as any).searchPermanentMemories) {
      results = await (window as any).searchPermanentMemories(memorySearchQuery, 5);
    }
    // 回退到 IPC 调用
    else if ((window as any).electronAPI?.memory?.search) {
      results = await (window as any).electronAPI.memory.search(memorySearchQuery, 5);
    }

    setMemorySearchResults(results);

    if (results.length === 0) {
      showToast?.(language === 'zh' ? '未找到相关记忆' : 'No memories found');
    }
  } catch (error) {
    console.error('Memory search failed:', error);
    showToast?.(language === 'zh' ? '记忆搜索失败' : 'Memory search failed', true);
  } finally {
    setIsSearchingMemories(false);
  }
};
```

---

## 验证检查清单

- [ ] `.memories/` 目录在 `userData` 路径下创建
- [ ] 记忆 Markdown 文件正确生成
- [ ] `_memories_index.json` 索引文件更新
- [ ] Chat 面板记忆搜索按钮响应
- [ ] 搜索结果正确显示
- [ ] 点击记忆项能插入到输入框

---

## 更新日志

| 日期 | 操作 | 结果 |
|------|------|------|
| 2024-12-29 | 问题发现与分析 | 确认根因 |
| 2024-12-29 | 创建问题文档 | - |
| 2025-12-29 | 实施修复方案 | ✅ 已完成 |
| 2025-12-29 | 验证修复效果 | 待验证 |
