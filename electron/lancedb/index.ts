// LanceDB 延迟加载 - 避免静态导入导致启动崩溃
import path from 'path';
import { app } from 'electron';
import { logger } from '../utils/logger.js';
import Module from 'module';

// 类型声明（避免导入 lancedb 模块）
type LanceDBModule = typeof import('@lancedb/lancedb');
type Connection = Awaited<ReturnType<LanceDBModule['connect']>>;
type Table = Awaited<ReturnType<Connection['openTable']>>;
type ModuleWithNodePaths = typeof Module & {
  _nodeModulePaths?: ((from: string) => string[]) | string[];
};
type ProcessWithResourcesPath = NodeJS.Process & { resourcesPath?: string };

/**
 * LanceDB 向量块数据结构
 */
export interface VectorChunk {
  id: string;
  fileId: string;
  fileName: string;
  content: string;
  vector: number[];
  chunkIndex: number;
  lastModified?: number; // 文件的 lastModified 时间戳，用于增量索引判断
  [key: string]: unknown; // 添加索引签名以满足 LanceDB 类型要求
}

// LanceDB 模块实例（延迟加载）
let lancedb: LanceDBModule | null = null;
let db: Connection | null = null;
let vectorTable: Table | null = null;
let isAvailable = false;
let initError: Error | null = null;
let modulePathsConfigured = false;

const TABLE_NAME = 'vectors';

/**
 * 配置模块搜索路径，确保能够找到 unpacked 目录中的模块
 * 这是解决 apache-arrow 等纯 JS 模块在打包后无法找到的关键
 */
function configureModulePaths(): void {
  if (modulePathsConfigured) return;

  try {
    // 获取 resources 路径（打包后为 app.asar 所在目录）
    const resourcesPath = (process as ProcessWithResourcesPath).resourcesPath;

    if (resourcesPath) {
      // 在打包环境中，添加 unpacked 目录到模块搜索路径
      const unpackedModules = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules');
      const asarModules = path.join(resourcesPath, 'app.asar', 'node_modules');

      logger.info('[LanceDB] Configuring module paths for packaged environment', {
        resourcesPath,
        unpackedModules,
        asarModules
      });

      // 将 unpacked 目录添加到模块搜索路径的最前面
      // 这样 @lancedb 的原生模块在 require('apache-arrow') 时能找到它
      const moduleWithPaths = Module as ModuleWithNodePaths;
      if (typeof moduleWithPaths._nodeModulePaths === 'function') {
        // 使用 monkey-patch 来添加路径
        const originalPaths = moduleWithPaths._nodeModulePaths;
        moduleWithPaths._nodeModulePaths = function(from: string) {
          const paths = originalPaths.call(this, from);
          // 在返回的路径数组前面添加 unpacked 目录
          if (!paths.includes(unpackedModules)) {
            paths.unshift(unpackedModules);
          }
          return paths;
        };
      }

      // 同时也修改 module.paths
      if (!module.paths.includes(unpackedModules)) {
        module.paths.unshift(unpackedModules);
      }
      if (!module.paths.includes(asarModules)) {
        module.paths.unshift(asarModules);
      }

      logger.info('[LanceDB] Module paths configured', { paths: module.paths.slice(0, 5) });
    } else {
      logger.info('[LanceDB] Running in development mode, no path configuration needed');
    }

    modulePathsConfigured = true;
  } catch (error) {
    logger.error('[LanceDB] Failed to configure module paths', error);
  }
}

/**
 * 延迟加载 LanceDB 模块
 */
async function loadLanceDB(): Promise<LanceDBModule> {
  if (lancedb) return lancedb;

  try {
    // 首先配置模块搜索路径
    configureModulePaths();

    // 动态导入 LanceDB 模块
    logger.info('[LanceDB] Attempting to load @lancedb/lancedb module...');
    lancedb = await import('@lancedb/lancedb');
    logger.info('[LanceDB] Module loaded successfully');
    return lancedb;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('[LanceDB] Failed to load module', {
      message: err.message,
      stack: err.stack,
      resourcesPath: (process as ProcessWithResourcesPath).resourcesPath,
      modulePaths: module.paths.slice(0, 5)
    });
    initError = err;
    throw error;
  }
}

/**
 * 检查 LanceDB 是否可用
 */
export function isLanceDBAvailable(): boolean {
  return isAvailable;
}

/**
 * 获取 LanceDB 初始化错误
 */
export function getLanceDBError(): Error | null {
  return initError;
}

/**
 * 初始化 LanceDB 连接
 */
