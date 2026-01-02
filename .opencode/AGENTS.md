# TashaStone 项目规则

> AI 驱动的 Markdown 编辑器 - OpenCode 配置

## 项目概述

TashaStone 是一个跨平台 Markdown 编辑器 + AI 知识管理工具，集成了先进的上下文工程技术来优化 AI 对话体验。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript + Vite |
| 样式方案 | Tailwind CSS v4 |
| 桌面运行时 | Electron 33 |
| 本地数据库 | better-sqlite3 |
| 向量数据库 | LanceDB |
| AI 集成 | Gemini / Ollama / OpenAI 兼容 |

## 核心架构

```
┌─────────────────────────────────────────────────┐
│                 React 19 渲染进程                │
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐   │
│  │  编辑器  │ │ AI 对话  │ │ 上下文工程 UI   │   │
│  └────┬─────┘ └────┬─────┘ └───────┬────────┘   │
│       │            │               │             │
│  ┌────┴────────────┴───────────────┴─────────┐  │
│  │              服务层 (Services)              │  │
│  │  ┌────────┐ ┌────────┐ ┌────────────────┐  │  │
│  │  │ AI     │ │ RAG    │ │ ContextMemory  │  │  │
│  │  │ Service│ │ Service │ │ Service        │  │  │
│  │  └────────┘ └────────┘ └────────────────┘  │  │
│  └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│              Electron 33 主进程                  │
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐   │
│  │ SQLite   │ │ LanceDB  │ │ MCP Client     │   │
│  │ (消息)   │ │ (RAG)    │ │ (工具协议)      │   │
│  └──────────┘ └──────────┘ └────────────────┘   │
└─────────────────────────────────────────────────┘
```

## 开发规范

### 前后端通信

**前端禁止直接使用 Node.js API**，必须通过 `window.electronAPI` 通信：

```typescript
// ✅ 正确：使用 preload 暴露的 API
window.electronAPI.ipcInvoke('chat/send', { message: '...' })
window.electronAPI.mcpCallTool('server-name', 'tool-name', args)

// ❌ 错误：直接使用 Node.js
import { ipcRenderer } from 'electron'
```

### 数据库操作

- 使用 `better-sqlite3` 进行本地数据存储
- 所有数据库操作通过 `repositories/` 目录封装
- 遵循 `electron/database/schema.sql` 表结构

### IPC 处理器

- IPC 处理器定义在 `electron/ipc/*.ts`
- 使用 `ipcMain.handle()` 注册处理器
- 渲染进程通过 `window.electronAPI.*` 调用

### 模块规范

- 所有文件使用 ESM 模块 (`import/export`)
- 遵循 TypeScript strict 模式
- 组件使用 React 19 hooks 规范

## 子代理系统

### 子代理调用方式

1. **自动调用**：根据描述自动匹配
2. **手动调用**：`@agent-name` 提及

### 子代理列表

| 代理 | 调用 | 功能 | 权限 |
|------|------|------|------|
| `@enhanced-plan` | 代理 | 增强规划、调研、方案评估 | 只读 + docs编辑 |
| `@bug-fixer` | 子代理 | Bug 修复和问题排查 | 全部 |
| `@code-reviewer` | 子代理 | 代码审查和最佳实践检查 | 全部 |
| `@frontend-dev` | 子代理 | React 前端开发 | 全部 |
| `@backend-dev` | 子代理 | Electron 后端开发 | 全部 |
| `@project-manager` | 子代理 | 项目进度管理和状态更新 | 只读 |

### 子代理工作流

所有子代理遵循统一的工作流模式：

```
开始任务
    │
    ▼
1. 读取项目文档
   - docs/PROJECT_STATUS.md
   - docs/TODO.md
   - AGENTS.md
    │
    ▼
2. 使用可用技能
   - 根据任务类型选择 Skill
   - 如：react-frontend, electron-main
    │
    ▼
3. LSP 辅助开发
   - 类型检查、定义跳转
   - 引用查找、错误定位
    │
    ▼
4. 完成任务
   - 通知 @project-manager 更新进度
   - 调用 /update-status 更新文档
```

### 子代理与项目管理集成

#### 启动时集成
```
子代理启动时：
1. 调用 /start 获取项目状态
2. 读取 docs/PROJECT_STATUS.md
3. 读取 docs/TODO.md
4. 使用 @project-manager 确认开发阶段
```

