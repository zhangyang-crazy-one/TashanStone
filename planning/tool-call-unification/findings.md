# 工具调用格式调研发现

> **最后更新**: 2026-01-23
> **状态**: ✅ 调研完成

---

## 1. Gemini Function Calling

**调研状态**: ✅ 完成

### SDK 信息

- **库**: `@google/genai` v1.30.0
- **主要实现**: `services/aiService.ts` 行 1538-1746

### 工具定义格式

```typescript
interface FunctionDeclaration {
  name: string;              // Tool name, e.g., "create_file"
  description: string;       // Tool description
  parameters: {
    type: Type.OBJECT;       // Always Type.OBJECT
    properties: {
      [key: string]: {
        type: Type.STRING | Type.NUMBER | Type.BOOLEAN | Type.ARRAY | Type.OBJECT;
        description: string;
      };
    };
    required: string[];
  };
}
```

### 请求格式

```typescript
client.models.generateContent({
  model: modelName,
  contents: contents,
  config: {
    tools: [{ functionDeclarations: [...baseTools, ...dynamicTools] }]
  }
});
```

### 响应格式

```typescript
// 工具调用在 response.functionCalls 数组中
interface GeminiFunctionCall {
  name: string;              // Function name
  args: Record<string, any>; // Arguments object
  // ⚠️ 无 'id' 字段
}
```

### 工具结果格式

```typescript
// 使用 role: 'user' (非 'function')
contents.push({
  role: 'user',
  parts: [{
    functionResponse: {
      name: call.name,
      response: result
    }
  }]
});
```

### 流式支持

| 特性 | 状态 |
|------|------|
| 流式文本 | ✅ 支持 |
| 流式工具调用 | ❌ **不支持** |

**原因**: `generateContentStream` 不传递 tools 参数，工具调用仅在非流式 `generateContent` 中可用。

### 关键差异

| 方面 | Gemini | OpenAI |
|------|--------|--------|
| 工具调用 ID | ❌ 无 | ✅ 必需 |
| 结果 role | `user` | `tool` |
| 结构 | `functionResponse` wrapper | 扁平结构 |
| Web 搜索 | 互斥 | N/A |

---

## 2. OpenAI Compatible

**调研状态**: ✅ 完成

### 工具定义格式

```typescript
const tool = {
  type: "function",
  function: {
    name: "create_file",
    description: "Create a new file...",
    parameters: {
      type: "object",
      properties: {
        filename: { type: "string", description: "..." },
        content: { type: "string", description: "..." }
      },
      required: ["filename", "content"]
    }
  }
};
```

### 请求格式

```typescript
POST /chat/completions
{
  model: "gpt-4",
  messages: [...],
  tools: [...OPENAI_TOOLS],
  tool_choice: "auto"  // "auto" | "none" | specific tool
}
```

### 响应格式

```typescript
{
  choices: [{
    message: {
      role: "assistant",
      content: null,
      tool_calls: [{
        id: "call_abc123",        // ✅ 必需 - 用于关联结果
        type: "function",
        function: {
          name: "search_knowledge_base",
          arguments: "{\"query\":\"...\"}}"  // JSON 字符串
        }
      }]
    }
  }]
}
```

### 工具结果格式

```typescript
messages.push({
  role: "tool",
  tool_call_id: "call_abc123",  // ✅ 必须匹配原始 id
  content: JSON.stringify(result)
});
```

### 流式支持

| 特性 | 状态 |
|------|------|
| 流式文本 | ✅ SSE 格式 |
| 流式工具调用 | ✅ delta 格式 |

### 支持的提供商

- OpenAI
- DeepSeek
- GLM-4
- Kimi

---

## 3. Anthropic (Claude)

**调研状态**: ✅ 完成

### 工具定义格式

```typescript
const tool = {
  name: "create_file",
  description: "Create a new file...",
  input_schema: {           // ⚠️ 注意: input_schema (非 parameters)
    type: "object",
    properties: {
      filename: { type: "string", description: "..." }
    },
    required: ["filename"]
  }
};
```

