---
name: rag-vectordb
description: |
  RAG 向量数据库开发规范 (Electron 版本)。

  触发场景：
  - 实现知识检索
  - 文本分块处理
  - 向量相似性搜索
  - Electron 持久化存储

  触发词：RAG、向量、检索、知识库、embedding、chunk、相似性搜索、LanceDB、vector
---

# RAG 向量数据库开发规范 (Electron)

> 本项目: TashanStone - AI-powered Markdown Editor (Electron + React)

## 技术架构

```
electron/
├── lancedb/
│   └── index.ts           # LanceDB 核心服务（延迟加载）
├── ipc/
│   └── lancedbHandlers.ts # LanceDB IPC 处理器
├── memory/
│   └── persistentMemoryService.ts  # 永久记忆服务
└── utils/
    └── logger.ts          # 日志服务

src/
├── services/
│   └── context/
│       ├── persistent-memory.ts   # 前端永久记忆服务
│       ├── project-memory.ts      # 项目记忆
│       └── long-term-memory.ts    # 长期记忆
└── types/
    └── electron.d.ts      # Electron API 类型声明
```

## 核心规范

### IPC 通信模式

```
渲染进程 → window.electronAPI.lancedb.xxx()
    ↓
preload.ts → ipcRenderer.invoke('lancedb:xxx', ...)
    ↓
ipcMain.handle('lancedb:xxx', ...) → electron/lancedb/index.ts
```

### 向量块数据结构

```typescript
// electron/lancedb/index.ts
export interface VectorChunk {
  id: string;
  fileId: string;
  fileName: string;
  content: string;
  vector: number[];
  chunkIndex: number;
  lastModified?: number; // 用于增量索引
  [key: string]: any;
}
```

### LanceDB 延迟加载

```typescript
// electron/lancedb/index.ts
import path from 'path';
import { app } from 'electron';
import { logger } from '../utils/logger.js';

type LanceDBModule = typeof import('@lancedb/lancedb');
type Connection = Awaited<ReturnType<LanceDBModule['connect']>>;
type Table = Awaited<ReturnType<Connection['openTable']>>;

let lancedb: LanceDBModule | null = null;
let db: Connection | null = null;
let vectorTable: Table | null = null;
let isAvailable = false;

const TABLE_NAME = 'vectors';

/**
 * 延迟加载 LanceDB 模块（避免启动崩溃）
 */
async function loadLanceDB(): Promise<LanceDBModule> {
  if (lancedb) return lancedb;

  try {
    lancedb = await import('@lancedb/lancedb');
    logger.info('[LanceDB] Module loaded successfully');
    return lancedb;
  } catch (error) {
    logger.error('[LanceDB] Failed to load module', error);
    throw error;
  }
}

/**
 * 初始化 LanceDB 连接
 */
export async function initLanceDB(): Promise<void> {
  try {
    const lance = await loadLanceDB();
    const dbPath = path.join(app.getPath('userData'), 'lancedb');

    db = await lance.connect(dbPath);

    const tables = await db.tableNames();
    if (tables.includes(TABLE_NAME)) {
      vectorTable = await db.openTable(TABLE_NAME);
      logger.info('[LanceDB] Opened existing table');
    }

    isAvailable = true;
  } catch (error) {
    isAvailable = false;
    logger.warn('[LanceDB] Not available, vector search disabled');
  }
}
```

### IPC Handler 注册

```typescript
// electron/ipc/lancedbHandlers.ts
import { ipcMain } from 'electron';
import * as lancedbService from '../lancedb/index.js';

export function registerLanceDBHandlers(): void {
  // 添加向量数据
  ipcMain.handle('lancedb:add', async (_, chunks) => {
    await lancedbService.addVectors(chunks);
  });

  // 向量搜索
  ipcMain.handle('lancedb:search', async (_, queryVector, limit) => {
    return await lancedbService.searchVectors(queryVector, limit);
  });

  // 删除文件向量
  ipcMain.handle('lancedb:deleteByFile', async (_, fileId) => {
    await lancedbService.deleteByFile(fileId);
  });

  // 获取统计信息
  ipcMain.handle('lancedb:getStats', async () => {
    return await lancedbService.getStats();
  });

  // 获取文件元数据（用于增量索引）
  ipcMain.handle('lancedb:getFileMetadata', async () => {
    const metadata = await lancedbService.getFileMetadata();
    // Map 转换为普通对象用于 IPC 传输
    const result: Record<string, number> = {};
    for (const [key, value] of metadata) {
      result[key] = value;
    }
    return result;
  });
}
```

### Preload 暴露 API

```typescript
// electron/preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  lancedb: {
    init: () => ipcRenderer.invoke('lancedb:init'),
    add: (chunks: VectorChunk[]) => ipcRenderer.invoke('lancedb:add', chunks),
    search: (queryVector: number[], limit: number) =>
      ipcRenderer.invoke('lancedb:search', queryVector, limit),
    deleteByFile: (fileId: string) =>
      ipcRenderer.invoke('lancedb:deleteByFile', fileId),
    getStats: () => ipcRenderer.invoke('lancedb:getStats'),
    getFileMetadata: () => ipcRenderer.invoke('lancedb:getFileMetadata'),
  },
});
```

### 前端调用示例

