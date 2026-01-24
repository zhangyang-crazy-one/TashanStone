# 工具调用统一化方案

> **目标**: 分析并统一 TashanStone 中各 AI 提供商的工具调用格式解析
> **创建时间**: 2026-01-23
> **状态**: 🔄 Phase 2.5 流式工具调用设计中

---

## 2.5 流式工具调用调研 ✅ 完成

> **新增日期**: 2026-01-24
> **产出**: findings.md 流式分析章节 (8-14)

| 任务 | 状态 | 产出 |
|------|------|------|
| OpenAI 流式格式分析 | ✅ | delta 事件结构、参数增量传输 |
| Anthropic Claude 流式分析 | ✅ | content_block_delta、partial_json |
| Ollama NDJSON 流式格式分析 | ✅ | 仅文本流式，工具调用禁用 |
| Gemini 流式限制确认 | ✅ | generateContentStream 不支持 tools |

### 流式能力总结

| 提供商 | 流式文本 | 流式工具调用 | 优先级 |
|--------|---------|-------------|--------|
| OpenAI | ✅ SSE | ✅ Delta 格式 | 🔴 P0 |
| Anthropic | ✅ SSE | ✅ Content Block | 🔴 P0 |
| Gemini | ✅ Stream | ❌ 不支持 | 🟡 P1 |
| Ollama | ✅ NDJSON | ❌ 禁用 | 🟡 P1 |

### 流式场景架构设计

```
流式场景 B (增强):
┌──────────┐   SSE/NDJSON 流    ┌────────────────────┐    ┌──────────────────┐
│ AI API   │ ────────────────→ │ StreamParser       │ →  │ StreamToolCard   │
└──────────┘   delta 事件        │ (增量解析)          │    │ (实时工具卡片)    │
                                  └────────────────────┘    └──────────────────┘
                                         │
                                         ▼
                                  ┌────────────────────┐
                                  │ StreamingAdapter   │
                                  │ State Management   │
                                  └────────────────────┘
```

---

## 2. 阶段规划

### Phase 1: 调研 ✅ 完成

| 任务 | 状态 | 结果 |
|------|------|------|
| Gemini Function Calling 分析 | ✅ | SDK: @google/genai v1.30.0, 无 ID, user role |
| OpenAI Compatible 分析 | ✅ | tool_calls 数组, 需要 tool_call_id |
| Anthropic Tool Use 分析 | ✅ | content 块结构, tool_use_id, user role |
| Ollama 工具调用分析 | ✅ | OpenAI 兼容格式, 无 ID |
| parseToolCalls 现有模式分析 | ✅ | 6 个正则模式, 不支持原生 API 格式 |

### Phase 2: 设计 🔄 进行中

| 任务 | 状态 | 负责 |
|------|------|------|
| 统一工具调用接口设计 | 🔄 进行中 | - |
| 适配器模式设计 | ⏳ 待开始 | - |
| 流式/非流式处理策略 | ⏳ 待开始 | - |

### Phase 3: 实现 ⏳ 待开始

| 任务 | 状态 | 说明 |
|------|------|------|
| 创建 ToolCallAdapter 接口 | ✅ 已完成 | `services/toolCallAdapters.ts` |
| 实现各提供商适配器 | ✅ 已完成 | Gemini/OpenAI/Anthropic/Ollama |
| 更新 parseToolCalls 支持原生格式 | ⏳ 待开始 | 适配器已覆盖，parseToolCalls 保持文本解析 |
| 更新 StreamToolCard 组件 | ⏳ 待开始 | 流式参数显示增强 |

### Phase 3.5: 流式工具调用实现 🔄 进行中

| 任务 | 状态 | 文件 |
|------|------|------|
| StreamingAdapterState 接口 | ⏳ | `services/toolCallAdapters.ts` |
| OpenAIStreamingAdapter | ⏳ | `services/toolCallAdapters.ts` |
| AnthropicStreamingAdapter | ⏳ | `services/toolCallAdapters.ts` |
| StreamingToolCard 增强 | ⏳ | `components/StreamToolCard.tsx` |
| useStreamingToolCalls Hook | ⏳ | `src/hooks/useStreamingToolCalls.ts` |
| ChatPanel 流式集成 | ⏳ | `components/ChatPanel.tsx` |

### Phase 4: 验证 ⏳ 待开始

| 任务 | 状态 |
|------|------|
| 单元测试 (非流式) | ⏳ |
| 单元测试 (流式) | ⏳ |
| OpenAI 流式集成测试 | ⏳ |
| Anthropic 流式集成测试 | ⏳ |
| Gemini/Ollama 回退测试 | ⏳ |

---

## 3. 当前理解

### 3.1 工具调用两种场景

