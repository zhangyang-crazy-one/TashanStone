import { ipcMain } from 'electron';
import { whisperService } from '../whisper/index.js';
import { logger } from '../utils/logger.js';

/**
 * 注册 Whisper 相关的 IPC 处理器
 *
 * 提供的功能:
 * 1. 检查 Whisper 是否可用
 * 2. 获取推荐的语音识别方法
 * 3. 执行音频转录 (如果 Whisper 可用)
 */
export function registerWhisperHandlers(): void {
    logger.info('Registering Whisper IPC handlers');

    /**
     * 检查系统是否安装了 Whisper
     *
     * 前端可以使用此 API 判断是否显示 Whisper 选项
     *
     * @returns {boolean} 是否可用
     */
    ipcMain.handle('whisper:isAvailable', async (): Promise<boolean> => {
        try {
            const available = await whisperService.isAvailable();
            logger.debug(`Whisper availability: ${available}`);
            return available;
        } catch (error: any) {
            logger.error('Failed to check Whisper availability', { error: error.message });
            return false;
        }
    });

    /**
     * 获取推荐的语音识别方法
     *
     * 返回值:
     * - 'webspeech': 推荐使用 Web Speech API (默认)
     * - 'whisper': 推荐使用 Whisper (如果已安装且配置)
     *
     * @returns {'webspeech' | 'whisper'} 推荐的方法
     */
    ipcMain.handle('whisper:getRecommendedMethod', async (): Promise<'webspeech' | 'whisper'> => {
        try {
            const method = whisperService.getRecommendedMethod();
            logger.debug(`Recommended speech recognition method: ${method}`);
            return method;
        } catch (error: any) {
            logger.error('Failed to get recommended method', { error: error.message });
            return 'webspeech'; // 默认返回 webspeech
        }
    });

    /**
     * 使用 Whisper 转录音频
     *
     * 参数:
     * - audioBuffer: 音频数据 (ArrayBuffer 格式)
     * - language: 可选的语言代码 ('en', 'zh', 'auto')
     *
     * 返回值:
     * {
     *   success: boolean,
     *   text?: string,         // 识别的文本
     *   language?: string,     // 语言代码
     *   error?: string         // 错误信息
     * }
     *
     * @param audioBuffer 音频数据
     * @param language 语言代码
     * @returns 转录结果
     */
    ipcMain.handle(
        'whisper:transcribe',
        async (
            _event,
            audioBuffer: ArrayBuffer,
            language?: string
        ): Promise<{
            success: boolean;
            text?: string;
            language?: string;
            error?: string;
        }> => {
            logger.info('Whisper transcription requested', {
                bufferSize: audioBuffer.byteLength,
                language
            });

            try {
                // 转换 ArrayBuffer 为 Node.js Buffer
                const buffer = Buffer.from(audioBuffer);

                // 调用 Whisper 服务进行转录
                const result = await whisperService.transcribe(buffer, { language });

                if (result.success) {
                    logger.info('Whisper transcription successful', {
                        textLength: result.text?.length || 0
                    });
                } else {
                    logger.warn('Whisper transcription failed', { error: result.error });
                }

                return result;

            } catch (error: any) {
                logger.error('Whisper transcription error', { error: error.message });
                return {
                    success: false,
                    error: error.message || 'Unknown error during transcription'
                };
            }
        }
    );

    logger.info('Whisper IPC handlers registered');
}
