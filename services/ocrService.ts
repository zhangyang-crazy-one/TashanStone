/**
 * OCR Service for Renderer Process
 * 使用主进程 OCR (esearch-ocr + onnxruntime-node + PP-OCRv5)
 *
 * 通过 IPC 调用主进程实现:
 * - DirectML GPU 加速 (Windows)
 * - CPU 后备方案
 * - 无 WebGL 内存限制
 */

/**
 * 单行识别结果
 */
export interface OcrTextLine {
    /** 识别出的文字 */
    text: string;
    /** 置信度 (0-1) */
    confidence: number;
    /** 四个角点坐标 [[x1,y1], [x2,y2], [x3,y3], [x4,y4]] */
    points: number[][];
}

/**
 * OCR 识别结果
 */
export interface OcrResult {
    /** 是否成功 */
    success: boolean;
    /** 所有文字合并（换行分隔） */
    text?: string;
    /** 每行文字及其位置 */
    lines?: OcrTextLine[];
    /** 错误信息 */
    error?: string;
    /** 总耗时（毫秒） */
    duration?: number;
    /** 检测到的文字框数量 */
    boxCount?: number;
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
 * OCR 服务类 - 使用主进程 IPC
 *
 * 在 Electron 环境下通过 IPC 调用主进程 OCR 服务
 * 在非 Electron 环境下返回不可用状态
 */
class OcrServiceLocal {
    private _isInitialized = false;
    private _currentBackend = 'unknown';
    private _modelVersion: string | null = null;

    /**
     * 检查是否在 Electron 环境
     */
    private isElectron(): boolean {
        return !!(window.electronAPI?.ocr);
    }

    /**
     * 初始化 OCR 引擎
     */
    async initialize(): Promise<boolean> {
        if (!this.isElectron()) {
            console.warn('[OCR] Not in Electron environment, OCR not available');
            return false;
        }

        if (this._isInitialized) {
            return true;
        }

        try {
            console.log('[OCR] Initializing via main process...');
            const startTime = Date.now();

            const result = await window.electronAPI!.ocr.initialize();

            if (result.success) {
                const duration = Date.now() - startTime;

                // Get status to update local state
                const status = await window.electronAPI!.ocr.getStatus();
                this._isInitialized = status.initialized;
                this._currentBackend = status.backend;
                this._modelVersion = status.modelVersion;

                console.log(`[OCR] Initialized successfully in ${duration}ms`);
                console.log(`[OCR] Backend: ${this._currentBackend}, Model: PP-OCR${this._modelVersion || '?'}`);
                return true;
            } else {
                console.error('[OCR] Initialization failed:', result.error);
                return false;
            }
        } catch (error: any) {
            console.error('[OCR] Failed to initialize OCR service:', error);
            return false;
        }
    }

    /**
     * 检查服务是否可用
     */
    async isAvailable(): Promise<boolean> {
        if (!this.isElectron()) {
            console.warn('[OCR] Not in Electron environment');
            return false;
        }

        try {
            // Check if model is available
            const modelAvailable = await window.electronAPI!.ocr.isModelAvailable();
            if (!modelAvailable) {
                console.warn('[OCR] Model not available');
                return false;
            }

            return true;
        } catch (error) {
            console.error('[OCR] Error checking OCR availability:', error);
            return false;
        }
    }

    /**
     * 检查模型是否已下载
     */
    async isModelAvailable(): Promise<boolean> {
        if (!this.isElectron()) {
            return false;
        }
        return window.electronAPI!.ocr.isModelAvailable();
    }

    /**
     * 获取模型下载信息
     */
    async getModelDownloadInfo(): Promise<{ url: string; name: string; size: string; files: string[] }> {
        if (!this.isElectron()) {
            return {
                url: 'https://huggingface.co/SWHL/PP-OCRv5-ONNX/tree/main',
                name: 'PP-OCRv5 Server ONNX Models',
                size: '~170MB',
                files: []
            };
        }
        return window.electronAPI!.ocr.getModelDownloadInfo();
    }

    /**
     * 获取 OCR 状态信息
     */
    async getStatus(): Promise<OcrStatus> {
        if (!this.isElectron()) {
            return {
                available: false,
                initialized: false,
                backend: 'unavailable',
                modelVersion: null,
                modelPath: ''
            };
        }
        return window.electronAPI!.ocr.getStatus();
    }

    /**
     * 获取当前后端
     */
    get currentBackend(): string {
        return this._currentBackend;
    }