### 请求格式

```typescript
POST /v1/messages
{
  model: "claude-sonnet-4-20250514",
  max_tokens: 4096,
  messages: [...],
  system: "...",           // ⚠️ 系统提示在单独字段
  tools: [...]
}

// Headers
{
  'Content-Type': 'application/json',
  'x-api-key': apiKey,
  'anthropic-version': '2023-06-01'
}
```

### 响应格式

```typescript
// Anthropic 使用 content 块数组
{
  content: [
    {
      type: "tool_use",
      id: "toolu_abc123",      // ✅ 必需
      name: "read_file",
      input: { path: "/file.md" }  // ⚠️ 对象 (非 JSON 字符串)
    }
  ]
}
```

### 工具结果格式

```typescript
// 作为 user 消息发送，包含 tool_result 块
messagesToSend.push({
  role: "user",
  content: [{
    type: "tool_result",
    tool_use_id: "toolu_abc123",  // ✅ 必须匹配
    content: JSON.stringify(result)
  }]
});
```

### 关键约束

| 约束 | 说明 |
|------|------|
| 消息交替 | 必须 user → assistant → user 交替 |
| tool role | 需转换为 user + tool_result |
| 系统提示 | 单独 `system` 字段，非消息数组 |

### 流式支持

| 特性 | 状态 |
|------|------|
| 流式文本 | ✅ content_block_delta |
| 流式工具调用 | ✅ 支持 |

---

## 4. Ollama

**调研状态**: ✅ 完成

### 工具定义格式

**与 OpenAI 相同**:

```typescript
const tool = {
  type: "function",
  function: {
    name: "create_file",
    description: "...",
    parameters: {
      type: "object",
      properties: {...},
      required: [...]
    }
  }
};
```

### 响应格式差异

| 方面 | Ollama | OpenAI |
|------|--------|--------|
| 响应路径 | `data.message.tool_calls` | `data.choices[0].message.tool_calls` |
| 工具调用 ID | ❌ **无** | ✅ 必需 |
| API 端点 | `/api/chat` | `/chat/completions` |

### 工具结果格式

```typescript
// 无需 tool_call_id
messages.push({
  role: "tool",
  content: JSON.stringify(result)
});
```

### 流式支持

| 特性 | 状态 |
|------|------|
| 流式文本 | ✅ NDJSON |
| 流式工具调用 | ❌ **禁用** (stream: false) |

**原因**: 工具调用需要完整参数才能执行，当前实现强制 `stream: false`。

---

## 5. parseToolCalls 现有模式

**调研状态**: ✅ 完成

### 正则模式清单

| # | 模式名 | 正则 | 目标格式 |
|---|--------|------|----------|
| 1 | thinkPattern | `<(?:think|thinking)>...</>` | DeepSeek/Claude 思考 |
| 2 | toolResultPattern | `<tool_result name="..." status="...">` | 自定义 XML |
| 3 | toolPattern | `🔧 **Tool: xxx**` | 流式提示 |
| 4 | laxToolPattern | 裸 JSON `json\n[...]` | 无代码块 (v1.81) |
| 5 | xmlToolPattern | `<tool_call><invoke name="...">` | MiniMax XML |
| 6 | simpleInvokePattern | `<invoke name="...">` | 简化 XML |
| 7 | partialXmlPattern | 畸形 XML | 流式中断片段 |

### 支持的格式

| 格式类型 | 提供商 | 状态 |
|----------|--------|------|
| 🔧 Emoji 工具标记 | TashanStone 自定义 | ✅ |
| MiniMax XML | MiniMax/MiniMaxi | ✅ |
| 思考标签 | DeepSeek/Claude | ✅ |
| 自定义 tool_result | TashanStone | ✅ |

### ⚠️ 不支持的格式

| 格式 | 提供商 | 状态 |
|------|--------|------|
| `response.functionCalls` | Gemini | ❌ 原生 API 格式 |
| `message.tool_calls` | OpenAI | ❌ 原生 API 格式 |
| `content[].tool_use` | Anthropic | ❌ 原生 API 格式 |
| `message.tool_calls` | Ollama | ❌ 原生 API 格式 |

