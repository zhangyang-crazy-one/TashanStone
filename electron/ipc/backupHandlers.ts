import { ipcMain, dialog } from 'electron';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { getDatabase } from '../database/index.js';
import { logger } from '../utils/logger.js';

/**
 * 加密参数配置
 * AES-256-GCM 认证加密模式
 */
const ENCRYPTION_CONFIG = {
    SALT_LENGTH: 16,        // PBKDF2 盐值长度
    IV_LENGTH: 12,          // GCM 模式初始向量长度
    KEY_LENGTH: 32,         // AES-256 密钥长度 (32 bytes = 256 bits)
    ITERATIONS: 100000,     // PBKDF2 迭代次数
    DIGEST: 'sha256',       // 密钥派生哈希算法
    CIPHER: 'aes-256-gcm'   // 加密算法
} as const;

/**
 * 备份数据结构 - 包含完整数据库内容
 */
interface BackupData {
    version: number;           // 备份格式版本
    timestamp: number;         // 备份时间戳
    appVersion?: string;       // 应用版本号 (可选)
    data: {
        files: any[];
        ai_config: any;
        chat_messages: any[];
        themes: any[];
        settings: any[];
        mistakes: any[];
        vector_chunks?: any[];      // 可选: 向量数据
        vector_index_meta?: any[];  // 可选: 向量索引元数据
    };
}

/**
 * 加密后的备份数据结构
 */
interface EncryptedBackup {
    version: number;       // 加密格式版本
    salt: string;          // Base64 编码的盐值
    iv: string;            // Base64 编码的初始向量
    data: string;          // Base64 编码的加密数据
    authTag: string;       // Base64 编码的 GCM 认证标签
}

/**
 * 收集所有数据库数据
 *
 * @returns 完整的备份数据对象
 */
