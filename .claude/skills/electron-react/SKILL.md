---
name: electron-react
description: |
  React 前端和 Electron 集成开发规范。

  触发场景：
  - 开发 React 组件
  - 使用 hooks 管理状态
  - TypeScript 类型定义
  - Tailwind CSS 样式
  - Electron IPC 通信 (window.electronAPI)

  触发词：React、前端、组件、hooks、typescript、jsx、tsx、UI、样式、Tailwind、electronAPI
---

# React 前端开发规范

> 本项目: TashanStone - AI-powered Markdown Editor (Electron + React)

## 核心架构

```
src/
├── index.css            # 全局样式 (Tailwind)
├── vite-env.d.ts        # Vite 环境类型
├── hooks/               # 自定义 hooks
│   └── useElectron.ts   # Electron API hook
├── services/            # 服务层
│   ├── index.ts         # 服务导出
│   ├── ai/              # AI 服务
│   ├── context/         # 上下文管理
│   ├── storage/         # 存储服务
│   └── knowledgeService.ts  # 知识库服务
└── types/               # TypeScript 类型
    └── electron.d.ts    # Electron API 类型声明
```

## 核心规范

### Electron API 类型声明

```typescript
// src/types/electron.d.ts
interface MarkdownFile {
  id: string;
  name: string;
  content: string;
  path?: string;
  folderId?: string;
  createdAt: string;
  updatedAt: string;
}

interface AIConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

interface ElectronAPI {
  files: {
    getAll: () => Promise<MarkdownFile[]>;
    save: (file: MarkdownFile) => Promise<MarkdownFile>;
    delete: (id: string) => Promise<boolean>;
    getById: (id: string) => Promise<MarkdownFile | null>;
  };
  ai: {
    chat: (config: AIConfig, messages: ChatMessage[]) => Promise<string>;
    streamChat: (config: AIConfig, messages: ChatMessage[]) => Promise<void>;
    fetch: (options: FetchOptions) => Promise<FetchResult>;
  };
  lancedb: {
    search: (query: string, limit: number) => Promise<SearchResult[]>;
    addDocument: (doc: Document) => Promise<boolean>;
  };
  mcp: {
    getServers: () => Promise<MCPServerStatus[]>;
    callTool: (serverName: string, toolName: string, args: unknown) => Promise<unknown>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

### Electron API 调用

```typescript
// 在 React 组件中调用 Electron API
const loadFiles = async () => {
  try {
    const files = await window.electronAPI.files.getAll();
    setFiles(files);
  } catch (error) {
    console.error('Failed to load files:', error);
  }
};

// 保存文件
const saveFile = async (file: MarkdownFile) => {
  const saved = await window.electronAPI.files.save(file);
  setFiles(prev => prev.map(f => f.id === saved.id ? saved : f));
};

// AI 对话
const sendMessage = async (content: string) => {
  const config = await window.electronAPI.ai.getConfig();
  const response = await window.electronAPI.ai.chat(config, [
    ...messages,
    { id: generateId(), role: 'user', content, timestamp: new Date().toISOString() }
  ]);
  return response;
};
```

### 自定义 Hook: useElectronAPI

```typescript
// src/hooks/useElectronAPI.ts
import { useState, useEffect, useCallback } from 'react';

