# 智能链接插入系统 - 实施计划

## 计划分析

| 方面 | 评价 | 建议 |
|------|------|------|
| 功能完整性 | ✅ 完整 | 三种模式覆盖主要场景 |
| 组件设计 | ✅ 清晰 | 两步流程合理 |
| 代码质量 | ✅ 良好 | 使用 hooks、useMemo、键盘导航 |
| 交互设计 | ⚠️ 需细化 | 需考虑 CodeMirror 场景 |

---

## 需细化的关键问题

### 问题 1: 快捷键冲突
- **Ctrl+K**: CodeMirror 默认用于显示补全面板
- **Ctrl+L**: CodeMirror 用于跳转到行
- **解决方案**: 在 CodeMirror 中禁用默认快捷键，或使用 Meta+K

### 问题 2: CodeMirror 集成
- CodeMirror 有自己的快捷键处理
- 需要在 CodeMirror 的 `keyMap` 中添加自定义快捷键
- `handleTextFormat` 函数可能不适用于 CodeMirror

### 问题 3: 移动端支持
- 当前设计仅支持键盘操作
- 建议：添加触摸支持（长按触发）

---

## 细化后的实施计划

### 阶段 1: 组件基础

#### 1.1 新建 `components/LinkInsertModal.tsx`

```
位置: components/LinkInsertModal.tsx
依赖: FileText (lucide-react)
```

**关键实现要点：**

| 功能 | 实现方式 |
|------|----------|
| 自动聚焦 | `useEffect` 中调用 `inputRef.current?.focus()` |
| 文件过滤 | `useMemo` 实时过滤 |
| 键盘导航 | `handleKeyDown` 处理 Escape/Enter |
| 行选择高亮 | 动态 class `bg-yellow-100` |

**状态管理：**

```typescript
interface LinkInsertState {
  step: 'file' | 'line';
  searchQuery: string;
  selectedFile: MarkdownFile | null;
  selectedLineStart: number;
  selectedLineEnd: number;
  alias: string;
}
```

#### 1.2 新建 `hooks/useLinkInsert.ts` (可选)

```typescript
// 抽取链接插入逻辑为自定义 hook
export function useLinkInsert(files: MarkdownFile[], onInsert: InsertCallback) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'wikilink' | 'blockref'>('wikilink');

  const openWikiLink = () => {
    setMode('wikilink');
    setIsOpen(true);
  };

  const openBlockRef = () => {
    setMode('blockref');
    setIsOpen(true);
  };

  return { isOpen, mode, openWikiLink, openBlockRef, close: () => setIsOpen(false) };
}
```

### 阶段 2: App.tsx 集成

#### 2.1 修改 `App.tsx`

**新增状态：**
```typescript
const [isLinkInsertOpen, setIsLinkInsertOpen] = useState(false);
const [linkInsertMode, setLinkInsertMode] = useState<'wikilink' | 'blockref'>('wikilink');
```

**新增快捷键处理：**

```typescript
// 需要区分 CodeMirror 和普通 textarea
case 'insert_wikilink':
  if (editorMode === 'preview') {
    setLinkInsertMode('wikilink');
    setIsLinkInsertOpen(true);
  }
  break;
```

**新增回调函数 `handleLinkInsert`:**

```typescript
const handleLinkInsert = (result: InsertResult) => {
  if (editorMode === 'preview' && editorRef.current) {
    // Textarea 模式
    insertTextToTextarea(editorRef.current, linkText);
  } else if (editorMode === 'split' && codeMirrorRef.current) {
    // CodeMirror 模式
    codeMirrorRef.current.replaceSelection(linkText);
  }
};
```

#### 2.2 修改 `types.ts`

```typescript
type ActionId =
  | 'insert_wikilink'
  | 'insert_blockref'
  | 'quick_link'
  // ... 现有类型
```

### 阶段 3: 快捷键配置

#### 3.1 修改 `DEFAULT_SHORTCUTS`

```typescript
// 建议使用 Meta 键避免冲突
{ id: 'insert_wikilink', name: '插入 WikiLink', keys: 'Meta+K', actionId: 'insert_wikilink' },
{ id: 'insert_blockref', name: '插入块引用', keys: 'Meta+Shift+K', actionId: 'insert_blockref' },
{ id: 'quick_link', name: '快速链接', keys: 'Meta+L', actionId: 'quick_link' },
```

**注意**: 需要在 CodeMirror 配置中禁用默认绑定：
```typescript
keyMap: {
  'Mod-K': false,  // 禁用默认
  'Mod-Shift-K': false,
  'Mod-L': false,
}
```

### 阶段 4: 翻译配置

#### 4.1 修改 `utils/translations.ts`

```typescript
const zh: Translation = {
  linkInsert: {
    title: {
      wikilink: '插入 WikiLink',
      blockref: '插入块引用',
    },
    placeholder: '搜索文件...',
    alias: '别名（可选）',
    startLine: '起始行',
    endLine: '结束行（可选）',
    noFilesFound: '未找到匹配的文件',
    back: '← 返回',
    cancel: '取消',
    insert: '插入',
    linkedTo: '已链接到',
    confirmCreate: '文件不存在，是否创建？',
    createAndLink: '创建并链接',
    linkOnly: '仅链接',
  }
};
```

### 阶段 5: Toolbar 集成 (可选)

