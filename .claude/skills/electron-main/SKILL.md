---
name: electron-main
description: |
  Electron 主进程和系统开发规范。

  触发场景：
  - 开发 Electron 主进程功能
  - IPC 通信 (ipcMain/ipcRenderer)
  - Preload 脚本开发
  - 数据库操作 (better-sqlite3)
  - LanceDB 向量数据库
  - 原生模块集成

  触发词：Electron、主进程、IPC、ipcMain、ipcRenderer、preload、contextBridge、sqlite、lancedb、native module
---

# Electron 主进程开发规范

> 本项目: TashanStone - AI-powered Markdown Editor (Electron + React)

## 核心架构

```
TashanStone/
├── electron/
│   ├── main.ts              # Electron 主进程入口
│   ├── preload.ts           # Preload 脚本 (contextBridge)
│   ├── database/            # SQLite 数据库
│   │   ├── index.ts         # 数据库初始化
│   │   ├── migrations.ts    # 数据迁移
│   │   └── repositories/    # 数据仓库
│   ├── ipc/                 # IPC 处理器
│   │   ├── index.ts         # 注册所有处理器
│   │   ├── aiHandlers.ts    # AI 相关
│   │   ├── dbHandlers.ts    # 数据库操作
│   │   ├── fileHandlers.ts  # 文件操作
│   │   ├── lancedbHandlers.ts # 向量数据库
│   │   ├── sherpaHandlers.ts  # 语音识别
│   │   └── ocrHandlers.ts   # OCR 处理
│   ├── lancedb/             # LanceDB 向量数据库
│   ├── mcp/                 # MCP 服务集成
│   ├── ocr/                 # OCR 服务
│   ├── sherpa/              # 语音识别服务
│   └── utils/               # 工具函数
├── src/                     # React 渲染进程
│   ├── services/            # 前端服务层
│   ├── hooks/               # React Hooks
│   └── types/               # TypeScript 类型
└── dist-electron/           # 编译输出
```

## 核心规范

### IPC 通信模式

```
渲染进程 → window.electronAPI.xxx() → preload.ts → ipcRenderer.invoke()
    ↓
ipcMain.handle() → electron/ipc/*.ts → 返回结果
```

### Preload 脚本 (contextBridge)

```typescript
// electron/preload.ts
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 文件操作
  files: {
    getAll: () => ipcRenderer.invoke('files:getAll'),
    save: (file: MarkdownFile) => ipcRenderer.invoke('files:save', file),
    delete: (id: string) => ipcRenderer.invoke('files:delete', id),
  },

  // AI 服务
  ai: {
    chat: (config: AIConfig, messages: ChatMessage[]) =>
      ipcRenderer.invoke('ai:chat', config, messages),
    streamChat: (config: AIConfig, messages: ChatMessage[]) =>
      ipcRenderer.invoke('ai:streamChat', config, messages),
    fetch: (options: FetchOptions) =>
      ipcRenderer.invoke('ai:fetch', options),
  },

  // LanceDB 向量数据库
  lancedb: {
    search: (query: string, limit: number) =>
      ipcRenderer.invoke('lancedb:search', query, limit),
    addDocument: (doc: Document) =>
      ipcRenderer.invoke('lancedb:add', doc),
  },

  // MCP 服务
  mcp: {
    getServers: () => ipcRenderer.invoke('mcp:getServers'),
    callTool: (serverName: string, toolName: string, args: unknown) =>
      ipcRenderer.invoke('mcp:callTool', serverName, toolName, args),
  },
});
```

### IPC Handler 定义

```typescript
// electron/ipc/dbHandlers.ts
import { ipcMain } from 'electron';
import { fileRepository } from '../database/repositories/fileRepository';

export function registerDbHandlers() {
  // 获取所有文件
  ipcMain.handle('files:getAll', async () => {
    return fileRepository.getAll();
  });

  // 保存文件
  ipcMain.handle('files:save', async (_, file: MarkdownFile) => {
    return fileRepository.save(file);
  });

  // 删除文件
  ipcMain.handle('files:delete', async (_, id: string) => {
    return fileRepository.delete(id);
  });
}
```

### 数据库操作 (better-sqlite3)

