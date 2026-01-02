# 工具调用渲染问题 - 转义字符显示错误

## 问题概述

**日期**: 2024-12-29
**状态**: 待修复
**优先级**: 中 (UI体验)
**影响模块**: ToolCallCard 组件

### 错误现象

1. MCP 工具调用结果显示转义字符 (`\n`, `\"`, `\\`)
2. JSON 输出未正确格式化，原始转义序列直接渲染
3. 影响 `evaluate_script` 等返回复杂数据的工具

### 环境信息

- React: 19.x
- 相关文件:
  - `components/ToolCallCard.tsx`
  - `electron/mcp/MCPClient.ts`

---

## 根本原因分析

### 1. 双重序列化问题

**问题链路**:

```
MCP 服务器
    ↓ JSON.stringify(result)  // 第一次序列化
返回字符串: '{"output": "Hello\\nWorld"}'
    ↓
MCPClient.ts
    ↓ JSON.stringify(response)  // 第二次序列化（某些情况）
返回字符串: '"{\"output\": \"Hello\\\\nWorld\"}"'
    ↓
ToolCallCard.tsx
    ↓ JSON.parse(result)  // 只解析一层
得到字符串: '{"output": "Hello\\nWorld"}'  ← 仍然是转义的字符串
```

### 2. 单层 JSON 解析

**问题位置**: `components/ToolCallCard.tsx:253-263`

```typescript
// 当前代码（只解析一层）
let parsedResult: any = null;
if (result) {
  try {
    parsedResult = JSON.parse(result);  // ← 只解析一次
    isSuccess = parsedResult.success !== false;
  } catch {
    parsedResult = result;
  }
}
```

**问题**:
- 当 `result` 是双重序列化的 JSON 字符串时
- `JSON.parse` 只解析最外层
- 内部仍然是带转义的 JSON 字符串

### 3. 格式检测函数局限

**问题位置**: `components/ToolCallCard.tsx:6-27`

```typescript
const formatWithSyntaxHighlight = (content: string) => {
  const trimmed = content.trim();

  // 只检测外层是否为 JSON
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);  // ← 验证 JSON 有效性
      return { type: 'json', formatted: trimmed };
    } catch {
      // 不是有效 JSON
    }
  }
  // ...
};
```

**问题**:
- 内容以 `"` 开头时（双重序列化的字符串），不会被识别为 JSON
- 导致转义字符原样显示

---

## 解决方案

### 方案 A: 深度 JSON 解析（推荐）

添加递归解析函数，自动处理多层序列化：

#### 步骤 1: 添加深度解析辅助函数

**文件**: `components/ToolCallCard.tsx`

```typescript
/**
 * 深度解析 JSON，处理多层序列化
 * @param value 可能是多层序列化的 JSON 字符串
 * @param maxDepth 最大解析深度，防止无限循环
 * @returns 解析后的值
 */
const deepParseJson = (value: any, maxDepth: number = 3): any => {
  if (maxDepth <= 0) return value;

  // 非字符串直接返回
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();

  // 尝试解析 JSON
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      // 递归解析，处理嵌套的序列化字符串
      return deepParseJson(parsed, maxDepth - 1);
    } catch {
      // 解析失败，返回原值
      return value;
    }
  }

  return value;
};

/**
 * 深度解析对象中的所有字符串字段
 */
const deepParseObject = (obj: any, maxDepth: number = 3): any => {
  if (maxDepth <= 0) return obj;

  if (typeof obj === 'string') {
    return deepParseJson(obj, maxDepth);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepParseObject(item, maxDepth - 1));
  }

  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deepParseObject(value, maxDepth - 1);
    }
    return result;
  }

  return obj;
};
```

#### 步骤 2: 修改结果解析逻辑

**文件**: `components/ToolCallCard.tsx` - `StreamToolCard` 组件

```typescript
// 替换现有的解析逻辑 (line 253-263)
let parsedResult: any = null;
let isSuccess = true;
if (result) {
  try {
    // 使用深度解析
    parsedResult = deepParseObject(JSON.parse(result));
    isSuccess = parsedResult.success !== false;
  } catch {
    // 尝试深度解析原始字符串
    parsedResult = deepParseJson(result);
  }
}
```

#### 步骤 3: 增强格式检测函数

```typescript
const formatWithSyntaxHighlight = (content: string): { type: 'json' | 'html' | 'text'; formatted: string } => {
  // 先尝试深度解析
  const deepParsed = deepParseJson(content);

  // 如果解析后是对象/数组，格式化为 JSON
  if (typeof deepParsed === 'object' && deepParsed !== null) {
    return {
      type: 'json',
      formatted: JSON.stringify(deepParsed, null, 2)
    };
  }

  // 如果解析后是字符串，检查是否为 HTML
  const trimmed = String(deepParsed).trim();

  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') ||
      trimmed.startsWith('<!') || (trimmed.startsWith('<') && trimmed.endsWith('>'))) {
    return { type: 'html', formatted: trimmed };
  }

  return { type: 'text', formatted: trimmed };
};
```

---

### 方案 B: MCP 客户端源头修复（备选）

在 MCP 客户端返回结果时统一处理：

**文件**: `electron/mcp/MCPClient.ts`

```typescript
// 在返回结果前处理双重序列化
private normalizeResult(result: any): any {
  if (typeof result === 'string') {
    try {
      // 尝试解析，如果是 JSON 字符串则解析
      const parsed = JSON.parse(result);
      return this.normalizeResult(parsed); // 递归处理
    } catch {
      return result;
    }
  }
  return result;
}

// 调用工具时使用
async callTool(name: string, args: any): Promise<any> {
  const rawResult = await this.sendRequest('tools/call', { name, arguments: args });
  return this.normalizeResult(rawResult);
}
```

---

## 验证检查清单

- [ ] `evaluate_script` 工具结果正确显示换行
- [ ] JSON 对象正确格式化（缩进、高亮）
- [ ] 嵌套 JSON 字符串正确解析
- [ ] HTML 内容正确显示
- [ ] 普通文本不受影响

---

## 示例对比

### 修复前

```
OUTPUT:
{"success":true,"output":"{\"title\":\"Example\",\"items\":[\"item1\",\"item2\"]}"}
```

显示效果：原始转义字符可见

### 修复后

```json
OUTPUT:
{
  "success": true,
  "output": {
    "title": "Example",
    "items": ["item1", "item2"]
  }
}
```

显示效果：JSON 正确格式化和高亮

---

## 更新日志

| 日期 | 操作 | 结果 |
|------|------|------|
| 2024-12-29 | 问题发现与分析 | 确认根因 |
| 2024-12-29 | 创建问题文档 | - |
| 2025-12-29 | 实施修复方案 | ✅ 已完成 |
| 2025-12-29 | 验证修复效果 | 待验证 |