export async function initLanceDB(): Promise<void> {
  try {
    // 尝试加载模块
    const lance = await loadLanceDB();

    const dbPath = path.join(app.getPath('userData'), 'lancedb');
    logger.info('[LanceDB] Initializing database', { dbPath });

    db = await lance.connect(dbPath);

    // 尝试打开现有表，如果不存在则创建空表
    const tables = await db.tableNames();
    if (tables.includes(TABLE_NAME)) {
      vectorTable = await db.openTable(TABLE_NAME);
      logger.info('[LanceDB] Opened existing table', { tableName: TABLE_NAME });

      // 检查 schema 是否需要迁移（是否有 lastModified 字段）
      const needsMigration = await checkSchemaMigration();
      if (needsMigration) {
        logger.warn('[LanceDB] Schema migration required - dropping old table');
        await db.dropTable(TABLE_NAME);
        vectorTable = null;
        logger.info('[LanceDB] Old table dropped, will be recreated with new schema on next index');
      }
    } else {
      logger.info('[LanceDB] Table does not exist, will be created on first add');
    }

    isAvailable = true;
    initError = null;
  } catch (error) {
    isAvailable = false;
    initError = error instanceof Error ? error : new Error(String(error));
    logger.error('[LanceDB] Failed to initialize', error);
    // 不抛出错误，让应用继续运行
    logger.warn('[LanceDB] LanceDB is not available, vector search will be disabled');
  }
}

/**
 * 检查是否需要 schema 迁移
 * 通过检查第一行数据是否有 lastModified 字段来判断
 */
async function checkSchemaMigration(): Promise<boolean> {
  if (!vectorTable) return false;

  try {
    const sample = await vectorTable.query().limit(1).toArray();
    if (sample.length === 0) {
      // 空表不需要迁移
      return false;
    }

    const firstRow = sample[0];
    // 如果没有 lastModified 字段，需要迁移
    if (firstRow.lastModified === undefined) {
      logger.info('[LanceDB] Schema migration needed: lastModified field missing');
      return true;
    }

    return false;
  } catch (error) {
    logger.error('[LanceDB] Failed to check schema migration', error);
    return false;
  }
}

/**
 * 添加向量数据到 LanceDB
 */
export async function addVectors(chunks: VectorChunk[]): Promise<void> {
  if (!isAvailable || !db) {
    throw new Error('LanceDB not available');
  }

  if (chunks.length === 0) {
    logger.warn('[LanceDB] No chunks to add');
    return;
  }

  try {
    if (!vectorTable) {
      // 首次创建表 - 使用正确的 API 签名
      const rows = chunks as Record<string, unknown>[];
      vectorTable = await db.createTable(TABLE_NAME, rows);
      logger.info('[LanceDB] Created new table', { tableName: TABLE_NAME, chunkCount: chunks.length });
    } else {
      const rows = chunks as Record<string, unknown>[];
      await vectorTable.add(rows);
      logger.info('[LanceDB] Added chunks', { chunkCount: chunks.length });
    }
  } catch (error) {
    logger.error('[LanceDB] Failed to add vectors', error);
    throw error;
  }
}

/**
 * 向量相似度搜索
 */
export async function searchVectors(queryVector: number[], limit: number = 5): Promise<VectorChunk[]> {
  if (!isAvailable || !vectorTable) {
    logger.warn('[LanceDB] No table available for search');
    return [];
  }

  try {
    const rawResults = await vectorTable
      .search(queryVector)
      .limit(limit)
      .toArray();

    // 序列化为可通过 IPC 传输的格式
    const results = rawResults.map(serializeChunk);
    logger.info('[LanceDB] Search completed', { resultCount: results.length, limit });
    return results;
  } catch (error) {
    logger.error('[LanceDB] Search failed', error);
    return [];
  }
}

/**
 * 删除指定文件的所有向量数据
 */
