# LanceDB 集成文档

## 概述

TashanStone 使用 LanceDB 作为向量数据库，用于存储和检索文档的向量嵌入，支持 RAG (Retrieval Augmented Generation) 功能。

## 架构设计

### 技术选型

- **@lancedb/lancedb**: 高性能向量数据库，基于 Apache Arrow
- **存储位置**: `%APPDATA%/tashanstone/lancedb/`
- **表结构**: 单表 `vectors` 存储所有文档向量

### 数据模型

```typescript
interface VectorChunk {
  id: string;           // 唯一标识
  fileId: string;       // 文件ID
  fileName: string;     // 文件名
  text: string;         // 文本内容
  vector: number[];     // 向量嵌入 (维度由 AI 模型决定)
  chunkIndex: number;   // 分块索引
  metadata: {
    fileName: string;
    chunkIndex: number;
    totalChunks: number;
  };
}
```

### 文件结构

```
electron/
├── lancedb/
│   └── index.ts          # LanceDB 服务封装
└── ipc/
    └── lancedbHandlers.ts  # IPC 处理器
```

## API 接口

### 初始化

```typescript
await window.electronAPI.lancedb.init();
```

### 添加向量

```typescript
await window.electronAPI.lancedb.add(chunks: VectorChunk[]);
```

### 搜索

```typescript
const results = await window.electronAPI.lancedb.search(
  queryVector: number[],
  limit: number
);
```

### 删除文件向量

```typescript
await window.electronAPI.lancedb.deleteByFile(fileId: string);
```

### 获取统计

```typescript
const stats = await window.electronAPI.lancedb.getStats();
// { totalChunks: number, indexedFiles: number, totalFiles: number }
```

### 清空数据库

```typescript
await window.electronAPI.lancedb.clear();
```

## 与 RAG 服务集成

### ragService.ts 中的使用

```typescript
class VectorStore {
  async indexFile(file: MarkdownFile, config: AIConfig) {
    // 1. 分块
    const chunks = this.chunkText(file.content);

    // 2. 生成向量
    const vectors = await this.generateEmbeddings(chunks, config);

    // 3. 存储到 LanceDB
    if (window.electronAPI?.lancedb) {
      await window.electronAPI.lancedb.add(vectorChunks);
    }
  }

  async search(query: string, config: AIConfig, limit: number) {
    // 1. 生成查询向量
    const queryVector = await this.generateEmbedding(query, config);

    // 2. 搜索 LanceDB
    if (window.electronAPI?.lancedb) {
      return await window.electronAPI.lancedb.search(queryVector, limit);
    }
  }
}
```

## 性能优化

### 索引策略

- 使用 IVF-PQ 索引加速大规模搜索
- 自动创建索引当数据量超过阈值

### 分块策略

- 默认分块大小: 500 字符
- 重叠: 50 字符
- 支持自定义分块参数

## 故障排除

### 常见问题

1. **初始化失败**: 检查 afterPack.cjs 是否正确复制依赖
2. **搜索结果为空**: 确认文件已索引，检查向量维度匹配
3. **性能问题**: 考虑调整分块大小和索引参数

### 日志位置

```
%APPDATA%/tashanstone/logs/
```

## 相关文档

- [LanceDB 打包问题修复](./LANCEDB_PACKAGING_ISSUE.md)
- [OCR 打包问题修复](./OCR_PACKAGING_ISSUE.md)
