/**
 * afterPack hook for electron-builder
 *
 * 问题:
 * 1. @lancedb 的 native 模块被解压到 app.asar.unpacked，
 *    但它的 peerDependency apache-arrow 是纯 JS 模块，未被自动解压，
 *    导致运行时 require('apache-arrow') 失败。
 *
 * 2. esearch-ocr 依赖 onnxruntime-common（纯 JS），
 *    OCR Worker 是外部 Node.js 进程，无法访问 asar 内的模块。
 *
 * 解决方案: 在打包后手动复制这些纯 JS 模块到 unpacked 目录。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * 递归复制目录
 */
function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
    console.log(`  [SKIP] Source not found: ${src}`);
    return false;
  }

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  return true;
}

function patchSherpaRpath(unpackedModules) {
  const sherpaDirs = fs.readdirSync(unpackedModules, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('sherpa-onnx-'))
    .map((entry) => entry.name);

  if (sherpaDirs.length === 0) {
    console.log('[afterPack] No sherpa-onnx-* packages found for rpath patch');
    return;
  }

  for (const dirName of sherpaDirs) {
    const nodePath = path.join(unpackedModules, dirName, 'sherpa-onnx.node');
    if (!fs.existsSync(nodePath)) {
      continue;
    }

    if (process.platform === 'linux') {
      try {
        execFileSync('patchelf', ['--set-rpath', '$ORIGIN', nodePath], { stdio: 'inherit' });
        console.log(`[afterPack] Patched RPATH for ${dirName}/sherpa-onnx.node`);
      } catch (error) {
        console.warn('[afterPack] patchelf failed; sherpa may require LD_LIBRARY_PATH at runtime', error.message || error);
      }
    } else if (process.platform === 'darwin') {
      try {
        execFileSync('install_name_tool', ['-add_rpath', '@loader_path', nodePath], { stdio: 'inherit' });
        console.log(`[afterPack] Added @loader_path for ${dirName}/sherpa-onnx.node`);
      } catch (error) {
        console.warn('[afterPack] install_name_tool failed; sherpa may require DYLD_LIBRARY_PATH at runtime', error.message || error);
      }
    }
  }
}

/**
 * afterPack hook
 */
exports.default = async function(context) {
  console.log('\n[afterPack] Starting pure JS dependencies fix (LanceDB + OCR)...');

  const appOutDir = context.appOutDir;
  const projectDir = context.packager.projectDir;

  // 源目录: 项目的 node_modules
  const sourceModules = path.join(projectDir, 'node_modules');

  // 目标目录: 打包后的 app.asar.unpacked/node_modules
  const unpackedModules = path.join(appOutDir, 'resources', 'app.asar.unpacked', 'node_modules');

  console.log(`[afterPack] Project dir: ${projectDir}`);
  console.log(`[afterPack] App out dir: ${appOutDir}`);
  console.log(`[afterPack] Unpacked modules dir: ${unpackedModules}`);

  // 确保 unpacked 目录存在
  if (!fs.existsSync(unpackedModules)) {
    console.log('[afterPack] Creating unpacked node_modules directory...');
    fs.mkdirSync(unpackedModules, { recursive: true });
  }

  // 需要复制的模块列表
  // LanceDB 相关: apache-arrow 及其所有依赖
  // OCR 相关: onnxruntime-common (esearch-ocr 的依赖)
  const modulesToCopy = [
    // LanceDB 依赖
    'apache-arrow',
    'flatbuffers',
    'tslib',
    'json-bignum',
    'command-line-args',
    'command-line-usage',
    // @swc 是 scoped package
    '@swc/helpers',
    // @types 可能也需要
    '@types/command-line-args',
    '@types/command-line-usage',
    '@types/node',
    // OCR 依赖 (esearch-ocr 需要)
    'onnxruntime-common',
  ];

  console.log(`[afterPack] Copying ${modulesToCopy.length} modules to unpacked directory...`);

  let successCount = 0;
  let skipCount = 0;

  for (const mod of modulesToCopy) {
    const srcPath = path.join(sourceModules, mod);
    const destPath = path.join(unpackedModules, mod);

    // 检查目标是否已存在
    if (fs.existsSync(destPath)) {
      console.log(`  [EXISTS] ${mod}`);
      successCount++;
      continue;
    }

    console.log(`  [COPY] ${mod}`);

    if (copyDirSync(srcPath, destPath)) {
      successCount++;
    } else {
      skipCount++;
    }
  }

  console.log(`[afterPack] Completed: ${successCount} copied, ${skipCount} skipped`);

  // 验证关键模块是否存在
  const criticalModules = ['apache-arrow', 'flatbuffers', 'onnxruntime-common'];
  let allCriticalExists = true;

  console.log('[afterPack] Verifying critical modules...');
  for (const mod of criticalModules) {
    const modPath = path.join(unpackedModules, mod);
    if (fs.existsSync(modPath)) {
      console.log(`  [OK] ${mod}`);
    } else {
      console.log(`  [MISSING] ${mod}`);
      allCriticalExists = false;
    }
  }

  if (allCriticalExists) {
    console.log('[afterPack] Pure JS dependencies fix completed successfully!\n');
  } else {
    console.error('[afterPack] WARNING: Some critical modules are missing!\n');
  }

  if (fs.existsSync(unpackedModules)) {
    patchSherpaRpath(unpackedModules);
  }
};
