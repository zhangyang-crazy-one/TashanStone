import { getPlatform } from '../platform/platformService';

export interface FetchResult {
    status: number;
    data: unknown;
    headers: Record<string, string>;
}

/**
 * Rewrite API URLs to use Vite proxy in development browser mode
 */
function rewriteUrlForProxy(url: string): string {
    // Only rewrite in browser dev mode (not Electron, not production)
    if (typeof window !== 'undefined' &&
        !window.electronAPI &&
        import.meta.env?.DEV) {

        // DeepSeek API proxy
        if (url.startsWith('https://api.deepseek.com')) {
            return url.replace('https://api.deepseek.com', '/api/deepseek');
        }
        // OpenAI API proxy
        if (url.startsWith('https://api.openai.com')) {
            return url.replace('https://api.openai.com', '/api/openai');
        }
    }
    return url;
}

/**
 * Platform-aware fetch function
 * Routes through Electron's main process when running in Electron to avoid CORS
 * Uses Vite proxy in browser dev mode
 * Uses native fetch in browser production/mobile
 */
export async function platformFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const platform = getPlatform();

    if (platform.isElectron && window.electronAPI) {
        // Route through Electron main process to avoid CORS
        const result = await window.electronAPI.ai.fetch(url, options);

        // 检测网络级错误（status 0表示网络错误）
        if (result.status === 0) {
            // status 0 表示IPC层捕获到错误
            let errorMessage = 'Network error';
            if (result.data && typeof result.data === 'object' && 'error' in result.data) {
                errorMessage = (result.data as { error: string }).error;
            }
            throw new Error(errorMessage);
        }

        // Convert to Response object
        const body = typeof result.data === 'string'
            ? result.data
            : JSON.stringify(result.data);

        return new Response(body, {
            status: result.status,
            headers: new Headers(result.headers)
        });
    }

    // Rewrite URL for Vite proxy in dev mode
    const finalUrl = rewriteUrlForProxy(url);

    // Direct fetch for web/mobile
    return fetch(finalUrl, options);
}

/**
 * Platform-aware JSON fetch
 */
export async function platformFetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await platformFetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
}

/**
 * Platform-aware streaming fetch for AI responses
 * Returns an AsyncGenerator that yields response chunks in real-time
 * In Electron: Uses IPC events for true streaming
 * In Browser: Uses native ReadableStream
 */
export async function* platformStreamFetch(url: string, options: RequestInit = {}): AsyncGenerator<string, void, unknown> {
    const platform = getPlatform();

    if (platform.isElectron && window.electronAPI?.ai?.streamFetch) {
        // Use Electron's IPC-based streaming
        try {
            const { streamId, status, errorText } = await window.electronAPI.ai.streamFetch(url, options);

            if (status === 0) {
                throw new Error('Network error: Failed to connect to AI service');
            }

            if (status >= 400) {
                let detail = '';
                if (errorText) {
                    const trimmed = errorText.trim();
                    if (trimmed) {
                        try {
                            const parsed = JSON.parse(trimmed) as { error?: { message?: string }; message?: string };
                            detail = parsed?.error?.message || parsed?.message || trimmed;
                        } catch {
                            detail = trimmed;
                        }
                        detail = detail.slice(0, 400);
                    }
                }
                throw new Error(detail ? `HTTP error! status: ${status} - ${detail}` : `HTTP error! status: ${status}`);
            }

            // Create a promise-based queue for stream chunks
            const chunkQueue: Array<{ chunk?: string; done: boolean; error?: string }> = [];
            let resolveNext: ((value: { chunk?: string; done: boolean; error?: string } | null) => void) | null = null;
            let streamEnded = false;

            // Set up the stream chunk listener
            const cleanup = window.electronAPI.ai.onStreamChunk((data) => {
                // Only process chunks for this stream
                if (data.streamId !== streamId) return;

                if (resolveNext) {
                    // Someone is waiting for data
                    resolveNext(data);
                    resolveNext = null;
                } else {
                    // Queue the chunk
                    chunkQueue.push(data);
                }

                if (data.done || data.error) {
                    streamEnded = true;
                }
            });

            try {
                // Yield chunks as they arrive
                while (true) {
                    let data: { chunk?: string; done: boolean; error?: string } | null;

                    if (chunkQueue.length > 0) {
                        data = chunkQueue.shift()!;
                    } else if (streamEnded) {
                        break;
                    } else {
                        // Wait for next chunk
                        data = await new Promise<{ chunk?: string; done: boolean; error?: string } | null>(
                            (resolve) => {
                                resolveNext = resolve;
                                // Safety timeout of 60 seconds
                                setTimeout(() => {
                                    if (resolveNext === resolve) {
                                        resolve({ done: true, error: 'Stream timeout' });
                                    }
                                }, 60000);
                            }
                        );
                    }

                    if (!data) break;

                    if (data.error) {
                        throw new Error(data.error);
                    }

                    if (data.chunk) {
                        yield data.chunk;
                    }

                    if (data.done) {
                        break;
                    }
                }
            } finally {
                cleanup();
            }
        } catch (error) {
            throw error;
        }
    } else {
        // Browser mode: Use native fetch with ReadableStream
        const finalUrl = rewriteUrlForProxy(url);
        const response = await fetch(finalUrl, options);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (!response.body) {
            throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                yield decoder.decode(value, { stream: true });
            }
        } finally {
            reader.releaseLock();
        }
    }
}