**关键发现**: `parseToolCallsFromContent` 只解析**文本中的标记**，不处理原生 API 结构化响应！

---

## 6. 格式对比矩阵

| 特性 | Gemini | OpenAI | Anthropic | Ollama |
|------|--------|--------|-----------|--------|
| **工具定义字段** | `parameters` | `parameters` | `input_schema` | `parameters` |
| **工具调用字段** | `functionCalls` | `tool_calls` | `tool_use` 块 | `tool_calls` |
| **参数格式** | 对象 | JSON 字符串 | 对象 | JSON 字符串 |
| **需要 ID** | ❌ | ✅ `tool_call_id` | ✅ `tool_use_id` | ❌ |
| **结果 role** | `user` | `tool` | `user` | `tool` |
| **结果结构** | `functionResponse` | 扁平 | `tool_result` 块 | 扁平 |
| **流式工具调用** | ❌ | ✅ | ✅ | ❌ |

---

## 7. 关键洞察

### 7.1 统一化挑战

1. **ID 生成**: Gemini/Ollama 无原生 ID，需自动生成
2. **参数解析**: OpenAI/Ollama 返回 JSON 字符串，需 parse
3. **结果格式**: 4 种不同的 wrapper 结构
4. **消息角色**: Anthropic/Gemini 使用 `user`，OpenAI/Ollama 使用 `tool`

### 7.2 建议的统一接口

```typescript
interface UnifiedToolCall {
  id: string;                           // 统一 ID (自动生成 if needed)
  name: string;                         // 工具名
  arguments: Record<string, JsonValue>; // 已解析参数
  status: 'pending' | 'executing' | 'success' | 'error';
  result?: JsonValue;
}

interface ToolCallAdapter {
  provider: 'gemini' | 'openai' | 'anthropic' | 'ollama';
  parseResponse(response: any): UnifiedToolCall[];
  formatResult(toolCall: UnifiedToolCall, result: any): any;
}
```

### 7.3 实现优先级

| 优先级 | 任务 |
|--------|------|
| 🔴 P0 | 设计 UnifiedToolCall 接口 |
| 🔴 P0 | 实现 4 个提供商适配器 |
| 🟠 P1 | 增强 parseToolCalls 支持原生格式 |
| 🟠 P1 | 更新 StreamToolCard 使用统一格式 |
| 🟢 P2 | 添加单元测试 |

---

## 8. 参考资料

- [Gemini Function Calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Anthropic Tool Use](https://docs.anthropic.com/claude/docs/tool-use)
- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)

---

## 9. 流式工具调用深度分析

> **新增日期**: 2026-01-24
> **状态**: ✅ 调研完成

### 9.1 OpenAI 兼容 (DeepSeek, GLM-4, Kimi)

#### 流式支持状态

| 特性 | 支持情况 | 说明 |
|------|---------|------|
| 流式文本 | ✅ | SSE 格式 `data: {...}` |
| 流式工具调用 | ✅ | delta 格式增量传输 |
| 参数增量传输 | ✅ | `function.arguments` 逐步传输 |

#### 事件/响应格式

```json
// 典型的 OpenAI 流式响应事件序列

// 1. 工具调用开始事件
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion.chunk",
  "created": 1677858242,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "delta": {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "index": 0,
            "id": "call_abc123",
            "type": "function",
            "function": {
              "name": "search_knowledge_base",
              "arguments": ""
            }
          }
        ]
      },
      "finish_reason": null
    }
  ]
}

// 2. 工具名称完成事件
{
  "choices": [{
    "delta": {
      "tool_calls": [{
        "index": 0,
        "function": {
          "name": "search_knowledge_base"
        }
      }]
    }
  }]
}

// 3. 参数增量传输事件 (多次)
{
  "choices": [{
    "delta": {
      "tool_calls": [{
        "index": 0,
        "function": {
          "arguments": "{\"query"
        }
      }]
    }
  }]
}

{
  "choices": [{
    "delta": {
      "tool_calls": [{
        "index": 0,
        "function": {
          "arguments": "\":\"note"
        }
      }]
    }
  }]
}

// 4. 流式结束事件
{
  "choices": [{
    "delta": {},
    "finish_reason": "tool_calls"
  }]
}
```

