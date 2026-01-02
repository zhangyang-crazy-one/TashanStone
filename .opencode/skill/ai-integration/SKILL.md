---
name: ai-integration
description: AI 服务集成规范，包括 Gemini API、多模型支持、Token 管理、流式处理
---

# AI 服务集成开发规范

## 触发条件

- **关键词**：AI、大模型、Gemini、API、Token、流式、模型、LLM
- **场景**：集成 AI 服务、实现聊天功能、配置模型、处理 AI 响应

## 核心规范

### 服务架构

```
┌─────────────────────────────────────────────────┐
│              AI Service Layer                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────┐ │
│  │ Gemini      │  │ Ollama      │  │ Custom  │ │
│  │ Service     │  │ Service     │  │ API     │ │
│  └──────┬──────┘  └──────┬──────┘  └────┬────┘ │
└─────────┼────────────────┼───────────────┼──────┘
          │                │               │
          ▼                ▼               ▼
┌─────────────────────────────────────────────────┐
│              Unified AI Interface               │
│           aiService.ts (统一入口)               │
└─────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────┐
│              Context Manager                    │
│         Token 预算、压缩、记忆管理              │
└─────────────────────────────────────────────────┘
```

### Gemini API 集成

```typescript
// services/geminiService.ts
import { GoogleGenerativeAI } from '@google/genai';

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function sendMessage(
  messages: Message[],
  config: AIConfig
): Promise<AIResponse> {
  const model = gemini.getGenerativeModel({
    model: config.model || 'gemini-pro'
  });

  const chat = model.startChat({
    history: messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    })),
    generationConfig: {
      maxOutputTokens: config.maxTokens,
      temperature: config.temperature || 0.7
    }
  });

  const result = await chat.sendMessage(messages[messages.length - 1].content);
  return {
    content: result.text(),
    usage: await getTokenUsage(messages)
  };
}
```

### 流式响应处理

```typescript
// services/streamService.ts
export async function* streamAIResponse(
  messages: Message[],
  config: AIConfig
): AsyncGenerator<Chunk, void, unknown> {
  const response = await fetch(config.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true
    })
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        yield data.choices[0].delta.content;
      }
    }
  }
}
```

### Token 预算管理

```typescript
// src/services/context/token-budget.ts
interface TokenBudget {
  total: number;
  used: number;
  reservedForSystem: number;
  reservedForResponse: number;
}

export class TokenBudgetManager {
  private budget: TokenBudget;

  constructor(totalBudget: number = 128000) {
    this.budget = {
      total: totalBudget,
      used: 0,
      reservedForSystem: 8000,
      reservedForResponse: 4000
    };
  }

  calculateAvailableForContext(): number {
    return this.budget.total
      - this.budget.used
      - this.budget.reservedForSystem
      - this.budget.reservedForResponse;
  }

  shouldCompress( messages: Message[]): boolean {
    const estimated = this.estimateTokenCount(messages);
    return estimated > this.calculateAvailableForContext() * 0.9;
  }

  allocate(tokens: number): void {
    this.budget.used += tokens;
  }

  release(tokens: number): void {
    this.budget.used = Math.max(0, this.budget.used - tokens);
  }
}
```

## 禁止事项

- ❌ 禁止在客户端代码中硬编码 API Key
- ❌ 禁止未经压缩直接发送长对话历史
- ❌ 禁止忽略 Token 超限错误
- ❌ 禁止在流式响应中不使用适当的错误处理

## 推荐模式

1. **统一接口**：所有 AI 服务通过 `aiService.ts` 统一访问
2. **Token 预算**：在发送前检查 Token 使用量，必要时压缩
3. **错误重试**：实现指数退避的重试机制
4. **上下文管理**：使用 ContextManager 统一管理对话历史

## 参考代码

| 文件 | 说明 |
|------|------|
| `services/aiService.ts` | AI 统一服务入口 |
| `services/geminiService.ts` | Gemini API 实现 |
| `services/ocrService.ts` | OCR 服务 |
| `src/services/context/manager.ts` | 上下文管理器 |
| `src/services/context/token-budget.ts` | Token 预算 |
| `src/services/context/streaming.ts` | 流式优化 |
| `electron/ipc/aiHandlers.ts` | AI IPC 处理器 |
