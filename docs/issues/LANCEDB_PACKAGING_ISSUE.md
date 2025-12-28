# LanceDB Electron 打包问题修复记录

## 问题概述

**日期**: 2024-12-21
**状态**: ✅ 已修复并验证
**优先级**: 高 (核心功能)

### 错误信息

```
[LanceDB] Failed to initialize: Cannot find module 'apache-arrow'
```

### 环境信息

- Electron: 33.4.11
- electron-builder: 25.1.8
- @lancedb/lancedb: 0.17.0
- apache-arrow: 18.1.0
- Node.js: v20.x
- OS: Windows 10/11

### 问题特征

- **仅在安装包版本中出现**: electron-dev 模式下 LanceDB 正常工作
- **打包后失效**: exe 安装后的应用无法初始化 LanceDB
- **错误类型**: Cannot find module 'apache-arrow'

---

## ✅ 根本原因

### 纯 JS 模块未解压到 unpacked 目录

**问题分析**：

@lancedb/lancedb 依赖链：
```
@lancedb/lancedb (napi-rs 原生模块)
├── apache-arrow (纯 JS 模块) ← 问题所在
├── flatbuffers (纯 JS 模块)
└── 其他依赖...
```

**关键问题**：
1. electron-builder 的 `asarUnpack` 只解压包含原生模块 (`.node` 文件) 的包
2. `apache-arrow` 和 `flatbuffers` 是纯 JS 模块，不会被自动解压
3. 打包后，@lancedb/lancedb 在 `app.asar.unpacked` 中，但其依赖在 `app.asar` 中
4. 原生模块无法正确 require asar 内的纯 JS 模块

**开发模式 vs 打包模式对比**：

| 模式 | apache-arrow 位置 | LanceDB 能否加载 |
|------|------------------|-----------------|
| 开发模式 | `node_modules/` (完整目录) | ✅ 可以 |
| 打包模式 | `app.asar` 内部 | ❌ 原生模块无法读取 |

**require 链失败过程**：
```
@lancedb/lancedb (app.asar.unpacked/node_modules/@lancedb/lancedb)
  → require('apache-arrow')
  → 在 app.asar.unpacked/node_modules 中找不到 ❌
  → 在 app.asar/node_modules 中？原生模块无法读取 asar！❌
  → 模块加载失败
```

---

## ✅ 解决方案

### 方案概述

1. 在 `electron-builder.yml` 的 `asarUnpack` 中声明模块（虽然对纯 JS 无效，但保持一致性）
2. 使用 `afterPack` 钩子手动复制纯 JS 模块到 unpacked 目录
3. 在主进程中配置 `module.paths` 确保正确的模块解析路径

### 修改 1: electron-builder.yml

```yaml
asarUnpack:
  # LanceDB 及其依赖
  - "**/node_modules/@lancedb/**/*"
  - "**/node_modules/apache-arrow/**/*"
  - "**/node_modules/flatbuffers/**/*"
```

### 修改 2: scripts/afterPack.cjs

创建 afterPack 钩子脚本，手动复制纯 JS 模块：

```javascript
const fs = require('fs');
const path = require('path');

// 需要复制的纯 JS 模块列表
const modulesToCopy = [
  'apache-arrow',
  'flatbuffers',
  'tslib',
  'json-bignum',
  'command-line-args',
  'command-line-usage',
  '@swc/helpers',
  '@types/command-line-args',
  '@types/command-line-usage',
  '@types/node',
  // OCR 依赖
  'onnxruntime-common',
];

// 关键模块验证
const criticalModules = ['apache-arrow', 'flatbuffers', 'onnxruntime-common'];

exports.default = async function(context) {
  const appOutDir = context.appOutDir;
  const resourcesDir = path.join(appOutDir, 'resources');
  const unpackedModules = path.join(resourcesDir, 'app.asar.unpacked', 'node_modules');
  const sourceModules = path.join(process.cwd(), 'node_modules');

  console.log('[afterPack] Copying pure JS modules to unpacked directory...');

  for (const moduleName of modulesToCopy) {
    const src = path.join(sourceModules, moduleName);
    const dest = path.join(unpackedModules, moduleName);

    if (fs.existsSync(src)) {
      fs.cpSync(src, dest, { recursive: true });
      console.log(`[OK] ${moduleName}`);
    }
  }

  // 验证关键模块
  for (const mod of criticalModules) {
    if (fs.existsSync(path.join(unpackedModules, mod))) {
      console.log(`[VERIFIED] ${mod}`);
    } else {
      console.error(`[MISSING] ${mod}`);
    }
  }
};
```

### 修改 3: electron/lancedb/index.ts

配置 module.paths 确保正确加载：

```typescript
import { app } from 'electron';
import path from 'path';

// 配置 module.paths 用于打包环境
if (app.isPackaged) {
  const resourcesPath = process.resourcesPath;
  const unpackedModules = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules');

  // 将 unpacked 目录添加到模块搜索路径
  if (!module.paths.includes(unpackedModules)) {
    module.paths.unshift(unpackedModules);
  }
}

// 动态导入 LanceDB
const lancedb = require('@lancedb/lancedb');
```

---

## 打包后目录结构验证 ✅

已确认所有必要文件都正确打包：

```
release/win-unpacked/resources/
├── app.asar.unpacked/node_modules/
│   ├── @lancedb/lancedb/              ✅ LanceDB 原生模块
│   │   └── index.win32-x64-msvc.node  ✅ Windows x64 原生绑定
│   ├── apache-arrow/                   ✅ 通过 afterPack 复制
│   ├── flatbuffers/                    ✅ 通过 afterPack 复制
│   ├── tslib/                          ✅ 通过 afterPack 复制
│   └── ...其他依赖
└── app.asar                            ✅ 主应用代码
```

---

## LanceDB 架构

### 文件结构

```
electron/
├── lancedb/
│   └── index.ts          # LanceDB 服务封装
├── ipc/
│   └── lancedbHandlers.ts  # IPC 处理器
└── main.ts               # 主进程入口
```

### 功能接口

```typescript
interface LanceDBService {
  init(): Promise<void>;
  add(chunks: VectorChunk[]): Promise<void>;
  search(queryVector: number[], limit: number): Promise<SearchResult[]>;
  deleteByFile(fileId: string): Promise<void>;
  clear(): Promise<void>;
  getAll(): Promise<VectorChunk[]>;
  getFileIds(): Promise<string[]>;
  getStats(): Promise<{ totalChunks: number; indexedFiles: number }>;
}
```

---

## 经验总结

### 纯 JS 模块打包问题的通用解决方案

1. **识别问题模式**：
   - 开发模式正常，打包后失败
   - 错误通常是 "Cannot find module"
   - 涉及原生模块的纯 JS 依赖

2. **诊断步骤**：
   ```powershell
   # 检查模块是否在 unpacked 目录
   Get-ChildItem 'release\win-unpacked\resources\app.asar.unpacked\node_modules' -Directory

   # 检查依赖树
   npm ls <module-name>
   ```

3. **修复模式**：
   - 在 `afterPack.cjs` 中添加需要复制的纯 JS 模块
   - 确保 `criticalModules` 数组包含关键依赖以验证复制成功
   - 在主进程中配置 `module.paths`

---

## 更新日志

| 日期 | 操作 | 结果 |
|------|------|------|
| 2024-12-21 | 创建问题调研文档 | - |
| 2024-12-21 | 定位根因：apache-arrow 未解压 | 确认 |
| 2024-12-21 | 应用 afterPack 解决方案 | ✅ 成功 |
| 2024-12-21 | 验证打包后 LanceDB 功能 | ✅ 正常工作 |
