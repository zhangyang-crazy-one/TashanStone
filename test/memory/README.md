# 记忆系统测试指南

> 本文档说明如何安装、配置和运行记忆系统的单元测试和集成测试。

---

## 一、安装测试依赖

```bash
# 安装 Vitest 和相关依赖
npm install -D vitest @vitest/ui @vitest/coverage-v8

# 或者使用 pnpm
pnpm add -D vitest @vitest/ui @vitest/coverage-v8
```

---

## 二、测试文件结构

```
test/
├── setup.ts                    # 测试设置文件
├── memory/
│   ├── memory.unit.test.ts     # 单元测试 (22 个测试用例)
│   └── memory.integration.test.ts  # 集成测试 (15 个测试用例)
├── README.md                   # 本文档
└── ...                         # 其他测试文件
```

---

## 三、运行测试

### 3.1 运行所有测试

```bash
# 使用 npm
npm test

# 或直接使用 vitest
npx vitest run
```

### 3.2 运行单元测试

```bash
npx vitest run test/memory/memory.unit.test.ts
```

### 3.3 运行集成测试

```bash
npx vitest run test/memory/memory.integration.test.ts
```

### 3.4 监听模式运行

```bash
npx vitest
```

### 3.5 带 UI 运行

```bash
npx vitest ui
```

---

## 四、单元测试用例

### 4.1 Token Budget 测试

| 用例 | 说明 | 预期结果 |
|------|------|----------|
| 简单文本 | 计算 "Hello, World!" 的 token 数 | 2 tokens |
| 空字符串 | 处理空输入 | 0 tokens |
| 中文文本 | 处理中文字符 | 每个字符 1+ tokens |
| 缓存 token | 从消息缓存计算总 token | 正确累加 |
| 无缓存估算 | 使用 fallback 估算 | 合理估算 |

### 4.2 Memory Document 测试

| 用例 | 说明 | 预期结果 |
|------|------|----------|
| 结构验证 | 创建有效 MemoryDocument | 所有字段正确 |
| Frontmatter 解析 | 解析 Markdown frontmatter | 正确提取 metadata |
| 可选字段 | 处理缺失的可选字段 | 使用默认值 |

### 4.3 Memory Index 测试

| 用例 | 说明 | 预期结果 |
|------|------|----------|
| 索引结构 | 创建有效索引 | version, memories 正确 |
| 主题过滤 | 按主题过滤记忆 | 正确筛选 |
| 时间排序 | 按更新时间排序 | 正确排序 |

### 4.4 Three Layer Memory 测试

| 用例 | 说明 | 预期结果 |
|------|------|----------|
| 短期记忆 | 推送和获取消息 | 正确存储 |
| 自动升级检查 | 检查 token 阈值 | 正确判断 |
| 重要性过滤 | 按 importance 过滤 | 正确筛选 |

### 4.5 搜索功能测试

| 用例 | 说明 | 预期结果 |
|------|------|----------|
| 主题搜索 | 按主题搜索记忆 | 正确返回 |
| 结果限制 | 限制返回数量 | 正确截断 |
| 无结果 | 处理无匹配情况 | 返回空数组 |

### 4.6 Result 类型测试

| 用例 | 说明 | 预期结果 |
|------|------|----------|
| Success 结果 | 创建成功结果 | success=true |
| Failure 结果 | 创建失败结果 | success=false |
| 类型判断 | 区分成功/失败 | 正确判断 |

### 4.7 文件操作测试

| 用例 | 说明 | 预期结果 |
|------|------|----------|
| 文件名生成 | 生成有效文件名 | 符合命名规范 |
| Markdown 格式化 | 格式化为 Markdown | 包含 frontmatter |
| 索引恢复 | 从文件恢复索引 | 正确重建 |

---

## 五、集成测试用例

### 5.1 CRUD 操作

| 用例 | 说明 | 预期结果 |
|------|------|----------|
| 创建记忆 | 创建新记忆 | 生成有效 ID |
| 更新记忆 | 更新现有记忆 | 保留 ID，更新内容 |
| 删除记忆 | 删除记忆 | 从列表移除 |
| 按 ID 查找 | 查找指定记忆 | 返回正确对象 |

### 5.2 搜索功能

| 用例 | 说明 | 预期结果 |
|------|------|----------|
| 主题搜索 | 按主题搜索 | 返回匹配结果 |
| 内容搜索 | 按内容搜索 | 返回匹配结果 |
| 结果限制 | 限制结果数量 | 正确截断 |
| 无匹配 | 处理无匹配情况 | 返回空数组 |

### 5.3 过滤功能