#### 任务中集成
```
任务进行时：
- 使用 @project-manager 记录子任务进度
- 根据 TODO 优先级排序任务
- 更新 docs/TODO.md 进度
```

#### 完成后集成
```
任务完成后：
1. 调用 /update-status 更新文档
2. 通知 @project-manager 任务完成
3. 更新 docs/PROJECT_STATUS.md
4. 生成任务完成报告
```

## Enhanced-Plan 代理

### 概述

`@enhanced-plan` 是一个专门的规划代理，专注于：

1. **需求分析**：整合用户头脑风暴结果和调研文档
2. **代码调研**：使用 LSP/GREP/GLOB/Chrome-DevTools 分析代码库
3. **方案评估**：调用 `@code-reviewer` 评估技术可行性
4. **计划制定**：制定详细的实施计划和验收标准

### 调用方式

```
用户: @enhanced-plan 设计一个 X 功能
用户: @enhanced-plan 评估使用 X 技术
用户: @enhanced-plan 制定 Y 功能实施计划
```

### 工作流程

```
1. 需求分析 → 2. 代码调研 → 3. 方案评估 → 4. 计划制定 → 5. 文档更新
```

### 权限限制

- **只读权限**：读取所有代码文件
- **docs编辑权限**：仅允许编辑 `docs/` 目录下的文档
- **禁止操作**：不允许修改源代码、配置文件、测试文件

### 输出格式

生成的计划文档包含：
- 概述（目标、范围、预期效果）
- 技术分析（相关代码、依赖项、技术风险）
- 实施步骤（详细步骤列表）
- 时间估算（总工时、关键路径）
- 风险识别（潜在风险及应对策略）
- 验收标准（可衡量的完成标准）

## 引用文档

| 文档 | 说明 |
|------|------|
| @docs/PROJECT.md | 项目概览和技术栈 |
| @docs/PROJECT_STATUS.md | 当前开发进度 |
| @docs/TODO.md | 待办任务列表 |
| @docs/CONTEXT_ENGINEERING.md | 上下文工程详情 |

## OpenCode 配置

### LSP 服务器

项目已配置以下语言服务器：

| 语言 | LSP 服务器 | 功能 |
|------|-----------|------|
| TypeScript | typescript-language-server | 定义跳转、引用查找、类型提示 |
| Python | pyright | 类型检查、代码补全 |
| Go | gopls | 符号跳转、重构 |
| Rust | rust-analyzer | 错误检查、重构 |

### MCP 服务器

- **chrome-devtools**: 浏览器自动化
- **mcp_everything**: 文件系统/Git 操作

### 主代理

| 代理 | 功能 | 温度 |
|------|------|------|
| `@enhanced-plan` | 增强规划、调研、方案评估 | 0.1 |

### 工具权限

所有子代理（除 project-manager 外）拥有全部权限：
- `write`: 允许创建和修改文件
- `bash`: 允许执行 shell 命令
- `read`: 允许读取文件内容
- `edit`: 允许精确编辑文件
- `grep`: 允许搜索文件内容
- `glob`: 允许模式匹配文件

## 快捷命令

| 命令 | 功能 |
|------|------|
| `/start` | 显示项目当前状态 |
| `/progress` | 查看详细项目进度 |
| `/next` | 获取下一步开发建议 |
| `/update-status` | 更新项目状态文档 |

## 可用技能

所有子代理可以根据任务类型动态选择技能：

| 技能 | 触发词 | 说明 |
|------|--------|------|
| `electron-main` | Electron、主进程、IPC、数据库 | Electron 主进程开发 |
| `react-frontend` | React、前端、组件、hooks | React 前端开发 |
| `rag-vectordb` | RAG、向量、检索、Embedding | 向量数据库操作 |
| `ai-integration` | AI、大模型、Gemini | AI 服务集成 |
| `mcp-tools` | MCP、工具、协议 | MCP 工具协议 |
| `platform-build` | 打包、构建、electron-builder | 平台构建打包 |
| `bug-debug` | Bug、报错、异常、Debug | 问题排查调试 |

## 相关文档

- 项目概览：@docs/PROJECT.md
- 项目状态：@docs/PROJECT_STATUS.md
- 待办事项：@docs/TODO.md
- 上下文工程：@docs/CONTEXT_ENGINEERING.md
- Claude Code 配置：.claude/settings.json
