# TUI 笔记本使用指南
```bash
./target/release/tui-notebook
```

## 快捷键
> **注意**：为避免与 Shell 快捷键冲突，主快捷键使用 `Ctrl+Shift` 组合。


### 导航
| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Tab` | 切换到下一个面板 |
| `Shift+Tab` | 切换到上一个面板 |
| `鼠标点击` | 点击选中面板 |
| `↑/↓` | 在文件列表中上下移动 |

### 文件操作
| 快捷键 | 功能 |
|--------|------|
| `Enter` | 打开文件或展开目录 |
| `←` | 折叠目录 |
| `→` | 展开目录 |
| `Ctrl+Shift+n` | 新建文件 |
| `Ctrl+Shift+s` | 保存当前文件 |
| `Ctrl+Shift+f` | 打开搜索 |

### 面板切换
| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+k` | 打开/关闭 AI 对话面板 |
| `Ctrl+Shift+l` | 打开/关闭知识库面板 |
| `Ctrl+Shift+t` | 切换深色/浅色主题 |
| `Ctrl+Shift+p` 或 `Esc` | 打开设置弹窗 |

### 知识库
| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+i` | 索引当前文件到知识库 |

### 其他
| 快捷键 | 功能 |
|--------|------|
| `Ctrl+↑/↓` | 上下滚动 |
| `Ctrl+Shift+q` | 退出应用 |
| `Esc` | 关闭弹窗/取消操作 |

## 文件树

侧边栏显示树形文件结构：
- `📁` 表示目录
- `📄` 表示文件
- `▼` 表示已展开的目录
- `▶` 表示可展开的目录
- 使用 `←` `→` 或 Enter 展开/折叠目录

## 设置弹窗

按 `Ctrl+Shift+p` 或 `Esc` 打开设置弹窗。

### AI 设置选项卡
- **Provider**: AI 提供商 (openafi/emini/ollama/anthropic)
- **Model**: 模型名称
- **API Key**: API 密钥
- **Base URL**: 自定义 API 地址（用于 Ollama 等本地服务）
- 我应该说什么呢？
### UI 设置选项卡
- **Workspace**: 工作区路径
- **Font Size**: 字体大小
- **Theme**: 主题（dark/light）

### 关于选项卡
显示应用版本和功能介绍。

## 面板说明

- **侧边栏**：树形文件浏览器，支持目录展开/折叠
- **编辑器**：Markdown 编辑，实时预览
- **预览面板**：Markdown 渲染效果
- **AI 对话**：`Ctrl+Shift+k` 打开，需在设置中配置 API Key
- **知识库**：`Ctrl+Shift+l` 打开，`Ctrl+Shift+i` 索引文件

## 配置 AI

1. 按 `Ctrl+Shift+p` 或 `Esc` 打开设置
2. 选择 "AI Settings" 选项卡
3. 选择 Provider:
   - **OpenAI**: 设置 API Key 和模型 (gpt-4, gpt-4-turbo, gpt-3.5-turbo)
   - **Gemini**: 设置 API Key 和模型 (gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash)
   - **Ollama**: 设置 Base URL (默认 http://localhost:11434) 和模型 (llama2, mistral, codellama)
   - **Anthropic**: 设置 API Key 和模型 (claude-3-5-sonnet, claude-3-opus, claude-3-haiku)
4. 按 Enter 保存设置

[[new_file.md]]