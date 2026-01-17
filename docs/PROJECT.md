# TashanStone

> AI 驱动的 Markdown 编辑器
> 版本：V1.81 上下文工程优化版

## 产品定位
跨平台 Markdown 编辑器 + AI 知识管理工具

## 核心功能

### 已实现 ✅

| 类别 | 功能 | 实现文件 |
|------|------|---------|
| **编辑** | Markdown 编辑/预览、分屏模式、多标签、代码高亮 | `CodeMirrorEditor.tsx`, `Preview.tsx` |
| **AI 对话** | 多提供商支持 (Gemini/Ollama/OpenAI/Anthropic) | `aiService.ts` |
| **AI 内容** | 内容润色扩展、知识图谱生成、思维导图生成 | `aiService.ts` |
| **知识管理** | RAG 向量检索、文件夹管理、PDF/DOCX 导入 | `ragService.ts` |
| **测验系统** | AI 生成测验、4种题型、智能评分、错题记录 | `QuizPanel.tsx` |
| **分析统计** | 考试成绩统计、知识点掌握度、薄弱项识别 | `AnalyticsDashboard.tsx` |
| **上下文工程** | 三层记忆系统、检查点、Token 预算管理、工具调用优化 | `src/services/context/` |
| **集成** | MCP 协议、语音转录、OCR、5 套主题 | `electron/mcp/`, `electron/ocr/` |

### V1.81 优化改进 📋

| 类别 | 改进项 | 状态 |
|------|--------|------|
| **上下文工程** | 工具卡片文字溢出修复 | ✅ 已完成 |
| **上下文工程** | 裸 JSON 工具调用解析 | ✅ 已完成 |
| **上下文工程** | 记忆保存目录自动创建 | ✅ 已完成 |
| **编辑器** | CodeMirror RAF 生命周期保护 | ✅ 已完成 |

### 现有功能利用

| 现有功能 | 扩展方向 |
|---------|---------|
| RAG 向量搜索 | → 智能搜索基础 |
| 测验系统 | → 题库管理 |
| 错题记录 (`MistakeRecord`) | → 间隔重复 |
| `StudyPlan`/`ReviewTask` 类型 | → 完整 srsService |
| 分析仪表板 | → 薄弱领域识别 |

## 技术栈
- 前端：React 19 + TypeScript + Vite + Tailwind CSS v4
- 桌面端：Electron 33 + SQLite + LanceDB
- AI：Gemini / Ollama / OpenAI 兼容

## 上下文工程 (v1.81)

### 核心特性

| 特性 | 说明 |
|------|------|
| 三层记忆系统 | 工作记忆、会话记忆、长期记忆 |
| 检查点机制 | 自动保存对话状态，支持恢复 |
| Token 预算管理 | 智能压缩和截断策略 |
| 工具调用优化 | 动态工具选择、去重解析 |
| 生命周期保护 | 组件卸载后回调防护 |

### 优化改进 (v1.81)

| 问题 | 解决方案 |
|------|----------|
| 工具卡片文字溢出 | 添加 `flex-1 min-w-0` + 增强正则解析 |
| 裸 JSON 格式解析失败 | 添加 `laxToolPattern` 正则表达式 |
| 记忆保存 ENOENT 错误 | 自动创建 `.memories` 目录 |
| CodeMirror RAF 警告 | 添加 `mountedRef` 生命周期保护 |

### 文件位置

| 功能 | 路径 |
|------|------|
| 记忆服务 | `src/services/context/persistent-memory.ts` |
| 记忆管理 | `src/services/context/memoryManager.ts` |
| 工具调用卡片 | `components/ToolCallCard.tsx` |
| 文件处理 | `electron/ipc/fileHandlers.ts` |

## AI 助手配置

### Claude Code
项目配置位于 `.claude/` 目录：
- `settings.json` - 钩子和权限配置
- `hooks/` - 生命周期钩子（4个）
- `skills/` - 技能模块（8个）
- `agents/` - 自定义代理（2个）
- `commands/` - 斜杠命令（4个）

### OpenCode
项目配置位于 `.opencode/` 目录：
- `AGENTS.md` - 项目规则主文件
- `opencode.json` - LSP/MCP/工具配置
- `command/` - 斜杠命令
- `agent/` - 自定义代理
- `skill/` - 技能模块

## 相关文档
- 项目状态：[PROJECT_STATUS.md](./PROJECT_STATUS.md)
- 待办事项：[TODO.md](./TODO.md)
- OpenCode 规则：.opencode/AGENTS.md
