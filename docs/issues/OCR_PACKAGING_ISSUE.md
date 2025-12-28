# OCR Electron 打包问题修复记录

## 问题概述

**日期**: 2024-12-21
**状态**: ✅ 已修复并验证
**优先级**: 高 (核心功能)

### 错误信息

```
Failed to initialize OCR service
```

### 环境信息

- Electron: 33.4.11
- electron-builder: 25.1.8
- esearch-ocr: (OCR 库)
- onnxruntime-node: 1.20.1
- onnxruntime-common: (纯 JS 依赖)
- Node.js: v20.x
- OS: Windows 10/11

### 问题特征

- **仅在安装包版本中出现**: electron-dev 模式下 OCR 正常工作
- **打包后失效**: exe 安装后的应用无法初始化 OCR 服务
- **与 LanceDB 问题同源**: 都是纯 JS 模块未正确解压导致

---

## ✅ 根本原因

### onnxruntime-common 未解压到 unpacked 目录

**问题分析**：

esearch-ocr 依赖链：
```
esearch-ocr
└── onnxruntime-common (纯 JS 模块)
    └── 被 onnxruntime-node 使用
```

**关键问题**：
1. OCR Worker 作为独立的 Node.js 子进程运行（不是 Electron 进程）
2. 外部 Node.js 进程无法读取 `app.asar` 内的文件
3. `onnxruntime-common` 是纯 JS 模块，electron-builder 的 `asarUnpack` 不会自动解压它

**开发模式 vs 打包模式对比**：

| 模式 | onnxruntime-common 位置 | Worker 能否访问 |
|------|------------------------|----------------|
| 开发模式 | `node_modules/` (完整目录) | ✅ 可以 |
| 打包模式 | `app.asar` 内部 | ❌ 外部 Node.js 无法读取 asar |

**require 链失败过程**：
```
Worker 进程 (外部 Node.js)
  → require('esearch-ocr')
  → 从 app.asar.unpacked/node_modules/esearch-ocr ✓
  → require('onnxruntime-common')
  → 在 app.asar.unpacked/node_modules 中找不到 ❌
  → 在 app.asar/node_modules 中？外部 Node.js 无法读取！❌
  → 初始化失败
```

---

## ✅ 解决方案

### 方案概述

与 LanceDB 问题使用相同的解决模式：
1. 在 `electron-builder.yml` 的 `asarUnpack` 中声明模块（虽然对纯 JS 无效，但保持一致性）
2. 使用 `afterPack` 钩子手动复制纯 JS 模块到 unpacked 目录

### 修改 1: electron-builder.yml

```yaml
asarUnpack:
  # ONNX Runtime (onnxruntime-common 是 esearch-ocr 的依赖)
  - "**/node_modules/onnxruntime-node/**/*"
  - "**/node_modules/onnxruntime-common/**/*"
```

### 修改 2: scripts/afterPack.cjs

在 `modulesToCopy` 数组中添加 OCR 依赖：

```javascript
const modulesToCopy = [
  // LanceDB 依赖
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
  // OCR 依赖 (esearch-ocr 需要)
  'onnxruntime-common',
];

// 关键模块验证
const criticalModules = ['apache-arrow', 'flatbuffers', 'onnxruntime-common'];
```

---

## 打包后目录结构验证 ✅

已确认所有必要文件都正确打包：

```
release/win-unpacked/resources/
├── electron/ocr/ocr-worker.cjs              ✅ Worker 脚本 (via extraResources)
├── ocr-models/
│   ├── PP-OCRv5_server_det_infer.onnx       ✅ 检测模型
│   ├── PP-OCRv5_server_rec_infer.onnx       ✅ 识别模型
│   └── ppocr_keys_v5.txt                    ✅ 字典文件
├── app.asar.unpacked/node_modules/
│   ├── canvas/build/Release/canvas.node     ✅ Canvas 原生模块
│   ├── onnxruntime-node/                    ✅ ONNX Runtime 原生模块
│   ├── onnxruntime-common/                  ✅ ONNX Runtime 纯 JS (通过 afterPack 复制)
│   ├── esearch-ocr/                         ✅ OCR 库
│   └── ...其他模块
└── app.asar                                 ✅ 主应用代码
```

---

## OCR 架构

### 文件结构

```
electron/
├── ocr/
│   ├── index.ts          # OCR 服务主入口
│   └── ocr-worker.cjs    # OCR 子进程 Worker (CommonJS)
```

### 工作原理

1. **主进程**: `electron/ocr/index.ts` 管理 OCR 服务
2. **子进程**: 使用 `spawn('node.exe', [workerPath])` 启动独立的 Node.js 进程
3. **模型文件**: PP-OCRv5 ONNX 模型文件 (~170MB)
4. **Native 模块**: canvas 和 onnxruntime-node 包含 `.node` 原生扩展

### 为什么使用子进程

- 避免 Electron 主进程与 onnxruntime-node 的兼容性问题
- 隔离 OCR 处理，防止阻塞 UI
- 便于管理 OCR 进程的生命周期

---

## 与 LanceDB 问题的对比

| 问题 | LanceDB | OCR |
|------|---------|-----|
| 模块类型 | napi-rs + 纯 JS 依赖 | onnx 原生模块 + 纯 JS 依赖 |
| 问题根因 | apache-arrow 未解压 | onnxruntime-common 未解压 |
| 子进程 | 无 (主进程使用) | Worker 子进程 |
| 模型文件 | 无 | ONNX 模型文件 |
| 解决方案 | afterPack + module.paths | afterPack + NODE_PATH |

---

## 经验总结

### 纯 JS 模块打包问题的通用解决方案

1. **识别问题模式**：
   - 开发模式正常，打包后失败
   - 错误通常是 "Cannot find module" 或初始化失败
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

---

## 更新日志

| 日期 | 操作 | 结果 |
|------|------|------|
| 2024-12-21 | 创建问题调研文档 | - |
| 2024-12-21 | 定位根因：onnxruntime-common 未解压 | 确认 |
| 2024-12-21 | 应用 afterPack 解决方案 | ✅ 成功 |
| 2024-12-21 | 验证打包后 OCR 功能 | ✅ 正常工作 |
