import { ipcMain } from 'electron';
import * as lancedbService from '../lancedb/index.js';
import { logger } from '../utils/logger.js';

/**
 * 注册 LanceDB 相关的 IPC 处理器
 */
export function registerLanceDBHandlers(): void {
  logger.info('[LanceDBHandlers] Registering LanceDB IPC handlers');

  // 初始化 LanceDB
  ipcMain.handle('lancedb:init', async () => {
    try {
      await lancedbService.initLanceDB();
      logger.info('[LanceDBHandlers] LanceDB initialized successfully');
    } catch (error) {
      logger.error('[LanceDBHandlers] Failed to initialize LanceDB', error);
      throw error;
    }
  });

  // 添加向量数据
  ipcMain.handle('lancedb:add', async (_, chunks) => {
    try {
      await lancedbService.addVectors(chunks);
      logger.info('[LanceDBHandlers] Vectors added', { count: chunks.length });
    } catch (error) {
      logger.error('[LanceDBHandlers] Failed to add vectors', error);
      throw error;
    }
  });

  // 搜索向量
  ipcMain.handle('lancedb:search', async (_, queryVector, limit) => {
    try {
      const results = await lancedbService.searchVectors(queryVector, limit);
      logger.info('[LanceDBHandlers] Vector search completed', { resultCount: results.length });
      return results;
    } catch (error) {
      logger.error('[LanceDBHandlers] Vector search failed', error);
      throw error;
    }
  });

  // 删除指定文件的向量
  ipcMain.handle('lancedb:deleteByFile', async (_, fileId) => {
    try {
      await lancedbService.deleteByFile(fileId);
      logger.info('[LanceDBHandlers] Vectors deleted for file', { fileId });
    } catch (error) {
      logger.error('[LanceDBHandlers] Failed to delete vectors', { fileId, error });
      throw error;
    }
  });

  // 清空所有向量
  ipcMain.handle('lancedb:clear', async () => {
    try {
      await lancedbService.clearAll();
      logger.info('[LanceDBHandlers] All vectors cleared');
    } catch (error) {
      logger.error('[LanceDBHandlers] Failed to clear vectors', error);
      throw error;
    }
  });

  // 获取所有向量块
  ipcMain.handle('lancedb:getAll', async () => {
    try {
      const chunks = await lancedbService.getAllChunks();
      logger.info('[LanceDBHandlers] Retrieved all chunks', { count: chunks.length });
      return chunks;
    } catch (error) {
      logger.error('[LanceDBHandlers] Failed to get all chunks', error);
      throw error;
    }
  });

  // 获取所有文件 ID
  ipcMain.handle('lancedb:getFileIds', async () => {
    try {
      const fileIds = await lancedbService.getFileIds();
      logger.info('[LanceDBHandlers] Retrieved file IDs', { count: fileIds.length });
      return fileIds;
    } catch (error) {
      logger.error('[LanceDBHandlers] Failed to get file IDs', error);
      throw error;
    }
  });

  // 获取统计信息
  ipcMain.handle('lancedb:getStats', async () => {
    try {
      const stats = await lancedbService.getStats();
      logger.info('[LanceDBHandlers] Retrieved stats', stats);
      return stats;
    } catch (error) {
      logger.error('[LanceDBHandlers] Failed to get stats', error);
      throw error;
    }
  });

  // 获取文件名到fileId的映射
  ipcMain.handle('lancedb:getFileNameMapping', async () => {
    try {
      const mapping = await lancedbService.getFileNameMapping();
      // 将 Map 转换为普通对象以便 IPC 传输
      const result: Record<string, string[]> = {};
      for (const [key, value] of mapping) {
        result[key] = value;
      }
      logger.info('[LanceDBHandlers] Retrieved file name mapping', { count: Object.keys(result).length });
      return result;
    } catch (error) {
      logger.error('[LanceDBHandlers] Failed to get file name mapping', error);
      throw error;
    }
  });

  // 清理重复文件名的旧版本数据
  ipcMain.handle('lancedb:cleanDuplicateFileNames', async (_event, fileNameToKeepId: Record<string, string>) => {
    try {
      const mapping = new Map(Object.entries(fileNameToKeepId));
      const deletedCount = await lancedbService.cleanDuplicateFileNames(mapping);
      logger.info('[LanceDBHandlers] Cleaned duplicate file names', { deletedCount });
      return deletedCount;
    } catch (error) {
      logger.error('[LanceDBHandlers] Failed to clean duplicate file names', error);
      throw error;
    }
  });

  // 获取文件元数据（fileId -> lastModified 映射）
  ipcMain.handle('lancedb:getFileMetadata', async () => {
    try {
      const metadata = await lancedbService.getFileMetadata();
      // 将 Map 转换为普通对象以便 IPC 传输
      const result: Record<string, number> = {};
      for (const [key, value] of metadata) {
        result[key] = value;
      }
      logger.info('[LanceDBHandlers] Retrieved file metadata', { count: Object.keys(result).length });
      return result;
    } catch (error) {
      logger.error('[LanceDBHandlers] Failed to get file metadata', error);
      throw error;
    }
  });

  logger.info('[LanceDBHandlers] LanceDB IPC handlers registered successfully');
}
