import { ipcMain } from 'electron';
import { ocrService } from '../ocr/index.js';
import { logger } from '../utils/logger.js';

/**
 * 注册 OCR 相关的 IPC 处理器
 */
export function registerOcrHandlers(): void {
    logger.info('Registering OCR IPC handlers');

    /**
     * 检查 OCR 服务是否可用
     */
    ipcMain.handle('ocr:isAvailable', async () => {
        try {
            return await ocrService.isAvailable();
        } catch (error: any) {
            logger.error('ocr:isAvailable error:', error);
            return false;
        }
    });

    /**
     * 检查 OCR 模型是否已下载
     */
    ipcMain.handle('ocr:isModelAvailable', async () => {
        try {
            return await ocrService.isModelAvailable();
        } catch (error: any) {
            logger.error('ocr:isModelAvailable error:', error);
            return false;
        }
    });

    /**
     * 获取模型下载信息
     */
    ipcMain.handle('ocr:getModelDownloadInfo', async () => {
        return ocrService.getModelDownloadInfo();
    });

    /**
     * 初始化 OCR 服务
     */
    ipcMain.handle('ocr:initialize', async (_event, config?: any) => {
        try {
            const success = await ocrService.initialize(config);
            return { success, error: success ? undefined : 'Failed to initialize OCR service' };
        } catch (error: any) {
            logger.error('ocr:initialize error:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * 重新初始化 OCR 服务 (用于切换后端)
     */
    ipcMain.handle('ocr:reinitialize', async (_event, config?: any) => {
        try {
            const success = await ocrService.reinitialize(config);
            return { success, error: success ? undefined : 'Failed to reinitialize OCR service' };
        } catch (error: any) {
            logger.error('ocr:reinitialize error:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * 执行 OCR 识别
     * @param imageData Base64 编码的图片数据
     */
    ipcMain.handle('ocr:recognize', async (_event, imageData: string) => {
        try {
            const result = await ocrService.recognize(imageData);
            return result;
        } catch (error: any) {
            logger.error('ocr:recognize error:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * 获取 OCR 服务状态
     * 返回可用性、初始化状态、后端类型和模型信息
     */
    ipcMain.handle('ocr:getStatus', async () => {
        try {
            return ocrService.getStatus();
        } catch (error: any) {
            logger.error('ocr:getStatus error:', error);
            return {
                available: false,
                initialized: false,
                backend: 'unknown',
                modelVersion: null,
                modelPath: ''
            };
        }
    });

    logger.info('OCR IPC handlers registered');
}
