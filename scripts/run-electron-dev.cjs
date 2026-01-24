const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function buildLibraryPath(envKey, value) {
  if (!value) return '';
  const delimiter = path.delimiter;
  const current = (process.env[envKey] || '').split(delimiter).filter(Boolean);
  if (!current.includes(value)) {
    current.unshift(value);
  }
  return current.join(delimiter);
}

function resolveSherpaPath(projectRoot) {
  const platform = process.platform === 'win32' ? 'win' : process.platform;
  const arch = process.arch;
  const packageDir = path.join(projectRoot, 'node_modules', `sherpa-onnx-${platform}-${arch}`);
  const addonPath = path.join(packageDir, 'sherpa-onnx.node');
  if (fs.existsSync(addonPath)) {
    return packageDir;
  }
  return '';
}

function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const env = { ...process.env };
  const sherpaPath = resolveSherpaPath(projectRoot);

  if (sherpaPath) {
    if (process.platform === 'linux') {
      env.LD_LIBRARY_PATH = buildLibraryPath('LD_LIBRARY_PATH', sherpaPath);
    } else if (process.platform === 'darwin') {
      env.DYLD_LIBRARY_PATH = buildLibraryPath('DYLD_LIBRARY_PATH', sherpaPath);
    }
  }

  const electronPath = require('electron');
  const child = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    cwd: projectRoot,
    env
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main();
