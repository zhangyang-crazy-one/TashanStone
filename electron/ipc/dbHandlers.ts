import { ipcMain } from 'electron';
import { getDatabase } from '../database/index.js';
import { fileRepository } from '../database/repositories/fileRepository.js';
import { configRepository, settingsRepository } from '../database/repositories/configRepository.js';
import { chatRepository } from '../database/repositories/chatRepository.js';
import { themeRepository } from '../database/repositories/themeRepository.js';
import { mistakeRepository } from '../database/repositories/mistakeRepository.js';
import { vectorRepository } from '../database/repositories/vectorRepository.js';
import { authRepository } from '../database/repositories/authRepository.js';
import { logger } from '../utils/logger.js';

import type { MarkdownFile } from '../database/repositories/fileRepository.js';
import type { AIConfig } from '../database/repositories/configRepository.js';
import type { ChatMessage } from '../database/repositories/chatRepository.js';
import type { AppTheme } from '../database/repositories/themeRepository.js';
import type { MistakeRecord } from '../database/repositories/mistakeRepository.js';
import type { VectorChunk, IndexMeta } from '../database/repositories/vectorRepository.js';

/**
 * 数据库完整导出格式
 */
export interface DatabaseExport {
    version: number;
    exportedAt: number;
    data: {
        files: MarkdownFile[];
        aiConfig: AIConfig;
        chatMessages: { conversationId: string; messages: ChatMessage[] }[];
        themes: AppTheme[];
        settings: Record<string, string>;
        mistakes: MistakeRecord[];
    };
}

/**
 * 标准化错误响应格式
 */
interface ErrorResponse {
    error: string;
    details?: string;
    code?: string;
}

/**
 * 包装错误处理的辅助函数
 */
