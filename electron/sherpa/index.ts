import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { createRequire } from 'module';
import { logger } from '../utils/logger.js';

// 在 ESM 环境中创建 require 函数
const require = createRequire(import.meta.url);

/**
 * Sherpa-ONNX 配置选项
 */
export interface SherpaOnnxConfig {
    /** 模型目录路径 */
    modelDir?: string;
    /** 语言: 'zh', 'en', 'auto' */
    language?: string;
    /** 采样率 (默认 16000) */
    sampleRate?: number;
}

/**
 * 流式识别会话
 */
interface StreamingSession {
    recognizer: any;
    stream: any;
    isActive: boolean;
}

/**
 * 转录结果
 */
export interface SherpaTranscriptionResult {
    success: boolean;
    text?: string;
    language?: string;
    error?: string;
    isPartial?: boolean;
}

/**
 * Sherpa-ONNX 语音识别服务
 *
 * 使用 sherpa-onnx npm 包进行本地语音识别
 * 支持流式和非流式识别
 * 无需 Python，纯 WebAssembly/原生实现
 */
export class SherpaOnnxService {
    private sherpaModule: any = null;
    private onlineRecognizer: any = null;
    private offlineRecognizer: any = null;
    private modelPath: string = '';
    private isInitialized = false;
    private initPromise: Promise<boolean> | null = null;
    private streamingSessions: Map<string, StreamingSession> = new Map();

    /**
     * 获取模型存储路径
     * 优先级：
     * 1. 环境变量 SHERPA_MODEL_PATH (如果设置)
     * 2. 开发模式多路径搜索 (../resources, ../../resources, cwd/resources)
     * 3. 打包后的资源目录 (process.resourcesPath/sherpa-models)
     * 4. 用户数据目录 (userData/sherpa-models)
     */
    private getModelBasePath(): string {
        const paths: { path: string; source: string }[] = [];

        // 0. 环境变量优先（用于开发和测试）
        if (process.env.SHERPA_MODEL_PATH) {
            const envPath = path.resolve(process.env.SHERPA_MODEL_PATH);
            paths.push({ path: envPath, source: 'environment variable' });
        }

        // 1. 开发模式路径搜索（app.getAppPath() 可能返回 dist-electron 或其他构建目录）
        const appPath = app.getAppPath();
        const cwd = process.cwd();

        // 1.1 相对于 appPath 的多层级搜索
        const devPaths = [
            path.join(appPath, 'resources', 'sherpa-models'),           // dist-electron/resources
            path.join(appPath, '..', 'resources', 'sherpa-models'),     // dist-electron/../resources
            path.join(appPath, '..', '..', 'resources', 'sherpa-models'), // 深层嵌套构建目录
        ];

        // 1.2 相对于工作目录的搜索（开发模式最常见）
        devPaths.push(path.join(cwd, 'resources', 'sherpa-models'));

        for (const devPath of devPaths) {
            const resolved = path.resolve(devPath);
            paths.push({ path: resolved, source: 'development resources' });
        }

        // 2. 生产环境打包资源目录
        if (process.resourcesPath) {
            const bundledModelPath = path.join(process.resourcesPath, 'sherpa-models');
            paths.push({ path: bundledModelPath, source: 'bundled resources' });
        }

        // 3. 用户数据目录（最后的备选，用于下载模型）
        const userDataPath = app.getPath('userData');
        const userModelPath = path.join(userDataPath, 'sherpa-models');
        paths.push({ path: userModelPath, source: 'user data directory' });

        logger.info('Sherpa model path search order:');
        for (const { path: searchPath, source } of paths) {
            const exists = fs.existsSync(searchPath);
            logger.info(`  - ${source}: ${searchPath} [${exists ? 'EXISTS' : 'NOT FOUND'}]`);

            if (exists) {
                logger.info(`✅ Selected model path: ${searchPath}`);
                return searchPath;
            }
        }

        // 如果都不存在，返回用户数据目录路径（用于后续下载）
        logger.warn(`⚠️  No existing model directory found. Will use: ${userModelPath}`);
        return userModelPath;
    }

