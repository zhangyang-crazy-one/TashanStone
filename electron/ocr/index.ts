import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import readline from 'readline';
import { logger } from '../utils/logger.js';

/**
 * OCR 识别结果
 */
export interface OcrResult {
    success: boolean;
    text?: string;
    error?: string;
    /** 识别耗时 (毫秒) */
    duration?: number;
    /** 使用的后端 */
    backend?: string;
}

/**
 * OCR 状态信息
 */
export interface OcrStatus {
    available: boolean;
    initialized: boolean;
    backend: string;  // 'cpu' | 'directml' | 'unknown'
    modelVersion: string | null;
    modelPath: string;
}

/**
 * OCR 配置选项
 */
export interface OcrConfig {
    /** 模型目录路径 */
    modelDir?: string;
    /** 强制使用的后端: 'directml' | 'cpu' | undefined (auto) */
    backend?: 'directml' | 'cpu';
}

/**
 * Worker 响应类型
 */
interface WorkerResponse {
    success?: boolean;
    ready?: boolean;
    error?: string;
    text?: string;
    duration?: number;
    backend?: string;
    modelVersion?: string;
    modelPath?: string;
    available?: boolean;
    initialized?: boolean;
    message?: string;
}

/**
 * PaddleOCR 服务 (基于 esearch-ocr + subprocess)
 *
 * 使用独立的 Node.js 子进程运行 OCR，避免 Electron 与 onnxruntime-node 的兼容性问题
 */
export class OcrService {
    private worker: ChildProcess | null = null;
    private _isInitialized = false;
    private initPromise: Promise<boolean> | null = null;
    private _modelPath: string = '';
    private _currentBackend: string = 'unknown';
    private _modelVersion: string | null = null;
    private pendingRequests: Map<number, { resolve: (value: WorkerResponse) => void; reject: (error: Error) => void }> = new Map();
    private requestId = 0;
    private workerReady = false;
    private readyPromise: Promise<void> | null = null;
    private readyResolve: (() => void) | null = null;

    /** 当前使用的后端 */
    get currentBackend(): string {
        return this._currentBackend;
    }

    /** 是否已初始化 */
    get isInitialized(): boolean {
        return this._isInitialized;
    }

    /** 模型路径 */
    get modelPath(): string {
        return this._modelPath;
    }

    /** 模型版本 */
    get modelVersion(): string | null {
        return this._modelVersion;
    }

    /**
     * 获取 OCR 状态信息
     */
    getStatus(): OcrStatus {
        return {
            available: this._isInitialized,
            initialized: this._isInitialized,
            backend: this._currentBackend,
            modelVersion: this._modelVersion,
            modelPath: this._modelPath
        };
    }

    /**
     * 获取模型存储路径
     */
    private getModelBasePath(): string {
        const paths: { path: string; source: string }[] = [];

        // 0. 环境变量优先
        if (process.env.OCR_MODEL_PATH) {
            const envPath = path.resolve(process.env.OCR_MODEL_PATH);
            paths.push({ path: envPath, source: 'environment variable' });
        }

        // 1. 开发模式路径搜索
        const appPath = app.getAppPath();
        const cwd = process.cwd();

        const devPaths = [
            path.join(appPath, 'resources', 'ocr-models'),
            path.join(appPath, '..', 'resources', 'ocr-models'),
            path.join(appPath, '..', '..', 'resources', 'ocr-models'),
            path.join(cwd, 'resources', 'ocr-models'),
        ];

        for (const devPath of devPaths) {
            const resolved = path.resolve(devPath);
            paths.push({ path: resolved, source: 'development resources' });
        }

        // 2. 生产环境打包资源目录
        if (process.resourcesPath) {
            const bundledModelPath = path.join(process.resourcesPath, 'ocr-models');
            paths.push({ path: bundledModelPath, source: 'bundled resources' });
        }

        // 3. 用户数据目录
        const userDataPath = app.getPath('userData');
        const userModelPath = path.join(userDataPath, 'ocr-models');
        paths.push({ path: userModelPath, source: 'user data directory' });

        logger.info('OCR model path search order:');
        for (const { path: searchPath, source } of paths) {
            const exists = fs.existsSync(searchPath);
            logger.info(`  - ${source}: ${searchPath} [${exists ? 'EXISTS' : 'NOT FOUND'}]`);

            if (exists) {
                logger.info(`Selected OCR model path: ${searchPath}`);
                return searchPath;
            }
        }

        logger.warn(`No existing OCR model directory found. Will use: ${userModelPath}`);
        return userModelPath;
    }