#### 关键字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `choices[0].delta.tool_calls[].index` | number | 工具调用索引，用于多工具区分 |
| `choices[0].delta.tool_calls[].id` | string | 工具调用唯一ID，用于关联结果 |
| `choices[0].delta.tool_calls[].function.name` | string | 工具名称 |
| `choices[0].delta.tool_calls[].function.arguments` | string | 参数 JSON 字符串增量 |
| `finish_reason` | string | `tool_calls` 表示工具调用完成 |

#### 前端解析策略

1. **工具调用识别**: 检测 `delta.tool_calls` 数组首次出现
2. **增量累积**: 对每个 `tool_calls[].function.arguments` 进行追加拼接
3. **JSON 解析**: 使用 `JSON.parse()` 累积的 arguments 字符串
4. **完成检测**: `finish_reason === 'tool_calls'` 时触发工具执行

#### 已知限制

- 参数可能不完整，需等待流式结束才能执行工具
- 多工具并行时需分别跟踪每个工具的 arguments 累积

---

### 9.2 Anthropic Claude

#### 流式支持状态

| 特性 | 支持情况 | 说明 |
|------|---------|------|
| 流式文本 | ✅ | `content_block_delta` 事件 |
| 流式工具调用 | ✅ | `content_block_start`, `content_block_delta` |
| 参数增量传输 | ✅ | `delta.partial_json` 增量传输 |

#### 事件/响应格式

```json
// Anthropic SSE 流式事件序列

// 1. 消息开始事件
{
  "type": "message_start",
  "message": {
    "id": "msg_abc123",
    "type": "message",
    "role": "assistant",
    "content": [],
    "model": "claude-sonnet-4-20250514",
    "stop_reason": null
  }
}

// 2. 工具调用块开始事件
{
  "type": "content_block_start",
  "index": 0,
  "content_block": {
    "type": "tool_use",
    "id": "toolu_abc123",
    "name": "search_knowledge_base",
    "input": {}
  }
}

// 3. 工具参数增量事件 (多次)
{
  "type": "content_block_delta",
  "index": 0,
  "delta": {
    "type": "input_json_delta",
    "partial_json": "{\"query\":\""
  }
}

{
  "type": "content_block_delta",
  "index": 0,
  "delta": {
    "type": "input_json_delta",
    "partial_json": "test\"}"
  }
}

// 4. 内容块完成事件
{
  "type": "content_block_stop",
  "index": 0
}

// 5. 消息完成事件
{
  "type": "message_stop",
  "stop_reason": "tool_use"
}
```

#### 关键字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `content_block_start.index` | number | 内容块索引 |
| `content_block_start.content_block.type` | string | `tool_use` 表示工具调用 |
| `content_block_start.content_block.id` | string | 工具调用唯一ID |
| `content_block_start.content_block.name` | string | 工具名称 |
| `content_block_delta.delta.type` | string | `input_json_delta` 表示参数增量 |
| `content_block_delta.delta.partial_json` | string | JSON 参数增量 |
| `stop_reason` | string | `tool_use` 表示需要工具结果 |

#### 前端解析策略

1. **工具块识别**: `content_block_start` 事件中检测 `type: 'tool_use'`
2. **参数累积**: 对 `delta.partial_json` 进行字符串追加
3. **JSON 解析**: 使用增量解析器处理不完整的 JSON
4. **工具执行**: `message_stop` 事件后触发工具调用

#### 已知限制

- `partial_json` 可能在 JSON 任意位置断开，需要增量 JSON 解析器
- 需要处理 `input_json_delta` 类型的特殊解析逻辑

---

