# Sidebar Snippets 修复与增强计划

> 计划日期：2026-01-01
> 版本：V1.77
> 状态：📋 计划中

## 概述

### 目标
1. 修复 Sidebar 代码片段插入功能（在 Plain 和 CodeMirror 编辑器中均失效）
2. 添加 WikiLink 双向链接模板
3. 支持在当前光标位置插入，而非仅追加到文件末尾

### 问题背景

| 问题 | 影响 | 严重性 |
|------|------|--------|
| CodeMirror 内容同步失效 | 插入后内容不更新 | 🔴 高 |
| 光标位置处理错误 | 插入后光标跳到错误位置 | 🔴 高 |
| 用户自定义 Snippets 不显示 | 只能使用默认模板 | 🟠 中 |
| 只能在文件末尾插入 | 无法在光标处插入 | 🟠 中 |
| 缺少 WikiLink 模板 | 用户无法快速插入双向链接 | 🟢 低 |

---

## 技术分析

### 问题 1：CodeMirror 内容同步失效

**根因**：`@uiw/react-codemirror` 组件不会自动同步外部传入的 `content` 变化。

**调用链**：
```
Sidebar 点击 Snippet
  → onInsertSnippet(content)
  → App.tsx:handleInsertSnippet
  → updateActiveFile(newContent)
  → files state 更新
  → CodeMirror 接收新 content
  → ❌ 但 EditorView 没有更新
```

**修复方案**：
```typescript
// CodeMirrorEditor.tsx 添加 useEffect 监听 content 变化
useEffect(() => {
  if (!viewRef.current) return;
  const view = viewRef.current;
  const currentContent = view.state.doc.toString();
  
  if (currentContent !== content) {
    view.dispatch({
      changes: {
        from: 0,
        to: currentContent.length,
        insert: content
      }
    });
  }
}, [content]);
```

### 问题 2：光标位置处理

**当前行为**：追加到文件末尾，不更新光标位置。

**期望行为**：在光标当前位置插入，并保持光标在插入内容之后。

**修复方案**：
```typescript
const handleInsertSnippet = (content: string) => {
  if (!activeFile) return;
  
  // 获取当前光标位置
  const cursorPos = activeFile.cursorPosition || {
    start: activeFile.content.length,
    end: activeFile.content.length
  };
  
  const before = activeFile.content.substring(0, cursorPos.start);
  const after = activeFile.content.substring(cursorPos.end);
  
  const newContent = before + content + after;
  const newCursorPos = {
    start: cursorPos.start + content.length,
    end: cursorPos.start + content.length
  };
  
  updateActiveFile(newContent, newCursorPos);
};
```

### 问题 3：用户自定义 Snippets 不显示

**当前代码** (Sidebar.tsx:934-965)：
```typescript
{DEFAULT_SNIPPETS.map(snippet => (
  <div onClick={() => onInsertSnippet?.(snippet.content)}>
```

**修复**：同时显示用户自定义 snippets 和默认模板。

### 问题 4：WikiLink 模板需求

**新增模板**：

| 模板 ID | 名称 | 内容 | 用途 |
|---------|------|------|------|
| `wikilink-file` | File Link | `[[filename]]` | 链接到文件 |
| `wikilink-alias` | Link with Alias | `[[filename\|Alias]]` | 带别名的链接 |
| `wikilink-block` | Block Reference | `<<filename:line>>` | 块级引用 |
| `wikilink-section` | Section Link | `[[filename#Section]]` | 章节链接 |

---

## 实施步骤

### Phase 1: 修复 CodeMirror 内容同步

#### 1.1 修改 CodeMirrorEditor.tsx

**文件**：`components/CodeMirrorEditor.tsx`

**新增代码**：
```typescript
// 在现有 useEffect 之后添加
useEffect(() => {
  if (!viewRef.current) return;
  
  const view = viewRef.current;
  const currentContent = view.state.doc.toString();
  
  if (currentContent !== content) {
    view.dispatch({
      changes: {
        from: 0,
        to: currentContent.length,
        insert: content
      }
    });
    console.log('[CodeMirror] 内容已同步');
  }
}, [content]);
```

**验收标准**：
- [ ] 在 CodeMirror 模式下插入 Snippet 后内容立即更新
- [ ] 无控制台错误
- [ ] 现有测试全部通过

### Phase 2: 修复光标位置处理

#### 2.1 修改 App.tsx - handleInsertSnippet

**文件**：`App.tsx`

**修改位置**：约第 1487-1492 行

**新实现**：
```typescript
const handleInsertSnippet = (content: string) => {
  if (!activeFile) return;
  
  const cursorPos = activeFile.cursorPosition || {
    start: activeFile.content.length,
    end: activeFile.content.length
  };
  
  const before = activeFile.content.substring(0, cursorPos.start);
  const after = activeFile.content.substring(cursorPos.end);
  
  const newContent = before + content + after;
  const newCursorPos = {
    start: cursorPos.start + content.length,
    end: cursorPos.start + content.length
  };
  
  updateActiveFile(newContent);
  handleCursorChange(activeFileId, newCursorPos);
  showToast('Snippet inserted');
};
```

#### 2.2 修改 updateActiveFile 函数

**文件**：`App.tsx`

**修改位置**：约第 754-779 行

**新增**：
```typescript
// 可选的 cursorPosition 参数
const updateActiveFile = (newContent: string, cursorPosition?: { start: number; end: number }) => {
  // ... 现有代码 ...
  
  // 如果提供了 cursorPosition，更新它
  if (cursorPosition) {
    setFiles(prev => prev.map(f =>
      f.id === activeFileId
        ? { ...f, content: newContent, cursorPosition }
        : f
    ));
    cursorPositionsRef.current.set(activeFileId, cursorPosition);
  } else {
    setFiles(prev => prev.map(f =>
      f.id === activeFileId ? { ...f, content: newContent } : f
    ));
  }
};
```