    /**
     * 检查模型是否已下载
     */
    async isModelAvailable(): Promise<boolean> {
        const modelDir = this.getModelBasePath();

        // PP-OCRv5 server 模型文件 (优先)
        const v5Files = [
            'PP-OCRv5_server_det_infer.onnx',
            'PP-OCRv5_server_rec_infer.onnx',
            'ppocr_keys_v5.txt'
        ];

        // 旧版 PP-OCRv2 模型文件 (兼容)
        const v2Files = [
            'ppocr_det.onnx',
            'ppocr_rec.onnx',
            'ppocr_keys_v1.txt'
        ];

        // 优先检查 v5 模型
        const hasV5 = v5Files.every(file => fs.existsSync(path.join(modelDir, file)));
        if (hasV5) {
            logger.info(`Found PP-OCRv5 server models in: ${modelDir}`);
            return true;
        }

        // 回退检查 v2 模型
        const hasV2 = v2Files.every(file => fs.existsSync(path.join(modelDir, file)));
        if (hasV2) {
            logger.info(`Found PP-OCRv2 models in: ${modelDir}`);
            return true;
        }

        logger.warn(`No OCR models found in: ${modelDir}`);
        return false;
    }

    /**
     * 获取模型下载信息
     */
    getModelDownloadInfo(): { url: string; name: string; size: string; files: string[] } {
        return {
            url: 'https://huggingface.co/SWHL/PP-OCRv5-ONNX/tree/main',
            name: 'PP-OCRv5 Server ONNX Models',
            size: '~170MB (det: 88MB + rec: 84MB)',
            files: [
                'PP-OCRv5_server_det_infer.onnx',
                'PP-OCRv5_server_rec_infer.onnx',
                'ppocr_keys_v5.txt'
            ]
        };
    }

    /**
     * 获取 Worker 脚本路径
     */
    private getWorkerPath(): string {
        // 开发模式：从 dist-electron 目录
        const devPath = path.join(app.getAppPath(), 'electron', 'ocr', 'ocr-worker.cjs');
        if (fs.existsSync(devPath)) {
            return devPath;
        }

        // 生产模式：从打包资源目录
        const prodPath = path.join(process.resourcesPath || '', 'electron', 'ocr', 'ocr-worker.cjs');
        if (fs.existsSync(prodPath)) {
            return prodPath;
        }

        // 备选：从 dist-electron 目录
        const distPath = path.join(app.getAppPath(), 'dist-electron', 'ocr', 'ocr-worker.cjs');
        if (fs.existsSync(distPath)) {
            return distPath;
        }

        // 备选：cwd
        const cwdPath = path.join(process.cwd(), 'electron', 'ocr', 'ocr-worker.cjs');
        if (fs.existsSync(cwdPath)) {
            return cwdPath;
        }

        logger.error('OCR worker script not found in any location');
        return devPath; // Return default path, will fail later
    }