### 9.3 Ollama

#### 流式支持状态

| 特性 | 支持情况 | 说明 |
|------|---------|------|
| 流式文本 | ✅ | NDJSON 格式 (非 SSE) |
| 流式工具调用 | ❌ | 官方文档显示 stream: false 禁用 |
| 参数增量传输 | ❌ | 不支持 |

#### NDJSON 响应格式

```json
// Ollama 响应是纯 JSON 行，非 SSE 格式
{"model":"llama3","created_at":"2024-01-01T00:00:00Z","message":{"role":"assistant","content":"Hello"},"done":false}
{"model":"llama3","created_at":"2024-01-01T00:00:01Z","message":{"role":"assistant","content":" World"},"done":false}
{"model":"llama3","created_at":"2024-01-01T00:00:02Z","done":true,"total_duration":2000000000}
```

#### 工具调用格式 (非流式)

```json
{
  "model": "llama3",
  "message": {
    "role": "assistant",
    "content": "",
    "tool_calls": [
      {
        "function": {
          "name": "search_knowledge_base",
          "arguments": "{\"query\":\"test\"}"
        }
      }
    ]
  },
  "done": true
}
```

#### 当前实现策略

由于 Ollama 工具调用需要完整参数才能执行，当前 `aiService.ts` 中的 `streamOllama` 函数强制使用 `stream: false`：

```typescript
// services/aiService.ts 行 789-795
body: JSON.stringify({
  model,
  messages,
  stream: true,  // 仅文本流式
  options: { temperature: config.temperature }
})
```

**关键发现**: Ollama 的工具调用在流式模式下不可用，需等待非流式响应。

---

### 9.4 Google Gemini

#### 流式支持状态

| 特性 | 支持情况 | 说明 |
|------|---------|------|
| 流式文本 | ✅ | `generateContentStream` |
| 流式工具调用 | ❌ | `generateContentStream` 不支持 tools |
| 参数增量传输 | ❌ | 不支持 |

#### 当前限制原因

Gemini 的 `generateContentStream` 方法在 SDK 层面不支持 tools 参数：

```typescript
// services/aiService.ts 行 741-745
const result = await client.models.generateContentStream({
  model: modelName,
  contents,
  config: generateConfig  // tools 不在其中
});

// 流式响应只包含文本
for await (const chunk of result) {
  const text = chunk.text;
  if (text) yield text;
}
```

#### 替代方案

1. **非流式工具调用**: 使用 `generateContent` 替代流式
2. **混合模式**: 文本流式 + 非流式工具调用
3. **等待官方支持**: Gemini API 未来可能添加流式工具调用

---

## 10. StreamToolCard.tsx 流式适配建议

### 10.1 当前实现分析

现有 `StreamToolCard.tsx` 组件 (302 行) 接收以下 props：

```typescript
interface StreamToolCardProps {
  toolName: string;
  status: 'executing' | 'success' | 'error';
  result?: string;
  args?: Record<string, JsonValue>;
  language?: Language;
}
```

### 10.2 流式适配增强

#### 需要新增的 props

```typescript
interface StreamingToolCardProps {
  // 现有
  toolName: string;
  status: 'executing' | 'success' | 'error';
  result?: string;
  args?: Record<string, JsonValue>;
  language?: Language;
  
  // 新增：流式状态
  isStreaming?: boolean;           // 是否正在流式传输
  partialArgs?: Record<string, any>; // 累积中的参数
  progress?: number;               // 进度百分比
  provider?: AIProvider;           // 用于样式适配
}
```

#### 组件增强建议

1. **参数增量显示**: 使用 `partialArgs` 实时显示累积中的参数
2. **流式进度指示**: 添加动画效果表示参数解析进度
3. **错误状态区分**: 区分"参数不完整"和"执行失败"
4. **Provider 样式**: 根据不同提供商调整配色和动画

---

## 11. parseToolCalls.ts 流式解析增强

### 11.1 现有正则模式分析

