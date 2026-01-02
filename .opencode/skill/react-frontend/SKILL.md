---
name: react-frontend
description: React 前端开发规范，包括组件设计、状态管理、hooks 使用
---

# React 前端开发规范

## 触发条件

- **关键词**：React、前端、组件、hooks、useState、useEffect、TSX
- **场景**：开发 UI 组件、前端功能集成、状态管理、API 调用

## 核心规范

### 组件结构标准

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useChat } from '@/hooks/useChat';
import { Button } from '@/components/Button';

interface Props {
  chatId: string;
  onClose: () => void;
}

export function ChatPanel({ chatId, onClose }: Props) {
  // 状态定义
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  // 自定义 Hook
  const { sendMessage, isStreaming } = useChat(chatId);

  // 副作用
  useEffect(() => {
    loadMessages();
    return () => cleanup();
  }, [chatId]);

  // 回调函数
  const handleSend = useCallback(async (content: string) => {
    await sendMessage(content);
  }, [sendMessage]);

  // 渲染
  return (
    <div className="chat-panel">
      <MessageList messages={messages} loading={loading} />
      <InputArea onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}
```

### 状态管理选择

| 场景 | 方案 |
|------|------|
| 组件本地状态 | useState / useReducer |
| 跨组件共享 | useContext |
| 复杂状态逻辑 | 自定义 Hook |
| 全局状态 | Context + useReducer |
| Server State | React Query / SWR |

### 禁止使用的模式

- ❌ 禁止在组件中直接使用 Node.js API
- ❌ 禁止使用非 React hooks 方式管理状态（如类组件的 setState）
- ❌ 禁止在 useEffect 中使用 async 函数直接赋值
- ❌ 禁止使用 any 类型，必要时使用 unknown

### 推荐的 hooks 模式

```typescript
// 自定义 Hook 封装逻辑
export function useChat(chatId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = useCallback(async (content: string) => {
    setIsStreaming(true);
    try {
      const response = await window.electronAPI.ipcInvoke('ai:chat', {
        messages: [...messages, { role: 'user', content }]
      });
      setMessages(prev => [...prev, response]);
    } finally {
      setIsStreaming(false);
    }
  }, [messages]);

  return { messages, sendMessage, isStreaming };
}

// Context 提供全局状态
const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  return (
    <ChatContext.Provider value={{ state, dispatch }}>
      {children}
    </ChatContext.Provider>
  );
}
```

### 与 Electron 通信

```typescript
// ✅ 正确：使用 window.electronAPI
export function useFilePicker() {
  const openFile = async () => {
    const result = await window.electronAPI.ipcInvoke('file:openDialog', {
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    });
    return result;
  };
  return { openFile };
}

// ❌ 错误：直接使用 electron
import { dialog } from 'electron';
```

## 参考代码

| 文件 | 说明 |
|------|------|
| `components/ChatPanel.tsx` | AI 对话面板 |
| `components/Editor.tsx` | Markdown 编辑器 |
| `components/Sidebar.tsx` | 侧边栏 |
| `src/hooks/useChat.ts` | 聊天逻辑 Hook |
| `src/hooks/useStorage.ts` | 存储 Hook |
| `src/services/mcpService.ts` | MCP 服务 |