    /**
     * 启动 Worker 进程
     */
    private async startWorker(): Promise<void> {
        if (this.worker && this.workerReady) {
            return;
        }

        const workerPath = this.getWorkerPath();
        logger.info(`Starting OCR worker: ${workerPath}`);

        // 查找 Node.js 可执行文件路径
        // 使用系统的 node，而非 Electron 的 node
        const nodePath = process.platform === 'win32' ? 'node.exe' : 'node';

        return new Promise((resolve, reject) => {
            this.readyPromise = new Promise(res => {
                this.readyResolve = res;
            });

            try {
                this.worker = spawn(nodePath, [workerPath], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    cwd: process.cwd()
                });

                if (!this.worker.stdout || !this.worker.stdin) {
                    reject(new Error('Failed to create worker pipes'));
                    return;
                }

                const rl = readline.createInterface({
                    input: this.worker.stdout,
                    crlfDelay: Infinity
                });

                rl.on('line', (line) => {
                    try {
                        const data = JSON.parse(line) as WorkerResponse;

                        if (data.ready) {
                            logger.info('OCR worker is ready');
                            this.workerReady = true;
                            if (this.readyResolve) {
                                this.readyResolve();
                            }
                            resolve();
                            return;
                        }

                        // Handle response for pending request
                        // For simplicity, we process responses in order
                        const firstPending = this.pendingRequests.entries().next().value;
                        if (firstPending) {
                            const [reqId, handlers] = firstPending;
                            this.pendingRequests.delete(reqId);
                            handlers.resolve(data);
                        }
                    } catch (e) {
                        logger.error('Failed to parse worker response:', e);
                    }
                });

                this.worker.stderr?.on('data', (data) => {
                    logger.warn('OCR worker stderr:', data.toString());
                });

                this.worker.on('error', (error) => {
                    logger.error('OCR worker error:', error);
                    this.workerReady = false;
                    reject(error);
                });

                this.worker.on('exit', (code) => {
                    logger.info(`OCR worker exited with code ${code}`);
                    this.worker = null;
                    this.workerReady = false;

                    // Reject all pending requests
                    for (const [, handlers] of this.pendingRequests) {
                        handlers.reject(new Error('Worker exited'));
                    }
                    this.pendingRequests.clear();
                });

                // Set timeout for worker startup
                setTimeout(() => {
                    if (!this.workerReady) {
                        reject(new Error('Worker startup timeout'));
                    }
                }, 30000);

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 发送命令到 Worker
     */
    private async sendCommand(command: object): Promise<WorkerResponse> {
        if (!this.worker || !this.workerReady) {
            await this.startWorker();
        }

        if (!this.worker?.stdin) {
            throw new Error('Worker not available');
        }

        return new Promise((resolve, reject) => {
            const reqId = ++this.requestId;
            this.pendingRequests.set(reqId, { resolve, reject });

            const cmd = JSON.stringify(command) + '\n';
            this.worker!.stdin!.write(cmd, (err) => {
                if (err) {
                    this.pendingRequests.delete(reqId);
                    reject(err);
                }
            });

            // Timeout for request
            setTimeout(() => {
                if (this.pendingRequests.has(reqId)) {
                    this.pendingRequests.delete(reqId);
                    reject(new Error('Request timeout'));
                }
            }, 120000); // 2 minutes for OCR
        });
    }

    /**
     * 停止 Worker 进程
     */
    private stopWorker(): void {
        if (this.worker) {
            try {
                this.worker.kill();
                this.worker = null;
            } catch (e) {
                // Ignore errors
            }
        }
        this.workerReady = false;
        this.pendingRequests.clear();
    }

    /**
     * 初始化 OCR 引擎
     */
    async initialize(config: OcrConfig = {}): Promise<boolean> {
        if (this._isInitialized) {
            return true;
        }

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this._doInitialize(config);
        return this.initPromise;
    }

    /**
     * 重新初始化 OCR 引擎 (用于切换后端)
     */
    async reinitialize(config: OcrConfig = {}): Promise<boolean> {
        logger.info('Reinitializing OCR service...');

        // Stop current worker
        this.stopWorker();

        // Reset state
        this._isInitialized = false;
        this.initPromise = null;
        this._currentBackend = 'unknown';

        // Initialize with new config
        return this.initialize(config);
    }

    private async _doInitialize(config: OcrConfig): Promise<boolean> {
        try {
            logger.info('Initializing OCR service via subprocess...');

            // Start worker and send init command
            const response = await this.sendCommand({
                action: 'init',
                config: {
                    modelDir: config.modelDir || this.getModelBasePath(),
                    backend: config.backend  // 'directml' | 'cpu' | undefined (auto)
                }
            });

            if (response.success) {
                this._isInitialized = true;
                this._currentBackend = response.backend || 'cpu';
                this._modelVersion = response.modelVersion || null;
                this._modelPath = response.modelPath || '';
                logger.info(`OCR service initialized (PP-OCR${this._modelVersion}, backend: ${this._currentBackend})`);
                return true;
            } else {
                logger.error('OCR initialization failed:', response.error);
                this.initPromise = null;
                return false;
            }

        } catch (error: any) {
            logger.error('Failed to initialize OCR service', { error: error.message });
            this.initPromise = null;
            return false;
        }
    }

    /**
     * 检查服务是否可用
     */
    async isAvailable(): Promise<boolean> {
        try {
            logger.info('Checking OCR availability...');

            // Check if worker can be started
            try {
                await this.startWorker();
                const response = await this.sendCommand({ action: 'ping' });
                if (response.success) {
                    logger.info('  OCR worker is available');
                }
            } catch (e: any) {
                logger.error('  OCR worker not available:', e.message);
                return false;
            }

            // Check if models exist
            const modelAvailable = await this.isModelAvailable();
            if (!modelAvailable) {
                logger.error('  OCR models not available');
                return false;
            }

            logger.info('  OCR is available');
            return true;
        } catch (error) {
            logger.error('Error checking OCR availability:', error);
            return false;
        }
    }

    /**
     * 识别图片中的文字
     * @param imageData Base64 编码的图片数据 (不含 data:image/... 前缀) 或 data URL
     */
    async recognize(imageData: string): Promise<OcrResult> {
        const startTime = Date.now();

        if (!this._isInitialized) {
            const initialized = await this.initialize();
            if (!initialized) {
                return { success: false, error: 'Failed to initialize OCR service' };
            }
        }

        try {
            const response = await this.sendCommand({
                action: 'recognize',
                imageData
            });

            if (response.success) {
                const duration = Date.now() - startTime;
                logger.info(`OCR completed in ${response.duration || duration}ms, extracted ${(response.text || '').length} characters`);

                return {
                    success: true,
                    text: response.text?.trim() || '',
                    duration: response.duration || duration,
                    backend: this._currentBackend
                };
            } else {
                return {
                    success: false,
                    error: response.error,
                    duration: Date.now() - startTime,
                    backend: this._currentBackend
                };
            }

        } catch (error: any) {
            logger.error('OCR recognition failed', { error: error.message });
            return {
                success: false,
                error: error.message,
                duration: Date.now() - startTime,
                backend: this._currentBackend
            };
        }
    }

    /**
     * 释放资源
     */
    dispose(): void {
        if (this.worker) {
            try {
                this.worker.kill();
                this.worker = null;
            } catch (e) {
                // Ignore errors
            }
        }

        this._isInitialized = false;
        this.initPromise = null;
        this._currentBackend = 'unknown';
        this.workerReady = false;
        this.pendingRequests.clear();
        logger.info('OCR service disposed');
    }
}

/**
 * 单例服务实例
 */
export const ocrService = new OcrService();