export async function deleteByFile(fileId: string): Promise<void> {
  if (!isAvailable || !vectorTable || !db) {
    logger.warn('[LanceDB] No table available for deletion');
    return;
  }

  try {
    // Log count before deletion
    const beforeChunks = await vectorTable.query().toArray() as VectorChunk[];
    const beforeCount = beforeChunks.length;
    const beforeFileIds = new Set(beforeChunks.map(c => c.fileId));
    const hasTargetFile = beforeFileIds.has(fileId);
    logger.debug('[LanceDB] Before deletion', {
      chunkCount: beforeCount,
      fileIdsCount: beforeFileIds.size,
      hasTargetFile,
      targetFileId: fileId
    });

    await vectorTable.delete(`\`fileId\` = '${fileId}'`);
    logger.info('[LanceDB] Deleted vectors for file', { fileId });

    // Optimize table to materialize deletions (remove tombstones)
    try {
      const optimizeStats = await vectorTable.optimize({
        cleanupOlderThan: new Date()
      });
      logger.debug('[LanceDB] Optimization completed', optimizeStats);
    } catch (optimizeError) {
      logger.warn('[LanceDB] Optimization failed, continuing anyway', optimizeError);
    }

    // Re-open table to ensure fresh data in subsequent queries
    vectorTable = await db.openTable(TABLE_NAME);

    const afterChunks = await vectorTable.query().toArray() as VectorChunk[];
    const afterCount = afterChunks.length;
    logger.debug('[LanceDB] After deletion and optimization', {
      chunkCount: afterCount,
      chunksDeleted: beforeCount - afterCount
    });
  } catch (error) {
    logger.error('[LanceDB] Failed to delete vectors', { fileId, error });
    throw error;
  }
}

/**
 * 删除指定 ID 的向量数据
 */
export async function deleteById(id: string): Promise<void> {
  if (!isAvailable || !vectorTable || !db) {
    logger.warn('[LanceDB] No table available for deletion by ID');
    return;
  }

  try {
    logger.info('[LanceDB] Deleting vector by ID', { id });
    await vectorTable.delete(`\`id\` = '${id}'`);

    // Optimize table to materialize deletions
    try {
      await vectorTable.optimize({
        cleanupOlderThan: new Date()
      });
    } catch (optimizeError) {
      logger.warn('[LanceDB] Optimization failed after deleteById', optimizeError);
    }

    // Re-open table to ensure fresh data
    vectorTable = await db.openTable(TABLE_NAME);
    logger.info('[LanceDB] Deleted vector by ID successfully', { id });
  } catch (error) {
    logger.error('[LanceDB] Failed to delete vector by ID', { id, error });
    throw error;
  }
}

/**
 * 清空所有向量数据
 */
export async function clearAll(): Promise<void> {
  if (!isAvailable || !db) {
    logger.warn('[LanceDB] Database not initialized, nothing to clear');
    return;
  }

  try {
    const tables = await db.tableNames();
    if (tables.includes(TABLE_NAME)) {
      await db.dropTable(TABLE_NAME);
      vectorTable = null;
      logger.info('[LanceDB] Table dropped', { tableName: TABLE_NAME });
    }
  } catch (error) {
    logger.error('[LanceDB] Failed to clear all', error);
    throw error;
  }
}

/**
 * 将 LanceDB 结果转换为可序列化的对象（处理 Float32Array 等类型）
 */
function serializeChunk(chunk: any): VectorChunk {
  return {
    id: chunk.id,
    fileId: chunk.fileId,
    fileName: chunk.fileName,
    content: chunk.content,
    vector: Array.isArray(chunk.vector) ? chunk.vector : Array.from(chunk.vector || []),
    chunkIndex: chunk.chunkIndex,
    lastModified: chunk.lastModified
  };
}

/**
 * 获取所有向量块数据
 */
export async function getAllChunks(): Promise<VectorChunk[]> {
  if (!isAvailable || !vectorTable) {
    logger.warn('[LanceDB] No table available, returning empty array');
    return [];
  }

  try {
    // 使用 query 方法获取所有数据
    const rawChunks = await vectorTable.query().toArray();
    // 序列化为可通过 IPC 传输的格式
    const chunks = rawChunks.map(serializeChunk);
    logger.info('[LanceDB] Retrieved all chunks', { count: chunks.length });
    return chunks;
  } catch (error) {
    logger.error('[LanceDB] Failed to get all chunks', error);
    return [];
  }
}

/**
 * 获取所有已索引的文件ID列表
 */
export async function getFileIds(): Promise<string[]> {
  if (!isAvailable || !vectorTable) {
    logger.warn('[LanceDB] No table available, returning empty file IDs');
    return [];
  }

  try {
    const chunks = await vectorTable.query().toArray() as VectorChunk[];
    const fileIds = [...new Set(chunks.map(c => c.fileId))];
    logger.info('[LanceDB] Retrieved file IDs', { count: fileIds.length });
    return fileIds;
  } catch (error) {
    logger.error('[LanceDB] Failed to get file IDs', error);
    return [];
  }
}

/**
 * 获取向量存储统计信息
 */
