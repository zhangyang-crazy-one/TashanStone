# TUI 笔记本使用指南
```bash
./target/release/tui-notebook
```

## 快捷键
> 默认使用终端友好的 `Terminal Leader` 键位；也可以在 `Settings -> Keyboard` 切到 `IDE Compatible`。

### 全局
| 快捷键 | 功能 |
|--------|------|
| `Tab` | 切换到下一个面板 |
| `Shift+Tab` | 切换到上一个面板 |
| `Ctrl+Q` | 打开退出确认 |
| `Ctrl+K` | 打开/关闭 AI 对话面板 |
| `Ctrl+G` | 打开/关闭快捷键帮助 |
| `Esc` | 关闭弹窗 / 退出输入 / 返回上一级 |

### Terminal Leader
| 快捷键 | 功能 |
|--------|------|
| `Space 1` | 聚焦文件树 |
| `Space 2` | 聚焦编辑器 |
| `Space 3` | 聚焦预览 |
| `Space 4` | 聚焦 AI |
| `Space 5` | 聚焦知识库 |
| `Space s` | 保存当前文件 |
| `Space /` | 打开搜索 |
| `Space ,` | 打开设置 |
| `Space k` | 打开/关闭 AI 对话面板 |
| `Space l` | 打开/关闭知识库面板 |
| `Space i` | 索引当前文件 |
| `Space q` | 打开退出确认 |
| `?` | 打开快捷键帮助（非输入态） |

### IDE Compatible
| 快捷键 | 功能 |
|--------|------|
| `F1` | 聚焦文件树 |
| `F2` | 聚焦编辑器 |
| `F3` | 聚焦预览 |
| `F4` | 打开/关闭 AI 对话面板 |
| `F5` | 打开/关闭知识库面板 |
| `F6` | 打开搜索 |
| `F7` | 索引当前文件 |
| `F8` | 进入预览导航 |
| `F9` | 保存当前文件 |
| `F10` | 打开设置 |
| `F12` | 打开退出确认 |

### 编辑器 Normal 模式
| 快捷键 | 功能 |
|--------|------|
| `i` | 进入插入模式 |
| `a` | 光标后进入插入模式 |
| `o` | 在下一行进入插入模式 |
| `h/j/k/l` | 左/下/上/右移动 |
| `w` / `b` | 按单词跳转 |
| `0` / `$` | 行首 / 行尾 |
| `gg` / `G` | 文首 / 文末 |
| `Ctrl+U` / `Ctrl+D` | 半页上滚 / 下滚 |
| `Enter` | 打开当前光标下的链接 |
| `K` | 打开当前光标下的悬浮预览 |
| `p` | 进入预览导航 |

### 预览导航
| 快捷键 | 功能 |
|--------|------|
| `j` / `Down` | 向下滚动 |
| `k` / `Up` | 向上滚动 |
| `Tab` / `Shift+Tab` | 切换下一个 / 上一个可交互目标 |
| `Enter` / `o` | 打开当前目标 |
| `Esc` / `q` | 返回编辑器 |

## 文件树

侧边栏显示树形文件结构：
- `📁` 表示目录
- `📄` 表示文件
- `▼` 表示已展开的目录
- `▶` 表示可展开的目录
- 使用 `←` `→` 或 Enter 展开/折叠目录

## 设置弹窗

按 `Space ,` 或 `F10` 打开设置弹窗。

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

### Keyboard 设置选项卡
- **Profile**: `Terminal Leader` / `IDE Compatible`
- **Status Hints**: 是否在状态栏显示当前快捷键提示
- **Preview Follow**: 预览聚焦时是否跟随编辑器当前位置

### 关于选项卡
显示应用版本和功能介绍。

## 面板说明

- **侧边栏**：树形文件浏览器，支持目录展开/折叠
- **编辑器**：Markdown 编辑，实时预览
- **预览面板**：Markdown 渲染效果
- **AI 对话**：`Ctrl+K`、`Space k` 或 `F4` 打开
- **知识库**：`Space l` 或 `F5` 打开，`Space i` 或 `F7` 索引文件

## 配置 AI

1. 按 `Space ,` 或 `F10` 打开设置
2. 选择 "AI Settings" 选项卡
3. 选择 Provider:
   - **OpenAI**: 设置 API Key 和模型 (gpt-4, gpt-4-turbo, gpt-3.5-turbo)
   - **Gemini**: 设置 API Key 和模型 (gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash)
   - **Ollama**: 设置 Base URL (默认 http://localhost:11434) 和模型 (llama2, mistral, codellama)
   - **Anthropic**: 设置 API Key 和模型 (claude-3-5-sonnet, claude-3-opus, claude-3-haiku)
4. 按 Enter 保存设置

[[new_file.md]]
