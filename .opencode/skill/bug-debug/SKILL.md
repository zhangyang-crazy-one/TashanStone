---
name: bug-debug
description: 问题排查和调试规范，包括错误处理、日志记录、调试技巧、常见问题解决方案
---

# 问题排查调试规范

## 触发条件

- **关键词**：Bug、报错、异常、Debug、调试、错误、排查、问题、issue
- **场景**：排查运行时错误、调试功能问题、修复 Bug、性能问题

## 核心规范

### 错误处理模式

```typescript
// 统一错误处理
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public severity: 'low' | 'medium' | 'high' | 'critical',
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// 使用 try-catch-with-result 模式
export async function handleAsync<T>(
  promise: Promise<T>,
  errorHandler?: (error: Error) => T
): Promise<{ success: true; data: T } | { success: false; error: Error }> {
  try {
    const data = await promise;
    return { success: true, data };
  } catch (error) {
    if (errorHandler) {
      return { success: false, error: errorHandler(error) };
    }
    return { success: false, error: error as Error };
  }
}

// 使用示例
const result = await handleAsync(
  window.electronAPI.ipcInvoke('db:query', sql)
);

if (!result.success) {
  logger.error('Database query failed', result.error);
  showErrorToast('操作失败，请重试');
}
```

### 日志记录

```typescript
// electron/utils/logger.ts
import winston from 'winston';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    if (Object.keys(meta).length) msg += ` ${JSON.stringify(meta)}`;
    if (stack) msg += `\n${stack}`;
    return msg;
  })
);

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error'
    }),
    new winston.transports.File({
      filename: 'logs/combined.log'
    })
  ]
});

// 渲染进程日志
export function logToMain(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
  window.electronAPI?.ipcInvoke('logger:write', { level, message, meta });
}
```

### 常见问题排查

#### 1. IPC 调用失败

```typescript
// 检查项
1. IPC 处理器是否在主进程注册？
   - 检查 electron/ipc/index.ts 中的 registerIPCHandlers() 调用

2. preload 是否正确暴露 API？
   - 检查 electron/preload.ts 中的 contextBridge.exposeInMainWorld

3. 渲染进程是否正确调用？
   - 使用 window.electronAPI.ipcInvoke 而非 ipcRenderer.invoke

4. 参数类型是否匹配？
   - IPC 参数必须可序列化（JSON）
```

#### 2. 数据库操作错误

```typescript
// 检查项
1. 数据库连接是否建立？
   - 检查 electron/database/index.ts 中的 getDatabase()

2. SQL 语句是否正确？
   - 使用 prepared statements 防止 SQL 注入

3. 表结构是否存在？
   - 运行 electron/database/schema.sql 初始化

4. 并发访问是否正确处理？
   - better-sqlite3 是同步的，确保不在主线程阻塞
```

#### 3. React 组件渲染问题

```typescript
// 检查项
1. useEffect 依赖是否完整？
   - ESLint exhaustive-deps 规则

2. 状态更新是否正确？
   - useState setter 是异步的

3. Context 是否正确提供？
   - 检查 Provider 包裹和 value 更新

4. 是否有无限循环？
   - 检查 useEffect 中的状态更新
```

### 调试技巧

```typescript
// 1. 开发环境启用详细日志
// main.ts
if (process.env.NODE_ENV === 'development') {
  logger.level = 'debug';
}

// 2. 渲染进程使用 React DevTools
// 安装 Chrome 扩展: React DevTools

// 3. Electron 使用开发者工具
// main.ts - 在开发环境打开 DevTools
if (process.env.NODE_ENV === 'development') {
  mainWindow.webContents.openDevTools();
}

// 4. 性能分析
// 使用 Chrome DevTools Performance 面板
// 或 React DevTools Profiler

// 5. 快速测试修复
// 在控制台直接运行修复代码测试效果
```

### LSP 调试技巧

OpenCode 已配置以下 LSP 服务器：

| 语言 | LSP 服务器 | 调试功能 |
|------|-----------|----------|
| TypeScript | typescript-language-server | 定义跳转、引用查找、类型提示 |
| Python | pyright | 类型检查、代码补全 |
| Go | gopls | 符号跳转、重构 |
| Rust | rust-analyzer | 错误检查、重构 |

#### 使用 LSP 进行问题定位

```typescript
// 1. 类型错误定位
// 触发条件：出现类型错误但不知道来源
// 使用 LSP 的 goToDefinition 跳转到类型定义

// 2. 引用查找
// 触发条件：不确定某个函数/变量在哪里被使用
// 使用 LSP 的 findReferences 查看所有引用

// 3. 符号搜索
// 触发条件：快速定位特定名称的定义
// 使用 LSP 的 workspaceSymbol 搜索项目符号

// 4. 错误跳转
// 触发条件：编译错误或 lint 错误
// 使用 LSP 的 documentSymbol 查看文档结构
```

#### 常见 LSP 问题

| 问题 | 解决方案 |
|------|----------|
| LSP 无响应 | 重启 LSP 服务器（重启 OpenCode） |
| 类型提示不准确 | 检查 tsconfig.json 配置 |
| 跳转失败 | 确认文件在 LSP 监控范围内 |
| 补全缺失 | 检查 LSP 日志确认连接状态 |

#### LSP 日志查看

```bash
# 检查 LSP 服务器是否运行
# Windows
tasklist | findstr "typescript-language-server"
tasklist | findstr "pyright"

# 查看 LSP 输出（开发环境）
# 在 OpenCode 中启用 debug 模式
```

### 问题报告模板

```markdown
## 问题描述
[简要描述问题]

## 复现步骤
1. [步骤1]
2. [步骤2]
3. [触发问题的步骤]

## 预期行为
[期望的行为]

## 实际行为
[实际发生的行为]

## 环境信息
- 操作系统：[Windows/macOS/Linux]
- Node.js 版本：[版本号]
- Electron 版本：[版本号]
- 应用版本：[版本号]

## 日志
```
[相关日志片段]
```

## 截图/录屏
[如果适用]

## 附加信息
- 相关文件：`src/xxx.ts`
- 可能的原因分析
```

## 禁止事项

- ❌ 禁止吞掉错误而不记录
- ❌ 禁止在生产环境使用 console.log 代替日志系统
- ❌ 禁止忽略 Promise rejection
- ❌ 禁止在错误处理中暴露敏感信息

## 推荐模式

1. **分层错误处理**：UI 层提示用户、业务层记录日志、系统层上报监控
2. **错误边界**：React 组件使用 ErrorBoundary 捕获渲染错误
3. **监控告警**：生产环境集成错误监控（Sentry 等）
4. **调试模式**：开发环境提供更详细的错误信息和调试工具

## 参考代码

| 文件 | 说明 |
|------|------|
| `electron/utils/logger.ts` | 日志系统 |
| `electron/ipc/index.ts` | IPC 入口 |
| `.opencode/opencode.json` | LSP/MCP 配置 |
| `tsconfig.json` | TypeScript 配置 |
| `src/index.css` | 全局样式 |
| `docs/issues/*.md` | 问题记录 |
| `docs/utils/MCP_USAGE.md` | MCP 使用问题 |
