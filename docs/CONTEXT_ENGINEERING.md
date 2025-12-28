# ZhangNote 上下文工程实施计划

> 基于 Claude Code、OpenCode、Roo-Code、Cody 源码分析的上下文工程实施方案

---

## 项目背景

### 目标
为 ZhangNote 的 AI 对话系统实现智能上下文管理，解决以下核心问题：
- **有限上下文窗口**：AI 模型上下文窗口有限（128K-200K tokens）
- **长对话记忆丢失**：对话过长时早期信息丢失
- **成本控制**：Token 消耗随对话增长线性增加
- **响应延迟**：上下文过大导致响应变慢

### 核心架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    ZhangNote 上下文工程架构                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  长期记忆层 (Long-term Memory)                           │   │
│  │  - 笔记内容索引 (LanceDB RAG)                            │   │
│  │  - 项目级知识 (CLAUDE.md)                                │   │
│  │  生命周期: 永久 | 存储: SQLite + LanceDB                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  中期记忆层 (Mid-term Memory)                            │   │
│  │  - 压缩摘要 (Summary)                                    │   │
│  │  - 会话状态快照 (Checkpoint)                             │   │
│  │  生命周期: 跨会话 | 存储: SQLite | 触发: 阈值/手动        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  短期记忆层 (Short-term Memory)                          │   │
│  │  - 对话上下文 (Context Window)                           │   │
│  │  - 工具调用缓存 (Tool Cache)                             │   │
│  │  生命周期: 当前会话 | 存储: 内存 | 限制: Token 预算       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 阶段一：核心上下文工程（高优先级）

### 1.1 类型定义扩展

**位置**: `types.ts` 或新建 `types/context.types.ts`

```typescript
// 上下文工程核心类型

// API 消息扩展
interface ApiMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
  ts: number  // 时间戳

  // 压缩相关元数据
  isSummary?: boolean           // 是否为摘要消息
  condenseId?: string           // 摘要 ID
  condenseParent?: string       // 被哪个摘要压缩

  // 截断相关元数据
  isTruncationMarker?: boolean  // 是否为截断标记
  truncationId?: string         // 截断 ID
  truncationParent?: string     // 被哪个截断隐藏
}

// Token 使用统计
interface TokenUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

// 上下文配置
interface ContextConfig {
  maxContextTokens: number      // 上下文窗口大小 (default: 200000)
  reservedOutputTokens: number  // 输出预留 (default: 16000)
  compactThreshold: number      // 压缩触发阈值 (default: 0.85)
  pruneThreshold: number        // 裁剪触发阈值 (default: 0.70)
  messagesToKeep: number        // 保留的最近消息数 (default: 3)
  bufferPercentage: number      // 安全缓冲区百分比 (default: 0.10)
}
```

**任务清单**:
- [ ] 定义 ApiMessage 扩展接口
- [ ] 定义 TokenUsage 接口
- [ ] 定义 ContextConfig 接口
- [ ] 定义 CompactionResult 接口
- [ ] 定义 TruncationResult 接口
- [ ] 定义 SessionState 接口

### 1.2 上下文管理器

**位置**: `src/services/context/manager.ts`

```typescript
export class ContextManager {
  // 核心方法
  calculateTokenUsage(messages: ApiMessage[], systemPrompt: string): Promise<number>
  calculateUsageRate(currentTokens: number): number
  shouldManageContext(messages: ApiMessage[], systemPrompt: string): Promise<'none' | 'prune' | 'compact' | 'truncate'>
  manageContext(messages: ApiMessage[], systemPrompt: string): Promise<ManageResult>
  getEffectiveHistory(messages: ApiMessage[]): ApiMessage[]
  truncate(messages: ApiMessage[], fracToRemove?: number): TruncationResult
  cleanupOrphanedTags(messages: ApiMessage[]): ApiMessage[]
}
```

**任务清单**:
- [ ] 实现 ContextManager 类
- [ ] 实现 Token 使用量计算
- [ ] 实现使用率分析
- [ ] 实现触发决策逻辑
- [ ] 实现有效历史过滤
- [ ] 实现滑动窗口截断
- [ ] 实现孤儿标记清理

### 1.3 压缩算法实现

**位置**: `src/services/context/compaction.ts`

**算法策略**:

| 算法 | 触发条件 | 处理方式 | 信息损失 | 成本 |
|------|----------|----------|----------|------|
| **Prune** | 70% 使用率 | 移除旧工具输出 | 低 | 无 |
| **Compact** | 85% 使用率 | LLM 生成摘要 | 中 | API 调用 |
| **Truncate** | 90% 使用率 | 标记并隐藏消息 | 高 | 无 |

```typescript
export class Compaction {
  // Prune: 裁剪工具输出
  prune(messages: ApiMessage[], options?: PruneOptions): Promise<PruneResult>

  // Compact: 生成摘要
  compact(messages: ApiMessage[], systemPrompt: string): Promise<CompactionResult>

  // 辅助方法
  formatMessagesForSummary(messages: ApiMessage[]): FormattedMessage[]
  extractTextContent(content: ContentBlock[]): string
  estimateTokens(messages: ApiMessage[]): Promise<number>
}
```

