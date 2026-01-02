---
name: rag-vectordb
description: RAG 向量检索和 LanceDB 集成，包括 Embedding 生成、相似度搜索、长期记忆存储
---

# RAG 向量数据库开发规范

## 触发条件

- **关键词**：RAG、向量、Embedding、检索、LanceDB、向量数据库、相似度搜索、知识库
- **场景**：实现 RAG 检索、知识索引、长期记忆存储、语义搜索

## 核心规范

### 架构概述

```
文档输入
    │
    ▼
┌─────────────┐     ┌─────────────┐
│ 文本分块    │ ──→ │ Embedding   │
└─────────────┘     │ 生成        │
                    └─────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  LanceDB 存储   │
                    │  (向量索引)     │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  相似度检索     │
                    └─────────────────┘
                              │
                              ▼
                    返回 Top-K 相关文档
```

### LanceDB 集成

```typescript
// electron/lancedb/index.ts
import * as lancedb from '@lancedb/lancedb';
import path from 'path';

const dbPath = path.join(process.resourcesPath, 'vector_db');
let db: lancedb.Connection | null = null;

export async function getDB() {
  if (!db) {
    db = await lancedb.connect(dbPath);
  }
  return db;
}

// 创建表
export async function createTable(name: string, schema: Schema) {
  const database = await getDB();
  const table = await database.createEmptyTable(name, schema);
  return table;
}

// 插入向量
export async function insertVectors(tableName: string, records: VectorRecord[]) {
  const table = await getTable(tableName);
  await table.add(records);
}

// 相似度搜索
export async function search(tableName: string, queryVector: number[], topK: number = 5) {
  const table = await getTable(tableName);
  const results = await table
    .query()
    .limit(topK)
    .nearestTo(queryVector)
    .execute();
  return results;
}
```

### RAG 检索流程

```typescript
// services/ragService.ts
import { getEmbeddings } from './embeddingService';

interface检索选项 {
  query: string;
  topK?: number;
  threshold?: number;
  filters?: Record<string, unknown>;
}

export async function retrieveDocuments(options: 检索选项): Promise<DocumentChunk[]> {
  const { query, topK = 5, threshold = 0.7, filters } = options;

  // 1. 生成查询向量
  const queryVector = await getEmbeddings(query);

  // 2. 向量检索
  const results = await search('documents', queryVector, topK * 2);

  // 3. 过滤和排序
  const filtered = results
    .filter(r => r.score >= threshold)
    .slice(0, topK);

  // 4. 返回结果
  return filtered.map(r => ({
    content: r.content,
    metadata: r.metadata,
    score: r.score
  }));
}
```

### 长期记忆集成

```typescript
// src/services/context/long-term-memory.ts
export class LongTermMemoryStorage {
  private embeddingService: EmbeddingService;
  private db: LanceDB;

  async store(memory: Memory): Promise<void> {
    const vector = await this.embeddingService.embed(memory.content);
    await this.db.table('long_term_memory').add({
      id: memory.id,
      vector,
      content: memory.content,
      metadata: memory.metadata,
      timestamp: Date.now()
    });
  }

  async search(query: string, limit: number = 5): Promise<Memory[]> {
    const queryVector = await this.embeddingService.embed(query);
    const results = await this.db.table('long_term_memory')
      .query()
      .limit(limit)
      .nearestTo(queryVector)
      .execute();
    return results;
  }
}
```

## 禁止事项

- ❌ 禁止直接操作 LanceDB 表结构而不使用封装方法
- ❌ 禁止使用未经处理的原始文本作为检索结果
- ❌ 禁止在生产环境使用内存向量存储（数据丢失风险）

## 推荐模式

1. **分块策略**：文档按语义段落分块，保留上下文信息
2. **元数据管理**：每条向量包含来源、时间戳、类型等元数据
3. **增量更新**：支持单条向量插入和删除，不重刷整个索引
4. **混合检索**：结合关键词和向量检索，提高召回率

## 参考代码

| 文件 | 说明 |
|------|------|
| `electron/lancedb/index.ts` | LanceDB 初始化和连接 |
| `services/ragService.ts` | RAG 服务 |
| `src/services/context/long-term-memory.ts` | 长期记忆存储 |
| `services/embeddingService.ts` | Embedding 服务 |
| `electron/ipc/lancedbHandlers.ts` | IPC 处理器 |
