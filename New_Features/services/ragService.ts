
import { MarkdownFile, AIConfig, RAGStats, SearchResult } from "../types";
import { getEmbedding } from "./aiService";
import { extractTags } from "./knowledgeService";

export interface Chunk {
  id: string;
  fileId: string;
  text: string;
  embedding?: number[];
  metadata: {
    start: number;
    end: number;
    fileName: string;
    lastModified: number;
    tags: string[];
  };
}

// Configuration
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

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

export class VectorStore {
  private chunks: Chunk[] = [];
  private fileEmbeddings: Map<string, number[]> = new Map(); // Average embedding per file for recommendations

  constructor() {}

  // --- Indexing ---

  private chunkText(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + CHUNK_SIZE, text.length);
      chunks.push(text.slice(start, end));
      start += CHUNK_SIZE - CHUNK_OVERLAP;
    }
    return chunks;
  }

  async indexFile(file: MarkdownFile, config: AIConfig): Promise<void> {
    // 1. Remove existing chunks for this file
    this.chunks = this.chunks.filter(c => c.fileId !== file.id);
    
    // 2. Create new chunks
    const textChunks = this.chunkText(file.content);
    const tags = extractTags(file.content);
    
    const fileVectors: number[][] = [];

    for (let i = 0; i < textChunks.length; i++) {
      const text = textChunks[i];
      const embedding = await getEmbedding(text, config);
      
      if (embedding.length > 0) {
        fileVectors.push(embedding);
        this.chunks.push({
          id: `${file.id}-chunk-${i}`,
          fileId: file.id,
          text,
          embedding,
          metadata: {
            start: i * (CHUNK_SIZE - CHUNK_OVERLAP),
            end: i * (CHUNK_SIZE - CHUNK_OVERLAP) + text.length,
            fileName: file.name,
            lastModified: file.lastModified,
            tags
          }
        });
      }
    }

    // 3. Compute average file embedding for "Related Files" feature
    if (fileVectors.length > 0) {
        const avgVector = new Array(fileVectors[0].length).fill(0);
        fileVectors.forEach(vec => {
            vec.forEach((val, idx) => avgVector[idx] += val);
        });
        const normalized = avgVector.map(val => val / fileVectors.length);
        this.fileEmbeddings.set(file.id, normalized);
    }
  }

  getStats(): RAGStats {
    const uniqueFiles = new Set(this.chunks.map(c => c.fileId));
    return {
      totalFiles: 0, // Managed by App
      indexedFiles: uniqueFiles.size,
      totalChunks: this.chunks.length,
      isIndexing: false
    };
  }

  // --- Retrieval ---

  async search(query: string, config: AIConfig, topK: number = 5): Promise<string> {
    const queryEmbedding = await getEmbedding(query, config);
    if (queryEmbedding.length === 0) return "";

    const scored = this.chunks
      .map(chunk => ({
        chunk,
        score: chunk.embedding ? cosineSimilarity(queryEmbedding, chunk.embedding) : -1
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored.map(item => 
      `[Source: ${item.chunk.metadata.fileName}]\n${item.chunk.text}`
    ).join('\n\n');
  }

  // Semantic Search returning structured results for UI
  async semanticSearch(query: string, config: AIConfig, topK: number = 10): Promise<SearchResult[]> {
      const queryEmbedding = await getEmbedding(query, config);
      if (queryEmbedding.length === 0) return [];

      const scored = this.chunks
        .map(chunk => ({
            chunk,
            score: chunk.embedding ? cosineSimilarity(queryEmbedding, chunk.embedding) : -1
        }))
        .filter(item => item.score > 0.4) // Minimum relevance threshold
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      // Deduplicate by file
      const results: SearchResult[] = [];
      const seenFiles = new Set<string>();

      for (const item of scored) {
          if (!seenFiles.has(item.chunk.fileId)) {
              seenFiles.add(item.chunk.fileId);
              results.push({
                  fileId: item.chunk.fileId,
                  fileName: item.chunk.metadata.fileName,
                  path: item.chunk.metadata.fileName, // Path matches name in chunks metadata currently
                  score: item.score,
                  matches: [{
                      type: 'content',
                      text: "..." + item.chunk.text.substring(0, 150) + "..."
                  }],
                  lastModified: item.chunk.metadata.lastModified,
                  tags: item.chunk.metadata.tags
              });
          }
      }
      return results;
  }

  // Recommendation Engine: Find related files based on content similarity
  findRelatedFiles(fileId: string, topK: number = 3): string[] {
      const sourceVec = this.fileEmbeddings.get(fileId);
      if (!sourceVec) return [];

      const scores: { id: string, score: number }[] = [];
      
      this.fileEmbeddings.forEach((vec, id) => {
          if (id === fileId) return;
          scores.push({ id, score: cosineSimilarity(sourceVec, vec) });
      });

      return scores
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(s => s.id);
  }
}