    /**
     * 检查模型是否已下载
     */
    async isModelAvailable(): Promise<boolean> {
        const modelDir = this.getModelBasePath();
        const requiredFiles = [
            'tokens.txt',
            'encoder-epoch-99-avg-1.onnx',
            'decoder-epoch-99-avg-1.onnx',
            'joiner-epoch-99-avg-1.onnx'
        ];

        logger.info(`Checking Sherpa models in: ${modelDir}`);

        try {
            // 检查目录是否存在
            const dirExists = fs.existsSync(modelDir);
            if (!dirExists) {
                logger.warn(`Model directory does not exist: ${modelDir}`);
                return false;
            }

            // 检查所有必要的模型文件
            const missingFiles: string[] = [];
            for (const file of requiredFiles) {
                const filePath = path.join(modelDir, file);
                try {
                    await fs.promises.access(filePath, fs.constants.F_OK);
                    logger.debug(`  ✓ Found: ${file}`);
                } catch {
                    logger.warn(`  ✗ Missing: ${file}`);
                    missingFiles.push(file);
                }
            }

            if (missingFiles.length > 0) {
                logger.error(`Missing model files: ${missingFiles.join(', ')}`);
                return false;
            }

            logger.info('All required model files found');
            return true;
        } catch (error) {
            logger.error('Error checking model availability:', error);
            return false;
        }
    }

    /**
     * 获取模型下载信息
     */
    getModelDownloadInfo(): { url: string; name: string; size: string } {
        return {
            // 使用 sherpa-onnx streaming zipformer 中英双语模型
            url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20.tar.bz2',
            name: 'sherpa-onnx-streaming-zipformer-bilingual-zh-en',
            size: '~70MB'
        };
    }

    /**
     * 初始化 Sherpa-ONNX
     */
    async initialize(config: SherpaOnnxConfig = {}): Promise<boolean> {
        if (this.isInitialized) {
            return true;
        }

        // 避免重复初始化
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this._doInitialize(config);
        return this.initPromise;
    }

    private async _doInitialize(config: SherpaOnnxConfig): Promise<boolean> {
        try {
            logger.info('Initializing Sherpa-ONNX service...');

            // 动态导入 sherpa-onnx-node (原生 Node.js addon，比 WASM 版本更稳定)
            let sherpaOnnx;
            try {
                sherpaOnnx = require('sherpa-onnx-node');
                this.sherpaModule = sherpaOnnx;
                logger.info(`  ✓ Loaded sherpa-onnx-node version: ${sherpaOnnx.version || 'unknown'}`);
            } catch (error: any) {
                logger.error('  ✗ Failed to load sherpa-onnx-node module:', error);
                return false;
            }

            // 确定模型路径
            this.modelPath = config.modelDir || this.getModelBasePath();
            logger.info(`  Model directory: ${this.modelPath}`);

            // 检查模型是否存在
            const modelAvailable = await this.isModelAvailable();
            if (!modelAvailable) {
                logger.error('  ✗ Required model files not found');
                const downloadInfo = this.getModelDownloadInfo();
                logger.info(`  → Please download models from: ${downloadInfo.url}`);
                logger.info(`  → Extract to: ${this.modelPath}`);
                return false;
            }

            // 创建在线识别器 (流式)
            logger.info('  Creating online recognizer...');
            await this.createOnlineRecognizer(config);

            this.isInitialized = true;
            logger.info('✅ Sherpa-ONNX service initialized successfully');
            return true;

        } catch (error: any) {
            logger.error('❌ Failed to initialize Sherpa-ONNX', { error: error.message, stack: error.stack });
            this.initPromise = null;
            return false;
        }
    }

    /**
     * 创建在线识别器 (流式识别)
     */
    private async createOnlineRecognizer(config: SherpaOnnxConfig): Promise<void> {
        const sampleRate = config.sampleRate || 16000;

        // 构建模型文件路径
        const modelFiles = {
            encoder: path.join(this.modelPath, 'encoder-epoch-99-avg-1.onnx'),
            decoder: path.join(this.modelPath, 'decoder-epoch-99-avg-1.onnx'),
            joiner: path.join(this.modelPath, 'joiner-epoch-99-avg-1.onnx'),
            tokens: path.join(this.modelPath, 'tokens.txt'),
        };

        logger.debug('Model file paths:', modelFiles);

        // 验证核心模型文件存在
        for (const [name, filePath] of Object.entries(modelFiles)) {
            if (!fs.existsSync(filePath)) {
                throw new Error(`Model file not found: ${name} at ${filePath}`);
            }
        }

        // 配置在线识别器 (sherpa-onnx-node API)
        // 优化参数用于中英文双语识别
        const recognizerConfig = {
            featConfig: {
                sampleRate: sampleRate,
                featureDim: 80,
            },
            modelConfig: {
                transducer: {
                    encoder: modelFiles.encoder,
                    decoder: modelFiles.decoder,
                    joiner: modelFiles.joiner,
                },
                tokens: modelFiles.tokens,
                numThreads: 4,  // 增加线程数提高性能
                provider: 'cpu',
                debug: 0,  // 关闭调试输出
                modelType: '',
                modelingUnit: '',  // bilingual-zh-en 模型使用 cjkchar（默认）
                bpeVocab: '',
            },
            decodingMethod: 'greedy_search',
            maxActivePaths: 4,
            enableEndpoint: 1,
            // 端点检测参数 - 针对中文优化
            // rule1: 长时间静音后结束 (句子结束)
            rule1MinTrailingSilence: 1.8,  // 减少到1.8秒，更快响应
            // rule2: 短时间静音后结束 (短句/词组)
            rule2MinTrailingSilence: 0.8,  // 减少到0.8秒，更快响应
            // rule3: 最小句子长度 (秒)
            rule3MinUtteranceLength: 15,   // 减少到15秒
        };

        try {
            // sherpa-onnx-node 使用 OnlineRecognizer 类构造函数
            this.onlineRecognizer = new this.sherpaModule.OnlineRecognizer(recognizerConfig);
            logger.info('  ✓ Online recognizer created successfully');
        } catch (error: any) {
            logger.error('  ✗ Failed to create online recognizer', {
                error: error.message,
                config: recognizerConfig
            });
            throw error;
        }
    }

