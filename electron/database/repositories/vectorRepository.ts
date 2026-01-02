import { getDatabase } from '../index.js';
import { logger } from '../../utils/logger.js';

/**
 * 数据库中的向量块行数据
 */
interface VectorChunkRow {
    id: string;
    file_id: string;
    chunk_index: number;
    text: string;
    embedding: Buffer | null;
    chunk_start: number;
    chunk_end: number;
    file_name: string;
    file_last_modified: number;
    created_at: number;
}

/**
 * 向量块对象（用于应用层）
 */
export interface VectorChunk {
    id: string;
    fileId: string;
    chunkIndex: number;
    text: string;
    embedding: number[] | null;
    metadata: {
        start: number;
        end: number;
        fileName: string;
    };
    fileLastModified: number;
}

/**
 * 向量索引元数据行数据
 */
interface IndexMetaRow {
    file_id: string;
    last_modified: number;
    chunk_count: number;
    indexed_at: number;
    embedding_model: string | null;
    embedding_provider: string | null;
}

/**
 * 向量索引元数据对象
 */
export interface IndexMeta {
    fileId: string;
    lastModified: number;
    chunkCount: number;
    indexedAt: number;
    embeddingModel?: string;
    embeddingProvider?: string;
}

/**
 * 向量存储数据访问层
 * 负责向量块和索引元数据的 CRUD 操作
 */
export class VectorRepository {
    /**
     * 检查文件是否需要重新索引
     * @param fileId 文件ID
     * @param lastModified 文件最后修改时间
     * @returns true 表示需要索引，false 表示已是最新
     */
    needsIndexing(fileId: string, lastModified: number): boolean {
        const db = getDatabase();
        try {
            const meta = db.prepare(`
                SELECT last_modified
                FROM vector_index_meta
                WHERE file_id = ?
            `).get(fileId) as { last_modified: number } | undefined;

            // 如果没有元数据或文件已修改，则需要索引
            return !meta || meta.last_modified !== lastModified;
        } catch (error) {
            logger.error('needsIndexing failed', { fileId, error });
            return true; // 出错时安全起见，返回需要索引
        }
    }

    /**
     * 获取指定文件的所有向量块
     * @param fileId 文件ID
     * @returns 向量块数组
     */
    getChunksByFile(fileId: string): VectorChunk[] {
        const db = getDatabase();
        try {
            const rows = db.prepare(`
                SELECT id, file_id, chunk_index, text, embedding,
                       chunk_start, chunk_end, file_name, file_last_modified, created_at
                FROM vector_chunks
                WHERE file_id = ?
                ORDER BY chunk_index ASC
            `).all(fileId) as VectorChunkRow[];

            return rows.map(this.rowToChunk);
        } catch (error) {
            logger.error('getChunksByFile failed', { fileId, error });
            return [];
        }
    }

    /**
     * 获取所有向量块（带分页，用于初始化向量存储）
     * @param limit 每页数量，默认 1000
     * @param offset 偏移量，默认 0
     * @returns 分页的向量块数组
     */
    getAllChunksPaginated(limit: number = 1000, offset: number = 0): VectorChunk[] {
        const db = getDatabase();
        try {
            const rows = db.prepare(`
                SELECT id, file_id, chunk_index, text, embedding,
                       chunk_start, chunk_end, file_name, file_last_modified, created_at
                FROM vector_chunks
                ORDER BY file_id, chunk_index ASC
                LIMIT ? OFFSET ?
            `).all(limit, offset) as VectorChunkRow[];

            return rows.map(this.rowToChunk);
        } catch (error) {
            logger.error('getAllChunksPaginated failed', { limit, offset, error });
            return [];
        }
    }

    /**
     * 获取所有向量块总数
     * @returns 总数
     */
    getAllChunksCount(): number {
        const db = getDatabase();
        try {
            const result = db.prepare(`SELECT COUNT(*) as count FROM vector_chunks`).get() as { count: number };
            return result.count;
        } catch (error) {
            logger.error('getAllChunksCount failed', { error });
            return 0;
        }
    }

    /**
     * 获取所有向量块（用于初始化向量存储）
     * @returns 所有向量块数组
     */
    getAllChunks(): VectorChunk[] {
        return this.getAllChunksPaginated(10000, 0);
    }