```typescript
// src/services/context/persistent-memory.ts

// 添加向量索引
async function indexDocument(doc: MarkdownFile, vector: number[]): Promise<void> {
  const chunks: VectorChunk[] = splitIntoChunks(doc.content).map((content, idx) => ({
    id: `${doc.id}-chunk-${idx}`,
    fileId: doc.id,
    fileName: doc.name,
    content,
    vector,
    chunkIndex: idx,
    lastModified: Date.now(),
  }));

  await window.electronAPI.lancedb.add(chunks);
}

// 向量搜索
async function searchSimilar(queryVector: number[], limit = 5): Promise<VectorChunk[]> {
  return await window.electronAPI.lancedb.search(queryVector, limit);
}

// 获取统计
async function getVectorStats() {
  const stats = await window.electronAPI.lancedb.getStats();
  return stats; // { totalFiles, totalChunks, isAvailable }
}
```

## 文本分块策略

```typescript
// 推荐配置
const CHUNK_SIZE = 800;      // 分块大小
const CHUNK_OVERLAP = 100;   // 重叠大小
const MIN_SIMILARITY = 0.3;  // 最小相似度阈值

export function splitIntoChunks(content: string): string[] {
  const chunks: string[] = [];
  const paragraphs = content.split(/\n\n+/);

  let currentChunk = '';
  for (const paragraph of paragraphs) {
    if ((currentChunk + paragraph).length <= CHUNK_SIZE) {
      currentChunk += paragraph + '\n\n';
    } else {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = paragraph;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
```

## 向量操作

### 添加向量

```typescript
export async function addVectors(chunks: VectorChunk[]): Promise<void> {
  if (!isAvailable || !db) {
    throw new Error('LanceDB not available');
  }

  if (chunks.length === 0) return;

  if (!vectorTable) {
    // 首次创建表
    vectorTable = await db.createTable(TABLE_NAME, chunks as any);
  } else {
    await vectorTable.add(chunks as any);
  }
}
```

### 向量搜索

```typescript
export async function searchVectors(
  queryVector: number[],
  limit: number = 5
): Promise<VectorChunk[]> {
  if (!isAvailable || !vectorTable) {
    return [];
  }

  const rawResults = await vectorTable
    .search(queryVector)
    .limit(limit)
    .toArray();

  // 序列化结果（处理 Float32Array）
  return rawResults.map(serializeChunk);
}

function serializeChunk(chunk: any): VectorChunk {
  return {
    id: chunk.id,
    fileId: chunk.fileId,
    fileName: chunk.fileName,
    content: chunk.content,
    vector: Array.isArray(chunk.vector)
      ? chunk.vector
      : Array.from(chunk.vector || []),
    chunkIndex: chunk.chunkIndex,
    lastModified: chunk.lastModified,
  };
}
```

### 删除向量

```typescript
export async function deleteByFile(fileId: string): Promise<void> {
  if (!isAvailable || !vectorTable || !db) return;

  await vectorTable.delete(`\`fileId\` = '${fileId}'`);

  // 优化表（移除墓碑）
  try {
    await vectorTable.optimize({ cleanupOlderThan: new Date() });
  } catch (e) {
    logger.warn('[LanceDB] Optimization failed', e);
  }

  // 重新打开表确保数据一致性
  vectorTable = await db.openTable(TABLE_NAME);
}
```

## 永久记忆服务

### 记忆文档结构

```typescript
interface MemoryDocument {
  id: string;
  filePath: string;
  content: string;
  topics: string[];
  importance: 'low' | 'medium' | 'high';
  sourceSessions: string[];
  created: number;
  updated: number;
  title?: string;
  summary?: string;
  category?: string;
}
```

### 记忆文件格式 (Markdown)

```markdown
---
id: permanent_1234567890_abc123
title: 开发笔记
created: 1703836800000
updated: 1703836800000
topics: ["开发", "React", "TypeScript"]
importance: medium
---

# 开发笔记

记忆内容...
```

### 文件存储位置

```
%APPDATA%/TashanStone/.memories/
├── _memories_index.json        # 索引文件
├── permanent_xxx_abc123.md     # 记忆文件
└── permanent_xxx_def456.md
```

## 增量索引

### 文件签名检测

```typescript
// 获取文件元数据用于增量索引判断
const metadata = await window.electronAPI.lancedb.getFileMetadata();

for (const file of files) {
  const cachedModified = metadata[file.id];
  if (!cachedModified || file.lastModified > cachedModified) {
    // 需要重新索引
    await deleteAndReindex(file);
  }
}
```

### Schema 迁移

```typescript
async function checkSchemaMigration(): Promise<boolean> {
  if (!vectorTable) return false;

  const sample = await vectorTable.query().limit(1).toArray();
  if (sample.length === 0) return false;

  // 检查是否有 lastModified 字段
  if (sample[0].lastModified === undefined) {
    return true; // 需要迁移
  }

  return false;
}
```

## 禁止事项

- ❌ 禁止同步导入 LanceDB（必须延迟加载）
- ❌ 禁止在渲染进程直接操作 LanceDB
- ❌ 禁止使用过大的分块（超过 1000 字符）
- ❌ 禁止忽略 IPC 传输时的序列化问题（Float32Array）
- ❌ 禁止在删除后不优化表（会留下墓碑数据）

## 参考代码

- `electron/lancedb/index.ts` - LanceDB 核心服务
- `electron/ipc/lancedbHandlers.ts` - IPC 处理器
- `electron/memory/persistentMemoryService.ts` - 永久记忆服务
- `src/services/context/` - 前端上下文服务

## 检查清单

- [ ] LanceDB 使用延迟加载模式
- [ ] IPC 返回值已序列化（Float32Array → number[]）
- [ ] 删除操作后调用 optimize()
- [ ] 增量索引使用 lastModified 字段
- [ ] 分块大小在 500-1000 字符范围
- [ ] 所有 IPC 调用通过 window.electronAPI
- [ ] 错误处理不抛出导致应用崩溃