export async function getStats(): Promise<{ totalFiles: number; totalChunks: number; isAvailable: boolean }> {
  if (!isAvailable || !vectorTable) {
    return { totalFiles: 0, totalChunks: 0, isAvailable: false };
  }

  try {
    const chunks = await vectorTable.query().toArray() as VectorChunk[];
    const totalChunks = chunks.length;
    const totalFiles = new Set(chunks.map(c => c.fileId)).size;

    logger.info('[LanceDB] Stats retrieved', { totalFiles, totalChunks });
    return { totalFiles, totalChunks, isAvailable: true };
  } catch (error) {
    logger.error('[LanceDB] Failed to get stats', error);
    return { totalFiles: 0, totalChunks: 0, isAvailable: false };
  }
}

/**
 * 获取所有文件名到fileId的映射（用于检测重复文件名）
 */
export async function getFileNameMapping(): Promise<Map<string, string[]>> {
  if (!isAvailable || !vectorTable) {
    logger.warn('[LanceDB] No table available, returning empty mapping');
    return new Map();
  }

  try {
    const chunks = await vectorTable.query().toArray() as VectorChunk[];
    const mapping = new Map<string, string[]>();

    for (const chunk of chunks) {
      const fileName = chunk.fileName;
      const fileId = chunk.fileId;
      if (!mapping.has(fileName)) {
        mapping.set(fileName, []);
      }
      const ids = mapping.get(fileName)!;
      if (!ids.includes(fileId)) {
        ids.push(fileId);
      }
    }

    logger.info('[LanceDB] File name mapping retrieved', {
      uniqueFileNames: mapping.size,
      totalFileIds: [...mapping.values()].reduce((sum, ids) => sum + ids.length, 0)
    });

    return mapping;
  } catch (error) {
    logger.error('[LanceDB] Failed to get file name mapping', error);
    return new Map();
  }
}

/**
 * 清理重复文件名的旧版本数据
 * 对于每个文件名，只保留指定的 fileId，删除其他重复的
 * @param fileNameToKeepId 文件名到要保留的fileId的映射
 */
export async function cleanDuplicateFileNames(fileNameToKeepId: Map<string, string>): Promise<number> {
  if (!isAvailable || !vectorTable || !db) {
    logger.warn('[LanceDB] No table available, nothing to clean');
    return 0;
  }

  try {
    const currentMapping = await getFileNameMapping();
    let deletedCount = 0;

    for (const [fileName, keepFileId] of fileNameToKeepId) {
      const existingIds = currentMapping.get(fileName) || [];
      // 删除所有不是 keepFileId 的重复数据
      for (const existingId of existingIds) {
        if (existingId !== keepFileId) {
          await vectorTable.delete(`\`fileId\` = '${existingId}'`);
          logger.info('[LanceDB] Deleted duplicate file data', { fileName, deletedFileId: existingId, keptFileId: keepFileId });
          deletedCount++;
        }
      }
    }

    // Optimize and refresh table after deletions
    if (deletedCount > 0) {
      // Optimize table to materialize deletions (remove tombstones)
      try {
        const optimizeStats = await vectorTable.optimize({
          cleanupOlderThan: new Date()
        });
        logger.debug('[LanceDB] Optimization completed after cleaning duplicates', optimizeStats);
      } catch (optimizeError) {
        logger.warn('[LanceDB] Optimization failed, continuing anyway', optimizeError);
      }

      // Re-open table to ensure fresh data in subsequent queries
      vectorTable = await db.openTable(TABLE_NAME);
      logger.debug('[LanceDB] Table refreshed after cleaning duplicates');
    }

    return deletedCount;
  } catch (error) {
    logger.error('[LanceDB] Failed to clean duplicate file names', error);
    return 0;
  }
}

/**
 * 获取所有文件的元数据（fileId -> lastModified 映射）
 * 用于初始化时恢复 fileSignatures，实现增量索引
 */
export async function getFileMetadata(): Promise<Map<string, number>> {
  if (!isAvailable || !vectorTable) {
    logger.warn('[LanceDB] No table available, returning empty metadata');
    return new Map();
  }

  try {
    const chunks = await vectorTable.query().toArray() as VectorChunk[];
    const metadata = new Map<string, number>();

    for (const chunk of chunks) {
      // 每个 fileId 只需要记录一次 lastModified（所有 chunks 的 lastModified 应该相同）
      if (!metadata.has(chunk.fileId) && chunk.lastModified !== undefined) {
        metadata.set(chunk.fileId, chunk.lastModified);
      }
    }

    logger.info('[LanceDB] File metadata retrieved', {
      totalFiles: metadata.size,
      sampleData: [...metadata.entries()].slice(0, 3)
    });

    return metadata;
  } catch (error) {
    logger.error('[LanceDB] Failed to get file metadata', error);
    return new Map();
  }
}
