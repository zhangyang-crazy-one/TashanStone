import { ipcMain } from 'electron';
import * as lancedbService from '../lancedb/index.js';
import { getMainProcessMemoryService } from '../memory/persistentMemoryService.js';
import { logger } from '../utils/logger.js';
import type { SaveMemoryRequest, SavePermanentMemoryRequest, UpdateMemoryRequest, MemoryFilters, Result } from '../types/ipc.js';
import { success, failure } from '../types/ipc.js';

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

  // 删除指定 ID 的向量
  ipcMain.handle('lancedb:deleteById', async (_, id) => {
    try {
      await lancedbService.deleteById(id);
      logger.info('[LanceDBHandlers] Vector deleted by ID', { id });
    } catch (error) {
      logger.error('[LanceDBHandlers] Failed to delete vector by ID', { id, error });
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

  // 搜索永久记忆
  ipcMain.handle('memory:search', async (_, query: string, limit: number = 5) => {
    try {
      const service = getMainProcessMemoryService();
      const results = await service.searchMemories(query, limit);
      logger.info('[LanceDBHandlers] Memory search completed', { query, resultCount: results.length });
      return results;
    } catch (error) {
      logger.error('[LanceDBHandlers] Memory search failed', { query, error });
      return [];
    }
  });

  // 保存永久记忆
  ipcMain.handle('memory:save', async (_, memory: SaveMemoryRequest) => {
    try {
      const service = getMainProcessMemoryService();

      // 转换 SaveMemoryRequest 为 MemoryDocument
      const memoryId = memory.id || `mem_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const now = Date.now();
      const memoryDocument = {
        id: memoryId,
        filePath: '', // 由 service.generateFileName 生成
        content: memory.content,
        topics: memory.topics || [],
        importance: memory.importance || 'medium',
        sourceSessions: [],
        created: now,
        updated: now,
        title: memory.title,
        summary: memory.summary,
        category: memory.category,
      };

      await service.saveMemory(memoryDocument);
      logger.info('[LanceDBHandlers] Memory saved successfully', { id: memoryId });
      return success(true);
    } catch (error) {
      logger.error('[LanceDBHandlers] Memory save failed', { id: memory?.id, error });
      return failure((error as Error).message);
    }
  });

  // 获取所有记忆
  ipcMain.handle('memory:getAll', async () => {
    try {
      const service = getMainProcessMemoryService();
      const memories = await service.getAllMemories();
      logger.info('[LanceDBHandlers] Get all memories completed', { count: memories.length });
      return memories;
    } catch (error) {
      logger.error('[LanceDBHandlers] Get all memories failed', error);
      return [];
    }
  });

  // 检查记忆文件同步状态
  ipcMain.handle('memory:checkSyncStatus', async () => {
    try {
      const { app } = await import('electron');
      const path = await import('path');
      const fs = await import('fs');
      const memoriesDir = path.join(app.getPath('userData'), '.memories');
      const indexPath = path.join(memoriesDir, '_memories_index.json');

      if (!fs.existsSync(indexPath)) {
        return { needsSync: false, outdatedFiles: [] };
      }

      const indexData = fs.readFileSync(indexPath, 'utf-8');
      const index = JSON.parse(indexData);
      const outdatedFiles: string[] = [];

      for (const memory of index.memories || []) {
        if (fs.existsSync(memory.filePath)) {
          const stats = fs.statSync(memory.filePath);
          const fileMtime = new Date(stats.mtime).getTime();
          const indexedMtime = new Date(memory.updated).getTime();

          if (fileMtime > indexedMtime) {
            outdatedFiles.push(memory.id);
          }
        }
      }

      logger.info('[LanceDBHandlers] Memory sync check completed', {
        totalMemories: index.memories?.length || 0,
        outdatedCount: outdatedFiles.length
      });

      return {
        needsSync: outdatedFiles.length > 0,
        outdatedFiles
      };
    } catch (error) {
      logger.error('[LanceDBHandlers] Failed to check memory sync status', error);
      return { needsSync: false, outdatedFiles: [] };
    }
  });

  // 更新记忆内容
  ipcMain.handle('memory:update', async (_, data: UpdateMemoryRequest) => {
    logger.debug('[LanceDB][memory:update] Received request', { id: data.id });

    try {
      const service = getMainProcessMemoryService();
      const memory = await service.getMemoryById(data.id);

      if (!memory) {
        logger.warn('[LanceDB][memory:update] Memory not found', { id: data.id });
        return failure('Memory not found');
      }

      memory.content = data.content;
      memory.updated = data.updatedAt || Date.now();

      await service.saveMemory(memory);

      logger.info('[LanceDBHandlers] Memory updated successfully', { id: data.id });
      return success(true);
    } catch (error) {
      logger.error('[LanceDBHandlers] Memory update failed', { id: data?.id, error });
      return failure((error as Error).message);
    }
  });

  // 标星/取消标星
  ipcMain.handle('memory:star', async (_, id: string, isStarred: boolean) => {
    logger.debug('[LanceDB][memory:star] Received request', { id, isStarred });

    try {
      const service = getMainProcessMemoryService();
      const memory = await service.getMemoryById(id);

      if (!memory) {
        logger.warn('[LanceDB][memory:star] Memory not found', { id });
        return failure('Memory not found');
      }

      memory.importance = isStarred ? 'high' : 'medium';
      await service.saveMemory(memory);

      logger.info('[LanceDBHandlers] Memory starred toggled', { id, isStarred });
      return success(true);
    } catch (error) {
      logger.error('[LanceDBHandlers] Memory star toggle failed', { id, error });
      return failure((error as Error).message);
    }
  });

  // 获取所有记忆（带筛选）
  ipcMain.handle('memory:getMemories', async (_, filters?: MemoryFilters) => {
    try {
      const service = getMainProcessMemoryService();
      let memories = await service.getAllMemories();

      if (filters) {
        if (filters.isStarred !== undefined) {
          memories = memories.filter(m => m.importance === 'high');
        }
        if (filters.importance) {
          memories = memories.filter(m => m.importance === filters.importance);
        }
      }

      return memories;
    } catch (error) {
      logger.error('[LanceDBHandlers] Get memories failed', error);
      return [];
    }
  });

  // 获取中期记忆（用于自动升级）
  ipcMain.handle('memory:getMidTermMemories', async () => {
    try {
      const { chatRepository } = await import('../database/repositories/chatRepository.js');
      const sessions = chatRepository.getAllCompactedSessions();
      
      const memories = sessions.map(session => ({
        id: session.id,
        sessionId: session.session_id,
        summary: session.summary,
        content: session.summary,
        topics: session.key_topics || [],
        createdAt: session.created_at,
        lastAccessedAt: session.created_at,
        accessCount: 0,
        isStarred: session.decisions?.length > 0,
      }));

      logger.info('[LanceDBHandlers] Retrieved mid-term memories', { count: memories.length });
      return memories;
    } catch (error) {
      logger.error('[LanceDBHandlers] Failed to get mid-term memories', error);
      return [];
    }
  });

  // 获取所有标星记忆
  ipcMain.handle('memory:getStarredMemories', async () => {
    try {
      const service = getMainProcessMemoryService();
      const memories = await service.getAllMemories();
      
      const starredMemories = memories
        .filter(m => m.importance === 'high')
        .map(m => ({
          id: m.id,
          sessionId: m.sourceSessions?.[0] || '',
          summary: m.content.substring(0, 200),
          content: m.content,
          topics: m.topics,
          createdAt: m.created,
          lastAccessedAt: m.updated,
          accessCount: 0,
          isStarred: true,
        }));

      logger.info('[LanceDBHandlers] Retrieved starred memories', { count: starredMemories.length });
      return starredMemories;
    } catch (error) {
      logger.error('[LanceDBHandlers] Failed to get starred memories', error);
      return [];
    }
  });

  // 保存永久记忆（带完整模板）
  ipcMain.handle('memory:savePermanent', async (_, memoryData: SavePermanentMemoryRequest) => {
    try {
      const service = getMainProcessMemoryService();
      const { app } = await import('electron');
      const p = await import('path');
      
      // 生成唯一 ID 和文件名
      const memoryId = memoryData.id || `permanent_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const fileName = `${memoryId}.md`;
      const filePath = p.join(app.getPath('userData'), '.memories', fileName);
      
      // 提取标题（从内容或提供）
      let title = memoryData.title;
      if (!title && memoryData.content) {
        const titleMatch = memoryData.content.match(/^#\s+(.+)$/m);
        title = titleMatch ? titleMatch[1].substring(0, 100) : memoryData.content.substring(0, 50);
      }
      title = title || 'Untitled Memory';
      
      // 构建完整的记忆对象（匹配 PermanentMemoryTemplate）
      const memory = {
        id: memoryId,
        title,
        filePath,
        content: memoryData.content,
        summary: memoryData.summary || memoryData.content?.substring(0, 200),
        sourcePath: memoryData.sourcePath || '',
        sourceType: memoryData.sourceType || 'manual',
        created: memoryData.createdAt || Date.now(),
        updated: Date.now(),
        lastAccessedAt: Date.now(),
        topics: memoryData.topics || [],
        category: memoryData.category,
        importance: memoryData.importance || 'medium',
        isStarred: memoryData.isStarred || false,
        accessCount: 0,
        sourceSessions: memoryData.promotedFrom ? [memoryData.promotedFrom] : [],
        promotedFrom: memoryData.promotedFrom || undefined,
        promotedAt: memoryData.promotedAt || undefined,
      };
      
      await service.saveMemory(memory);
      logger.info('[LanceDBHandlers] Permanent memory saved', { id: memoryId, title });
      return success({ id: memoryId });
    } catch (error) {
      logger.error('[LanceDBHandlers] Save permanent memory failed', error);
      return failure((error as Error).message);
    }
  });

  // 标记为已升级
  ipcMain.handle('memory:markAsPromoted', async (_, originalId: string) => {
    try {
      const service = getMainProcessMemoryService();
      
      const originalMemory = await service.getMemoryById(originalId);
      
      if (originalMemory) {
        originalMemory.promotedFrom = originalId;
        originalMemory.promotedAt = Date.now();
        originalMemory.importance = 'high';
        originalMemory.isStarred = true;
        await service.saveMemory(originalMemory);
        logger.info('[LanceDBHandlers] Memory marked as promoted', { originalId });
      } else {
        logger.warn('[LanceDBHandlers] Memory not found for promotion', { originalId });
      }
      
      return success(true);
    } catch (error) {
      logger.error('[LanceDBHandlers] Mark as promoted failed', error);
      return failure((error as Error).message);
    }
  });

  logger.info('[LanceDBHandlers] LanceDB IPC handlers registered successfully');
}
