

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

// Configuration
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const MAX_CHUNKS_PER_QUERY = 15; // Number of chunks to retrieve

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

    constructor() {
        // Try loading from session storage? (Optional optimization, skipping for now to keep it simple)
    }

    // Main indexing method
    async indexFile(file: MarkdownFile, config: AIConfig): Promise<boolean> {
        // Skip if already indexed and valid
        if (this.fileSignatures.get(file.id) === file.lastModified) {
            return false; // No update needed
        }

        this.isProcessing = true;
        try {
            // Remove old chunks
            this.chunks = this.chunks.filter(c => c.fileId !== file.id);

            // Create new chunks
            const newChunks = splitTextIntoChunks(file);

            // Embed chunks (Batching is ideal, but let's do sequential for safety with rate limits)
            for (const chunk of newChunks) {
                try {
                    // Rate limit guard (simple delay)
                    await new Promise(r => setTimeout(r, 200)); 
                    chunk.embedding = await getEmbedding(chunk.text, config);
                } catch (e) {
                    console.warn(`Failed to embed chunk in ${file.name}`, e);
                    // We keep the chunk without embedding? Or skip?
                    // Skip for vector search, but maybe keep text? 
                    // Better to skip if vector search is the goal.
                }
            }

            // Filter out failed embeddings
            const validChunks = newChunks.filter(c => c.embedding && c.embedding.length > 0);
            this.chunks.push(...validChunks);
            this.fileSignatures.set(file.id, file.lastModified);
            
            return true;
        } finally {
            this.isProcessing = false;
        }
    }

    async search(query: string, config: AIConfig, topK: number = MAX_CHUNKS_PER_QUERY): Promise<string> {
        if (this.chunks.length === 0) return "";

        try {
            const queryEmbedding = await getEmbedding(query, config);
            if (!queryEmbedding || queryEmbedding.length === 0) return "";

            // Score chunks
            const scored = this.chunks.map(chunk => ({
                chunk,
                score: chunk.embedding ? cosineSimilarity(queryEmbedding, chunk.embedding) : -1
            }));

            // Sort and Top K
            scored.sort((a, b) => b.score - a.score);
            const topResults = scored.slice(0, topK);

            // Format Output
            return topResults
                .map(r => `[Source: ${r.chunk.metadata.fileName} (Score: ${r.score.toFixed(2)})]\n${r.chunk.text}`)
                .join("\n\n");
        } catch (e) {
            console.error("Vector Search Failed", e);
            return "";
        }
    }

    getStats(): RAGStats {
        return {
            totalFiles: this.fileSignatures.size,
            indexedFiles: this.fileSignatures.size, // Approximation
            totalChunks: this.chunks.length,
            isIndexing: this.isProcessing
        };
    }
    
    clear() {
        this.chunks = [];
        this.fileSignatures.clear();
    }
}
