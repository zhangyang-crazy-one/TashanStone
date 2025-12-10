import { ipcMain, dialog } from 'electron';
import { sherpaOnnxService } from '../sherpa/index.js';
import { AudioProcessor } from '../sherpa/audioProcessor.js';
import { logger } from '../utils/logger.js';

/**
 * 注册 Sherpa-ONNX 相关的 IPC 处理器
 *
 * 提供的功能:
 * 1. 检查 Sherpa-ONNX 是否可用
 * 2. 获取推荐的语音识别方法
 * 3. 初始化服务
 * 4. 开始/结束流式会话
 * 5. 输入音频数据
 * 6. 非流式转录
 */
export function registerSherpaHandlers(): void {
    logger.info('Registering Sherpa-ONNX IPC handlers');

    /**
     * 检查 Sherpa-ONNX 是否可用
     */
    ipcMain.handle('sherpa:isAvailable', async (): Promise<boolean> => {
        try {
            const available = await sherpaOnnxService.isAvailable();
            logger.debug(`Sherpa-ONNX availability: ${available}`);
            return available;
        } catch (error: any) {
            logger.error('Failed to check Sherpa-ONNX availability', { error: error.message });
            return false;
        }
    });

    /**
     * 获取推荐的语音识别方法
     */
    ipcMain.handle('sherpa:getRecommendedMethod', async (): Promise<'sherpa' | 'webspeech'> => {
        try {
            const method = await sherpaOnnxService.getRecommendedMethod();
            logger.debug(`Recommended speech recognition method: ${method}`);
            return method;
        } catch (error: any) {
            logger.error('Failed to get recommended method', { error: error.message });
            return 'webspeech';
        }
    });

    /**
     * 初始化 Sherpa-ONNX 服务
     */
    ipcMain.handle('sherpa:initialize', async (
        _event,
        config?: { modelDir?: string; language?: string; sampleRate?: number }
    ): Promise<{ success: boolean; error?: string }> => {
        try {
            const result = await sherpaOnnxService.initialize(config);
            return { success: result };
        } catch (error: any) {
            logger.error('Failed to initialize Sherpa-ONNX', { error: error.message });
            return { success: false, error: error.message };
        }
    });

    /**
     * 检查模型是否已下载
     */
    ipcMain.handle('sherpa:isModelAvailable', async (): Promise<boolean> => {
        try {
            return await sherpaOnnxService.isModelAvailable();
        } catch (error: any) {
            logger.error('Failed to check model availability', { error: error.message });
            return false;
        }
    });

    /**
     * 获取模型下载信息
     */
    ipcMain.handle('sherpa:getModelDownloadInfo', async (): Promise<{ url: string; name: string; size: string }> => {
        return sherpaOnnxService.getModelDownloadInfo();
    });

    /**
     * 开始流式识别会话
     */
    ipcMain.handle('sherpa:startSession', async (
        _event,
        sessionId: string
    ): Promise<{ success: boolean; error?: string }> => {
        try {
            // 确保服务已初始化
            const initResult = await sherpaOnnxService.initialize();
            if (!initResult) {
                logger.error('Failed to initialize Sherpa-ONNX service before starting session');
                return { success: false, error: 'Sherpa-ONNX initialization failed. Please check if model files exist.' };
            }

            const result = sherpaOnnxService.startStreamingSession(sessionId);
            if (result) {
                logger.info(`Streaming session started: ${sessionId}`);
                return { success: true };
            } else {
                return { success: false, error: 'Failed to start streaming session - recognizer may not be ready' };
            }
        } catch (error: any) {
            logger.error('Failed to start streaming session', { error: error.message, stack: error.stack });
            return { success: false, error: error.message };
        }
    });

    /**
     * 向流式会话输入音频数据
     */
    ipcMain.handle('sherpa:feedAudio', async (
        _event,
        sessionId: string,
        audioData: ArrayBuffer,
        sampleRate: number = 16000
    ): Promise<{ success: boolean; text?: string; isPartial?: boolean; error?: string }> => {
        try {
            // 转换 ArrayBuffer 为 Float32Array
            const float32Data = new Float32Array(audioData);

            const result = sherpaOnnxService.feedAudio(sessionId, float32Data, sampleRate);
            return result;
        } catch (error: any) {
            logger.error('Failed to feed audio', { error: error.message });
            return { success: false, error: error.message };
        }
    });

    /**
     * 结束流式会话
     */
    ipcMain.handle('sherpa:endSession', async (
        _event,
        sessionId: string
    ): Promise<{ success: boolean; text?: string; error?: string }> => {
        try {
            const result = sherpaOnnxService.endStreamingSession(sessionId);
            logger.info(`Streaming session ended: ${sessionId}`, { text: result.text?.substring(0, 50) });
            return result;
        } catch (error: any) {
            logger.error('Failed to end streaming session', { error: error.message });
            return { success: false, error: error.message };
        }
    });

    /**
     * 非流式转录 (整段音频一次性处理)
     */
    ipcMain.handle('sherpa:transcribe', async (
        _event,
        audioBuffer: ArrayBuffer,
        language?: string
    ): Promise<{ success: boolean; text?: string; language?: string; error?: string }> => {
        logger.info('Sherpa-ONNX transcription requested', {
            bufferSize: audioBuffer.byteLength,
            language
        });

        try {
            const buffer = Buffer.from(audioBuffer);
            const result = await sherpaOnnxService.transcribe(buffer, { language });

            if (result.success) {
                logger.info('Sherpa-ONNX transcription successful', {
                    textLength: result.text?.length || 0
                });
            } else {
                logger.warn('Sherpa-ONNX transcription failed', { error: result.error });
            }

            return result;
        } catch (error: any) {
            logger.error('Sherpa-ONNX transcription error', { error: error.message });
            return {
                success: false,
                error: error.message || 'Unknown error during transcription'
            };
        }
    });

    /**
     * 选择音频文件对话框
     */
    ipcMain.handle('sherpa:selectAudioFile', async (): Promise<{ success: boolean; filePath?: string; error?: string }> => {
        try {
            const result = await dialog.showOpenDialog({
                title: 'Select Audio File',
                filters: [
                    { name: 'Audio Files', extensions: ['wav', 'mp3', 'm4a', 'flac', 'ogg', 'aac', 'wma', 'webm'] },
                    { name: 'All Files', extensions: ['*'] }
                ],
                properties: ['openFile']
            });

            if (result.canceled || result.filePaths.length === 0) {
                return { success: false, error: 'No file selected' };
            }

            const filePath = result.filePaths[0];

            // Validate file format
            if (!AudioProcessor.isSupportedFormat(filePath)) {
                return { success: false, error: 'Unsupported audio format' };
            }

            logger.info('Audio file selected', { filePath });
            return { success: true, filePath };
        } catch (error: any) {
            logger.error('Failed to select audio file', { error: error.message });
            return { success: false, error: error.message };
        }
    });

    /**
     * 获取音频文件信息
     */
    ipcMain.handle('sherpa:getAudioInfo', async (
        _event,
        filePath: string
    ): Promise<{ success: boolean; duration?: number; sampleRate?: number; format?: string; error?: string }> => {
        try {
            const info = await AudioProcessor.getAudioInfo(filePath);
            logger.info('Audio info retrieved', { filePath, info });
            return {
                success: true,
                duration: info.duration,
                sampleRate: info.sampleRate,
                format: info.format
            };
        } catch (error: any) {
            logger.error('Failed to get audio info', { error: error.message });
            return { success: false, error: error.message };
        }
    });

    /**
     * 带增强处理的音频文件转录（支持降噪）
     */
    ipcMain.handle('sherpa:transcribeFile', async (
        _event,
        filePath: string,
        options?: { enableNoiseReduction?: boolean; language?: string }
    ): Promise<{ success: boolean; text?: string; duration?: number; error?: string }> => {
        const { enableNoiseReduction = true, language } = options || {};

        logger.info('Sherpa-ONNX file transcription requested', {
            filePath,
            enableNoiseReduction,
            language
        });

        try {
            // 1. 确保服务已初始化
            const initResult = await sherpaOnnxService.initialize();
            if (!initResult) {
                return { success: false, error: 'Sherpa-ONNX initialization failed' };
            }

            // 2. 处理音频文件（转换格式 + 可选降噪）
            const audioData = await AudioProcessor.processAudioFile(filePath, {
                enableNoiseReduction
            });

            logger.info('Audio processed', {
                duration: audioData.duration,
                sampleRate: audioData.sampleRate,
                samplesCount: audioData.samples.length
            });

            // 3. 使用 Sherpa-ONNX 进行转录
            // 对于长音频，使用流式处理
            const sessionId = `file_${Date.now()}`;
            const chunkSize = 16000; // 1 second chunks
            let fullText = '';

            // 开始会话
            const startResult = sherpaOnnxService.startStreamingSession(sessionId);
            if (!startResult) {
                return { success: false, error: 'Failed to start transcription session' };
            }

            // 分块处理
            for (let i = 0; i < audioData.samples.length; i += chunkSize) {
                const chunk = audioData.samples.slice(i, Math.min(i + chunkSize, audioData.samples.length));
                const result = sherpaOnnxService.feedAudio(sessionId, chunk, audioData.sampleRate);

                if (result.text && !result.isPartial) {
                    fullText += result.text + ' ';
                }
            }

            // 结束会话获取最终结果
            const endResult = sherpaOnnxService.endStreamingSession(sessionId);
            if (endResult.text) {
                fullText += endResult.text;
            }

            // 清理文本
            fullText = fullText.trim().replace(/\s+/g, ' ');

            logger.info('File transcription complete', {
                textLength: fullText.length,
                duration: audioData.duration
            });

            return {
                success: true,
                text: fullText,
                duration: audioData.duration
            };
        } catch (error: any) {
            logger.error('File transcription error', { error: error.message, stack: error.stack });
            return { success: false, error: error.message };
        }
    });

    /**
     * 检查 FFmpeg 是否可用
     */
    ipcMain.handle('sherpa:isFFmpegAvailable', async (): Promise<boolean> => {
        try {
            return await AudioProcessor.isFFmpegAvailable();
        } catch (error: any) {
            logger.error('Failed to check FFmpeg availability', { error: error.message });
            return false;
        }
    });

    logger.info('Sherpa-ONNX IPC handlers registered');
}
