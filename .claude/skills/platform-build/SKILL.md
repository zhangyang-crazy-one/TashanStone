---
name: platform-build
description: |
  Tauri 平台构建打包开发规范。

  触发场景：
  - Tauri 打包
  - 安装包生成
  - 跨平台构建
  - CI/CD 配置

  触发词：打包、构建、tauri、安装包、exe、dmg、deb、asar、cargo、rustup
---

# Tauri 平台构建打包开发规范

> 本项目: Pixel-Client Tauri 迁移 (Rust + React)

## 技术架构

```
pixel-client-tauri/
├── src-tauri/
│   ├── Cargo.toml              # Rust 依赖 + Tauri 配置
│   ├── tauri.conf.json         # Tauri 运行时配置
│   ├── build.rs                # 构建脚本 (syntect 缓存)
│   ├── icons/                  # 图标文件
│   │   ├── icon.icns           # macOS
│   │   ├── icon.ico            # Windows
│   │   └── 32x32.png           # Linux
│   └── src/
│       ├── lib.rs              # Rust 核心
│       └── main.rs             # 入口
├── .github/workflows/
│   └── ci.yml                  # CI/CD 流水线
├── package.json                # 前端依赖 + 打包脚本
└── vite.config.ts              # Vite 配置
```

## 核心配置

### tauri.conf.json

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Pixel Client",
  "version": "0.1.0",
  "identifier": "com.pixel.client",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:1420",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Pixel Client",
        "width": 1200,
        "height": 800,
        "resizable": true,
        "fullscreen": false,
        "decorations": false,
        "transparent": true
      }
    ],
    "trayIcon": {
      "iconPath": "icons/tray.png",
      "iconAsTemplate": false
    },
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "resources": [
      "fonts/*"
    ]
  }
}
```

### Cargo.toml (bundle 配置)

```toml
[package]
name = "pixel-client-tauri"
version = "0.1.0"
description = "Pixel Client Tauri Desktop Application"
authors = ["you"]
edition = "2021"

[build-dependencies]
tauri-build = "2"

[dependencies]
tauri = { version = "2", features = ["shell-open", "system-tray", "window-all"] }
tauri-build = "2"

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]

[profile.release]
panic = "abort"
codegen-units = 1
lto = true
opt-level = "z"
strip = true
```

### package.json 脚本

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "build:tauri": "cd src-tauri && cargo build --release",
    "build:all": "npm run build && npm run build:tauri",
    "dev:tauri": "cd src-tauri && cargo run",
    "bundle": "cd src-tauri && cargo tauri build",
    "bundle:win": "cd src-tauri && cargo tauri build --target x86_64-pc-windows-msvc",
    "bundle:mac": "cd src-tauri && cargo tauri build --target aarch64-apple-darwin",
    "bundle:linux": "cd src-tauri && cargo tauri build --target x86_64-unknown-linux-gnu"
  }
}
```

## 构建产物

| 平台 | 格式 | 文件名 |
|------|------|--------|
| Windows | NSIS/EXE | Pixel Client_0.1.0_x64_en-US.msi |
| macOS | DMG/APPKIT | Pixel Client_0.1.0_aarch64.dmg |
| Linux | AppImage/DEB | pixel-client-tauri_0.1.0_amd64.deb |

## 跨平台构建

### 使用 GitHub Actions CI

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: npm ci

      - name: Build frontend
        run: npm run build

      - name: Build Tauri
        uses: tauri-apps/tauri-action@v0
        with:
          args: build --debug
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  types-sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Generate TypeScript bindings
        run: cargo test
        working-directory: src-tauri

      - name: Check bindings unchanged
        run: |
          if git diff --name-only | grep -q "src/types/bindings.ts"; then
            echo "bindings.ts changed - commit the changes"
            exit 1
          fi
```

## Tauri 权限配置

```json
{
  "permissions": [
    "core:default",
    "core:menu",
    "core:window",
    "core:app",
    "core:path",
    "core:shell",
    "fs:default",
    "shell:allow-open"
  ]
}
```

## 资源文件打包

```rust
// src-tauri/build.rs - syntect 缓存生成

fn main() {
    // 生成 syntect 语法和主题缓存
    let syntax_set = syntect::parsing::SyntaxSet::load_defaults_newlines();
    let theme_set = syntect::highlighting::ThemeSet::load_defaults();

    let out_dir = Path::new("assets");
    std::fs::create_dir_all(out_dir).unwrap();

    let syntax_path = out_dir.join("syntaxes.pack");
    syntect::dumps::dump_to_file(&syntax_set, &syntax_path).unwrap();

    let theme_path = out_dir.join("themes.pack");
    syntect::dumps::dump_to_file(&theme_set, &theme_path).unwrap();

    // 告诉 Tauri 复制资源
    tauri_build::build();
}
```

## Rust 环境配置

```bash
# 安装 Rust (如果未安装)
rustup default stable

# 安装 Tauri CLI
cargo install tauri-cli

# 或者使用 bun 包管理器
bun install @tauri-apps/cli

# 验证安装
cargo tauri --version
rustc --version
```

## 禁止事项

- ❌ 禁止在 asar 中包含未压缩的资源
- ❌ 禁止硬编码资源路径（应使用 Tauri API 获取）
- ❌ 禁止使用开发环境的绝对路径
- ❌ 禁止跳过类型同步检查

## 参考代码

- `src-tauri/tauri.conf.json` - Tauri 配置
- `src-tauri/Cargo.toml` - Rust 依赖
- `.github/workflows/ci.yml` - CI/CD 流水线
- `build.rs` - 构建脚本

## 检查清单

- [ ] 是否配置了正确的 productName 和 identifier
- [ ] 是否配置了所有平台的图标
- [ ] 是否配置了 resources 复制
- [ ] 是否测试了所有平台的打包产物
- [ ] CI 是否包含类型同步检查
- [ ] 是否配置了 release profile 优化