| 用例 | 说明 | 预期结果 |
|------|------|----------|
| 按重要性过滤 | 过滤指定重要性 | 正确筛选 |
| 多主题过滤 | 过滤多主题 | AND 逻辑 |

### 5.4 排序功能

| 用例 | 说明 | 预期结果 |
|------|------|----------|
| 按创建时间排序 | 降序排列 | 最新在前 |
| 按更新时间排序 | 正确排序 | 时间递减 |

### 5.5 索引操作

| 用例 | 说明 | 预期结果 |
|------|------|----------|
| 索引结构 | 创建有效索引 | 版本和记忆正确 |
| 索引同步 | 同步索引和记忆 | 数量一致 |
| 索引恢复 | 从文件恢复 | 正确重建 |

### 5.6 升级功能

| 用例 | 说明 | 预期结果 |
|------|------|----------|
| 跟踪升级 | 记录升级来源 | 正确记录 |
| 访问计数 | 更新访问次数 | 正确计数 |
| 标星状态 | 标记重要记忆 | 正确设置 |

### 5.7 统计功能

| 用例 | 说明 | 预期结果 |
|------|------|----------|
| 主题统计 | 统计主题分布 | 正确计数 |
| 重要性统计 | 统计重要性分布 | 正确计数 |

### 5.8 三层记忆集成

| 用例 | 说明 | 预期结果 |
|------|------|----------|
| 短期到中期 | 压缩会话 | 生成摘要 |
| 中期到长期 | 升级为长期 | 生成 embedding |

---

## 六、验证脚本

项目已提供验证脚本：

```bash
# 1. 创建测试记忆
node scripts/create-test-memory.cjs

# 2. 验证记忆系统
node scripts/verify-memories.cjs
```

输出示例：
```
🧪 验证永久记忆功能

==================================================

📁 检查记忆目录...
✅ 目录存在: F:\MYproject\Zhang_Note\TashaStone\.memories

📋 检查索引文件...
✅ 索引文件存在: F:\MYproject\Zhang_Note\TashaStone\.memories\_memories_index.json

📊 验证索引内容...
  - 版本: 1.0
  - 更新时间: 2025-12-29T06:50:56.901Z
  - 记忆数量: 3

📄 验证记忆文件...
✅ memory_2025-12-29_ceshi_p6xtib.md
    ID: test-memory-...
    话题: 测试, 示例, 项目
    重要性: medium
...

🔍 测试搜索功能...
  搜索 "测试": 1 个结果
  搜索 "项目": 3 个结果
  搜索 "开发": 1 个结果

==================================================
✨ 验证完成！
```

---

## 七、人机交互验证

### 7.1 启动应用

```bash
# 开发模式
npm run dev
```

### 7.2 触发记忆功能

| 功能 | 触发方式 | 位置 |
|------|----------|------|
| 创建记忆 | 点击 "+" 按钮 | MemoryPanel |
| 保存对话 | 💾 图标 | ChatPanel |
| 升级记忆 | 上下文压缩 | ChatPanel |
| 搜索记忆 | 搜索框 | MemoryPanel |
| 标星记忆 | ⭐ 图标 | MemoryPanel |
| 删除记忆 | 🗑️ 图标 | MemoryPanel |

### 7.3 验证步骤

1. **创建记忆**
   - 点击左侧 🧠 Brain 图标
   - 点击 "新建记忆"
   - 输入内容并保存

2. **搜索记忆**
   - 在 MemoryPanel 搜索框输入关键词
   - 验证搜索结果

3. **AI 对话保存**
   - 打开 ChatPanel
   - 开始对话
   - 点击 💾 保存到记忆

4. **上下文压缩**
   - 对话超过阈值
   - 点击压缩按钮
   - 验证记忆升级

---

## 八、测试覆盖率

运行测试后查看覆盖率：

```bash
npx vitest run --coverage
```

生成覆盖率报告在 `coverage/` 目录。

---

## 九、持续集成

在 `package.json` 中添加测试脚本：

```json
{
  "scripts": {
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest ui"
  }
}
```

---

## 十、故障排除

### 10.1 Vitest 未找到

```bash
# 确保已安装
npm install -D vitest

# 检查版本
npx vitest --version
```

### 10.2 TypeScript 错误

确保 `tsconfig.json` 包含 test 目录：

```json
{
  "include": ["src/**/*", "test/**/*", "*.config.ts"]
}
```

### 10.3 ESM 兼容性问题

确保 `package.json` 设置 `"type": "module"`。

---

## 十一、相关文档

- 测试文件: `test/memory/memory.unit.test.ts`
- 集成测试: `test/memory/memory.integration.test.ts`
- 验证脚本: `scripts/verify-memories.cjs`
- 创建脚本: `scripts/create-test-memory.cjs`