export function useFiles() {
  const [files, setFiles] = useState<MarkdownFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadFiles = useCallback(async () => {
    try {
      setLoading(true);
      const data = await window.electronAPI.files.getAll();
      setFiles(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, []);

  const saveFile = useCallback(async (file: MarkdownFile) => {
    const saved = await window.electronAPI.files.save(file);
    setFiles(prev => {
      const index = prev.findIndex(f => f.id === saved.id);
      if (index >= 0) {
        return [...prev.slice(0, index), saved, ...prev.slice(index + 1)];
      }
      return [...prev, saved];
    });
    return saved;
  }, []);

  const deleteFile = useCallback(async (id: string) => {
    const success = await window.electronAPI.files.delete(id);
    if (success) {
      setFiles(prev => prev.filter(f => f.id !== id));
    }
    return success;
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  return { files, loading, error, saveFile, deleteFile, refresh: loadFiles };
}
```

### 状态管理

使用 React Hooks + Electron IPC 同步：

```typescript
// 状态声明
const [files, setFiles] = useState<MarkdownFile[]>([]);
const [activeFileId, setActiveFileId] = useState<string | null>(null);
const [aiConfig, setAIConfig] = useState<AIConfig | null>(null);

// 加载初始数据
useEffect(() => {
  const init = async () => {
    const [files, config] = await Promise.all([
      window.electronAPI.files.getAll(),
      window.electronAPI.ai.getConfig(),
    ]);
    setFiles(files);
    setAIConfig(config);
  };
  init();
}, []);

// 派生状态
const activeFile = useMemo(
  () => files.find(f => f.id === activeFileId),
  [files, activeFileId]
);
```

### 组件结构

```tsx
interface EditorPanelProps {
  file: MarkdownFile;
  onSave: (file: MarkdownFile) => Promise<void>;
}

export function EditorPanel({ file, onSave }: EditorPanelProps) {
  const [content, setContent] = useState(file.content);
  const [isSaving, setIsSaving] = useState(false);

  // 使用 useCallback 避免不必要的重渲染
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await onSave({ ...file, content });
    } finally {
      setIsSaving(false);
    }
  }, [file, content, onSave]);

  // 自动保存
  useEffect(() => {
    const timer = setTimeout(() => {
      if (content !== file.content) {
        handleSave();
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [content, file.content, handleSave]);

  return (
    <div className="flex-1 flex flex-col">
      <CodeMirror
        value={content}
        onChange={setContent}
        className="flex-1"
      />
      {isSaving && <span className="text-sm text-gray-500">Saving...</span>}
    </div>
  );
}
```

### Tailwind CSS 样式

```tsx
<div className="flex w-full h-screen bg-slate-50 dark:bg-slate-900
    text-slate-800 dark:text-slate-200 overflow-hidden">
  <Sidebar className="w-64 border-r border-gray-200 dark:border-gray-700" />
  <div className="flex-1 flex flex-col">
    <EditorPanel />
    <StatusBar />
  </div>
</div>
```

### 类型定义

```typescript
// src/types/index.ts
export interface MarkdownFile {
  id: string;
  name: string;
  content: string;
  path?: string;
  folderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface AIConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

// 本地扩展类型
export interface EditorState {
  isDirty: boolean;
  isPreview: boolean;
  cursorPosition: { line: number; column: number };
}
```

## 第三方库使用

| 库 | 用途 | 导入方式 |
|------|------|----------|
| @uiw/react-codemirror | Markdown 编辑器 | `import CodeMirror from '@uiw/react-codemirror'` |
| react-markdown | Markdown 渲染 | `import ReactMarkdown from 'react-markdown'` |
| lucide-react | 图标库 | `import { Icon } from 'lucide-react'` |
| clsx | 类名合并 | `import { clsx } from 'clsx'` |
| tailwind-merge | Tailwind 类名合并 | `import { twMerge } from 'tailwind-merge'` |

## 禁止事项

- 禁止直接使用 Node.js API（必须通过 window.electronAPI）
- 禁止使用 `as any` 绕过类型检查
- 禁止在 useEffect 中忘记清理副作用
- 禁止使用 class 组件（统一使用函数组件 + hooks）
- 禁止在组件内部定义大型对象/数组常量（应提升到模块级别）

## 参考代码

- `src/services/` - 服务层实现
- `src/hooks/` - 自定义 hooks
- `src/types/` - TypeScript 类型定义

## 检查清单

- [ ] 是否使用 window.electronAPI 进行 IPC 通信
- [ ] 是否使用函数组件 + hooks
- [ ] 是否正确使用 TypeScript 类型
- [ ] 是否使用 Tailwind CSS 样式
- [ ] 是否在 useEffect 中正确清理副作用
- [ ] 是否避免了不必要的重渲染（useCallback/useMemo）
- [ ] 是否处理了加载和错误状态