当前 `parseToolCalls.ts` (236 行) 包含 7 种正则模式，但均为**文本标记解析**，不支持流式 API 响应。

### 11.2 流式解析增强函数

```typescript
interface StreamingToolCallState {
  toolCalls: Map<number, {
    id: string;
    name: string;
    arguments: string;
    complete: boolean;
  }>;
}

export const parseStreamingToolCalls = (
  chunk: string,
  state: StreamingToolCallState
): StreamingToolCallState => {
  // 1. 检测 OpenAI 格式
  if (chunk.includes('"tool_calls"')) {
    const toolCalls = extractOpenAIToolCalls(chunk);
    // 更新状态...
  }
  
  // 2. 检测 Anthropic 格式
  if (chunk.includes('"tool_use"')) {
    const toolCalls = extractAnthropicToolCalls(chunk);
    // 更新状态...
  }
  
  return newState;
};
```

---

## 12. 与现有非流式适配器的集成策略

### 12.1 新增流式适配器接口

```typescript
interface StreamingToolCallAdapter extends ToolCallAdapter {
  parseStreamingChunk(chunk: string, state: StreamingAdapterState): StreamingAdapterState;
  getIncompleteToolCalls(state: StreamingAdapterState): ToolCall[];
  isStreamEnd(chunk: string): boolean;
}

interface StreamingAdapterState {
  toolCalls: Map<number, {
    id: string;
    name: string;
    arguments: string;
    complete: boolean;
  }>;
  accumulatedText: string;
  isComplete: boolean;
}
```

### 12.2 适配器选择策略

```typescript
export const getStreamingAdapter = (provider: AIProvider): StreamingToolCallAdapter | null => {
  switch (provider) {
    case 'openai':
      return OpenAIStreamingAdapter;
    case 'anthropic':
      return AnthropicStreamingAdapter;
    case 'gemini':
      return null; // 不支持流式工具调用
    case 'ollama':
      return null; // 强制非流式
    default:
      return null;
  }
};
```

---

## 13. 实现路线图

### 13.1 第一阶段：基础架构

| 任务 | 文件 | 说明 |
|------|------|------|
| StreamingAdapterState 接口 | `services/toolCallAdapters.ts` | 定义流式状态结构 |
| 流式适配器接口扩展 | `services/toolCallAdapters.ts` | 添加 parseStreamingChunk 方法 |
| OpenAI 流式适配器 | `services/toolCallAdapters.ts` | 实现 OpenAI 增量解析 |
| Anthropic 流式适配器 | `services/toolCallAdapters.ts` | 实现 Anthropic 增量解析 |

### 13.2 第二阶段：前端集成

| 任务 | 文件 | 说明 |
|------|------|------|
| StreamingToolCard 组件 | `components/StreamToolCard.tsx` | 添加流式参数显示 |
| 流式工具调用 Hook | `src/hooks/useStreamingToolCalls.ts` | 管理流式状态 |
| ChatPanel 集成 | `components/ChatPanel.tsx` | 集成流式解析 |

### 13.3 第三阶段：测试与优化

| 任务 | 文件 | 说明 |
|------|------|------|
| 流式解析单元测试 | `test/services/streamingToolAdapter.test.ts` | 测试各提供商解析 |
| 集成测试 | `test/integration/streaming.test.ts` | 测试完整流式流程 |

---

## 14. 各提供商流式能力总结

| 提供商 | 流式文本 | 流式工具调用 | 推荐策略 |
|--------|---------|-------------|---------|
| OpenAI | ✅ SSE | ✅ Delta 格式 | 优先支持 |
| Anthropic | ✅ SSE | ✅ Content Block | 重点支持 |
| Gemini | ✅ Stream | ❌ 不支持 | 非流式回退 |
| Ollama | ✅ NDJSON | ❌ 禁用 | 非流式强制 |

---

## 15. 新增参考资料

- [OpenAI Streaming](https://platform.openai.com/docs/api-reference/chat/streaming)
- [Anthropic Streaming](https://docs.anthropic.com/en/docs/build-with-claude/streaming)
