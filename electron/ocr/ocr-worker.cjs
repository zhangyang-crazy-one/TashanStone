/**
 * OCR Worker - Standalone Node.js script for OCR processing
 *
 * This script runs in a separate vanilla Node.js process to avoid
 * Electron's native module compatibility issues with onnxruntime-node.
 *
 * Communication:
 * - Input: JSON via stdin { action: 'init' | 'recognize', ... }
 * - Output: JSON via stdout { success: boolean, ... }
 */

const path = require('path');
const fs = require('fs');
const readline = require('readline');

// === 修复打包后 native 模块加载问题 ===
// 在打包后，native 模块 (canvas, onnxruntime-node) 位于 app.asar.unpacked/node_modules
// 需要将该路径添加到 module.paths 以便 require() 能找到它们
(function setupModulePaths() {
    // 从 NODE_PATH 环境变量获取额外的模块路径
    if (process.env.NODE_PATH) {
        const extraPaths = process.env.NODE_PATH.split(path.delimiter);
        for (const p of extraPaths) {
            if (p && !module.paths.includes(p)) {
                // 将 app.asar.unpacked 路径添加到搜索路径最前面
                module.paths.unshift(p);
                console.error(`[OCR Worker] Added module path: ${p}`);
            }
        }
    }

    // 额外尝试：基于 worker 脚本位置推断 app.asar.unpacked 路径
    // Worker 在: resources/electron/ocr/ocr-worker.cjs
    // Native 在: resources/app.asar.unpacked/node_modules
    const workerDir = __dirname;
    const possiblePaths = [
        path.join(workerDir, '..', '..', 'app.asar.unpacked', 'node_modules'),
        path.join(workerDir, '..', '..', '..', 'app.asar.unpacked', 'node_modules'),
    ];

    for (const p of possiblePaths) {
        const resolved = path.resolve(p);
        if (fs.existsSync(resolved) && !module.paths.includes(resolved)) {
            module.paths.unshift(resolved);
            console.error(`[OCR Worker] Auto-detected module path: ${resolved}`);
        }
    }
})();

// Polyfill OffscreenCanvas for Node.js using node-canvas
// This is required by esearch-ocr which uses browser Canvas API
try {
    const { createCanvas, Image, loadImage } = require('canvas');

    // Create OffscreenCanvas polyfill
    class OffscreenCanvasPolyfill {
        constructor(width, height) {
            this._canvas = createCanvas(width, height);
            this.width = width;
            this.height = height;
        }

        getContext(type, options) {
            return this._canvas.getContext(type, options);
        }

        convertToBlob(options = {}) {
            return new Promise((resolve, reject) => {
                const mimeType = options.type || 'image/png';
                const quality = options.quality || 0.92;

                this._canvas.toBuffer((err, buffer) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(new Blob([buffer], { type: mimeType }));
                    }
                }, mimeType, { quality });
            });
        }

        transferToImageBitmap() {
            // Return the canvas itself as ImageBitmap-like object
            return this._canvas;
        }
    }

    // Polyfill global objects
    if (typeof globalThis.OffscreenCanvas === 'undefined') {
        globalThis.OffscreenCanvas = OffscreenCanvasPolyfill;
    }
    if (typeof globalThis.Image === 'undefined') {
        globalThis.Image = Image;
    }
    if (typeof globalThis.createCanvas === 'undefined') {
        globalThis.createCanvas = createCanvas;
    }
    if (typeof globalThis.loadImage === 'undefined') {
        globalThis.loadImage = loadImage;
    }

    // Also create ImageData polyfill if needed
    if (typeof globalThis.ImageData === 'undefined') {
        globalThis.ImageData = class ImageData {
            constructor(data, width, height) {
                if (data instanceof Uint8ClampedArray) {
                    this.data = data;
                    this.width = width;
                    this.height = height || (data.length / 4 / width);
                } else {
                    // data is width, width is height
                    this.width = data;
                    this.height = width;
                    this.data = new Uint8ClampedArray(this.width * this.height * 4);
                }
            }
        };
    }
} catch (e) {
    // canvas package not available, will fail later with better error
    console.error('Warning: canvas package not available:', e.message);
}

