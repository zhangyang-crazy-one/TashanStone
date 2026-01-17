# 移除 Plain Editor 实施计划

> TashaStone v1.80 架构优化计划
> 
> **状态**: 待开始
> **版本**: v1.80
> **创建日期**: 2026-01-12

---

## 一、项目概述

### 1.1 当前架构

```
App.tsx (状态管理)
├── Toolbar (useCodeMirror 开关)
├── SplitEditor (编辑器容器)
│   ├── CodeMirrorEditor (功能丰富)
│   └── Editor (Plain textarea - 待删除)
└── Preview (预览组件)
```

### 1.2 移除原因

| 问题 | 影响 |
|------|------|
| IME 输入光标跳转 | 用户在 Plain Editor 中使用输入法时，光标会跳动 |
| 代码重复 | WikiLink 检测、图片粘贴逻辑在两个编辑器中重复 |
| 维护困难 | 功能同步困难，容易产生差异 |
| 用户困惑 | 两种编辑器体验不一致 |

### 1.3 预期收益

- ✅ 消除 IME 光标问题
- ✅ 减少代码重复
- ✅ 统一用户体验
- ✅ 便于后续功能扩展

---

## 二、现状分析

### 2.1 功能对比矩阵

| 功能 | Plain Editor | CodeMirror Editor | 处理建议 |
|------|-------------|-------------------|---------|
| Markdown 输入 | ✅ | ✅ | 无风险 |
| 撤销/重做 | ✅ | ✅ | 无风险 |
| WikiLink 检测 | ✅ | ✅ | 无风险 |
| WikiLink 悬停 | ❌ | ✅ | CodeMirror 胜出 |
| WikiLink 状态栏 | ✅ | ⚠️ | 需检查 UI |
| 图片粘贴 | ✅ | ✅ | 无风险 |
| 语法高亮 | ❌ | ✅ | CodeMirror 胜出 |
| 行号显示 | ❌ | ✅ | CodeMirror 胜出 |
| 光标保存 | ✅ | ✅ | 无风险 |

### 2.2 使用位置追踪

| 文件 | 使用方式 |
|------|---------|
| `App.tsx:340` | `useCodeMirror` 状态定义 |
| `App.tsx:897-944` | `handleToggleCodeMirror` 函数 |
| `Toolbar.tsx:303-307` | 切换按钮 UI |
| `SplitEditor.tsx:124-156` | 条件渲染逻辑 |

### 2.3 风险评估

| 风险项 | 等级 | 应对措施 |
|--------|------|----------|
| IME 光标跳转 | 🟡 触发原因 | 正是删除 Plain 的动机 |
| 用户习惯 | 🟡 中等 | 默认使用 CodeMirror，提供平滑过渡 |
| 功能覆盖 | 🟢 低 | CodeMirror 功能更丰富 |
| 光标同步 | 🟡 需测试 | 保留 `handleToggleCodeMirror` 中的光标保存逻辑 |

---

## 三、实施计划

### 阶段 1：CodeMirror 样式重构（准备）

**目标**：确保 CodeMirror 完美适配 5 套主题

| 任务 | 状态 | 说明 |
|------|------|------|
| 1.1 替换颜色为 CSS 变量 | ⏳ 待开始 | 将硬编码颜色替换为 `var(--*)` |
| 1.2 验证 5 套主题适配 | ⏳ 待开始 | Neon Cyber, Simple Paper, Handwritten, Dracula, Dawn |
| 1.3 增加滚动边距 | ⏳ 待开始 | 添加 `padding-bottom: 50vh` |

### 阶段 2：移除 Plain Editor（执行）

**目标**：删除所有 Plain Editor 相关代码

| 任务 | 状态 | 说明 |
|------|------|------|
| 2.1 修改 App.tsx | ⏳ 待开始 | 移除 `useCodeMirror` 状态和切换逻辑 |
| 2.2 修改 Toolbar.tsx | ⏳ 待开始 | 移除切换菜单选项 |
| 2.3 修改 SplitEditor.tsx | ⏳ 待开始 | 始终使用 CodeMirrorEditor |
| 2.4 删除 Editor.tsx | ⏳ 待开始 | 删除 Plain Editor 文件 |