```
场景 A: 非流式 API 调用
┌──────────┐    原生格式     ┌────────────┐
│ AI API   │ ─────────────→ │ aiService  │ → 内部执行 → 返回最终文本
└──────────┘  (结构化JSON)   └────────────┘

场景 B: 流式输出
┌──────────┐   文本流(含标记)  ┌────────────────────┐
│ AI API   │ ─────────────→ │ parseToolCalls     │ → 解析文本中的工具标记
└──────────┘  🔧 **Tool:...  └────────────────────┘
```

### 3.2 已知格式

| 提供商 | 非流式(原生) | 流式(文本标记) |
|--------|------------|--------------|
| Gemini | functionCall 对象 | 提示模板注入 |
| OpenAI | tool_calls 数组 | SSE delta |
| Anthropic | tool_use 块 | content_block_delta |
| Ollama | OpenAI 兼容 | OpenAI 兼容 |

### 3.3 调研发现总结

| 方面 | Gemini | OpenAI | Anthropic | Ollama |
|------|--------|--------|-----------|--------|
| 工具定义 | parameters | parameters | input_schema | parameters |
| 响应字段 | functionCalls | tool_calls | content[].tool_use | tool_calls |
| ID 字段 | ❌ 无 | ✅ tool_call_id | ✅ tool_use_id | ❌ 无 |
| 结果 role | user | tool | user | tool |
| 结果结构 | functionResponse | 扁平 | tool_result 块 | 扁平 |
| 流式工具 | ❌ | ✅ | ✅ | ❌ |

---

## 4. 遇到的问题

| 问题 | 影响 | 状态 |
|------|------|------|
| parseToolCalls 只解析文本 | 原生 API 格式无法显示为卡片 | ✅ Phase 1 识别 |
| 各提供商流式格式不统一 | 需要多个正则模式 | ✅ Phase 1 识别 |
| ID 生成问题 | Gemini/Ollama 无原生 ID | ✅ Phase 1 识别 |

---

## 5. 设计方案 (Phase 2)

### 5.1 UnifiedToolCall 接口

```typescript
interface UnifiedToolCall {
  id: string;                           // 统一 ID (自动生成 if needed)
  name: string;                         // 工具名
  arguments: Record<string, JsonValue>; // 已解析参数
  status: 'pending' | 'executing' | 'success' | 'error';
  result?: JsonValue;
  provider: 'gemini' | 'openai' | 'anthropic' | 'ollama';
}
```

### 5.2 ToolCallAdapter 接口

```typescript
interface ToolCallAdapter {
  /** 提供商标识 */
  provider: 'gemini' | 'openai' | 'anthropic' | 'ollama';

  /** 解析 API 响应为统一格式 */
  parseResponse(response: any): UnifiedToolCall[];

  /** 格式化工具结果为 API 格式 */
  formatResult(toolCall: UnifiedToolCall, result: any): any;

  /** 检测是否包含工具调用 */
  hasToolCalls(response: any): boolean;
}
```

### 5.3 适配器实现

| 适配器 | 职责 |
|--------|------|
| GeminiAdapter | 处理 functionCalls, 生成 ID, 转换 functionResponse |
| OpenAIAdapter | 处理 tool_calls, 传递 tool_call_id |
| AnthropicAdapter | 处理 content[].tool_use, 转换 tool_result 块 |
| OllamaAdapter | 处理 tool_calls, 生成 ID |

### 5.4 AdapterFactory

```typescript
class ToolCallAdapterFactory {
  static getAdapter(provider: AIProvider): ToolCallAdapter {
    switch (provider) {
      case 'gemini': return new GeminiAdapter();
      case 'openai': return new OpenAIAdapter();
      case 'anthropic': return new AnthropicAdapter();
      case 'ollama': return new OllamaAdapter();
      default: throw new Error(`Unknown provider: ${provider}`);
    }
  }
}
```

---

## 6. 下一步

1. ✅ 调研完成 (Phase 1)
2. ✅ findings.md 已更新
3. ⏳ 继续 Phase 2 设计
4. ⏳ 实现各提供商适配器
5. ⏳ 更新 parseToolCalls 支持原生格式

---

## 7. 文件修改记录

| 文件 | 操作 | 日期 |
|------|------|------|
| `planning/tool-call-unification/task_plan.md` | 创建 | 2026-01-23 |
| `planning/tool-call-unification/findings.md` | 完整调研结果 | 2026-01-23 |
| `planning/tool-call-unification/progress.md` | 进度日志 | 2026-01-23 |
| `components/ToolCallCard.tsx` | 重构 (37 行) | 2026-01-23 |
| `components/StreamToolCard.tsx` | 新文件 (301 行) | 2026-01-23 |
| `components/ThinkingCard.tsx` | 新文件 (129 行) | 2026-01-23 |
| `components/SyntaxHighlight.tsx` | 新文件 (76 行) | 2026-01-23 |
| `utils/parseToolCalls.ts` | 新文件 (235 行) | 2026-01-23 |
| `utils/jsonHelpers.ts` | 新文件 (89 行) | 2026-01-23 |
