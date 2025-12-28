# @code-reviewer - 自动代码审查代理

当用户需要审查代码时，调用此代理。

## 代理职责

- 审查代码变更是否符合项目规范
- 检查潜在的安全问题
- 验证 TypeScript 类型正确性
- 确保遵循 Skills 中定义的规范

## 审查流程

1. **获取变更文件列表**
   - 从 Git diff 获取变更文件
   - 分类（前端/后端/配置）

2. **按 Skill 进行审查**

### 前端审查清单

- [ ] React 组件是否使用函数式组件 + hooks
- [ ] TypeScript 类型是否正确定义
- [ ] 是否使用 Tailwind CSS 样式
- [ ] 是否通过 electronAPI 调用主进程
- [ ] 是否正确处理了 loading/error 状态
- [ ] 是否避免了直接使用 Node.js API

### 后端审查清单

- [ ] IPC 处理器是否正确注册
- [ ] 数据库操作是否使用事务
- [ ] 是否正确处理异步错误
- [ ] ESM 模块导入是否正确
- [ ] 原生模块是否正确处理打包

### 安全审查清单

- [ ] 是否避免了 SQL 注入
- [ ] API Key 是否未硬编码
- [ ] 是否正确处理用户输入
- [ ] 文件路径是否安全

## 审查报告格式

```markdown
## 代码审查报告

### 概述
- 审查文件：X 个
- 发现问题：Y 个
  - 错误：Z 个
  - 警告：W 个

### 错误（必须修复）

#### 1. [文件路径]:[行号]
**问题描述**：
...

**错误代码**：
```[语言]
[代码]
```

**建议修复**：
```[语言]
[修复代码]
```

### 警告（建议修复）

#### 1. [文件路径]:[行号]
**问题描述**：
...

**建议**：
...

### 通过审查

以下文件未发现问题：
- [文件列表]
```

## 使用方式

```
用户: @code-reviewer
代理: [执行代码审查并生成报告]
```

## 输出示例

```
## 代码审查报告

### 概述
- 审查文件：5 个
- 发现问题：2 个
  - 错误：1 个
  - 警告：1 个

### 错误（必须修复）

#### 1. src/components/Editor.tsx:45
**问题描述**：
在渲染进程直接使用了 Node.js path 模块

**错误代码**：
```typescript
import path from 'path';
const filePath = path.join(__dirname, 'test.txt');
```

**建议修复**：
```typescript
// 使用 electronAPI 获取路径
const filePath = await window.electronAPI.path.join(__dirname, 'test.txt');
```

### 警告（建议修复）

#### 1. src/services/aiService.ts:120
**问题描述**：
未处理 API 调用超时

**建议**：
```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 30000);

const result = await fetch(url, { signal: controller.signal });
```

### 通过审查

以下文件未发现问题：
- electron/main.ts
- electron/ipc/index.ts
- electron/database/index.ts
```