### 阶段 3：UI 细节打磨（优化）

**目标**：提升用户体验

| 任务 | 状态 | 说明 |
|------|------|------|
| 3.1 提取状态栏组件 | ⏳ 待开始 | 创建 `EditorStatusBar` 统一显示 |
| 3.2 工具栏布局优化 | ⏳ 待开始 | 增加 Focus Mode 按钮 |
| 3.3 清理代码重复 | ⏳ 待开始 | 提取共享的 WikiLink 逻辑 |

### 阶段 4：文档和清理（收尾）

| 任务 | 状态 | 说明 |
|------|------|------|
| 4.1 更新翻译文件 | ⏳ 待开始 | 移除 `plainTextEditor` 翻译 |
| 4.2 更新项目文档 | ⏳ 待开始 | 更新 README, CLAUDE.md |
| 4.3 运行完整测试 | ⏳ 待开始 | 确保所有测试通过 |

---

## 四、测试清单

### 4.1 单元测试

- [ ] `npm run test` 全部通过
- [ ] WikiLink 检测功能测试
- [ ] 图片粘贴功能测试
- [ ] 光标位置保存/恢复测试

### 4.2 手动测试场景

- [ ] 新建文件并输入文本
- [ ] 使用输入法输入中文
- [ ] 粘贴图片到编辑器
- [ ] 分屏模式测试
- [ ] 主题切换测试（5套主题）
- [ ] 撤销/重做快捷键
- [ ] WikiLink 点击导航

### 4.3 验收标准

| 标准 | 描述 |
|------|------|
| 功能完整 | 所有 Plain Editor 功能在 CodeMirror 中可用 |
| IME 正常 | 输入法输入时光标不跳动 |
| 主题适配 | 5 套主题全部正确适配 CodeMirror |
| 性能达标 | 加载时间无明显增加 |

---

## 五、回滚计划

如果出现严重问题，按以下步骤回滚：

```bash
# 1. 从 git 恢复删除的文件
git checkout HEAD -- components/Editor.tsx

# 2. 恢复 App.tsx 中的 useCodeMirror 状态
git checkout HEAD -- App.tsx

# 3. 恢复 Toolbar.tsx 中的切换选项
git checkout HEAD -- components/Toolbar.tsx

# 4. 恢复 SplitEditor.tsx 的条件渲染
git checkout HEAD -- components/SplitEditor.tsx
```

---

## 六、进度追踪

### 当前版本信息

| 项目 | 值 |
|------|-----|
| 当前版本 | v1.7.0 |
| 目标版本 | v1.8.0 |
| 进度 | 0% |

### 任务完成情况

| 阶段 | 总任务 | 完成 | 进行中 | 待开始 |
|------|--------|------|--------|--------|
| 阶段1 | 3 | 0 | 0 | 3 |
| 阶段2 | 4 | 0 | 0 | 4 |
| 阶段3 | 3 | 0 | 0 | 3 |
| 阶段4 | 3 | 0 | 0 | 3 |
| **总计** | **13** | **0** | **0** | **13** |

---

## 七、变更日志

### v1.8.0 (待发布)

**主要变更**
- ✨ 移除 Plain Editor，统一使用 CodeMirror Editor
- ✨ CodeMirror 深度主题化，适配 5 套主题
- ✨ 优化滚动体验，增加滚到底部边距
- ✨ 新增 Focus Mode 专注模式

**技术改进**
- 🔧 移除 `useCodeMirror` 状态
- 🔧 提取共享的 WikiLink 逻辑
- 🔧 删除约 300 行重复代码

**已知问题**
- 无

---

## 八、相关文档

- [README.md](../README.md)
- [PROJECT.md](./PROJECT.md)
- [PROJECT_STATUS.md](./PROJECT_STATUS.md)
- [CODE_STYLE_GUIDE.md](./CODE_STYLE_GUIDE.md)
