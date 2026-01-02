# TashanStone

> AI 驱动的 Markdown 编辑器
> 版本：V1.75 统一路线图

## 产品定位
跨平台 Markdown 编辑器 + AI 知识管理工具

## 核心功能

### 已实现 ✅

| 类别 | 功能 | 实现文件 |
|------|------|---------|
| **编辑** | Markdown 编辑/预览、分屏模式、多标签、代码高亮 | `Editor.tsx`, `Preview.tsx` |
| **AI 对话** | 多提供商支持 (Gemini/Ollama/OpenAI/Anthropic) | `aiService.ts` |
| **AI 内容** | 内容润色扩展、知识图谱生成、思维导图生成 | `aiService.ts` |
| **知识管理** | RAG 向量检索、文件夹管理、PDF/DOCX 导入 | `ragService.ts` |
| **测验系统** | AI 生成测验、4种题型、智能评分、错题记录 | `QuizPanel.tsx` |
| **分析统计** | 考试成绩统计、知识点掌握度、薄弱项识别 | `AnalyticsDashboard.tsx` |
| **上下文工程** | 三层记忆系统、检查点、Token 预算管理 | `src/services/context/` |
| **集成** | MCP 协议、语音转录、OCR、5 套主题 | `electron/mcp/`, `electron/ocr/` |

### V1.75 计划中 📋

| 类别 | 功能 | Phase |
|------|------|-------|
| **双向链接** | WikiLink `[[Page]]`、块级引用 `<<Page:Line>>`、反向链接、悬停预览 | 1 |
| **题库管理** | 题库创建/编辑/删除、AI 生成试题、统计分析 | 2 |
| **智能标签** | 标签提取、AI 建议、标签索引 | 3 |
| **间隔重复** | 艾宾浩斯遗忘曲线、学习计划、错题复习 | 6 🆕 |
| **智能搜索** | 双模式搜索、过滤语法、结果预览 | 7 🆕 |
| **智能整理** | AI 重要性评分、分类建议 | 8 🆕 |

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
