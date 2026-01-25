import type { AIConfig } from '@/types';
import { platformFetch } from '@/src/services/ai/platformFetch';
import { getGeminiClient } from './geminiClient';

interface CacheEntry {
  embedding: number[];
  timestamp: number;
}

class EmbeddingCache {
  private cache: Map<string, CacheEntry>;
  private maxSize: number;
  private maxAge: number; // milliseconds

  constructor(maxSize: number = 1000, maxAgeMinutes: number = 60) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.maxAge = maxAgeMinutes * 60 * 1000;
  }

  private hash(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  get(text: string): number[] | null {
    const key = this.hash(text);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }

    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.embedding;
  }

  set(text: string, embedding: number[]): void {
    const key = this.hash(text);

    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      embedding,
      timestamp: Date.now()
    });
  }

  stats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize
    };
  }
}

const embeddingCache = new EmbeddingCache(500, 60);

const getOllamaEmbedding = async (text: string, embeddingModel?: string): Promise<number[]> => {
  const modelName = embeddingModel || 'nomic-embed-text';
  const ollamaUrl = 'http://localhost:11434';

  const response = await platformFetch(`${ollamaUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      input: text
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama embedding failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { embeddings?: number[][] };
  return data.embeddings?.[0] || [];
};

export const getEmbedding = async (text: string, config: AIConfig): Promise<number[]> => {
  const cleanText = text.replace(/\n/g, ' ').trim().substring(0, 8000);

  const cached = embeddingCache.get(cleanText);
  if (cached) {
    console.log(`[EmbeddingCache] HIT (${embeddingCache.stats().size}/${embeddingCache.stats().maxSize})`);
    return cached;
  }
  console.log(`[EmbeddingCache] MISS for text length: ${cleanText.length}`);

  const embeddingProvider = config.embeddingProvider || config.provider;
  const embeddingModel = config.embeddingModel;
  const embeddingBaseUrl = config.embeddingBaseUrl || config.baseUrl;
  const embeddingApiKey = config.embeddingApiKey || config.apiKey;

  if (embeddingProvider === 'gemini') {
    try {
      const client = getGeminiClient(embeddingApiKey);
      const modelName = embeddingModel || 'text-embedding-004';
      const result = await client.models.embedContent({
        model: modelName,
        contents: [{ parts: [{ text: cleanText }] }]
      });
      const embedding = result.embeddings?.[0]?.values || [];
      embeddingCache.set(cleanText, embedding);
      return embedding;
    } catch (error: unknown) {
      console.error('Gemini Embedding Error', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Embedding Failed: ${message}`);
    }
  }

  if (embeddingProvider === 'openai') {
    try {
      const modelName = embeddingModel || 'text-embedding-3-small';
      const response = await platformFetch(
        `${(embeddingBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/embeddings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${embeddingApiKey}`
          },
          body: JSON.stringify({
            input: cleanText,
            model: modelName
          })
        }
      );
      if (!response.ok) {
        console.warn(`OpenAI-compatible API doesn't support embeddings (${response.status}), falling back to Ollama`);
        return await getOllamaEmbedding(cleanText, embeddingModel);
      }
      const data = await response.json() as { data?: Array<{ embedding?: number[] }> };
      const embedding = data.data?.[0]?.embedding || [];
      embeddingCache.set(cleanText, embedding);
      return embedding;
    } catch (error: unknown) {
      console.error('OpenAI Embedding Error', error);
      console.warn('Falling back to Ollama for embeddings');
      try {
        return await getOllamaEmbedding(cleanText, embeddingModel);
      } catch (ollamaError: unknown) {
        console.error('Ollama fallback also failed', ollamaError);
        throw error;
      }
    }
  }

  if (embeddingProvider === 'ollama') {
    try {
      const modelName = embeddingModel || 'nomic-embed-text';
      const response = await platformFetch(
        `${(embeddingBaseUrl || 'http://localhost:11434').replace(/\/$/, '')}/api/embed`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelName,
            input: cleanText
          })
        }
      );

      if (!response.ok) {
        if (modelName !== config.model) {
          const responseFallback = await platformFetch(
            `${(embeddingBaseUrl || 'http://localhost:11434').replace(/\/$/, '')}/api/embed`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: config.model,
                input: cleanText
              })
            }
          );
          if (!responseFallback.ok) {
            throw new Error('Ollama Embedding Failed');
          }
          const data = await responseFallback.json() as { embeddings?: number[][] };
          const fallbackEmbedding = data.embeddings?.[0] || [];
          embeddingCache.set(cleanText, fallbackEmbedding);
          return fallbackEmbedding;
        }
        throw new Error(`Ollama Embedding Failed: ${response.statusText}`);
      }

      const data = await response.json() as { embeddings?: number[][] };
      const embedding = data.embeddings?.[0] || [];
      embeddingCache.set(cleanText, embedding);
      return embedding;
    } catch (error: unknown) {
      console.error('Ollama Embedding Error', error);
      throw error;
    }
  }

  return [];
};
