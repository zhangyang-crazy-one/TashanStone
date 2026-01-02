# TashanStone macOS 编译指南

本文档介绍如何在 macOS 上编译 TashanStone 应用程序。

## 系统要求

- **操作系统**: macOS 10.15 (Catalina) 或更高版本
- **处理器**: Intel x64 或 Apple Silicon (M1/M2/M3)
- **内存**: 8GB RAM 或以上（推荐 16GB）
- **磁盘空间**: 至少 10GB 可用空间

## 环境准备

### 1. 安装 Xcode Command Line Tools

打开终端，执行：

```bash
xcode-select --install
```

### 2. 安装 Node.js

推荐使用 nvm 管理 Node.js 版本：

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 重新加载终端配置
source ~/.zshrc  # 或 source ~/.bashrc

# 安装 Node.js 20 LTS
nvm install 20
nvm use 20

# 验证安装
node -v  # 应显示 v20.x.x
npm -v   # 应显示 10.x.x
```

或者直接从 [Node.js 官网](https://nodejs.org/) 下载安装包。

### 3. 安装编译依赖

某些原生模块需要额外的编译工具：

```bash
# 安装 Python (编译 node-gyp 需要)
# macOS 通常已预装，验证版本：
python3 --version

# 如果需要安装，使用 Homebrew：
brew install python
```

## 编译步骤

### 1. 克隆代码仓库

```bash
git clone https://github.com/tashanstone/tashanstone.git
cd tashanstone
```

### 2. 安装依赖

```bash
npm install
```

> **注意**: 首次安装会自动编译原生模块（better-sqlite3、canvas、sherpa-onnx 等），这可能需要几分钟时间。

如果遇到 `node-gyp` 编译错误，尝试：

```bash
# 清理并重新安装
rm -rf node_modules
npm cache clean --force
npm install
```

### 3. 下载 AI 模型（可选）

如果需要离线语音识别功能，下载 Sherpa-ONNX 模型：

```bash
npm run download:sherpa-model
```

如果需要离线 OCR 功能，下载 OCR 模型：

```bash
npm run download:ocr-model
```

### 4. 构建应用

#### 开发模式运行

```bash
npm run dev:electron
```

#### 构建 macOS 安装包

```bash
# 构建当前架构的 DMG
npm run dist:mac
```

构建完成后，安装包位于 `release/` 目录：

- `TashanStone-1.6.0-arm64.dmg` - Apple Silicon 版本
- `TashanStone-1.6.0-x64.dmg` - Intel 版本
- `TashanStone-1.6.0-arm64.zip` - Apple Silicon 便携版
- `TashanStone-1.6.0-x64.zip` - Intel 便携版

> **提示**: 默认构建当前机器架构。如需构建特定架构：
> ```bash
> # 仅构建 Intel 版本
> npm run build:electron && npx electron-builder --mac --x64
>
> # 仅构建 Apple Silicon 版本
> npm run build:electron && npx electron-builder --mac --arm64
> ```

## 安装应用

1. 双击打开 `.dmg` 文件
2. 将 TashanStone 图标拖拽到 Applications 文件夹
3. 首次运行时，右键点击应用 → 选择"打开"（绕过 Gatekeeper 检查）

## 常见问题

### Q1: 编译时报错 `gyp ERR! stack Error: not found: make`

**解决方案**: 安装 Xcode Command Line Tools：
```bash
xcode-select --install
```

### Q2: 编译 canvas 模块失败

**解决方案**: 安装必要的图形库：
```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman
```

### Q3: 编译 better-sqlite3 失败

**解决方案**: 确保 Python 和编译工具链完整：
```bash
npm install -g node-gyp
node-gyp install
```

### Q4: 打开应用提示"无法验证开发者"

**解决方案**:
1. 打开"系统偏好设置" → "安全性与隐私"
2. 在"通用"标签页底部，点击"仍要打开"
3. 或者：右键点击应用 → "打开" → 确认打开

### Q5: 应用崩溃或无法启动

**解决方案**: 检查系统版本是否满足要求（macOS 10.15+），尝试：
```bash
# 查看崩溃日志
open ~/Library/Logs/DiagnosticReports/

# 从终端启动查看错误信息
/Applications/TashanStone.app/Contents/MacOS/TashanStone
```

### Q6: 语音识别功能不工作

**解决方案**:
1. 检查麦克风权限："系统偏好设置" → "安全性与隐私" → "麦克风"
2. 确保已下载语音识别模型：`npm run download:sherpa-model`

### Q7: 如何构建通用二进制 (Universal Binary)

通用二进制同时包含 Intel 和 Apple Silicon 代码，但体积较大：

```bash
npm run build:electron && npx electron-builder --mac --universal
```

## 代码签名（可选）

如果你有 Apple Developer 账号，可以对应用进行签名：

### 1. 准备证书

1. 登录 [Apple Developer](https://developer.apple.com/)
2. 创建 "Developer ID Application" 证书
3. 下载并安装到钥匙串

### 2. 配置环境变量

```bash
# 导出证书为 .p12 文件，然后设置：
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=your_password

# 可选：启用公证 (Notarization)
export APPLE_ID=your@apple.id
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=XXXXXXXXXX
```

### 3. 构建签名版本

```bash
npm run dist:mac
```

electron-builder 会自动使用证书签名并提交公证。

## 输出文件说明

| 文件 | 说明 |
|------|------|
| `TashanStone-x.x.x-arm64.dmg` | Apple Silicon Mac 安装包 |
| `TashanStone-x.x.x-x64.dmg` | Intel Mac 安装包 |
| `TashanStone-x.x.x-arm64.zip` | Apple Silicon 便携版 |
| `TashanStone-x.x.x-x64.zip` | Intel 便携版 |
| `mac-arm64/` | Apple Silicon 未打包应用 |
| `mac-x64/` | Intel 未打包应用 |

## 参考链接

- [Electron 官方文档](https://www.electronjs.org/docs)
- [electron-builder 文档](https://www.electron.build/)
- [Node.js 下载](https://nodejs.org/)
- [Apple Developer 代码签名指南](https://developer.apple.com/support/code-signing/)
