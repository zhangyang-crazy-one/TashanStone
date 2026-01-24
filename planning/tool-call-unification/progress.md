# 工具调用统一化 - 进度日志

---

## 2026-01-23

### 13:30 - 任务启动

**目标**: 分析各 AI 提供商工具调用格式，设计统一解析方案

**背景**:
- 用户反馈工具调用卡片显示问题
- 已完成 ToolCallCard 组件重构
- 需要确保各提供商格式都能正确解析

### 13:35 - 启动并行调研

启动 5 个 explore agent:

| Task ID | 主题 | 状态 |
|---------|------|------|
| `bg_81fe1c3f` | Gemini Function Calling | ✅ 完成 |
| `bg_87e0999c` | OpenAI Compatible | ✅ 完成 |
| `bg_699fea90` | Anthropic Tool Use | ✅ 完成 |
| `bg_413d8677` | Ollama Tool Calling | ✅ 完成 |
| `bg_05c37b9c` | parseToolCalls 分析 | ✅ 完成 |

### 13:36 - 创建规划文件

- ✅ `task_plan.md` - 阶段规划
- ✅ `findings.md` - 发现记录 (完整调研结果)

### 14:00 - Phase 1 调研完成

**调研成果汇总**:

| 提供商 | 工具定义 | 响应字段 | ID 字段 | 结果格式 |
|--------|----------|----------|---------|----------|
| Gemini | parameters | functionCalls | ❌ 无 | user + functionResponse |
| OpenAI | parameters | tool_calls | ✅ tool_call_id | tool + content |
| Anthropic | input_schema | content[].tool_use | ✅ tool_use_id | user + tool_result |
| Ollama | parameters | tool_calls | ❌ 无 | tool + content |

**关键发现**:
- `parseToolCallsFromContent` 只解析文本标记，不处理原生 API 格式
- Gemini/Ollama 无原生 ID，需要自动生成
- Anthropic 使用块结构 (content 数组)
- 流式工具调用: Gemini/Ollama ❌, OpenAI/Anthropic ✅

### 14:15 - 进入 Phase 2 设计

**下一步任务**:
1. ✅ 更新 findings.md (完成)
2. ⏳ 更新 progress.md (进行中)
3. ⏳ 更新 task_plan.md
4. ⏳ 设计 UnifiedToolCall 接口
5. ⏳ 设计各提供商适配器

### 14:30 - Phase 2 设计完成

**设计方案已确定**:

| 组件 | 状态 | 说明 |
|------|------|------|
| UnifiedToolCall 接口 | ✅ | 统一工具调用结构，包含 id, name, arguments, status, result, provider |
| ToolCallAdapter 接口 | ✅ | 适配器接口，包含 parseResponse, formatResult, hasToolCalls |
| GeminiAdapter | ✅ | 处理 functionCalls, 生成 ID, 转换 functionResponse |
| OpenAIAdapter | ✅ | 处理 tool_calls, 传递 tool_call_id |
| AnthropicAdapter | ✅ | 处理 content[].tool_use, 转换 tool_result 块 |
| OllamaAdapter | ✅ | 处理 tool_calls, 生成 ID |
| AdapterFactory | ✅ | 工厂模式根据 provider 返回对应适配器 |

**关键设计决策**:
- ID 生成策略: Gemini/Ollama 无原生 ID，使用 `tool_${timestamp}_${random}` 格式
- 参数解析: OpenAI/Ollama 的 arguments 是 JSON 字符串，需自动 parse
- 结果格式: 各提供商使用不同的 wrapper 结构

---

## 2026-01-24

### 14:00 - 流式工具调用调研启动

**目标**: 深度分析各提供商流式场景下的工具调用处理机制

**启动背景**:
- Phase 1-2 已完成非流式适配器实现
- 需要支持 OpenAI/Anthropic 的流式工具调用
- Gemini/Ollama 无流式工具调用支持，需明确回退策略

### 14:05 - 启动深度调研

启动 1 个 explore agent (深度调研模式):

| Task ID | 主题 | 状态 |
|---------|------|------|
| `bg_e85d6246` | OpenAI/Anthropic/Ollama/Gemini 流式工具调用 | ✅ 完成 (3m 24s) |

### 14:30 - 流式调研完成

**调研成果**:

| 提供商 | 流式文本 | 流式工具调用 | 实现策略 |
|--------|---------|-------------|---------|
| OpenAI | ✅ SSE | ✅ Delta 格式 | 优先支持 |
| Anthropic | ✅ SSE | ✅ Content Block | 重点支持 |
| Gemini | ✅ Stream | ❌ 不支持 | 非流式回退 |
| Ollama | ✅ NDJSON | ❌ 禁用 | 非流式强制 |

**关键发现**:
- OpenAI: `tool_calls` delta 包含 `index`, `id`, `function.name`, `function.arguments`
- Anthropic: `content_block_start` + `content_block_delta` (`input_json_delta`)
- Gemini: `generateContentStream` 不支持 tools 参数
- Ollama: 强制 `stream: false` 以支持工具调用

**产出文档**:
- ✅ `findings.md` 新增第 9-15 章 (流式深度分析)
- ✅ `task_plan.md` 新增 Phase 3.5 (流式实现)

**下一步**:
1. ⏳ 实现 OpenAIStreamingAdapter
2. ⏳ 实现 AnthropicStreamingAdapter
3. ⏳ 增强 StreamToolCard 组件
4. ⏳ 添加流式单元测试

---

## 待记录

*(后续更新将追加于此)*
