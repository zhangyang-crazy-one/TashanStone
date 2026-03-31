//! Vector service - RAG and semantic search
//!
//! Provides embedding generation and vector storage for knowledge retrieval.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::sync::RwLock;

/// Text chunk for embedding
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chunk {
    pub id: String,
    pub content: String,
    pub file_path: String,
    pub start_line: usize,
    pub end_line: usize,
}

/// Embedding vector
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Embedding {
    pub id: String,
    pub vector: Vec<f32>,
    pub chunk_id: String,
}

/// Search result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub chunk_id: String,
    pub content: String,
    pub file_path: String,
    pub score: f32,
    pub start_line: usize,
    pub end_line: usize,
}

/// Vector service configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorConfig {
    pub embedding_model: String,
    pub embedding_dim: usize,
    pub top_k: usize,
}

impl Default for VectorConfig {
    fn default() -> Self {
        Self {
            embedding_model: "text-embedding-3-small".to_string(),
            embedding_dim: 1536,
            top_k: 5,
        }
    }
}

/// Vector service error
#[derive(Debug, thiserror::Error)]
pub enum VectorError {
    #[error("Embedding error: {0}")]
    Embedding(String),
    #[error("Storage error: {0}")]
    Storage(String),
    #[error("Search error: {0}")]
    Search(String),
    #[error("Not found: {0}")]
    NotFound(String),
}

/// Vector service for RAG operations
pub struct VectorService {
    config: VectorConfig,
    embeddings: RwLock<HashMap<String, Vec<Embedding>>>,
    chunks: RwLock<HashMap<String, Chunk>>,
}

impl VectorService {
    /// Create a new vector service
    pub fn new() -> Self {
        Self {
            config: VectorConfig::default(),
            embeddings: RwLock::new(HashMap::new()),
            chunks: RwLock::new(HashMap::new()),
        }
    }

    /// Create with custom config
    pub fn with_config(config: VectorConfig) -> Self {
        Self {
            config,
            embeddings: RwLock::new(HashMap::new()),
            chunks: RwLock::new(HashMap::new()),
        }
    }

    /// Add chunks for a file
    pub async fn add_chunks(&self, file_path: &str, chunks: Vec<Chunk>) {
        let mut chunk_store = self.chunks.write().await;
        let mut embed_store = self.embeddings.write().await;

        for chunk in chunks {
            // Generate embedding for chunk
            let embedding = self.generate_embedding(&chunk.content).await;

            let embed = Embedding {
                id: format!("{}_{}", file_path, chunk.id),
                vector: embedding,
                chunk_id: chunk.id.clone(),
            };

            embed_store
                .entry(file_path.to_string())
                .or_insert_with(Vec::new)
                .push(embed);

            chunk_store.insert(chunk.id.clone(), chunk);
        }
    }

    /// Search for similar chunks
    pub async fn search(
        &self,
        query: &str,
        top_k: usize,
    ) -> Result<Vec<SearchResult>, VectorError> {
        let query_embedding = self.generate_embedding(query).await;

        let embed_store = self.embeddings.read().await;
        let chunk_store = self.chunks.read().await;

        let mut results: Vec<SearchResult> = Vec::new();

        for (file_path, embeddings) in embed_store.iter() {
            for embed in embeddings {
                if let Some(chunk) = chunk_store.get(&embed.chunk_id) {
                    let score = self.cosine_similarity(&query_embedding, &embed.vector);

                    results.push(SearchResult {
                        chunk_id: embed.chunk_id.clone(),
                        content: chunk.content.clone(),
                        file_path: file_path.clone(),
                        score,
                        start_line: chunk.start_line,
                        end_line: chunk.end_line,
                    });
                }
            }
        }

        // Sort by score descending
        results.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        results.truncate(top_k);

        Ok(results)
    }

    /// Remove all chunks for a file
    pub async fn remove_file(&self, file_path: &str) {
        let mut embed_store = self.embeddings.write().await;
        let mut chunk_store = self.chunks.write().await;

        if let Some(embeddings) = embed_store.remove(file_path) {
            for embed in embeddings {
                chunk_store.remove(&embed.chunk_id);
            }
        }
    }

    /// Clear all data
    pub async fn clear(&self) {
        let mut embed_store = self.embeddings.write().await;
        let mut chunk_store = self.chunks.write().await;

        embed_store.clear();
        chunk_store.clear();
    }

    /// Generate embedding for text (placeholder - needs OpenAI or similar API)
    async fn generate_embedding(&self, text: &str) -> Vec<f32> {
        // Simple hash-based embedding for demo purposes
        // In production, this would call OpenAI embeddings API or similar
        let mut vector = vec![0.0; self.config.embedding_dim];

        let hash = self.simple_hash(text);
        for (i, v) in vector.iter_mut().enumerate() {
            *v = ((hash + i) as f32 / 1000.0).sin();
        }

        // Normalize
        let len = vector.iter().map(|x| x * x).sum::<f32>().sqrt();
        if len > 0.0 {
            for v in vector.iter_mut() {
                *v /= len;
            }
        }

        vector
    }

    /// Simple hash function
    fn simple_hash(&self, text: &str) -> usize {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        text.hash(&mut hasher);
        hasher.finish() as usize
    }

    /// Cosine similarity between two vectors
    fn cosine_similarity(&self, a: &[f32], b: &[f32]) -> f32 {
        if a.len() != b.len() {
            return 0.0;
        }

        let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
        let len_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
        let len_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

        if len_a == 0.0 || len_b == 0.0 {
            0.0
        } else {
            dot / (len_a * len_b)
        }
    }

    /// Chunk text into segments
    pub fn chunk_text(&self, content: &str, max_lines: usize) -> Vec<Chunk> {
        let lines: Vec<&str> = content.lines().collect();
        let total_lines = lines.len();

        let mut chunks = Vec::new();
        let mut chunk_id = 0;

        for start in (0..total_lines).step_by(max_lines) {
            let end = (start + max_lines).min(total_lines);
            let chunk_lines = &lines[start..end];

            let content = chunk_lines.join("\n");

            chunks.push(Chunk {
                id: format!("chunk_{}", chunk_id),
                content,
                file_path: String::new(), // Will be set by caller
                start_line: start + 1,    // 1-indexed
                end_line: end,
            });

            chunk_id += 1;
        }

        chunks
    }
}

impl Default for VectorService {
    fn default() -> Self {
        Self::new()
    }
}
