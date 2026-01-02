

import { MarkdownFile, AIConfig, RAGStats } from "../types";
import { getEmbedding } from "./aiService";

export interface Chunk {
  id: string;
  fileId: string;
  text: string;
  embedding?: number[];
  metadata: {
    start: number;
    end: number;
    fileName: string;
  };
}

// Search result with score for display
export interface SearchResult {
  chunk: Chunk;
  score: number;
}

// RAG search response with both formatted context and structured results
export interface RAGSearchResponse {
  context: string;           // Formatted context for AI
  results: SearchResult[];   // Structured results for UI display
  queryTime: number;         // Search time in ms
}

// Configuration
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const MAX_CHUNKS_PER_QUERY = 15; // Number of chunks to retrieve
const MIN_SIMILARITY_THRESHOLD = 0.3; // Only return chunks above this score

// --- Helper: Text Splitter ---
export const splitTextIntoChunks = (file: MarkdownFile): Chunk[] => {
    const text = file.content;
    const chunks: Chunk[] = [];
    
    // Normalized simple splitter
    const cleanText = text.replace(/\r\n/g, '\n');
    
    // First, split by Headers to respect document structure
    const sections = cleanText.split(/(?=^#{1,3}\s)/m);

    sections.forEach(section => {
        if (section.length <= CHUNK_SIZE) {
            if (section.trim()) {
                chunks.push({
                    id: `${file.id}-${chunks.length}`,
                    fileId: file.id,
                    text: section.trim(),
                    metadata: { start: 0, end: 0, fileName: file.name } // Simplified metadata
                });
            }
        } else {
            // Sub-chunk large sections
            for (let i = 0; i < section.length; i += (CHUNK_SIZE - CHUNK_OVERLAP)) {
                let end = Math.min(i + CHUNK_SIZE, section.length);
                // Try to break at newline or period
                if (end < section.length) {
                    const nextPeriod = section.indexOf('.', end - 50);
                    const nextNewline = section.indexOf('\n', end - 50);
                    if (nextPeriod !== -1 && nextPeriod < end + 50) end = nextPeriod + 1;
                    else if (nextNewline !== -1 && nextNewline < end + 50) end = nextNewline + 1;
                }
                
                const chunkText = section.substring(i, end).trim();
                if (chunkText) {
                    chunks.push({
                        id: `${file.id}-${chunks.length}`,
                        fileId: file.id,
                        text: chunkText,
                        metadata: { start: i, end: end, fileName: file.name }
                    });
                }
                if (end >= section.length) break;
            }
        }
    });

    return chunks;
};

// --- Math: Cosine Similarity ---
const cosineSimilarity = (vecA: number[], vecB: number[]) => {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

// --- Class: Client-Side Vector Store ---
export class VectorStore {
    private chunks: Chunk[] = [];
    private fileSignatures: Map<string, number> = new Map(); // fileId -> lastModified
    private isProcessing = false;
    private lastSearchResponse: RAGSearchResponse | null = null;
    private initialized = false; // 标记是否已初始化

    constructor() {
        // 初始化会在 initialize() 异步方法中进行
    }

    /**
     * 检测是否在 Electron 环境
     */
    private isElectron(): boolean {
        return typeof window !== 'undefined' &&
               window.electronAPI?.lancedb !== undefined;
    }

    /**
     * 初始化向量存储（从 LanceDB 加载）
     * 必须在使用 VectorStore 前调用
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        // 如果在 Electron 环境，从 LanceDB 加载向量
        if (this.isElectron()) {
            try {
                console.log('[VectorStore] Initializing from LanceDB...');

                // 初始化 LanceDB
                await window.electronAPI.lancedb.init();

                // 加载所有向量块
                const chunks = await window.electronAPI.lancedb.getAll();

                // 转换 LanceDB 格式到内存格式
                this.chunks = chunks.map((lanceChunk: any) => ({
                    id: lanceChunk.id,
                    fileId: lanceChunk.fileId,
                    text: lanceChunk.content,
                    embedding: lanceChunk.vector,
                    metadata: {
                        start: 0,
                        end: 0,
                        fileName: lanceChunk.fileName
                    }
                }));

                // 从 LanceDB 获取 fileId -> lastModified 映射，用于增量索引判断
                const fileMetadata = await window.electronAPI.lancedb.getFileMetadata();
                for (const [fileId, lastModified] of Object.entries(fileMetadata)) {
                    this.fileSignatures.set(fileId, lastModified);
                }

                const stats = await window.electronAPI.lancedb.getStats();
                console.log('[VectorStore] Initialized from LanceDB', {
                    totalFiles: stats.totalFiles,
                    totalChunks: stats.totalChunks,
                    fileSignaturesLoaded: this.fileSignatures.size
                });
            } catch (e) {
                console.warn('[VectorStore] Failed to load vectors from LanceDB:', e);
                // 出错时继续,使用空的内存存储
            }
        } else {
            console.log('[VectorStore] Running in Web mode, using in-memory storage');
        }

        this.initialized = true;
    }

    /**
     * 检查文件是否需要索引
     * 注意: LanceDB 模式下简化判断,只检查内存中的 fileSignatures
     */
    async needsIndexing(file: MarkdownFile): Promise<boolean> {
        // 在 Electron 环境下,检查内存中的签名
        // 由于 LanceDB 不直接存储 lastModified,我们依赖内存状态
        return this.fileSignatures.get(file.id) !== file.lastModified;
    }

    /**
     * 检查是否有文件需要索引（异步版本）
     */
    async hasFilesToIndex(files: MarkdownFile[]): Promise<boolean> {
        for (const file of files) {
            if (await this.needsIndexing(file)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 主索引方法（使用 LanceDB 持久化）
     * 优化：使用并行嵌入处理提高性能
     */
    async indexFile(file: MarkdownFile, config: AIConfig): Promise<boolean> {
        // 跳过已索引且有效的文件
        if (this.fileSignatures.get(file.id) === file.lastModified) {
            return false; // No update needed
        }

        this.isProcessing = true;
        try {
            // Remove old chunks from memory and LanceDB
            this.chunks = this.chunks.filter(c => c.fileId !== file.id);
            if (this.isElectron()) {
                await window.electronAPI.lancedb.deleteByFile(file.id);
            }

            // Create new chunks
            const newChunks = splitTextIntoChunks(file);

            // 并行嵌入处理（批量优化）
            const BATCH_SIZE = 5; // 每批并行处理 5 个 chunk
            const validChunks: Chunk[] = [];

            for (let i = 0; i < newChunks.length; i += BATCH_SIZE) {
                const batch = newChunks.slice(i, i + BATCH_SIZE);
                const batchResults = await Promise.all(
                    batch.map(async (chunk) => {
                        try {
                            chunk.embedding = await getEmbedding(chunk.text, config);
                            return chunk;
                        } catch (e) {
                            console.warn(`Failed to embed chunk in ${file.name}`, e);
                            return null;
                        }
                    })
                );

                // 过滤掉失败的 embedding
                validChunks.push(...batchResults.filter((c): c is Chunk => c !== null && c.embedding && c.embedding.length > 0));

                // 小延迟避免速率限制（可选，取决于 API 限制）
                if (i + BATCH_SIZE < newChunks.length) {
                    await new Promise(r => setTimeout(r, 100));
                }
            }

            this.chunks.push(...validChunks);
            this.fileSignatures.set(file.id, file.lastModified);

            // 持久化到 LanceDB (Electron 模式)
            if (this.isElectron() && validChunks.length > 0) {
                try {
                    // 转换为 LanceDB VectorChunk 格式，包含 lastModified 用于增量索引判断
                    const lanceChunks = validChunks.map((chunk, idx) => ({
                        id: chunk.id,
                        fileId: chunk.fileId,
                        fileName: chunk.metadata.fileName,
                        content: chunk.text,
                        vector: chunk.embedding || [],
                        chunkIndex: idx,
                        lastModified: file.lastModified  // 存储文件的 lastModified 时间戳
                    }));

                    await window.electronAPI.lancedb.add(lanceChunks);
                    console.log(`[VectorStore] Persisted ${validChunks.length} chunks to LanceDB for file ${file.name}`);
                } catch (e) {
                    console.error('[VectorStore] Failed to persist chunks to LanceDB:', e);
                    // 即使持久化失败,内存中的向量仍然可用
                }
            }

            return true;
        } finally {
            this.isProcessing = false;
        }
    }

    // Enhanced search with structured results (使用 LanceDB 向量搜索)
    async searchWithResults(query: string, config: AIConfig, topK: number = MAX_CHUNKS_PER_QUERY): Promise<RAGSearchResponse> {
        const startTime = Date.now();

        if (this.chunks.length === 0) {
            return { context: "", results: [], queryTime: 0 };
        }

        try {
            const queryEmbedding = await getEmbedding(query, config);
            if (!queryEmbedding || queryEmbedding.length === 0) {
                return { context: "", results: [], queryTime: Date.now() - startTime };
            }

            let scored: { chunk: Chunk; score: number }[];

            // 在 Electron 模式下使用 LanceDB 的向量搜索
            if (this.isElectron()) {
                try {
                    // 使用 LanceDB 的向量搜索 (返回的 score 是距离,需要转换为相似度)
                    const lanceResults = await window.electronAPI.lancedb.search(queryEmbedding, topK);

                    // 转换 LanceDB 结果为内部格式
                    scored = lanceResults.map((lanceChunk: any) => {
                        // LanceDB 返回 L2 距离,转换为相似度分数 (距离越小越相似)
                        // 使用简单的反比转换: score = 1 / (1 + distance)
                        const distance = lanceChunk._distance || 0;
                        const score = 1 / (1 + distance);

                        return {
                            chunk: {
                                id: lanceChunk.id,
                                fileId: lanceChunk.fileId,
                                text: lanceChunk.content,
                                embedding: lanceChunk.vector,
                                metadata: {
                                    start: 0,
                                    end: 0,
                                    fileName: lanceChunk.fileName
                                }
                            },
                            score
                        };
                    });

                    console.log('[VectorStore] LanceDB search completed', { resultCount: scored.length });
                } catch (e) {
                    console.error('[VectorStore] LanceDB search failed, falling back to memory search:', e);
                    // 失败时回退到内存搜索
                    scored = this.searchInMemory(queryEmbedding, topK);
                }
            } else {
                // Web 模式使用内存搜索
                scored = this.searchInMemory(queryEmbedding, topK);
            }

            // Filter by minimum threshold
            const topResults = scored
                .filter(r => r.score >= MIN_SIMILARITY_THRESHOLD)
                .slice(0, topK);

            // Format context for AI
            const context = topResults
                .map(r => `[Source: ${r.chunk.metadata.fileName} (Score: ${r.score.toFixed(2)})]\n${r.chunk.text}`)
                .join("\n\n");

            const response: RAGSearchResponse = {
                context,
                results: topResults,
                queryTime: Date.now() - startTime
            };

            this.lastSearchResponse = response;
            return response;
        } catch (e) {
            console.error("Vector Search Failed", e);
            return { context: "", results: [], queryTime: Date.now() - startTime };
        }
    }

    // 内存向量搜索 (fallback)
    private searchInMemory(queryEmbedding: number[], topK: number): { chunk: Chunk; score: number }[] {
        const scored = this.chunks.map(chunk => ({
            chunk,
            score: chunk.embedding ? cosineSimilarity(queryEmbedding, chunk.embedding) : -1
        }));

        scored.sort((a, b) => b.score - a.score);
        return scored;
    }

    // Legacy search method for backward compatibility
    async search(query: string, config: AIConfig, topK: number = MAX_CHUNKS_PER_QUERY): Promise<string> {
        const response = await this.searchWithResults(query, config, topK);
        return response.context;
    }

    // Get the last search response (for UI display)
    getLastSearchResponse(): RAGSearchResponse | null {
        return this.lastSearchResponse;
    }

    getStats(): RAGStats {
        return {
            totalFiles: this.fileSignatures.size,
            indexedFiles: this.fileSignatures.size, // Approximation
            totalChunks: this.chunks.length,
            isIndexing: this.isProcessing
        };
    }

    /**
     * 从 LanceDB 获取实时统计数据（Electron 模式）
     */
    async getStatsFromDB(): Promise<RAGStats> {
        if (this.isElectron()) {
            try {
                const stats = await window.electronAPI.lancedb.getStats();
                return {
                    totalFiles: stats.totalFiles,
                    indexedFiles: stats.totalFiles,
                    totalChunks: stats.totalChunks,
                    isIndexing: this.isProcessing
                };
            } catch (e) {
                console.error('[VectorStore] Failed to get stats from LanceDB:', e);
            }
        }
        // Fallback to memory stats
        return this.getStats();
    }

    /**
     * 删除指定文件的向量数据
     */
    async deleteByFile(fileId: string): Promise<void> {
        // 清理内存中的chunks
        this.chunks = this.chunks.filter(c => c.fileId !== fileId);
        this.fileSignatures.delete(fileId);

        // 清理 LanceDB (Electron模式)
        if (this.isElectron()) {
            try {
                await window.electronAPI.lancedb.deleteByFile(fileId);
                console.log(`[VectorStore] Deleted vectors for file ${fileId} from LanceDB`);
            } catch (e) {
                console.error('[VectorStore] Failed to delete vectors from LanceDB:', e);
            }
        }
    }

    /**
     * 清空向量存储（同时清空 LanceDB）
     */
    async clear(): Promise<void> {
        this.chunks = [];
        this.fileSignatures.clear();
        this.lastSearchResponse = null;

        // 清空 LanceDB (Electron 模式)
        if (this.isElectron()) {
            try {
                await window.electronAPI.lancedb.clear();
                console.log('[VectorStore] LanceDB vectors cleared');
            } catch (e) {
                console.error('[VectorStore] Failed to clear LanceDB vectors:', e);
            }
        }
    }

    /**
     * 同步清理：删除 LanceDB 中已不存在于文件系统的陈旧数据
     * 同时清理相同 fileName 但不同 fileId 的重复数据（保留当前文件系统中的版本）
     * @param currentFiles 当前文件系统中的文件列表（用于获取 fileName → fileId 映射）
     * @returns 删除的陈旧文件数量
     */
    async syncWithFileSystem(currentFiles: { id: string; name: string }[]): Promise<number> {
        const currentFileIds = currentFiles.map(f => f.id);

        if (!this.isElectron()) {
            // Web 模式下只清理内存
            const staleIds = [...this.fileSignatures.keys()].filter(id => !currentFileIds.includes(id));
            staleIds.forEach(id => {
                this.chunks = this.chunks.filter(c => c.fileId !== id);
                this.fileSignatures.delete(id);
            });
            console.log(`[VectorStore] Cleaned ${staleIds.length} stale files from memory`);
            return staleIds.length;
        }

        try {
            let totalCleaned = 0;

            // Step 1: 清理不存在于文件系统的 fileId
            const lanceFileIds = await window.electronAPI.lancedb.getFileIds();
            const staleFileIds = lanceFileIds.filter((id: string) => !currentFileIds.includes(id));

            if (staleFileIds.length > 0) {
                console.log(`[VectorStore] Found ${staleFileIds.length} stale fileIds in LanceDB, cleaning...`);

                for (const fileId of staleFileIds) {
                    await window.electronAPI.lancedb.deleteByFile(fileId);
                    this.chunks = this.chunks.filter(c => c.fileId !== fileId);
                    this.fileSignatures.delete(fileId);
                }

                console.log(`[VectorStore] Cleaned ${staleFileIds.length} stale fileIds from LanceDB`);
                totalCleaned += staleFileIds.length;
            }

            // Step 2: 清理重复文件名的旧版本数据
            // 构建当前文件系统的 fileName → fileId 映射
            const currentFileNameToId: Record<string, string> = {};
            for (const file of currentFiles) {
                currentFileNameToId[file.name] = file.id;
            }

            // 获取 LanceDB 中的 fileName → fileId[] 映射
            const lanceFileNameMapping = await window.electronAPI.lancedb.getFileNameMapping();

            // 找出需要清理的重复文件名
            const duplicatesToClean: Record<string, string> = {};
            for (const [fileName, fileIds] of Object.entries(lanceFileNameMapping)) {
                if (fileIds.length > 1) {
                    // 有重复，需要保留当前文件系统中的版本
                    const keepId = currentFileNameToId[fileName];
                    if (keepId && fileIds.includes(keepId)) {
                        duplicatesToClean[fileName] = keepId;
                        console.log(`[VectorStore] Found duplicate fileName "${fileName}" with ${fileIds.length} versions, keeping fileId: ${keepId}`);
                    }
                }
            }

            if (Object.keys(duplicatesToClean).length > 0) {
                const cleanedCount = await window.electronAPI.lancedb.cleanDuplicateFileNames(duplicatesToClean);
                console.log(`[VectorStore] Cleaned ${cleanedCount} duplicate fileName entries from LanceDB`);
                totalCleaned += cleanedCount;

                // 同步清理内存
                for (const [fileName, keepId] of Object.entries(duplicatesToClean)) {
                    this.chunks = this.chunks.filter(c => {
                        if (c.metadata.fileName === fileName && c.fileId !== keepId) {
                            this.fileSignatures.delete(c.fileId);
                            return false;
                        }
                        return true;
                    });
                }
            }

            return totalCleaned;
        } catch (e) {
            console.error('[VectorStore] Failed to sync with file system:', e);
            return 0;
        }
    }
}