    /**
     * 检查服务是否可用
     */
    async isAvailable(): Promise<boolean> {
        try {
            logger.info('Checking Sherpa-ONNX availability...');

            // 1. 检查 sherpa-onnx-node 模块是否可以导入
            try {
                const sherpaOnnx = require('sherpa-onnx-node');
                if (sherpaOnnx && typeof sherpaOnnx.OnlineRecognizer === 'function') {
                    logger.info('  ✓ sherpa-onnx-node module loaded successfully');
                    logger.debug(`    Available methods: ${Object.keys(sherpaOnnx).join(', ')}`);
                } else {
                    logger.error('  ✗ sherpa-onnx-node module loaded but invalid (missing OnlineRecognizer)');
                    return false;
                }
            } catch (error: any) {
                logger.error('  ✗ Failed to load sherpa-onnx-node module:', error.message || error);
                logger.debug('    This might be due to:');
                logger.debug('    - Module not installed (run: npm install sherpa-onnx-node)');
                logger.debug('    - Electron rebuild required (run: npx electron-rebuild -f -w sherpa-onnx-node)');
                return false;
            }

            // 2. 检查模型是否存在
            const modelPath = this.getModelBasePath();
            const modelAvailable = await this.isModelAvailable();

            if (!modelAvailable) {
                logger.error('  ✗ Sherpa models not available');
                logger.info(`  → Model path checked: ${modelPath}`);
                const downloadInfo = this.getModelDownloadInfo();
                logger.info(`  → Download models from: ${downloadInfo.url}`);
                logger.info(`  → Model name: ${downloadInfo.name}`);
                logger.info(`  → Size: ${downloadInfo.size}`);
                return false;
            }

            logger.info(`  ✓ Sherpa-ONNX is available (models at: ${modelPath})`);
            return true;
        } catch (error) {
            logger.error('Error checking Sherpa-ONNX availability:', error);
            return false;
        }
    }

    /**
     * 开始流式识别会话
     */
    startStreamingSession(sessionId: string): boolean {
        if (!this.isInitialized || !this.onlineRecognizer) {
            logger.error('Sherpa-ONNX not initialized');
            return false;
        }

        try {
            const stream = this.onlineRecognizer.createStream();
            this.streamingSessions.set(sessionId, {
                recognizer: this.onlineRecognizer,
                stream,
                isActive: true
            });
            logger.debug(`Streaming session started: ${sessionId}`);
            return true;
        } catch (error: any) {
            logger.error('Failed to start streaming session', { error: error.message });
            return false;
        }
    }

