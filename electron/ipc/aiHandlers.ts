import { ipcMain, net, BrowserWindow } from 'electron';
import { logger } from '../utils/logger.js';

export interface FetchResult {
    status: number;
    data: unknown;
    headers: Record<string, string>;
}

// Global stream ID counter
let streamIdCounter = 0;

export function registerAiHandlers(): void {
    logger.info('Registering AI IPC handlers');

    // Proxy fetch requests to avoid CORS issues
    ipcMain.handle('ai:fetch', async (_, url: string, options: RequestInit): Promise<FetchResult> => {
        try {
            logger.debug('AI fetch request', { url, method: options.method });

            // 规范化localhost URL处理
            let fetchUrl = url;
            if (url.includes('localhost') || url.includes('127.0.0.1')) {
                // 如果不以http://或https://开头，则添加http://
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    fetchUrl = `http://${url}`;
                }
            }

            logger.debug('Normalized URL', { original: url, normalized: fetchUrl });

            const response = await net.fetch(fetchUrl, {
                method: options.method || 'POST',
                headers: options.headers as Record<string, string>,
                body: options.body as string
            });

            const contentType = response.headers.get('content-type') || '';
            let data: unknown;

            if (contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            const headers: Record<string, string> = {};
            response.headers.forEach((value, key) => {
                headers[key] = value;
            });

            logger.debug('AI fetch response', { status: response.status, url: fetchUrl });

            return {
                status: response.status,
                data,
                headers
            };
        } catch (error) {
            logger.error('ai:fetch failed', { error, url });

            // 提供更具体的错误信息
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            let userFriendlyError = errorMessage;

            if (errorMessage.includes('ECONNREFUSED')) {
                userFriendlyError = `连接被拒绝: ${url}。请确保AI服务正在运行。`;
            } else if (errorMessage.includes('ETIMEDOUT')) {
                userFriendlyError = `连接超时: ${url}。请检查网络连接。`;
            } else if (errorMessage.includes('ENOTFOUND')) {
                userFriendlyError = `找不到主机: ${url}。请检查URL是否正确。`;
            } else if (errorMessage.includes('ERR_INVALID_URL')) {
                userFriendlyError = `无效的URL: ${url}。请检查URL格式。`;
            }

            // 使用状态码0表示网络错误（HTTP级别的错误）
            return {
                status: 0,
                data: {
                    error: userFriendlyError,
                    originalError: errorMessage,
                    url: url
                },
                headers: {}
            };
        }
    });

    // Stream fetch for AI responses - Real streaming via IPC events
    ipcMain.handle('ai:streamFetch', async (event, url: string, options: RequestInit): Promise<{ streamId: string; status: number; headers: Record<string, string>; errorText?: string }> => {
        const streamId = `stream_${++streamIdCounter}_${Date.now()}`;

        try {
            logger.debug('AI stream fetch request', { streamId, url, method: options.method });

            // 规范化localhost URL处理
            let fetchUrl = url;
            if (url.includes('localhost') || url.includes('127.0.0.1')) {
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    fetchUrl = `http://${url}`;
                }
            }

            const response = await net.fetch(fetchUrl, {
                method: options.method || 'POST',
                headers: options.headers as Record<string, string>,
                body: options.body as string
            });

            const headers: Record<string, string> = {};
            response.headers.forEach((value, key) => {
                headers[key] = value;
            });

            // Get the sender's BrowserWindow
            const webContents = event.sender;

            if (response.status >= 400) {
                let errorText = '';
                try {
                    errorText = await response.text();
                } catch (readError) {
                    logger.warn('AI stream error body read failed', { streamId, error: readError });
                }

                logger.error('AI stream request failed', {
                    streamId,
                    status: response.status,
                    url: fetchUrl,
                    errorText: errorText.slice(0, 2000)
                });

                return {
                    streamId,
                    status: response.status,
                    headers,
                    errorText
                };
            }

            if (!response.body) {
                throw new Error('No response body');
            }

            // Start reading stream in background
            (async () => {
                try {
                    const reader = response.body!.getReader();
                    const decoder = new TextDecoder();

                    while (true) {
                        const { done, value } = await reader.read();

                        if (done) {
                            webContents.send('ai:streamChunk', { streamId, done: true });
                            logger.debug('AI stream completed', { streamId });
                            break;
                        }

                        const text = decoder.decode(value, { stream: true });
                        webContents.send('ai:streamChunk', { streamId, chunk: text, done: false });
                    }
                } catch (streamError) {
                    logger.error('AI stream read error', { streamId, error: streamError });
                    webContents.send('ai:streamChunk', {
                        streamId,
                        error: streamError instanceof Error ? streamError.message : 'Stream read error',
                        done: true
                    });
                }
            })();

            logger.debug('AI stream started', { streamId, status: response.status });

            return {
                streamId,
                status: response.status,
                headers
            };
        } catch (error) {
            logger.error('ai:streamFetch failed', { streamId, error, url });

            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            let userFriendlyError = errorMessage;

            if (errorMessage.includes('ECONNREFUSED')) {
                userFriendlyError = `连接被拒绝: ${url}。请确保AI服务正在运行。`;
            } else if (errorMessage.includes('ETIMEDOUT')) {
                userFriendlyError = `连接超时: ${url}。请检查网络连接。`;
            } else if (errorMessage.includes('ENOTFOUND')) {
                userFriendlyError = `找不到主机: ${url}。请检查URL是否正确。`;
            }

            throw new Error(userFriendlyError);
        }
    });

    logger.info('AI IPC handlers registered');
}