function handleError(operation: string, error: unknown): never {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails = error instanceof Error ? error.stack : undefined;

    logger.error(`${operation} failed`, { error: errorMessage, stack: errorDetails });

    // 抛出标准化的错误
    const err = new Error(`${operation}: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
        err.stack = error.stack;
    }
    throw err;
}

export function registerDbHandlers(): void {
    logger.info('Registering database IPC handlers');

    // ===== File Handlers =====
    ipcMain.handle('db:files:getAll', async () => {
        try {
            return fileRepository.getAll();
        } catch (error) {
            handleError('db:files:getAll', error);
        }
    });

    ipcMain.handle('db:files:get', async (_, id: string) => {
        try {
            return fileRepository.getById(id);
        } catch (error) {
            handleError('db:files:get', error);
        }
    });

    ipcMain.handle('db:files:create', async (_, file: MarkdownFile) => {
        try {
            return fileRepository.create(file);
        } catch (error) {
            handleError('db:files:create', error);
        }
    });

    ipcMain.handle('db:files:update', async (_, id: string, updates: Partial<MarkdownFile>) => {
        try {
            return fileRepository.update(id, updates);
        } catch (error) {
            handleError('db:files:update', error);
        }
    });

    ipcMain.handle('db:files:delete', async (_, id: string) => {
        try {
            return fileRepository.delete(id);
        } catch (error) {
            handleError('db:files:delete', error);
        }
    });

    // ===== AI Config Handlers =====
    ipcMain.handle('db:config:get', async () => {
        try {
            return configRepository.getAIConfig();
        } catch (error) {
            handleError('db:config:get', error);
        }
    });

    ipcMain.handle('db:config:set', async (_, config: AIConfig) => {
        try {
            return configRepository.setAIConfig(config);
        } catch (error) {
            handleError('db:config:set', error);
        }
    });

    // ===== Chat Handlers =====
    ipcMain.handle('db:chat:getAll', async (_, conversationId?: string) => {
        try {
            return chatRepository.getAll(conversationId);
        } catch (error) {
            handleError('db:chat:getAll', error);
        }
    });

    ipcMain.handle('db:chat:add', async (_, message: ChatMessage, conversationId?: string) => {
        try {
            return chatRepository.add(message, conversationId);
        } catch (error) {
            handleError('db:chat:add', error);
        }
    });

    ipcMain.handle('db:chat:clear', async (_, conversationId?: string) => {
        try {
            chatRepository.clear(conversationId);
        } catch (error) {
            handleError('db:chat:clear', error);
        }
    });

    // ===== Theme Handlers =====
    ipcMain.handle('db:themes:getAll', async () => {
        try {
            return themeRepository.getAll();
        } catch (error) {
            handleError('db:themes:getAll', error);
        }
    });

    ipcMain.handle('db:themes:save', async (_, theme: AppTheme) => {
        try {
            return themeRepository.save(theme);
        } catch (error) {
            handleError('db:themes:save', error);
        }
    });

    ipcMain.handle('db:themes:delete', async (_, id: string) => {
        try {
            return themeRepository.delete(id);
        } catch (error) {
            handleError('db:themes:delete', error);
        }
    });

    // ===== Settings Handlers =====
    ipcMain.handle('db:settings:get', async (_, key: string) => {
        try {
            return settingsRepository.get(key);
        } catch (error) {
            handleError('db:settings:get', error);
        }
    });

    ipcMain.handle('db:settings:set', async (_, key: string, value: string) => {
        try {
            settingsRepository.set(key, value);
        } catch (error) {
            handleError('db:settings:set', error);
        }
    });

    // ===== Mistake Handlers =====
    ipcMain.handle('db:mistakes:getAll', async () => {
        try {
            return mistakeRepository.getAll();
        } catch (error) {
            handleError('db:mistakes:getAll', error);
        }
    });

    ipcMain.handle('db:mistakes:add', async (_, record: MistakeRecord) => {
        try {
            return mistakeRepository.add(record);
        } catch (error) {
            handleError('db:mistakes:add', error);
        }
    });

    ipcMain.handle('db:mistakes:delete', async (_, id: string) => {
        try {
            return mistakeRepository.delete(id);
        } catch (error) {
            handleError('db:mistakes:delete', error);
        }
    });

    // ===== Data Import/Export Handlers =====
    /**
     * 导出所有数据为 JSON 格式
     */
    ipcMain.handle('sync:exportData', async (): Promise<DatabaseExport> => {
        try {
            logger.info('Starting database export');

            // 获取所有会话ID
            const conversationIds = chatRepository.getConversationIds();
            const chatMessages = conversationIds.map(conversationId => ({
                conversationId,
                messages: chatRepository.getAll(conversationId)
            }));

            const exportData: DatabaseExport = {
                version: 1,
                exportedAt: Date.now(),
                data: {
                    files: fileRepository.getAll(),
                    aiConfig: configRepository.getAIConfig(),
                    chatMessages,
                    themes: themeRepository.getAll().filter(t => !t.isCustom), // 只导出自定义主题
                    settings: settingsRepository.getAll(),
                    mistakes: mistakeRepository.getAll()
                }
            };

            logger.info('Database export completed', {
                filesCount: exportData.data.files.length,
                conversationsCount: exportData.data.chatMessages.length,
                themesCount: exportData.data.themes.length,
                mistakesCount: exportData.data.mistakes.length
            });

            return exportData;
        } catch (error) {
            logger.error('sync:exportData failed', error);
            throw new Error(`导出失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    /**
     * 从 JSON 导入数据（使用事务确保原子性）
     */
    ipcMain.handle('sync:importData', async (_, jsonData: DatabaseExport): Promise<{ success: boolean; imported: Record<string, number>; errors: string[] }> => {
        const db = getDatabase();
        const imported: Record<string, number> = {
            files: 0,
            chatMessages: 0,
            themes: 0,
            settings: 0,
            mistakes: 0
        };
        const errors: string[] = [];

        try {
            logger.info('Starting database import', {
                version: jsonData.version,
                exportedAt: new Date(jsonData.exportedAt).toISOString()
            });

            // 验证导入数据格式
            if (!jsonData.data || typeof jsonData.data !== 'object') {
                throw new Error('无效的导入数据格式');
            }

            // 使用事务确保所有操作的原子性
            const importTransaction = db.transaction(() => {
                // 1. 导入文件
                if (Array.isArray(jsonData.data.files)) {
                    for (const file of jsonData.data.files) {
                        try {
                            // 如果文件已存在，则更新；否则创建
                            const existing = fileRepository.getById(file.id);
                            if (existing) {
                                fileRepository.update(file.id, file);
                            } else {
                                fileRepository.create(file);
                            }
                            imported.files++;
                        } catch (error) {
                            errors.push(`导入文件 ${file.id} 失败: ${error instanceof Error ? error.message : String(error)}`);
                        }
                    }
                }

                // 2. 导入AI配置
                if (jsonData.data.aiConfig) {
                    try {
                        configRepository.setAIConfig(jsonData.data.aiConfig);
                    } catch (error) {
                        errors.push(`导入AI配置失败: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }

                // 3. 导入聊天消息
                if (Array.isArray(jsonData.data.chatMessages)) {
                    for (const conversation of jsonData.data.chatMessages) {
                        try {
                            // 先清空该会话的现有消息
                            chatRepository.clear(conversation.conversationId);

                            // 导入新消息
                            for (const message of conversation.messages) {
                                chatRepository.add(message, conversation.conversationId);
                                imported.chatMessages++;
                            }
                        } catch (error) {
                            errors.push(`导入会话 ${conversation.conversationId} 失败: ${error instanceof Error ? error.message : String(error)}`);
                        }
                    }
                }

                // 4. 导入主题（仅自定义主题）
                if (Array.isArray(jsonData.data.themes)) {
                    for (const theme of jsonData.data.themes) {
                        try {
                            // 只导入自定义主题，跳过内置主题
                            if (theme.isCustom) {
                                themeRepository.save(theme);
                                imported.themes++;
                            }
                        } catch (error) {
                            errors.push(`导入主题 ${theme.id} 失败: ${error instanceof Error ? error.message : String(error)}`);
                        }
                    }
                }

                // 5. 导入设置
                if (jsonData.data.settings && typeof jsonData.data.settings === 'object') {
                    for (const [key, value] of Object.entries(jsonData.data.settings)) {
                        try {
                            settingsRepository.set(key, value);
                            imported.settings++;
                        } catch (error) {
                            errors.push(`导入设置 ${key} 失败: ${error instanceof Error ? error.message : String(error)}`);
                        }
                    }
                }

                // 6. 导入错题记录
                if (Array.isArray(jsonData.data.mistakes)) {
                    for (const mistake of jsonData.data.mistakes) {
                        try {
                            // 检查是否已存在，避免重复
                            const existing = mistakeRepository.getAll().find(m => m.id === mistake.id);
                            if (!existing) {
                                mistakeRepository.add(mistake);
                                imported.mistakes++;
                            }
                        } catch (error) {
                            errors.push(`导入错题 ${mistake.id} 失败: ${error instanceof Error ? error.message : String(error)}`);
                        }
                    }
                }
            });

            // 执行事务
            importTransaction();

            logger.info('Database import completed', {
                imported,
                errorsCount: errors.length
            });

            if (errors.length > 0) {
                logger.warn('Import completed with errors', { errors });
            }

            return {
                success: errors.length === 0,
                imported,
                errors
            };
        } catch (error) {
            logger.error('sync:importData transaction failed', error);
            throw new Error(`导入失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    // ===== Vector Operations Handlers =====
    /**
     * 检查文件是否需要重新索引
     */
    ipcMain.handle('db:vectors:needsIndexing', async (_, fileId: string, lastModified: number): Promise<boolean> => {
        try {
            return vectorRepository.needsIndexing(fileId, lastModified);
        } catch (error) {
            handleError('db:vectors:needsIndexing', error);
        }
    });

    /**
     * 获取指定文件的所有向量块
     */
    ipcMain.handle('db:vectors:getByFile', async (_, fileId: string): Promise<VectorChunk[]> => {
        try {
            return vectorRepository.getChunksByFile(fileId);
        } catch (error) {
            handleError('db:vectors:getByFile', error);
        }
    });

    /**
     * 获取所有向量块（带分页）
     */
    ipcMain.handle('db:vectors:getAllPaginated', async (_, limit: number, offset: number): Promise<VectorChunk[]> => {
        try {
            return vectorRepository.getAllChunksPaginated(limit, offset);
        } catch (error) {
            handleError('db:vectors:getAllPaginated', error);
        }
    });

    /**
     * 获取所有向量块数量
     */
    ipcMain.handle('db:vectors:getAllCount', async (): Promise<number> => {
        try {
            return vectorRepository.getAllChunksCount();
        } catch (error) {
            handleError('db:vectors:getAllCount', error);
        }
    });

    /**
     * 获取所有向量块
     */
    ipcMain.handle('db:vectors:getAll', async (): Promise<VectorChunk[]> => {
        try {
            return vectorRepository.getAllChunks();
        } catch (error) {
            handleError('db:vectors:getAll', error);
        }
    });

    /**
     * 保存文件的向量块
     */
    ipcMain.handle('db:vectors:save', async (
        _,
        fileId: string,
        chunks: VectorChunk[],
        lastModified: number,
        model?: string,
        provider?: string
    ): Promise<void> => {
        try {
            vectorRepository.saveChunks(fileId, chunks, lastModified, model, provider);
        } catch (error) {
            handleError('db:vectors:save', error);
        }
    });

    /**
     * 删除指定文件的向量块
     */
    ipcMain.handle('db:vectors:deleteByFile', async (_, fileId: string): Promise<void> => {
        try {
            vectorRepository.deleteByFile(fileId);
        } catch (error) {
            handleError('db:vectors:deleteByFile', error);
        }
    });

    /**
     * 获取所有索引元数据
     */
    ipcMain.handle('db:vectors:getMeta', async (): Promise<IndexMeta[]> => {
        try {
            return vectorRepository.getIndexMeta();
        } catch (error) {
            handleError('db:vectors:getMeta', error);
        }
    });

    /**
     * 清空所有向量数据
     */
    ipcMain.handle('db:vectors:clear', async (): Promise<void> => {
        try {
            vectorRepository.clearAll();
        } catch (error) {
            handleError('db:vectors:clear', error);
        }
    });

    /**
     * 获取向量存储统计信息
     */
    ipcMain.handle('db:vectors:getStats', async (): Promise<{ totalFiles: number; totalChunks: number }> => {
        try {
            return vectorRepository.getStats();
        } catch (error) {
            handleError('db:vectors:getStats', error);
        }
    });

    // ===== Auth Handlers =====
    /**
     * 注册新用户
     */
    ipcMain.handle('db:auth:register', async (_, username: string, password: string) => {
        try {
            return authRepository.register(username, password);
        } catch (error) {
            handleError('db:auth:register', error);
        }
    });

    /**
     * 验证密码
     */
    ipcMain.handle('db:auth:verify', async (_, password: string) => {
        try {
            return authRepository.verify(password);
        } catch (error) {
            handleError('db:auth:verify', error);
        }
    });

    /**
     * 检查是否已注册
     */
    ipcMain.handle('db:auth:isRegistered', async () => {
        try {
            return authRepository.isRegistered();
        } catch (error) {
            handleError('db:auth:isRegistered', error);
        }
    });

    /**
     * 获取用户名
     */
    ipcMain.handle('db:auth:getUsername', async () => {
        try {
            return authRepository.getUsername();
        } catch (error) {
            handleError('db:auth:getUsername', error);
        }
    });

    /**
     * 修改密码
     */
    ipcMain.handle('db:auth:changePassword', async (_, oldPassword: string, newPassword: string) => {
        try {
            return authRepository.changePassword(oldPassword, newPassword);
        } catch (error) {
            handleError('db:auth:changePassword', error);
        }
    });

    /**
     * 重置密码 (危险操作) - 已添加当前密码验证
     * 修复：需要先验证当前密码才能重置
     */
    ipcMain.handle('db:auth:resetPassword', async (_, currentPassword: string, newPassword: string) => {
        try {
            // 1. 验证当前密码
            const isValidCurrent = authRepository.verify(currentPassword);
            if (!isValidCurrent) {
                logger.warn('Password reset attempted with incorrect current password');
                return {
                    success: false,
                    error: '当前密码错误，无法重置密码'
                };
            }

            // 2. 执行密码重置
            const result = authRepository.resetPassword(newPassword);

            if (result.success) {
                logger.info('Password reset successfully after verification');
            }

            return result;
        } catch (error) {
            handleError('db:auth:resetPassword', error);
        }
    });

    /**
     * 登录 (验证密码的别名)
     */
    ipcMain.handle('db:auth:login', async (_, password: string) => {
        try {
            return authRepository.verify(password);
        } catch (error) {
            handleError('db:auth:login', error);
        }
    });

    /**
     * 工厂重置 (删除所有用户数据)
     */
    ipcMain.handle('db:auth:reset', async () => {
        try {
            return authRepository.reset();
        } catch (error) {
            handleError('db:auth:reset', error);
        }
    });

    logger.info('Database IPC handlers registered');
}