// Global state
let ocrEngine = null;
let isInitialized = false;
let modelVersion = null;
let modelPath = '';
let ort = null;
let currentBackend = 'cpu';  // 'directml' | 'cpu'

/**
 * Test if DirectML (GPU) is available
 */
async function testDirectML(ortModule, testModelPath) {
    try {
        console.error('[OCR Worker] Testing DirectML availability...');

        // Try to create a session with DirectML
        const sessionOptions = {
            executionProviders: ['dml'],  // DirectML
            logSeverityLevel: 3  // Suppress verbose logs
        };

        const testSession = await ortModule.InferenceSession.create(testModelPath, sessionOptions);
        await testSession.release();

        console.error('[OCR Worker] DirectML is available!');
        return true;
    } catch (e) {
        console.error('[OCR Worker] DirectML not available:', e.message);
        return false;
    }
}

/**
 * Find OCR model path
 */
function findModelPath() {
    const searchPaths = [
        // Development paths
        path.join(__dirname, '..', '..', 'resources', 'ocr-models'),
        path.join(__dirname, '..', '..', '..', 'resources', 'ocr-models'),
        path.join(process.cwd(), 'resources', 'ocr-models'),
        // Production paths (process.resourcesPath would be undefined in vanilla Node.js)
    ];

    for (const searchPath of searchPaths) {
        try {
            if (fs.existsSync(searchPath)) {
                // Check for v5 models
                const v5Files = [
                    'PP-OCRv5_server_det_infer.onnx',
                    'PP-OCRv5_server_rec_infer.onnx',
                    'ppocr_keys_v5.txt'
                ];
                if (v5Files.every(f => fs.existsSync(path.join(searchPath, f)))) {
                    return { path: searchPath, version: 'v5' };
                }

                // Check for v2 models
                const v2Files = [
                    'ppocr_det.onnx',
                    'ppocr_rec.onnx',
                    'ppocr_keys_v1.txt'
                ];
                if (v2Files.every(f => fs.existsSync(path.join(searchPath, f)))) {
                    return { path: searchPath, version: 'v2' };
                }
            }
        } catch (e) {
            // Ignore errors
        }
    }

    return { path: '', version: null };
}

/**
 * Initialize OCR engine
 */