    /**
     * 向流式会话输入音频数据
     * @param sessionId 会话ID
     * @param audioData Float32Array 格式的音频数据 ([-1, 1] 范围)
     * @param sampleRate 采样率
     */
    feedAudio(sessionId: string, audioData: Float32Array, sampleRate: number = 16000): SherpaTranscriptionResult {
        const session = this.streamingSessions.get(sessionId);
        if (!session || !session.isActive) {
            return { success: false, error: 'Session not found or inactive' };
        }

        try {
            // 输入音频 (sherpa-onnx-node 使用对象参数)
            session.stream.acceptWaveform({samples: audioData, sampleRate: sampleRate});

            // 检查是否准备好解码
            while (session.recognizer.isReady(session.stream)) {
                session.recognizer.decode(session.stream);
            }

            // 获取当前结果
            const result = session.recognizer.getResult(session.stream);
            const isEndpoint = session.recognizer.isEndpoint(session.stream);

            // 如果检测到端点，重置流
            if (isEndpoint) {
                session.recognizer.reset(session.stream);
            }

            return {
                success: true,
                text: result.text || '',
                isPartial: !isEndpoint
            };
        } catch (error: any) {
            logger.error('Error feeding audio', { error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * 结束流式会话并获取最终结果
     */
    endStreamingSession(sessionId: string): SherpaTranscriptionResult {
        const session = this.streamingSessions.get(sessionId);
        if (!session) {
            return { success: false, error: 'Session not found' };
        }

        try {
            // 标记输入结束
            session.stream.inputFinished();

            // 解码剩余数据
            while (session.recognizer.isReady(session.stream)) {
                session.recognizer.decode(session.stream);
            }

            // 获取最终结果
            const result = session.recognizer.getResult(session.stream);

            // 清理会话 - 安全地尝试释放资源
            try {
                if (typeof session.stream.free === 'function') {
                    session.stream.free();
                }
            } catch (freeError) {
                // 忽略释放错误，某些版本可能不支持free方法
                logger.debug('Stream free not available or failed, continuing cleanup');
            }
            session.isActive = false;
            this.streamingSessions.delete(sessionId);

            logger.debug(`Streaming session ended: ${sessionId}`);

            return {
                success: true,
                text: result.text || '',
                isPartial: false
            };
        } catch (error: any) {
            logger.error('Error ending session', { error: error.message });
            this.streamingSessions.delete(sessionId);
            return { success: false, error: error.message };
        }
    }

    /**
     * 非流式转录 (整段音频一次性处理)
     * @param audioBuffer WAV 格式的音频缓冲区
     * @param config 配置选项
     */
    async transcribe(audioBuffer: Buffer, config: SherpaOnnxConfig = {}): Promise<SherpaTranscriptionResult> {
        if (!this.isInitialized) {
            const initialized = await this.initialize(config);
            if (!initialized) {
                return { success: false, error: 'Failed to initialize Sherpa-ONNX' };
            }
        }

        try {
            // sherpa-onnx-node 不支持 readWaveFromBinaryData，需要先保存临时文件
            const tempDir = app.getPath('temp');
            const tempFile = path.join(tempDir, `sherpa_temp_${Date.now()}.wav`);

            try {
                fs.writeFileSync(tempFile, audioBuffer);

                // 读取音频数据
                const waveData = this.sherpaModule.readWave(tempFile);

                if (!waveData || !waveData.samples) {
                    return { success: false, error: 'Failed to decode audio data' };
                }

                // 使用在线识别器处理
                const stream = this.onlineRecognizer.createStream();
                // sherpa-onnx-node 使用对象参数
                stream.acceptWaveform({samples: waveData.samples, sampleRate: waveData.sampleRate});
                stream.inputFinished();

                // 解码
                while (this.onlineRecognizer.isReady(stream)) {
                    this.onlineRecognizer.decode(stream);
                }

                const result = this.onlineRecognizer.getResult(stream);

                return {
                    success: true,
                    text: result.text || '',
                    language: config.language
                };
            } finally {
                // 清理临时文件
                try {
                    if (fs.existsSync(tempFile)) {
                        fs.unlinkSync(tempFile);
                    }
                } catch (e) {
                    // 忽略清理错误
                }
            }

        } catch (error: any) {
            logger.error('Transcription failed', { error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * 释放资源
     */
    dispose(): void {
        // 清理所有活动会话
        for (const [sessionId, session] of this.streamingSessions) {
            try {
                if (session.stream) {
                    session.stream.free();
                }
            } catch (e) {
                // 忽略清理错误
            }
        }
        this.streamingSessions.clear();

        // 释放识别器
        if (this.onlineRecognizer) {
            try {
                this.onlineRecognizer.free();
            } catch (e) {
                // 忽略
            }
            this.onlineRecognizer = null;
        }

        if (this.offlineRecognizer) {
            try {
                this.offlineRecognizer.free();
            } catch (e) {
                // 忽略
            }
            this.offlineRecognizer = null;
        }

        this.isInitialized = false;
        this.initPromise = null;
        logger.info('Sherpa-ONNX service disposed');
    }

    /**
     * 获取推荐的语音识别方法
     */
    async getRecommendedMethod(): Promise<'sherpa' | 'webspeech'> {
        const available = await this.isAvailable();
        return available ? 'sherpa' : 'webspeech';
    }
}

/**
 * 单例服务实例
 */
export const sherpaOnnxService = new SherpaOnnxService();
