---
name: electron-main
description: |
  Electron 主进程开发规范。

  触发场景：
  - 开发 IPC 处理器
  - 数据库操作 (SQLite)
  - 向量数据库 (LanceDB)
  - 原生模块集成

  触发词：Electron、主进程、IPC、数据库、SQLite、LanceDB、MCP、原生模块
---

# Electron 主进程开发规范

## 核心架构

```
electron/
├── main.ts              # 应用入口
├── preload.ts           # IPC 桥接
├── ipc/                 # IPC 处理器
│   ├── index.ts         # 注册器
│   ├── aiHandlers.ts
│   ├── dbHandlers.ts
│   ├── fileHandlers.ts
│   ├── lancedbHandlers.ts
│   └── ...
├── database/            # SQLite 数据库
│   ├── index.ts         # 初始化
│   ├── schema.sql       # 表结构
│   ├── migrations.ts
│   └── repositories/
├── lancedb/             # 向量数据库
│   └── index.ts
├── mcp/                 # MCP 管理器
│   ├── index.ts
│   ├── handlers.ts
│   └── MCPClient.ts
└── ocr/                 # OCR 服务
    └── index.ts
```

## 核心规范

### IPC 通信模式

渲染进程 → `window.electronAPI.*` → IPC Renderer → IPC Main → 处理函数

```typescript
// preload.ts 中暴露 API
contextBridge.exposeInMainWorld('electronAPI', {
  ai: {
    fetch: (options) => ipcRenderer.invoke('ai:fetch', options),
  },
  db: {
    files: {
      getAll: () => ipcRenderer.invoke('db:files:getAll'),
      create: (file) => ipcRenderer.invoke('db:files:create', file),
    },
  },
  // ... 更多 API
});
```

### 数据库操作

- 使用 `better-sqlite3` 原生模块
- 遵循 `schema.sql` 表结构
- 通过 `repositories/` 封装数据访问

```typescript
// database/index.ts
import Database from 'better-sqlite3';
import path from 'path';

export function initializeDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'zhangnote.db');
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  return db;
}
```

### ESM 模块规范

Electron 主进程使用 ESM 模块：

```typescript
// electron/main.ts
import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```

### 原生模块处理

打包时需要特殊处理原生模块（better-sqlite3, canvas, onnxruntime）：

```typescript
// 配置 module.paths 用于打包环境
if (app.isPackaged) {
  const resourcesPath = process.resourcesPath;
  const unpackedModules = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules');
  if (!module.paths.includes(unpackedModules)) {
    module.paths.unshift(unpackedModules);
  }
}
```

## 禁止事项

- ❌ 禁止在前端代码直接使用 Node.js API
- ❌ 禁止在渲染进程执行同步 IPC
- ❌ 禁止在渲染进程 require 原生模块
- ❌ 禁止跳过 preload 直接通信

## 参考代码

- `electron/main.ts` - 应用入口
- `electron/ipc/index.ts` - IPC 注册器
- `electron/database/index.ts` - 数据库初始化
- `electron/preload.ts` - IPC 桥接

## 检查清单

- [ ] 是否使用 IPC 通信
- [ ] 是否遵循 ESM 规范
- [ ] 是否正确处理异步操作
- [ ] 是否在 preload 中暴露必要 API
- [ ] 是否处理了打包环境路径
