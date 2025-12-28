---
name: react-frontend
description: |
  React 前端开发规范。

  触发场景：
  - 开发 React 组件
  - 使用 hooks 管理状态
  - TypeScript 类型定义
  - Tailwind CSS 样式

  触发词：React、前端、组件、hooks、typescript、jsx、tsx、UI、样式、Tailwind
---

# React 前端开发规范

## 核心架构

```
src/
├── App.tsx              # 主组件（状态管理）
├── index.tsx            # 入口
├── index.css            # 全局样式 (Tailwind)
├── hooks/               # 自定义 hooks
│   └── usePlatform.ts
├── services/            # 平台抽象层
│   ├── platform/
│   ├── storage/
│   └── ai/
└── utils/               # 工具函数

components/
├── Editor.tsx           # Markdown 编辑器
├── Preview.tsx          # 预览面板
├── ChatPanel.tsx        # AI 对话
├── Sidebar.tsx          # 文件浏览器
├── Toolbar.tsx          # 工具栏
├── KnowledgeGraph.tsx   # 知识图谱 (D3)
├── QuizPanel.tsx        # 测验系统
├── MindMap.tsx          # 思维导图 (Mermaid)
└── ...
```

## 核心规范

### 状态管理

使用 React Hooks (useState, useEffect, useCallback)：

```typescript
// 状态声明
const [files, setFiles] = useState<MarkdownFile[]>([]);
const [activeFileId, setActiveFileId] = useState<string | null>(null);

// 副作用
useEffect(() => {
  loadFiles();
}, [folderId]);

// 回调
const handleSave = useCallback(async () => {
  await saveFile(activeFileId, content);
}, [activeFileId, content]);
```

### 类型定义

集中在 `types.ts`：

```typescript
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
```

### Tailwind CSS 样式

```tsx
<div className="flex w-full h-screen bg-paper-50 dark:bg-cyber-900 
    text-slate-800 dark:text-slate-200 overflow-hidden">
  <Sidebar />
  <div className="flex-1 flex flex-col">
    <Toolbar />
    <Editor />
  </div>
</div>
```

### 组件结构

```tsx
interface ComponentProps {
  data: DataType;
  onAction: (action: string) => void;
  theme?: 'light' | 'dark';
}

export function Component({ data, onAction, theme = 'dark' }: ComponentProps) {
  return (
    <div className="...">
      {/* 内容 */}
    </div>
  );
}
```

## 第三方库使用

| 库 | 用途 | 导入方式 |
|------|------|----------|
| react-markdown | Markdown 渲染 | `import ReactMarkdown from 'react-markdown'` |
| d3 | 知识图谱 | `import * as d3 from 'd3'` |
| mermaid | 思维导图 | `import mermaid from 'mermaid'` |
| pdfjs-dist | PDF 解析 | `import * as pdfjsLib from 'pdfjs-dist'` |

## 禁止事项

- ❌ 禁止在渲染进程使用 Node.js API
- ❌ 禁止直接 require 原生模块 (better-sqlite3 等)
- ❌ 禁止跳过 electronAPI 直接 IPC
- ❌ 避免使用 class 组件（统一使用函数组件 + hooks）

## 参考代码

- `App.tsx` - 主组件（状态管理范例）
- `types.ts` - 类型定义
- `components/Editor.tsx` - 编辑器组件
- `components/Sidebar.tsx` - 文件浏览器

## 检查清单

- [ ] 是否使用函数组件 + hooks
- [ ] 是否正确使用 TypeScript 类型
- [ ] 是否使用 Tailwind CSS 样式
- [ ] 是否通过 electronAPI 调用主进程功能
- [ ] 是否处理了 loading/error 状态