    /**
     * 是否已初始化
     */
    get isInitialized(): boolean {
        return this._isInitialized;
    }

    /**
     * 切换后端 (GPU/CPU)
     */
    async switchBackend(backend: 'directml' | 'cpu'): Promise<boolean> {
        if (!this.isElectron()) {
            return false;
        }

        try {
            console.log(`[OCR] Switching to ${backend.toUpperCase()} backend...`);
            const result = await window.electronAPI!.ocr.reinitialize({ backend });

            if (result.success) {
                const status = await window.electronAPI!.ocr.getStatus();
                this._currentBackend = status.backend;
                this._isInitialized = status.initialized;
                console.log(`[OCR] Switched to ${this._currentBackend.toUpperCase()}`);
                return true;
            } else {
                console.error('[OCR] Failed to switch backend:', result.error);
                return false;
            }
        } catch (error: any) {
            console.error('[OCR] Error switching backend:', error);
            return false;
        }
    }

    /**
     * 识别图片中的文字
     *
     * @param imageSource 图片源 - HTMLImageElement, HTMLCanvasElement, 或 data URL 字符串
     */
    async recognize(imageSource: HTMLImageElement | HTMLCanvasElement | string): Promise<OcrResult> {
        const startTime = Date.now();

        if (!this.isElectron()) {
            return { success: false, error: 'OCR not available in this environment' };
        }

        // Convert image source to data URL
        let dataUrl: string;

        if (typeof imageSource === 'string') {
            // Already a data URL or base64 string
            dataUrl = imageSource;
        } else if (imageSource instanceof HTMLCanvasElement) {
            // Canvas element - convert to data URL
            dataUrl = imageSource.toDataURL('image/png');
        } else if (imageSource instanceof HTMLImageElement) {
            // Image element - draw to canvas first
            const canvas = document.createElement('canvas');
            canvas.width = imageSource.naturalWidth || imageSource.width;
            canvas.height = imageSource.naturalHeight || imageSource.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return { success: false, error: 'Failed to create canvas context' };
            }
            ctx.drawImage(imageSource, 0, 0);
            dataUrl = canvas.toDataURL('image/png');
        } else {
            return { success: false, error: 'Invalid image source type' };
        }

        try {
            console.log('[OCR] Starting recognition via main process...');

            // Call main process OCR
            const result = await window.electronAPI!.ocr.recognize(dataUrl);

            const duration = Date.now() - startTime;

            if (result.success && result.text !== undefined) {
                const lines = result.text.split('\n').filter((l: string) => l.trim());

                console.log(`[OCR] Recognition completed in ${result.duration || duration}ms`);
                console.log(`[OCR] Extracted ${lines.length} lines, ${result.text.length} characters`);

                return {
                    success: true,
                    text: result.text,
                    lines: lines.map((text: string) => ({
                        text,
                        confidence: 1.0,  // Main process doesn't return per-line confidence
                        points: []
                    })),
                    duration: result.duration || duration,
                    boxCount: lines.length,
                    backend: result.backend || this._currentBackend
                };
            } else {
                console.warn('[OCR] Recognition returned no text or failed:', result.error);
                return {
                    success: false,
                    error: result.error || 'No text recognized',
                    duration: duration,
                    backend: result.backend || this._currentBackend
                };
            }

        } catch (error: any) {
            console.error('[OCR] Recognition failed:', error);
            return {
                success: false,
                error: error.message,
                duration: Date.now() - startTime,
                backend: this._currentBackend
            };
        }
    }

    /**
     * 从 Data URL 识别文字
     * @param dataUrl base64 编码的图片 data URL
     */
    async recognizeFromDataUrl(dataUrl: string): Promise<OcrResult> {
        return this.recognize(dataUrl);
    }

    /**
     * 释放资源
     */
    dispose(): void {
        this._isInitialized = false;
        this._currentBackend = 'unknown';
        this._modelVersion = null;
        console.log('[OCR] OCR service disposed');
    }
}

/**
 * 单例服务实例
 */
export const ocrServiceLocal = new OcrServiceLocal();

/**
 * 便捷函数：检查 OCR 是否可用
 */
export async function isOcrAvailable(): Promise<boolean> {
    return ocrServiceLocal.isAvailable();
}

/**
 * 便捷函数：识别图片
 */
export async function recognizeImage(imageSource: HTMLImageElement | HTMLCanvasElement | string): Promise<OcrResult> {
    return ocrServiceLocal.recognize(imageSource);
}

// 同时导出旧的名称以保持兼容
export const ocrServiceRenderer = ocrServiceLocal;