```tsx
<ToolbarButton
  icon={<Link2 size={16} />}
  tooltip="插入链接 (Ctrl+K)"
  onClick={() => handleAction('insert_wikilink')}
/>
```

---

## 修改文件清单

| 文件 | 操作 | 优先级 |
|------|------|--------|
| `components/LinkInsertModal.tsx` | 新建 | P0 |
| `types.ts` | 修改 | P0 |
| `App.tsx` | 修改 | P0 |
| `utils/translations.ts` | 修改 | P1 |
| `hooks/useLinkInsert.ts` | 新建 | P2 (可选) |
| `components/Toolbar.tsx` | 修改 | P2 (可选) |

---

## 风险点

| 风险 | 缓解措施 |
|------|----------|
| CodeMirror 快捷键冲突 | 使用 Meta 键，禁用默认绑定 |
| 大量文件时的性能 | 限制显示 20 个结果，使用 useMemo |
| 行号越界 | 添加 `min/max` 验证和边界检查 |
| 插入位置错误 | 使用 `selectionStart/End` 精确计算 |

---

## 交互流程（更新版）

```
用户按下 Meta+K
    │
    ├─► CodeMirror: 禁用默认，触发 action
    │
    ▼
┌─────────────────────────────┐
│  🔍 搜索文件...             │
│  ┌─────────────────────────┐│
│  │ 📄 Welcome.md           ││
│  │ 📄 README.md            ││
│  │ 📄 Notes.md             ││
│  └─────────────────────────┘│
│  ┌─────────────────────────┐│
│  │ 别名（可选）: ________  ││
│  └─────────────────────────┘│
└─────────────────────────────┘
```

---

## 用户选择

| 选项 | 选择 |
|------|------|
| 快捷键 | `Ctrl+Alt+K` / `Ctrl+Alt+Shift+K` / `Ctrl+Alt+L` |
| Toolbar | 不需要 |
| CodeMirror | 完全支持 |

---

## CodeMirror 完全支持方案

### 1. KeyMap 配置

在 CodeMirror 配置中添加自定义快捷键：

```typescript
// components/CodeMirrorEditor.tsx
const keyMap = {
  'Ctrl-Alt-K': (cm: EditorView) => {
    window.dispatchEvent(new CustomEvent('editor-action', { detail: 'insert_wikilink' }));
  },
  'Ctrl-Alt-Shift-K': (cm: EditorView) => {
    window.dispatchEvent(new CustomEvent('editor-action', { detail: 'insert_blockref' }));
  },
  'Ctrl-Alt-L': (cm: EditorView) => {
    window.dispatchEvent(new CustomEvent('editor-action', { detail: 'quick_link' }));
  },
  ...defaultKeymap,
  ...extraKeymap,
};
```

### 2. 事件监听

在 App.tsx 中监听 CodeMirror 发出的事件：

```typescript
useEffect(() => {
  const handleEditorAction = (e: CustomEvent) => {
    const action = e.detail;
    switch (action) {
      case 'insert_wikilink':
        setLinkInsertMode('wikilink');
        setIsLinkInsertOpen(true);
        break;
      case 'insert_blockref':
        setLinkInsertMode('blockref');
        setIsLinkInsertOpen(true);
        break;
      case 'quick_link':
        handleQuickLink();
        break;
    }
  };

  window.addEventListener('editor-action', handleEditorAction as EventListener);
  return () => window.removeEventListener('editor-action', handleEditorAction as EventListener);
}, []);
```

### 3. 插入函数

```typescript
const insertToCodeMirror = (text: string) => {
  if (!codeMirrorRef.current) return;

  const cm = codeMirrorRef.current;
  const selection = cm.state.selection.main;

  cm.dispatch({
    changes: {
      from: selection.from,
      to: selection.to,
      insert: text,
    },
    selection: {
      anchor: selection.from + text.length,
    },
  });
};
```

---

## 最终快捷键配置

| 功能 | 快捷键 | Action ID |
|------|--------|-----------|
| 插入 WikiLink | `Ctrl+Alt+K` | `insert_wikilink` |
| 插入块引用 | `Ctrl+Alt+Shift+K` | `insert_blockref` |
| 快速链接 | `Ctrl+Alt+L` | `quick_link` |

---

## 实施步骤

### 阶段 1: 基础组件
1. 新建 `components/LinkInsertModal.tsx`
2. 新建 `hooks/useLinkInsert.ts` (可选)

### 阶段 2: 类型和翻译
1. 修改 `types.ts` - 添加 ActionId
2. 修改 `utils/translations.ts` - 添加翻译

### 阶段 3: App.tsx 集成
1. 添加状态管理
2. 添加快捷键处理 (textarea)
3. 添加 CodeMirror 事件监听
4. 添加 `handleLinkInsert` 回调
5. 渲染 LinkInsertModal

### 阶段 4: CodeMirror 集成
1. 配置 keyMap 自定义快捷键
2. 实现 `insertToCodeMirror` 函数

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `components/LinkInsertModal.tsx` | 新建 | 链接插入弹窗 |
| `types.ts` | 修改 | 添加 ActionId 类型 |
| `App.tsx` | 修改 | 状态、快捷键、回调 |
| `utils/translations.ts` | 修改 | 添加翻译 |
| `components/CodeMirrorEditor.tsx` | 修改 | 添加 keyMap 配置 |
| `hooks/useLinkInsert.ts` | 新建 | 抽取逻辑 (可选) |