**任务清单**:
- [ ] 实现 Prune 算法（工具输出裁剪）
- [ ] 实现 Compact 算法（上下文压缩）
- [ ] 实现摘要提示词模板
- [ ] 实现 Token 估算
- [ ] 实现非破坏性标记机制

### 1.4 Token 预算管理

**位置**: `src/services/context/token-budget.ts`

```typescript
export class TokenBudget {
  calculateBudget(model: ModelConfig): TokenBudgetResult
  checkThresholds(current: number, budget: TokenBudgetResult): UsageStatus
  allocateTokens(budget: TokenBudgetResult, components: ContextComponents): Allocation
  trackUsage(usage: TokenUsage): void
}

// 预算分配策略 (以 128K 窗口为例)
// - 系统提示 + 项目记忆: 10K-15K (8-12%)
// - 压缩摘要: 5K-10K (4-8%)
// - 对话历史: 60K-80K (50-65%)
// - 工具输出/检索结果: 15K-25K (12-20%)
// - 输出预留: 16K-32K (12-25%)
```

**任务清单**:
- [ ] 实现 TokenBudget 类
- [ ] 实现动态预算分配
- [ ] 实现阈值检查
- [ ] 实现使用量追踪

---

## 阶段二：会话存储与检查点（高优先级）

### 2.1 扩展现有 Chat 存储

**位置**: 扩展 `electron/database/repositories/chatRepository.ts`

**变更**:
- 扩展消息表结构，添加压缩标记字段
- 添加摘要消息存储
- 添加检查点存储

```sql
-- 消息表扩展
ALTER TABLE chat_messages ADD COLUMN is_summary BOOLEAN DEFAULT FALSE;
ALTER TABLE chat_messages ADD COLUMN condense_id TEXT;
ALTER TABLE chat_messages ADD COLUMN condense_parent TEXT;
ALTER TABLE chat_messages ADD COLUMN is_truncation_marker BOOLEAN DEFAULT FALSE;
ALTER TABLE chat_messages ADD COLUMN truncation_id TEXT;
ALTER TABLE chat_messages ADD COLUMN truncation_parent TEXT;

-- 检查点表
CREATE TABLE IF NOT EXISTS chat_checkpoints (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  messages_snapshot TEXT NOT NULL,  -- JSON
  token_usage TEXT,  -- JSON
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
);
```

**任务清单**:
- [ ] 设计数据库迁移脚本
- [ ] 扩展消息存储接口
- [ ] 实现检查点存储接口
- [ ] 实现会话状态恢复

### 2.2 检查点机制

**位置**: `src/services/context/checkpoint.ts`

```typescript
export class CheckpointManager {
  create(params: CreateCheckpointParams): Promise<Checkpoint>
  restore(checkpointId: string): Promise<SessionState>
  listBySession(sessionId: string): Checkpoint[]
  delete(checkpointId: string): Promise<boolean>
  compressForCheckpoint(messages: ApiMessage[]): ApiMessage[]
}
```

**任务清单**:
- [ ] 实现检查点创建
- [ ] 实现检查点恢复
- [ ] 实现检查点列表
- [ ] 实现自动检查点（压缩后触发）

---

## 阶段三：三层记忆系统（中优先级）

### 3.1 记忆层实现

**位置**: `src/services/context/memory.ts`

```typescript
export class MemoryLayer {
  // 短期记忆 (内存)
  shortTerm: Map<string, ApiMessage[]>

  // 中期记忆 (SQLite)
  saveMidTerm(sessionId: string, summary: string): Promise<void>
  loadMidTerm(sessionId: string): Promise<Summary[]>

  // 长期记忆 (RAG + 文件)
  saveLongTerm(key: string, content: string): Promise<void>
  loadLongTerm(key: string): Promise<string | null>
  searchLongTerm(query: string): Promise<SearchResult[]>
}
```

### 3.2 与现有 RAG 系统集成

**集成点**: `services/ragService.ts` + `electron/lancedb/index.ts`

**扩展功能**:
- 对话摘要自动索引
- 相关历史对话检索
- 知识库上下文注入

**任务清单**:
- [ ] 实现短期记忆管理
- [ ] 实现中期记忆存储
- [ ] 扩展 RAG 服务支持对话索引
- [ ] 实现相关上下文检索

---

## 阶段四：UI 集成（中优先级）

### 4.1 ChatPanel 扩展

**位置**: `components/ChatPanel.tsx`

**新增功能**:
- Token 使用率显示
- 上下文管理状态指示
- 手动压缩按钮
- 检查点历史查看

```typescript
// 新增状态
interface ChatContextState {
  tokenUsage: TokenUsage
  usageRate: number
  lastAction: 'none' | 'prune' | 'compact' | 'truncate'
  checkpoints: Checkpoint[]
}

// 新增 UI 元素
- TokenUsageIndicator: 显示当前 Token 使用率
- ContextActionBadge: 显示最近执行的上下文操作
- CompactButton: 手动触发压缩
- CheckpointDrawer: 查看和恢复检查点
```