```typescript
// electron/database/index.ts
import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

let db: Database.Database | null = null;

export function initializeDatabase(): Database.Database {
  const dbPath = path.join(app.getPath('userData'), 'tashanstone.db');

  db = new Database(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
  });

  // 启用 WAL 模式提高性能
  db.pragma('journal_mode = WAL');

  return db;
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
```

### Repository 模式

```typescript
// electron/database/repositories/fileRepository.ts
import { getDatabase } from '../index';

export interface MarkdownFile {
  id: string;
  name: string;
  content: string;
  path?: string;
  folderId?: string;
  createdAt: string;
  updatedAt: string;
}

export const fileRepository = {
  getAll(): MarkdownFile[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM files ORDER BY updatedAt DESC').all() as MarkdownFile[];
  },

  getById(id: string): MarkdownFile | undefined {
    const db = getDatabase();
    return db.prepare('SELECT * FROM files WHERE id = ?').get(id) as MarkdownFile | undefined;
  },

  save(file: MarkdownFile): MarkdownFile {
    const db = getDatabase();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO files (id, name, content, path, folderId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, COALESCE((SELECT createdAt FROM files WHERE id = ?), ?), ?)
    `);

    stmt.run(file.id, file.name, file.content, file.path, file.folderId, file.id, now, now);
    return { ...file, updatedAt: now };
  },

  delete(id: string): boolean {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM files WHERE id = ?').run(id);
    return result.changes > 0;
  },
};
```

### LanceDB 向量数据库

```typescript
// electron/lancedb/index.ts
import * as lancedb from '@lancedb/lancedb';
import path from 'path';
import { app } from 'electron';

let db: lancedb.Connection | null = null;

export async function initLanceDB(): Promise<lancedb.Connection> {
  const dbPath = path.join(app.getPath('userData'), 'lancedb');
  db = await lancedb.connect(dbPath);
  return db;
}

export function getLanceDB(): lancedb.Connection {
  if (!db) {
    throw new Error('LanceDB not initialized');
  }
  return db;
}

// electron/ipc/lancedbHandlers.ts
export function registerLanceDBHandlers() {
  ipcMain.handle('lancedb:search', async (_, query: string, limit: number) => {
    const db = getLanceDB();
    const table = await db.openTable('documents');

    // 生成查询向量
    const queryVector = await generateEmbedding(query);

    // 向量搜索
    const results = await table
      .search(queryVector)
      .limit(limit)
      .execute();

    return results;
  });

  ipcMain.handle('lancedb:add', async (_, doc: Document) => {
    const db = getLanceDB();
    const table = await db.openTable('documents');

    // 生成文档向量
    const vector = await generateEmbedding(doc.content);

    await table.add([{ ...doc, vector }]);
    return true;
  });
}
```

### 主进程入口

```typescript
// electron/main.ts
import { app, BrowserWindow } from 'electron';
import { initializeDatabase, closeDatabase } from './database/index';
import { registerAllHandlers } from './ipc/index';
import { initLanceDB } from './lancedb/index';

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 开发模式加载 Vite 服务器
  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  // 初始化数据库
  initializeDatabase();
  await initLanceDB();

  // 注册 IPC 处理器
  registerAllHandlers();

  await createWindow();
});

app.on('window-all-closed', () => {
  closeDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

## 禁止事项

- 禁止在渲染进程直接使用 Node.js API（必须通过 preload 暴露）
- 禁止在 preload 中启用 nodeIntegration
- 禁止在主进程使用同步 IPC (ipcMain.on + event.returnValue)
- 禁止硬编码数据库路径（使用 app.getPath()）
- 禁止在 IPC handler 中忘记错误处理

## 参考代码

- `electron/main.ts` - 主进程入口
- `electron/preload.ts` - Preload 脚本
- `electron/ipc/` - IPC 处理器
- `electron/database/` - 数据库层

## 检查清单

- [ ] 是否使用 contextBridge 暴露 API
- [ ] 是否使用 ipcMain.handle + ipcRenderer.invoke（异步模式）
- [ ] 是否正确处理了 IPC 错误
- [ ] 数据库是否使用 WAL 模式
- [ ] 是否在 app.quit 时正确关闭数据库
- [ ] 是否使用 app.getPath('userData') 存储数据