function gatherAllData(): BackupData {
    const db = getDatabase();

    logger.info('Gathering all database data for backup');

    try {
        const backupData: BackupData = {
            version: 1,
            timestamp: Date.now(),
            data: {
                files: db.prepare('SELECT * FROM files').all(),
                ai_config: db.prepare('SELECT * FROM ai_config WHERE id = 1').get(),
                chat_messages: db.prepare('SELECT * FROM chat_messages').all(),
                themes: db.prepare('SELECT * FROM themes WHERE is_custom = 1').all(), // 只导出自定义主题
                settings: db.prepare('SELECT * FROM settings').all(),
                mistakes: db.prepare('SELECT * FROM mistake_records').all(),
            }
        };

        // 可选: 导出向量数据 (如果表存在)
        try {
            const vectorChunks = db.prepare('SELECT * FROM vector_chunks').all();
            const vectorMeta = db.prepare('SELECT * FROM vector_index_meta').all();
            if (vectorChunks.length > 0) {
                backupData.data.vector_chunks = vectorChunks;
                backupData.data.vector_index_meta = vectorMeta;
            }
        } catch (error) {
            // 表可能不存在,忽略
            logger.debug('Vector tables not found, skipping vector data export');
        }

        logger.info('Data gathering completed', {
            filesCount: backupData.data.files.length,
            messagesCount: backupData.data.chat_messages.length,
            themesCount: backupData.data.themes.length,
            settingsCount: backupData.data.settings.length,
            mistakesCount: backupData.data.mistakes.length
        });

        return backupData;
    } catch (error) {
        logger.error('Failed to gather database data', error);
        throw new Error(`数据收集失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 加密备份数据
 *
 * 使用 AES-256-GCM 认证加密模式确保机密性和完整性
 * PBKDF2-SHA256 密钥派生增强密码强度
 *
 * @param data - 待加密的备份数据
 * @param password - 用户密码
 * @returns 加密后的数据对象
 */
function encryptData(data: BackupData, password: string): EncryptedBackup {
    logger.info('Starting data encryption');

    try {
        // 1. 生成随机盐值和初始向量
        const salt = crypto.randomBytes(ENCRYPTION_CONFIG.SALT_LENGTH);
        const iv = crypto.randomBytes(ENCRYPTION_CONFIG.IV_LENGTH);

        // 2. 使用 PBKDF2 从密码派生密钥
        const key = crypto.pbkdf2Sync(
            password,
            salt,
            ENCRYPTION_CONFIG.ITERATIONS,
            ENCRYPTION_CONFIG.KEY_LENGTH,
            ENCRYPTION_CONFIG.DIGEST
        );

        // 3. 创建 AES-256-GCM 加密器
        const cipher = crypto.createCipheriv(ENCRYPTION_CONFIG.CIPHER, key, iv);

        // 4. 加密数据
        const jsonData = JSON.stringify(data);
        let encrypted = cipher.update(jsonData, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        // 5. 获取 GCM 认证标签 (确保数据完整性)
        const authTag = cipher.getAuthTag();

        const result: EncryptedBackup = {
            version: 1,
            salt: salt.toString('base64'),
            iv: iv.toString('base64'),
            data: encrypted.toString('base64'),
            authTag: authTag.toString('base64')
        };

        logger.info('Data encryption completed successfully');

        return result;
    } catch (error) {
        logger.error('Encryption failed', error);
        throw new Error(`加密失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 解密备份数据
 *
 * @param backup - 加密的备份数据
 * @param password - 用户密码
 * @returns 解密后的备份数据
 * @throws 如果密码错误或数据损坏
 */
function decryptData(backup: EncryptedBackup, password: string): BackupData {
    logger.info('Starting data decryption');

    try {
        // 1. 解码 Base64 数据
        const salt = Buffer.from(backup.salt, 'base64');
        const iv = Buffer.from(backup.iv, 'base64');
        const encrypted = Buffer.from(backup.data, 'base64');
        const authTag = Buffer.from(backup.authTag, 'base64');

        // 2. 使用相同参数派生密钥
        const key = crypto.pbkdf2Sync(
            password,
            salt,
            ENCRYPTION_CONFIG.ITERATIONS,
            ENCRYPTION_CONFIG.KEY_LENGTH,
            ENCRYPTION_CONFIG.DIGEST
        );

        // 3. 创建解密器并设置认证标签
        const decipher = crypto.createDecipheriv(ENCRYPTION_CONFIG.CIPHER, key, iv);
        decipher.setAuthTag(authTag);

        // 4. 解密数据
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        // 5. 解析 JSON
        const result = JSON.parse(decrypted.toString('utf8')) as BackupData;

        logger.info('Data decryption completed successfully');

        return result;
    } catch (error) {
        logger.error('Decryption failed', error);

        // 识别具体错误类型
        if (error instanceof Error) {
            if (error.message.includes('Unsupported state') ||
                error.message.includes('bad decrypt') ||
                error.message.includes('auth')) {
                throw new Error('密码错误或文件已损坏');
            }
        }

        throw new Error(`解密失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 恢复数据到数据库
 *
 * 使用事务确保操作的原子性
 * 保留用户表不恢复,避免覆盖当前登录用户
 *
 * @param data - 备份数据
 */
function restoreData(data: BackupData): void {
    const db = getDatabase();

    logger.info('Starting data restoration', { version: data.version, timestamp: data.timestamp });

    try {
        // 使用事务确保原子性
        const restoreTransaction = db.transaction(() => {
            // 1. 清空并恢复文件表
            if (data.data.files && Array.isArray(data.data.files)) {
                logger.debug(`Deleting existing files from database...`);
                const deleteResult = db.prepare('DELETE FROM files').run();
                logger.debug(`Deleted ${deleteResult.changes} existing files`);

                const insertFile = db.prepare(`
                    INSERT INTO files (id, name, content, last_modified, file_path, is_local, created_at)
                    VALUES (@id, @name, @content, @last_modified, @file_path, @is_local, @created_at)
                `);

                let insertedCount = 0;
                for (const file of data.data.files) {
                    try {
                        const result = insertFile.run(file);
                        if (result.changes > 0) {
                            insertedCount++;
                        }
                        logger.debug(`Inserted file: ${file.name} (id: ${file.id})`);
                    } catch (error) {
                        logger.error(`Failed to insert file ${file.name}:`, error);
                        throw error;
                    }
                }

                logger.info(`Successfully restored ${insertedCount}/${data.data.files.length} files to database`);
            }

            // 2. 恢复 AI 配置
            if (data.data.ai_config) {
                logger.debug('Deleting existing AI config...');
                const deleteResult = db.prepare('DELETE FROM ai_config').run();
                logger.debug(`Deleted ${deleteResult.changes} AI config records`);

                const insertConfig = db.prepare(`
                    INSERT INTO ai_config (id, provider, model, base_url, api_key_encrypted, temperature, language, updated_at)
                    VALUES (@id, @provider, @model, @base_url, @api_key_encrypted, @temperature, @language, @updated_at)
                `);
                const result = insertConfig.run(data.data.ai_config);
                logger.info(`Restored AI config (changes: ${result.changes})`);
            }

            // 3. 清空并恢复聊天消息
            if (data.data.chat_messages && Array.isArray(data.data.chat_messages)) {
                db.prepare('DELETE FROM chat_messages').run();
                const insertMessage = db.prepare(`
                    INSERT INTO chat_messages (id, role, content, timestamp, conversation_id)
                    VALUES (@id, @role, @content, @timestamp, @conversation_id)
                `);

                for (const message of data.data.chat_messages) {
                    insertMessage.run(message);
                }

                logger.debug(`Restored ${data.data.chat_messages.length} chat messages`);
            }

            // 4. 恢复自定义主题 (不清空,允许合并)
            if (data.data.themes && Array.isArray(data.data.themes)) {
                const insertTheme = db.prepare(`
                    INSERT OR REPLACE INTO themes (id, name, type, colors, is_custom, is_builtin, created_at)
                    VALUES (@id, @name, @type, @colors, @is_custom, @is_builtin, @created_at)
                `);

                for (const theme of data.data.themes) {
                    insertTheme.run(theme);
                }

                logger.debug(`Restored ${data.data.themes.length} themes`);
            }

            // 5. 恢复设置
            if (data.data.settings && Array.isArray(data.data.settings)) {
                db.prepare('DELETE FROM settings').run();
                const insertSetting = db.prepare(`
                    INSERT INTO settings (key, value, updated_at)
                    VALUES (@key, @value, @updated_at)
                `);

                for (const setting of data.data.settings) {
                    insertSetting.run(setting);
                }

                logger.debug(`Restored ${data.data.settings.length} settings`);
            }

            // 6. 清空并恢复错题记录
            if (data.data.mistakes && Array.isArray(data.data.mistakes)) {
                db.prepare('DELETE FROM mistake_records').run();
                const insertMistake = db.prepare(`
                    INSERT INTO mistake_records (id, question, user_answer, correct_answer, explanation, timestamp, quiz_title, file_id)
                    VALUES (@id, @question, @user_answer, @correct_answer, @explanation, @timestamp, @quiz_title, @file_id)
                `);

                for (const mistake of data.data.mistakes) {
                    insertMistake.run(mistake);
                }

                logger.debug(`Restored ${data.data.mistakes.length} mistake records`);
            }

            // 7. 可选: 恢复向量数据
            if (data.data.vector_chunks && Array.isArray(data.data.vector_chunks)) {
                try {
                    db.prepare('DELETE FROM vector_chunks').run();
                    db.prepare('DELETE FROM vector_index_meta').run();

                    const insertChunk = db.prepare(`
                        INSERT INTO vector_chunks (id, file_id, chunk_text, embedding, chunk_index, created_at)
                        VALUES (@id, @file_id, @chunk_text, @embedding, @chunk_index, @created_at)
                    `);

                    for (const chunk of data.data.vector_chunks) {
                        insertChunk.run(chunk);
                    }

                    if (data.data.vector_index_meta && Array.isArray(data.data.vector_index_meta)) {
                        const insertMeta = db.prepare(`
                            INSERT INTO vector_index_meta (file_id, last_modified, model, provider, indexed_at)
                            VALUES (@file_id, @last_modified, @model, @provider, @indexed_at)
                        `);

                        for (const meta of data.data.vector_index_meta) {
                            insertMeta.run(meta);
                        }
                    }

                    logger.debug(`Restored ${data.data.vector_chunks.length} vector chunks`);
                } catch (error) {
                    logger.warn('Vector data restoration failed (tables might not exist)', error);
                }
            }
        });

        // 执行事务
        restoreTransaction();

        logger.info('Data restoration transaction committed successfully');

        // 验证数据已写入
        const verifyResults = {
            filesCount: db.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number },
            aiConfigCount: db.prepare('SELECT COUNT(*) as count FROM ai_config').get() as { count: number },
            messagesCount: db.prepare('SELECT COUNT(*) as count FROM chat_messages').get() as { count: number },
            themesCount: db.prepare('SELECT COUNT(*) as count FROM themes WHERE is_custom = 1').get() as { count: number },
            settingsCount: db.prepare('SELECT COUNT(*) as count FROM settings').get() as { count: number },
            mistakesCount: db.prepare('SELECT COUNT(*) as count FROM mistake_records').get() as { count: number }
        };

        logger.info('Database verification after restore:', verifyResults);

        // 检查是否有数据未成功写入
        const expectedFiles = data.data.files?.length || 0;
        const actualFiles = verifyResults.filesCount.count;
        if (expectedFiles > 0 && actualFiles === 0) {
            throw new Error(`数据写入验证失败: 预期恢复 ${expectedFiles} 个文件,但数据库中只有 ${actualFiles} 个`);
        }

        logger.info('Data restoration completed and verified successfully');
    } catch (error) {
        logger.error('Data restoration failed', error);
        throw new Error(`数据恢复失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 注册备份相关的 IPC 处理器
 */
export function registerBackupHandlers(): void {
    logger.info('Registering backup IPC handlers');

    /**
     * 导出备份到文件
     *
     * @param password - 加密密码
     * @returns 操作结果
     */
    ipcMain.handle('backup:export', async (_, password: string) => {
        try {
            logger.info('Backup export requested');

            // 验证密码
            if (!password || password.length < 6) {
                return {
                    success: false,
                    error: '密码长度至少 6 个字符'
                };
            }

            // 1. 收集数据
            const data = gatherAllData();

            // 2. 加密数据
            const encrypted = encryptData(data, password);

            // 3. 打开保存对话框
            const result = await dialog.showSaveDialog({
                title: '导出备份',
                defaultPath: `zhangnote-backup-${new Date().toISOString().split('T')[0]}.znb`,
                filters: [
                    { name: 'ZhangNote 备份文件', extensions: ['znb'] },
                    { name: '所有文件', extensions: ['*'] }
                ],
                properties: ['createDirectory', 'showOverwriteConfirmation']
            });

            if (result.canceled || !result.filePath) {
                logger.info('Backup export canceled by user');
                return { success: false, canceled: true };
            }

            // 4. 写入文件
            await fs.writeFile(result.filePath, JSON.stringify(encrypted, null, 2), 'utf8');

            logger.info('Backup exported successfully', { path: result.filePath });

            return {
                success: true,
                path: result.filePath,
                size: (await fs.stat(result.filePath)).size
            };
        } catch (error) {
            logger.error('Backup export failed', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    });

    /**
     * 选择备份文件 (不需要密码)
     *
     * 用于先选择文件，再输入密码的两步流程
     *
     * @returns 选择的文件路径和基本信息
     */
    ipcMain.handle('backup:selectFile', async () => {
        try {
            logger.info('Backup file selection requested');

            // 打开文件选择对话框
            const result = await dialog.showOpenDialog({
                title: '选择备份文件',
                filters: [
                    { name: 'ZhangNote 备份文件', extensions: ['znb'] },
                    { name: '所有文件', extensions: ['*'] }
                ],
                properties: ['openFile']
            });

            if (result.canceled || result.filePaths.length === 0) {
                logger.info('Backup file selection canceled by user');
                return { success: false, canceled: true };
            }

            const filePath = result.filePaths[0];
            const stats = await fs.stat(filePath);
            const fileName = path.basename(filePath);

            logger.info('Backup file selected', { filePath, fileName });

            return {
                success: true,
                filePath,
                fileName,
                fileSize: stats.size,
                modifiedAt: stats.mtime.getTime()
            };
        } catch (error) {
            logger.error('Backup file selection failed', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    });

    /**
     * 从文件导入备份
     *
     * @param password - 解密密码
     * @param filePath - 可选的文件路径（如果已通过 selectFile 选择）
     * @returns 操作结果
     */
    ipcMain.handle('backup:import', async (_, password: string, filePath?: string) => {
        try {
            logger.info('Backup import requested', { hasFilePath: !!filePath });

            // 验证密码
            if (!password || password.length < 6) {
                return {
                    success: false,
                    error: '密码长度至少 6 个字符'
                };
            }

            // 如果没有提供文件路径，打开文件选择对话框（兼容旧流程）
            if (!filePath) {
                const result = await dialog.showOpenDialog({
                    title: '导入备份',
                    filters: [
                        { name: 'ZhangNote 备份文件', extensions: ['znb'] },
                        { name: '所有文件', extensions: ['*'] }
                    ],
                    properties: ['openFile']
                });

                if (result.canceled || result.filePaths.length === 0) {
                    logger.info('Backup import canceled by user');
                    return { success: false, canceled: true };
                }

                filePath = result.filePaths[0];
            }

            // 验证文件存在
            try {
                await fs.access(filePath);
            } catch {
                return {
                    success: false,
                    error: '备份文件不存在或无法访问'
                };
            }
            const content = await fs.readFile(filePath, 'utf8');

            // 3. 解析 JSON
            let encrypted: EncryptedBackup;
            try {
                encrypted = JSON.parse(content);
            } catch (error) {
                return {
                    success: false,
                    error: '无效的备份文件格式'
                };
            }

            // 验证备份文件结构
            if (!encrypted.version || !encrypted.salt || !encrypted.iv || !encrypted.data || !encrypted.authTag) {
                return {
                    success: false,
                    error: '备份文件已损坏或格式不正确'
                };
            }

            // 4. 解密数据
            const data = decryptData(encrypted, password);

            // 5. 恢复数据
            restoreData(data);

            logger.info('Backup imported successfully', {
                path: filePath,
                timestamp: new Date(data.timestamp).toISOString()
            });

            return {
                success: true,
                timestamp: data.timestamp,
                itemsRestored: {
                    files: data.data.files?.length || 0,
                    messages: data.data.chat_messages?.length || 0,
                    themes: data.data.themes?.length || 0,
                    settings: data.data.settings?.length || 0,
                    mistakes: data.data.mistakes?.length || 0
                }
            };
        } catch (error) {
            logger.error('Backup import failed', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    });

    /**
     * 获取备份文件信息 (无需密码)
     *
     * 只读取未加密的元数据
     *
     * @param filePath - 备份文件路径
     * @returns 备份文件信息
     */
    ipcMain.handle('backup:getInfo', async (_, filePath: string) => {
        try {
            logger.debug('Getting backup info', { filePath });

            // 读取文件
            const content = await fs.readFile(filePath, 'utf8');

            // 解析 JSON
            let backup: EncryptedBackup;
            try {
                backup = JSON.parse(content);
            } catch (error) {
                return {
                    success: false,
                    error: '无效的备份文件格式'
                };
            }

            // 获取文件统计信息
            const stats = await fs.stat(filePath);

            return {
                success: true,
                version: backup.version,
                fileSize: stats.size,
                modifiedAt: stats.mtime.getTime(),
                // 注意: 时间戳在加密数据中,无法在不解密的情况下获取
                encrypted: true
            };
        } catch (error) {
            logger.error('Failed to get backup info', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    });

    logger.info('Backup IPC handlers registered');
}
