<div align="center">

<img src="build/icon.png" alt="ZhangNote Logo" width="128" height="128">

# ZhangNote

**智能 AI 驱动的 Markdown 编辑器与知识管理工具**

[![Release](https://img.shields.io/github/v/release/zhangyang-crazy-one/Zhang_Note?style=flat-square)](https://github.com/zhangyang-crazy-one/Zhang_Note/releases)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=flat-square)](https://opensource.org/licenses/Apache-2.0)
[![Platform](https://img.shields.io/badge/Platform-Windows%20|%20macOS%20|%20Linux-lightgrey.svg?style=flat-square)](https://github.com/zhangyang-crazy-one/Zhang_Note/releases)
[![Electron](https://img.shields.io/badge/Electron-33-47848F.svg?style=flat-square)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg?style=flat-square)](https://reactjs.org/)

[English](#english) | [中文](#中文)

---

### 下载安装 / Download

| 平台 Platform | 下载链接 Download |
|:---:|:---:|
| Windows x64 | [ZhangNote-Setup-1.6.0-x64.exe](https://github.com/zhangyang-crazy-one/Zhang_Note/releases/download/v1.6.0/ZhangNote-Setup-1.6.0-x64.exe) |
| macOS (Intel / Apple Silicon) | [📖 查看编译指南 / Build Guide](docs/BUILD_MAC.md) |
| Linux x64 (Debian/Ubuntu/麒麟) | [zhangnote_1.6.0_amd64.deb](https://github.com/zhangyang-crazy-one/Zhang_Note/releases/download/v1.6.0/zhangnote_1.6.0_amd64.deb) |
| Linux AppImage | [ZhangNote-1.6.0.AppImage](https://github.com/zhangyang-crazy-one/Zhang_Note/releases/download/v1.6.0/ZhangNote-1.6.0.AppImage) |

> 💡 **macOS 用户**: 由于缺少 Apple 开发者签名，macOS 版本需要用户自行编译。请参考 [macOS 编译指南](docs/BUILD_MAC.md)

</div>

---

<a id="中文"></a>
## 中文

### 简介

ZhangNote 是一款现代化的 AI 驱动 Markdown 编辑器，专为知识工作者、研究人员和笔记爱好者设计。它将优美的编辑体验与强大的 AI 能力完美结合，让您的笔记更加智能化。

### 核心功能

#### 📝 Markdown 编辑
- **实时预览** - 所见即所得的编辑体验，支持语法高亮
- **多视图模式** - 纯编辑、纯预览、分屏三种模式自由切换
- **代码高亮** - 支持 100+ 编程语言语法高亮
- **数学公式** - 完整支持 LaTeX 数学公式渲染
- **Mermaid 图表** - 支持流程图、时序图、甘特图等

#### 📁 文件管理
- **文件夹组织** - 树状结构清晰管理笔记
- **拖拽操作** - 直观的文件移动和重命名
- **多格式导入** - 支持 PDF、DOCX、CSV 自动转换为 Markdown

#### 🤖 AI 智能功能
- **AI 对话助手** - 与笔记内容进行上下文感知对话
- **RAG 知识检索** - 语义搜索您的知识库，精准定位信息
- **内容润色** - AI 驱动的写作增强，提升文笔质量
- **知识图谱** - 可视化笔记中的概念关系网络
- **思维导图** - 自动从内容生成结构化思维导图
- **试卷生成** - 从学习材料智能创建测验题目

#### 🔧 MCP 工具协议
- **Chrome DevTools 集成** - 直接控制浏览器进行自动化操作
- **自定义工具扩展** - 支持接入各类 Node.js MCP 服务
- **灵活扩展架构** - 轻松扩展 AI 能力边界

### 支持的 AI 提供商

| 提供商 | 推荐模型 | 特点 |
|--------|----------|------|
| **Google Gemini** | gemini-2.5-flash, gemini-2.5-pro | 网络搜索、超长上下文 (100万tokens) |
| **Ollama** | qwen3, llama3, mistral | 本地运行、完全隐私 |
| **OpenAI 兼容** | DeepSeek, GLM-4, Kimi | 灵活 API、多选择 |
| **Anthropic 兼容** | Claude Sonnet 4, Claude 3.5 | 支持官方API及MiniMaxi等代理 |

### 主题系统

内置 5 套精心设计的主题：

| 主题 | 风格 | 适用场景 |
|------|------|----------|
| 霓虹赛博 | 暗色系，青紫色调 | 夜间编程、酷炫风格 |
| 简洁纸张 | 浅色系，仿纸张 | 日常写作、阅读 |
| 手绘风格 | 马善政楷体手写风 | 创意写作、笔记 |
| 午夜德古拉 | 经典暗色主题 | 长时间使用 |
| 曙光主题 | 温暖浅色调 | 清晨阅读 |

### 快速开始

1. **下载安装**
   - Windows: 下载 `.exe` 安装包，双击安装
   - macOS: 参考 [编译指南](docs/BUILD_MAC.md) 自行编译
   - Linux: 下载 `.deb` 包，运行 `sudo dpkg -i zhangnote_1.6.0_amd64.deb`
   - 或下载 `.AppImage`，添加执行权限后直接运行

2. **配置 AI**
   - 点击设置图标 → 选择 AI 提供商
   - 输入 API 密钥（Gemini/OpenAI）或保持默认（Ollama）
   - 点击保存

3. **开始使用**
   - 创建新笔记或打开已有文件夹
   - 使用工具栏切换视图模式
   - 点击 AI 图标开启智能功能

### 快捷键

| 操作 | 快捷键 |
|------|--------|
| 加粗 | `Ctrl + B` |
| 斜体 | `Ctrl + I` |
| 撤销 | `Ctrl + Z` |
| 重做 | `Ctrl + Y` |
| 保存 | `Ctrl + S` |
| 新建 | `Ctrl + N` |

### 隐私说明

- ✅ 笔记本地存储，不上传云端
- ✅ 不收集任何使用数据
- ⚠️ AI 功能需发送内容到配置的 AI 服务商

---

<a id="english"></a>
## English

### Introduction

ZhangNote is a modern AI-powered Markdown editor designed for knowledge workers, researchers, and note-taking enthusiasts. It combines a beautiful editing experience with powerful AI capabilities.

### Key Features

#### 📝 Markdown Editing
- **Live Preview** - Real-time rendering with syntax highlighting
- **Multiple View Modes** - Editor-only, preview-only, or split view
- **Code Highlighting** - 100+ programming languages supported
- **Math Equations** - Full LaTeX math formula rendering
- **Mermaid Diagrams** - Flowcharts, sequence diagrams, Gantt charts

#### 📁 File Management
- **Folder Organization** - Tree structure for clear note management
- **Drag & Drop** - Intuitive file operations
- **Multi-format Import** - PDF, DOCX, CSV auto-conversion to Markdown

#### 🤖 AI-Powered Features
- **AI Chat Assistant** - Context-aware conversations with your notes
- **RAG Knowledge Retrieval** - Semantic search across your knowledge base
- **Content Polish** - AI-powered writing enhancement
- **Knowledge Graph** - Visualize concept relationships
- **Mind Map Generation** - Auto-generate structured mind maps
- **Quiz Generation** - Create quizzes from study materials

#### 🔧 MCP Protocol Support
- **Chrome DevTools Integration** - Browser automation control
- **Custom Tool Extensions** - Connect various Node.js MCP services
- **Extensible Architecture** - Easily expand AI capabilities

### Supported AI Providers

| Provider | Recommended Models | Features |
|----------|-------------------|----------|
| **Google Gemini** | gemini-2.5-flash, gemini-2.5-pro | Web search, 1M token context |
| **Ollama** | qwen3, llama3, mistral | Local, fully private |
| **OpenAI Compatible** | DeepSeek, GLM-4 | Flexible API options |
| **Anthropic Compatible** | Claude Sonnet 4, Claude 3.5 | Official API & MiniMaxi proxy support |

### Quick Start

1. **Install**
   - Windows: Download and run the `.exe` installer
   - macOS: Follow the [Build Guide](docs/BUILD_MAC.md) to compile
   - Linux: Download `.deb` and run `sudo dpkg -i zhangnote_1.6.0_amd64.deb`
   - Or download `.AppImage`, make it executable and run directly

2. **Configure AI**
   - Click Settings → Select AI provider
   - Enter API key (Gemini/OpenAI) or use defaults (Ollama)
   - Save settings

3. **Start Using**
   - Create notes or open existing folders
   - Switch view modes via toolbar
   - Click AI icons to enable smart features

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Bold | `Ctrl + B` |
| Italic | `Ctrl + I` |
| Undo | `Ctrl + Z` |
| Redo | `Ctrl + Y` |
| Save | `Ctrl + S` |
| New File | `Ctrl + N` |

### Privacy

- ✅ Notes stored locally only
- ✅ No usage data collection
- ⚠️ AI features require sending content to configured AI providers

---

## Development

```bash
# Install dependencies
npm install

# Development mode
npm run dev:electron

# Build for production
npm run dist:win      # Windows
npm run dist:mac      # macOS (see docs/BUILD_MAC.md)
npm run dist:linux    # Linux
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4
- **Desktop**: Electron 33
- **Database**: SQLite (better-sqlite3)
- **Build**: Vite, electron-builder

## License

[Apache License 2.0](LICENSE)

---

<div align="center">

**Made with ❤️ for knowledge seekers**

[Report Bug](https://github.com/zhangyang-crazy-one/Zhang_Note/issues) · [Request Feature](https://github.com/zhangyang-crazy-one/Zhang_Note/issues)

</div>