async function initialize(config = {}) {
    if (isInitialized) {
        return { success: true, message: 'Already initialized', backend: currentBackend };
    }

    try {
        // Load canvas for Node.js environment
        const { createCanvas, loadImage, Image } = require('canvas');

        // Load modules
        const ocr = require('esearch-ocr');
        ort = require('onnxruntime-node');

        // Set up Node.js canvas environment for esearch-ocr
        ocr.setOCREnv({
            canvas: (w, h) => createCanvas(w, h),
            imageData: (data, w, h) => {
                // Create ImageData-like object
                return { data, width: w, height: h };
            }
        });

        // Find model path
        const result = config.modelDir
            ? { path: config.modelDir, version: null }
            : findModelPath();

        if (!result.path) {
            return { success: false, error: 'OCR models not found' };
        }

        modelPath = result.path;

        // Detect model version if not already known
        if (!result.version) {
            const v5Files = ['PP-OCRv5_server_det_infer.onnx', 'PP-OCRv5_server_rec_infer.onnx', 'ppocr_keys_v5.txt'];
            if (v5Files.every(f => fs.existsSync(path.join(modelPath, f)))) {
                result.version = 'v5';
            } else {
                result.version = 'v2';
            }
        }

        modelVersion = result.version;

        // Build model file paths
        let detModelPath, recModelPath, dictPath;
        const imgh = 48;

        if (modelVersion === 'v5') {
            detModelPath = path.join(modelPath, 'PP-OCRv5_server_det_infer.onnx');
            recModelPath = path.join(modelPath, 'PP-OCRv5_server_rec_infer.onnx');
            dictPath = path.join(modelPath, 'ppocr_keys_v5.txt');
        } else {
            detModelPath = path.join(modelPath, 'ppocr_det.onnx');
            recModelPath = path.join(modelPath, 'ppocr_rec.onnx');
            dictPath = path.join(modelPath, 'ppocr_keys_v1.txt');
        }

        // Read dictionary
        const dictContent = fs.readFileSync(dictPath, 'utf-8');

        // Test DirectML (GPU) availability
        const forceBackend = config.backend;  // 'directml' | 'cpu' | undefined (auto)
        let useDirectML = false;

        if (forceBackend === 'cpu') {
            console.error('[OCR Worker] Forced CPU backend');
            useDirectML = false;
        } else if (forceBackend === 'directml') {
            console.error('[OCR Worker] Forced DirectML backend');
            useDirectML = true;
        } else {
            // Auto-detect
            useDirectML = await testDirectML(ort, detModelPath);
        }

        // Build session options
        const ortOption = useDirectML ? {
            executionProviders: ['dml', 'cpu'],  // DirectML with CPU fallback
            logSeverityLevel: 3
        } : {
            executionProviders: ['cpu'],
            logSeverityLevel: 3
        };

        currentBackend = useDirectML ? 'directml' : 'cpu';
        console.error(`[OCR Worker] Using backend: ${currentBackend}`);

        // Initialize engine with execution providers
        ocrEngine = await ocr.init({
            ort,
            ortOption,  // Pass session options to esearch-ocr
            det: {
                input: detModelPath,
                ratio: 1.0
            },
            rec: {
                input: recModelPath,
                decodeDic: dictContent,
                imgh: imgh
            }
        });

        isInitialized = true;

        return {
            success: true,
            modelVersion,
            modelPath,
            backend: currentBackend
        };

    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Recognize text from image
 */
async function recognize(imageData) {
    const startTime = Date.now();

    if (!isInitialized) {
        const initResult = await initialize();
        if (!initResult.success) {
            return initResult;
        }
    }

    try {
        const { createCanvas, loadImage } = require('canvas');

        // Ensure imageData is a data URL
        let dataUrl = imageData;
        if (!imageData.startsWith('data:')) {
            dataUrl = `data:image/png;base64,${imageData}`;
        }

        // Load image using canvas
        const img = await loadImage(dataUrl);

        // Create canvas and draw image
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // Get ImageData from canvas (esearch-ocr in Node.js mode requires ImageData, not Canvas)
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Run OCR with ImageData
        const result = await ocrEngine.ocr(imgData);

        // Extract text
        let text = '';
        if (result && result.parragraphs && Array.isArray(result.parragraphs)) {
            text = result.parragraphs.map(p => p.text || '').join('\n');
        } else if (result && result.lines && Array.isArray(result.lines)) {
            text = result.lines.map(l => l.text || '').join('\n');
        } else if (result && typeof result.text === 'string') {
            text = result.text;
        }

        const duration = Date.now() - startTime;

        return {
            success: true,
            text: text.trim(),
            duration,
            backend: 'cpu',
            modelVersion
        };

    } catch (error) {
        return {
            success: false,
            error: error.message,
            duration: Date.now() - startTime,
            backend: 'cpu'
        };
    }
}

/**
 * Check if models are available
 */
function isModelAvailable() {
    const result = findModelPath();
    return { available: !!result.version, modelPath: result.path, modelVersion: result.version };
}

/**
 * Get status
 */
function getStatus() {
    return {
        initialized: isInitialized,
        modelVersion,
        modelPath,
        backend: currentBackend
    };
}

/**
 * Process a command
 */
async function processCommand(cmd) {
    try {
        switch (cmd.action) {
            case 'init':
                return await initialize(cmd.config);

            case 'recognize':
                return await recognize(cmd.imageData);

            case 'isModelAvailable':
                return isModelAvailable();

            case 'status':
                return getStatus();

            case 'ping':
                return { success: true, message: 'pong' };

            default:
                return { success: false, error: `Unknown action: ${cmd.action}` };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Main entry point - read commands from stdin, write responses to stdout
 */
async function main() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });

    // Signal that worker is ready
    console.log(JSON.stringify({ ready: true }));

    rl.on('line', async (line) => {
        try {
            const cmd = JSON.parse(line);
            const result = await processCommand(cmd);
            console.log(JSON.stringify(result));
        } catch (error) {
            console.log(JSON.stringify({ success: false, error: `Parse error: ${error.message}` }));
        }
    });

    rl.on('close', () => {
        process.exit(0);
    });
}

// Run if executed directly
main().catch(err => {
    console.error('Worker error:', err);
    process.exit(1);
});
