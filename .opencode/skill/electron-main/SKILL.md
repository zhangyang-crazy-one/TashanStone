---
name: electron-main
description: Electron 主进程开发规范，包括 IPC 通信、数据库操作、进程管理
---

# Electron 主进程开发规范

## 触发条件

- **关键词**：Electron、主进程、IPC、数据库、SQLite、better-sqlite3、进程
- **场景**：开发 IPC 处理器、数据库操作、原生模块集成、主进程代码

## 核心规范

### IPC 通信模式

渲染进程通过 preload 暴露的 API 与主进程通信：

```typescript
// electron/preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  ipcInvoke: (channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args),
  ipcSend: (channel: string, ...args: unknown[]) =>
    ipcRenderer.send(channel, ...args),
  mcp: {
    getTools: () => ipcRenderer.invoke('mcp:getTools'),
    callTool: (name: string, args: Record<string, unknown>) =>
      ipcRenderer.invoke('mcp:callTool', name, args),
  }
})
```

### IPC 处理器注册

```typescript
// electron/ipc/index.ts
import { ipcMain } from 'electron';
import { aiHandlers } from './aiHandlers';
import { dbHandlers } from './dbHandlers';

export function registerIPCHandlers() {
  // AI 相关
  ipcMain.handle('ai:chat', aiHandlers.handleChat);
  ipcMain.handle('ai:stream', aiHandlers.handleStream);

  // 数据库相关
  ipcMain.handle('db:query', dbHandlers.handleQuery);
  ipcMain.handle('db:getChatHistory', dbHandlers.getChatHistory);
}
```

### 数据库操作

使用 `better-sqlite3` 并通过 repositories 封装：

```typescript
// electron/database/repositories/chatRepository.ts
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.resourcesPath, 'data.db');
const db = new Database(dbPath);

// 使用 prepared statements 防止 SQL 注入
export function getChatHistory(limit: number = 50) {
  const stmt = db.prepare(`
    SELECT * FROM messages
    WHERE chat_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(chatId, limit);
}

export function saveMessage(message: Message) {
  const stmt = db.prepare(`
    INSERT INTO messages (chat_id, role, content, created_at)
    VALUES (?, ?, ?, ?)
  `);
  return stmt.run(message.chatId, message.role, message.content, Date.now());
}
```

### 架构模式

```
渲染进程 (React)
    │
    ▼ window.electronAPI.ipcInvoke()
IPC Main (electron/ipc/*.ts)
    │
    ▼ 调用对应 Handler
处理函数 (electron/database/, electron/ai/*.ts)
    │
    ▼ 数据库操作
SQLite (better-sqlite3)
```

## 禁止事项

- ❌ 禁止在前端代码直接使用 `electron` 模块
- ❌ 禁止在渲染进程执行同步 IPC
- ❌ 禁止在主进程直接访问 DOM
- ❌ 禁止使用字符串拼接构建 SQL 查询

## 推荐模式

1. **统一入口**：所有主进程功能通过 `electron/ipc/index.ts` 注册
2. **模块化**：按功能拆分 handlers（aiHandlers.ts, dbHandlers.ts）
3. **类型安全**：定义完整的 TypeScript 接口
4. **错误处理**：所有 IPC 处理器包含 try-catch 和错误返回

## 参考代码

| 文件 | 说明 |
|------|------|
| `electron/main.ts` | 主进程入口 |
| `electron/preload.ts` | IPC 桥接 |
| `electron/ipc/index.ts` | IPC 注册 |
| `electron/ipc/aiHandlers.ts` | AI 相关处理器 |
| `electron/database/index.ts` | 数据库初始化 |
| `electron/database/repositories/*.ts` | 数据访问层 |
| `src/services/mcpService.ts` | 渲染进程 MCP 服务 |