**验收标准**：
- [ ] 在光标位置插入内容
- [ ] 插入后光标位于新内容之后
- [ ] Plain 和 CodeMirror 编辑器行为一致

### Phase 3: 显示用户自定义 Snippets

#### 3.1 修改 Sidebar.tsx

**文件**：`components/Sidebar.tsx`

**修改位置**：约第 934-965 行

**新实现**：
```typescript
{/* 用户自定义 Snippets */}
{snippets.length > 0 && (
  <>
    <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-4 mb-2">
      {t.mySnippets}
    </h4>
    <div className="space-y-1">
      {snippets.map(snippet => (
        <div
          key={snippet.id}
          onClick={() => onInsertSnippet?.(snippet.content)}
          className="px-3 py-2 rounded-lg hover:bg-paper-200 dark:hover:bg-cyber-700 cursor-pointer transition-colors"
        >
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {snippet.name}
          </span>
          {snippet.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {snippet.description}
            </p>
          )}
        </div>
      ))}
    </div>
  </>
)}

{/* 默认模板 */}
<h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-4 mb-2">
  {t.templates}
</h4>
<div className="space-y-1">
  {DEFAULT_SNIPPETS.map(snippet => (
    // ... 现有代码 ...
  ))}
</div>
```

**验收标准**：
- [ ] 用户创建的 Snippets 显示在 UI 中
- [ ] 默认模板仍在下方显示
- [ ] 两类 Snippets 可正常插入

### Phase 4: 添加 WikiLink 模板

#### 4.1 新增 WikiLink 模板到 DEFAULT_SNIPPETS

**文件**：`components/Sidebar.tsx`

**新增模板**：
```typescript
// WikiLink 模板
{ id: 'wikilink-plain', name: 'File Link', category: 'wikilink', content: '[[{filename}]]\n' },
{ id: 'wikilink-alias', name: 'Link with Alias', category: 'wikilink', content: '[[{filename}|{alias}]]\n' },
{ id: 'wikilink-block', name: 'Block Reference', category: 'wikilink', content: '<<{filename}:{line}>>\n' },

// 现有模板保持不变...
```

#### 4.2 添加 WikiLink 模板专用插入逻辑

**修改 handleInsertSnippet**：
```typescript
const handleInsertSnippet = (content: string, isWikiLink: boolean = false) => {
  if (!activeFile) return;
  
  if (isWikiLink) {
    // WikiLink 模板需要用户选择目标文件
    // 暂时先插入占位符，让用户填充
    // 后续可以实现文件选择器
  }
  
  // ... 普通插入逻辑 ...
};
```

#### 4.3 增强 WikiLink 模板体验（可选）

**未来优化**：
- 点击 WikiLink 模板时弹出文件选择器
- 自动填充当前文件列表中的文件名
- 支持按名称搜索文件

**验收标准**：
- [ ] 新增 WikiLink 模板显示在 Sidebar 中
- [ ] 点击模板可插入基本格式
- [ ] 在 Plain 和 CodeMirror 编辑器中均可工作

---

## 文件修改清单

| 文件 | 修改内容 | 优先级 |
|------|----------|--------|
| `components/CodeMirrorEditor.tsx` | 添加 content 同步 useEffect | 🔴 高 |
| `App.tsx` | 修改 handleInsertSnippet | 🔴 高 |
| `App.tsx` | 修改 updateActiveFile | 🔴 高 |
| `components/Sidebar.tsx` | 显示用户自定义 Snippets | 🟠 中 |
| `components/Sidebar.tsx` | 新增 WikiLink 模板 | 🟢 低 |
| `utils/translations.ts` | 新增国际化文本 | 🟢 低 |

---

## 时间估算

| Phase | 任务 | 工时 |
|-------|------|------|
| Phase 1 | CodeMirror 内容同步 | 1-2h |
| Phase 2 | 光标位置处理 | 2-3h |
| Phase 3 | 用户自定义 Snippets | 1-2h |
| Phase 4 | WikiLink 模板 | 1-2h |
| **总计** | | **5-9h** |

---

## 验收标准

### 功能验收

- [ ] Sidebar Snippets 在 Plain 编辑器中正常工作
- [ ] Sidebar Snippets 在 CodeMirror 编辑器中正常工作
- [ ] 插入位置为当前光标位置，而非文件末尾
- [ ] 插入后光标位于新内容之后
- [ ] 用户自定义 Snippets 显示在 Sidebar 中
- [ ] 新增 WikiLink 模板可用

### 代码质量验收

- [ ] 所有新增代码通过 ESLint 检查
- [ ] 添加必要的 TypeScript 类型
- [ ] 保持现有代码风格一致
- [ ] 添加必要的注释说明

### 测试验收

- [ ] 现有测试全部通过 (112/112)
- [ ] 手动测试覆盖所有场景
- [ ] 无控制台错误或警告

---

## 风险识别

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| CodeMirror 内部状态与外部 content 不同步 | 内容显示错误 | 使用 CodeMirror 官方推荐的同步方式 |
| 光标位置计算错误 | 用户体验差 | 详细测试各种插入场景 |
| WikiLink 模板需要用户输入 | 使用门槛高 | 后续实现文件选择器 |

---

## 相关文档

- 代码审查报告：上方详细分析
- WikiLink 类型定义：`src/types/wiki.ts`
- Snippet 类型定义：`types.ts`
- CodeMirror API：https://codemirror.net/docs/ref/

---

## 更新日志

| 日期 | 版本 | 描述 |
|------|------|------|
| 2026-01-01 | V1.77 | 初始计划创建 |