**任务清单**:
- [ ] 添加 Token 使用率显示组件
- [ ] 添加上下文状态指示
- [ ] 添加手动压缩按钮
- [ ] 添加检查点历史面板

### 4.2 AI 设置扩展

**位置**: `components/AISettingsModal.tsx`

**新增配置项**:
- 压缩触发阈值
- 保留消息数量
- 自动检查点开关
- Token 预算分配

**任务清单**:
- [ ] 添加上下文工程配置区
- [ ] 实现配置持久化
- [ ] 添加配置验证

---

## 阶段五：性能优化（低优先级）

### 5.1 Prompt Caching

**目标**: 利用 Claude API 的 Prompt Caching 功能降低成本和延迟

```typescript
// 缓存策略
// - 系统提示: 稳定内容，高缓存命中率
// - 项目上下文: 会话内稳定，可缓存
// - 对话历史: 动态增长，部分缓存

interface CacheStrategy {
  systemPromptCached: boolean
  projectContextCached: boolean
  historyCacheDepth: number  // 缓存最近 N 条消息
}
```

### 5.2 流式响应优化

**集成点**: `services/aiService.ts`

**优化项**:
- SSE 流式处理
- 增量渲染
- 中断恢复

**任务清单**:
- [ ] 研究 Prompt Caching 集成
- [ ] 优化流式响应处理
- [ ] 添加响应中断机制

---

## 实施时间线

| 阶段 | 内容 | 预计工作量 | 优先级 |
|------|------|-----------|--------|
| 阶段一 | 核心上下文工程 | 5-7 天 | 高 |
| 阶段二 | 会话存储与检查点 | 3-4 天 | 高 |
| 阶段三 | 三层记忆系统 | 4-5 天 | 中 |
| 阶段四 | UI 集成 | 3-4 天 | 中 |
| 阶段五 | 性能优化 | 2-3 天 | 低 |

**总计**: 约 17-23 天

---

## 文件结构规划

```
src/
├── services/
│   ├── context/                    # 新增目录
│   │   ├── index.ts               # 导出入口
│   │   ├── manager.ts             # 上下文管理器
│   │   ├── compaction.ts          # 压缩算法
│   │   ├── memory.ts              # 记忆层
│   │   ├── token-budget.ts        # Token 预算
│   │   ├── checkpoint.ts          # 检查点
│   │   └── types.ts               # 类型定义
│   └── ...
│
├── types/
│   └── context.types.ts           # 上下文工程类型（可选）
│
electron/
├── database/
│   ├── migrations/
│   │   └── 002_context_engineering.ts  # 数据库迁移
│   └── repositories/
│       └── contextRepository.ts   # 上下文存储仓库
│
components/
├── context/                        # 新增目录
│   ├── TokenUsageIndicator.tsx
│   ├── ContextActionBadge.tsx
│   ├── CompactButton.tsx
│   └── CheckpointDrawer.tsx
```

---

## 与现有服务整合策略

| 新功能 | 现有服务 | 整合方式 |
|--------|----------|----------|
| 会话压缩 | `services/aiService.ts` | 在发送请求前调用 ContextManager |
| 检查点存储 | `electron/database` | 扩展现有数据库结构 |
| 长期记忆 | `services/ragService.ts` | 扩展 RAG 支持对话索引 |
| Token 统计 | `services/geminiService.ts` | 收集 API 返回的 usage 数据 |
| UI 状态 | `components/ChatPanel.tsx` | 添加上下文状态管理 |

---

## 测试策略

### 单元测试

```typescript
// 测试用例示例
describe('ContextManager', () => {
  describe('getEffectiveHistory', () => {
    it('应该过滤被压缩的消息')
    it('应该保留摘要消息')
    it('应该恢复孤儿消息')
  })

  describe('truncate', () => {
    it('应该保留第一条消息')
    it('应该按比例截断')
    it('应该插入截断标记')
  })
})

describe('Compaction', () => {
  describe('prune', () => {
    it('应该裁剪超过阈值的工具输出')
    it('应该保护最近 2 轮对话')
  })

  describe('compact', () => {
    it('应该生成有效摘要')
    it('应该使用非破坏性标记')
  })
})
```

### 集成测试

- [ ] 完整压缩流程测试
- [ ] 检查点恢复测试
- [ ] UI 交互测试
- [ ] 数据库迁移测试

---

## 参考资源

1. **调研文档**: `zhang_reader/New_Features/output/`
   - `01_context_engineering_architecture.md` - 架构设计
   - `02_claude_code_engineering_analysis.md` - Claude Code 分析
   - `03_typescript_development_guide.md` - 代码实现指南

2. **开源参考**:
   - OpenCode: `packages/opencode/src/session/compaction.ts`
   - Roo-Code: `src/core/condense/index.ts`
   - Cody: `vscode/src/local-context/context-ranking.ts`

---

*文档版本: 1.0 | 创建时间: 2025-12-28*