    /**
     * 保存文件的向量块（使用事务确保原子性）
     * @param fileId 文件ID
     * @param chunks 向量块数组
     * @param lastModified 文件最后修改时间
     * @param model 嵌入模型名称（可选）
     * @param provider 嵌入提供商（可选）
     */
    saveChunks(
        fileId: string,
        chunks: VectorChunk[],
        lastModified: number,
        model?: string,
        provider?: string
    ): void {
        const db = getDatabase();
        const transaction = db.transaction(() => {
            try {
                // 1. 删除该文件的旧向量块（CASCADE 会自动清理）
                db.prepare('DELETE FROM vector_chunks WHERE file_id = ?').run(fileId);

                // 2. 插入新的向量块
                const insertChunk = db.prepare(`
                    INSERT INTO vector_chunks (
                        id, file_id, chunk_index, text, embedding,
                        chunk_start, chunk_end, file_name, file_last_modified
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                for (const chunk of chunks) {
                    // 将 embedding 从 number[] 转换为 Buffer
                    const embeddingBuffer = chunk.embedding
                        ? Buffer.from(new Float32Array(chunk.embedding).buffer)
                        : null;

                    insertChunk.run(
                        chunk.id,
                        chunk.fileId,
                        chunk.chunkIndex,
                        chunk.text,
                        embeddingBuffer,
                        chunk.metadata.start,
                        chunk.metadata.end,
                        chunk.metadata.fileName,
                        chunk.fileLastModified
                    );
                }

                // 3. 更新或插入索引元数据
                db.prepare(`
                    INSERT OR REPLACE INTO vector_index_meta (
                        file_id, last_modified, chunk_count, embedding_model, embedding_provider
                    ) VALUES (?, ?, ?, ?, ?)
                `).run(fileId, lastModified, chunks.length, model || null, provider || null);

                logger.debug('saveChunks transaction completed', {
                    fileId,
                    chunkCount: chunks.length,
                    model,
                    provider
                });
            } catch (error) {
                logger.error('saveChunks transaction failed', { fileId, error });
                throw error; // 回滚事务
            }
        });

        // 执行事务
        transaction();
    }

    /**
     * 删除指定文件的所有向量块
     * @param fileId 文件ID
     */
    deleteByFile(fileId: string): void {
        const db = getDatabase();
        try {
            // 使用事务确保元数据和向量块都被删除
            const transaction = db.transaction(() => {
                db.prepare('DELETE FROM vector_chunks WHERE file_id = ?').run(fileId);
                db.prepare('DELETE FROM vector_index_meta WHERE file_id = ?').run(fileId);
            });

            transaction();
            logger.debug('deleteByFile completed', { fileId });
        } catch (error) {
            logger.error('deleteByFile failed', { fileId, error });
            throw error;
        }
    }

    /**
     * 获取所有索引元数据
     * @returns 索引元数据数组
     */
    getIndexMeta(): IndexMeta[] {
        const db = getDatabase();
        try {
            const rows = db.prepare(`
                SELECT file_id, last_modified, chunk_count, indexed_at,
                       embedding_model, embedding_provider
                FROM vector_index_meta
                ORDER BY indexed_at DESC
            `).all() as IndexMetaRow[];

            return rows.map(this.rowToMeta);
        } catch (error) {
            logger.error('getIndexMeta failed', { error });
            return [];
        }
    }

    /**
     * 清空所有向量数据
     */
    clearAll(): void {
        const db = getDatabase();
        try {
            const transaction = db.transaction(() => {
                db.prepare('DELETE FROM vector_chunks').run();
                db.prepare('DELETE FROM vector_index_meta').run();
            });

            transaction();
            logger.info('clearAll completed - all vector data deleted');
        } catch (error) {
            logger.error('clearAll failed', { error });
            throw error;
        }
    }

    /**
     * 获取统计信息
     */
    getStats(): { totalFiles: number; totalChunks: number } {
        const db = getDatabase();
        try {
            const result = db.prepare(`
                SELECT
                    COUNT(DISTINCT file_id) as file_count,
                    COUNT(*) as chunk_count
                FROM vector_chunks
            `).get() as { file_count: number; chunk_count: number };

            return {
                totalFiles: result.file_count,
                totalChunks: result.chunk_count
            };
        } catch (error) {
            logger.error('getStats failed', { error });
            return { totalFiles: 0, totalChunks: 0 };
        }
    }

    /**
     * 将数据库行转换为 VectorChunk 对象
     * 关键：将 BLOB 转换回 number[]
     */
    private rowToChunk(row: VectorChunkRow): VectorChunk {
        let embedding: number[] | null = null;

        // 将 Buffer 转换为 Float32Array 再转为 number[]
        if (row.embedding && row.embedding.length > 0) {
            try {
                const float32Array = new Float32Array(
                    row.embedding.buffer,
                    row.embedding.byteOffset,
                    row.embedding.length / 4 // Float32 占用 4 字节
                );
                embedding = Array.from(float32Array);
            } catch (error) {
                logger.warn('Failed to parse embedding', { chunkId: row.id, error });
            }
        }

        return {
            id: row.id,
            fileId: row.file_id,
            chunkIndex: row.chunk_index,
            text: row.text,
            embedding,
            metadata: {
                start: row.chunk_start,
                end: row.chunk_end,
                fileName: row.file_name
            },
            fileLastModified: row.file_last_modified
        };
    }

    /**
     * 将元数据行转换为 IndexMeta 对象
     */
    private rowToMeta(row: IndexMetaRow): IndexMeta {
        return {
            fileId: row.file_id,
            lastModified: row.last_modified,
            chunkCount: row.chunk_count,
            indexedAt: row.indexed_at,
            embeddingModel: row.embedding_model || undefined,
            embeddingProvider: row.embedding_provider || undefined
        };
    }
}

/**
 * 单例实例导出
 */
export const vectorRepository = new VectorRepository();
