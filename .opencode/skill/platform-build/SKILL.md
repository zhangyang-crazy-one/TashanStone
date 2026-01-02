---
name: platform-build
description: 平台构建和打包规范，包括 Electron 打包、跨平台构建、安装程序生成
---

# 平台构建打包规范

## 触发条件

- **关键词**：打包、构建、electron-builder、安装程序、发布、build、dist
- **场景**：生成安装程序、跨平台构建、打包配置、CI/CD

## 核心规范

### 打包配置

```typescript
// electron-builder.yml
productName: TashaStone
appId: com.tashanstone.app
directories:
  output: dist

files:
  - from: dist-electron
    filter:
      - '**/*'

asar: true
asarUnpack:
  - '**/*.node'

win:
  target: nsis
  icon: build/icon.ico
  signing:
    hashFiles:
      - dist-electron/**/*
  signAndEditExecutable: true

mac:
  target: dmg
  icon: build/icons/icon.icns
  notarize: false

linux:
  target: AppImage
  icon: build/icons/
  category: Office

extends: null
```

### 打包脚本

```json
// package.json
{
  "scripts": {
    "build:electron": "cross-env ELECTRON=true npm run build && tsc -p electron/tsconfig.json",
    "dist": "npm run build:electron && electron-builder",
    "dist:win": "npm run build:electron && electron-builder --win",
    "dist:mac": "npm run build:electron && electron-builder --mac",
    "dist:linux": "npm run build:electron && electron-builder --linux"
  }
}
```

### Vite 配置

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ mode }) => {
  const isElectron = process.env.ELECTRON === 'true';

  return {
    plugins: [
      react(),
      ...(isElectron ? [
        viteStaticCopy({
          targets: [
            {
              src: 'node_modules/**/*',
              dest: 'node_modules'
            }
          ]
        })
      ] : [])
    ],
    base: isElectron ? './' : '/',
    build: {
      outDir: isElectron ? 'dist-electron' : 'dist',
      lib: isElectron ? false : undefined
    },
    define: {
      'process.env': isElectron ? '{}' : 'process.env'
    }
  };
});
```

### 构建前准备

```typescript
// scripts/generate-icons.cjs
const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');

async function generateIcons() {
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
  const files = sizes.map(s => `build/icons/${s}.png`);

  const icoBuffer = await pngToIco(files);
  fs.writeFileSync('build/icon.ico', icoBuffer);

  console.log('Icons generated successfully');
}

generateIcons();
```

### CI/CD 构建

```yaml
# .github/workflows/build.yml
name: Build

on:
  push:
    tags:
      - v*

jobs:
  build:
    runs-on: ${{ matrix.os }}

    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build:electron
        env:
          ELECTRON_CACHE: ~/.electron-cache

      - name: Build installer
        run: |
          if [[ "${{ matrix.os }}" == "windows-latest" ]]; then
            npm run dist:win
          elif [[ "${{ matrix.os }}" == "macos-latest" ]]; then
            npm run dist:mac
          else
            npm run dist:linux
          fi

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.os }}-build
          path: dist/
```

## 禁止事项

- ❌ 禁止在asar包中排除必要的运行时依赖
- ❌ 禁止使用未签名证书进行生产构建
- ❌ 禁止忽略平台特定的构建要求
- ❌ 禁止在构建时硬编码 API 密钥

## 推荐模式

1. **资源路径**：使用 `process.resourcesPath` 访问打包资源
2. **跨平台测试**：在所有目标平台验证构建
3. **自动更新**：实现 Squirrel.Mac 或 NSIS 更新
4. **构建缓存**：缓存 node_modules 和 Electron 构建

## 参考代码

| 文件 | 说明 |
|------|------|
| `electron-builder.yml` | Electron Builder 配置 |
| `vite.config.ts` | Vite 构建配置 |
| `package.json` | 构建脚本 |
| `scripts/generate-icons.cjs` | 图标生成 |
| `build/linux/after-install.sh` | Linux 安装脚本 |
| `docs/BUILD_MAC.md` | macOS 构建指南 |
