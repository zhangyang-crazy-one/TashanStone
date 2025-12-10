import crypto from 'crypto';
import { getDatabase } from '../index.js';
import { logger } from '../../utils/logger.js';

// 密码哈希参数配置
const SALT_LENGTH = 32;         // 盐值长度 (字节)
const KEY_LENGTH = 64;           // 密钥长度 (字节)
const ITERATIONS = 100000;       // PBKDF2 迭代次数
const DIGEST = 'sha512';         // 摘要算法

/**
 * 用户数据库行接口
 */
interface UserRow {
    id: string;
    username: string;
    password_hash: string;
    salt: string;
    created_at: number;
}

/**
 * 认证响应接口
 */
export interface AuthResult {
    success: boolean;
    error?: string;
}

/**
 * 用户认证仓储类
 * 实现基于 PBKDF2 + 盐值的安全密码认证
 */
export class AuthRepository {
    /**
     * 生成随机盐值
     */
    private generateSalt(): string {
        return crypto.randomBytes(SALT_LENGTH).toString('hex');
    }

    /**
     * 使用 PBKDF2 哈希密码
     * @param password 明文密码
     * @param salt 盐值
     */
    private hashPassword(password: string, salt: string): string {
        return crypto.pbkdf2Sync(
            password,
            salt,
            ITERATIONS,
            KEY_LENGTH,
            DIGEST
        ).toString('hex');
    }

    /**
     * 时序安全比较两个哈希值
     * 防止时序攻击
     */
    private secureCompare(hash1: string, hash2: string): boolean {
        try {
            const buffer1 = Buffer.from(hash1, 'hex');
            const buffer2 = Buffer.from(hash2, 'hex');

            // 长度不同则立即返回 false
            if (buffer1.length !== buffer2.length) {
                return false;
            }

            return crypto.timingSafeEqual(buffer1, buffer2);
        } catch (error) {
            logger.error('secureCompare failed', { error });
            return false;
        }
    }

    /**
     * 检查是否已有用户注册
     */
    isRegistered(): boolean {
        try {
            const db = getDatabase();
            const result = db.prepare(`
                SELECT COUNT(*) as count FROM users
            `).get() as { count: number };

            return result.count > 0;
        } catch (error) {
            logger.error('isRegistered check failed', { error });
            return false;
        }
    }

    /**
     * 获取用户名 (不暴露密码信息)
     */
    getUsername(): string | null {
        try {
            const db = getDatabase();
            const result = db.prepare(`
                SELECT username FROM users LIMIT 1
            `).get() as UserRow | undefined;

            return result?.username || null;
        } catch (error) {
            logger.error('getUsername failed', { error });
            return null;
        }
    }

    /**
     * 注册新用户
     * @param username 用户名
     * @param password 明文密码
     */
    register(username: string, password: string): AuthResult {
        try {
            const db = getDatabase();

            // 1. 检查是否已有用户
            if (this.isRegistered()) {
                logger.warn('Registration attempted when user already exists');
                return {
                    success: false,
                    error: '系统已有注册用户'
                };
            }

            // 2. 验证输入参数
            if (!username || username.trim().length === 0) {
                return {
                    success: false,
                    error: '用户名不能为空'
                };
            }

            if (!password || password.length < 6) {
                return {
                    success: false,
                    error: '密码长度至少为 6 位'
                };
            }

            // 3. 生成盐值和哈希
            const salt = this.generateSalt();
            const passwordHash = this.hashPassword(password, salt);
            const userId = crypto.randomUUID();
            const now = Date.now();

            // 4. 插入数据库
            db.prepare(`
                INSERT INTO users (id, username, password_hash, salt, created_at)
                VALUES (?, ?, ?, ?, ?)
            `).run(userId, username.trim(), passwordHash, salt, now);

            logger.info('User registered successfully', {
                userId,
                username: username.trim()
            });

            return { success: true };
        } catch (error) {
            logger.error('Registration failed', { error });
            return {
                success: false,
                error: '注册失败,请重试'
            };
        }
    }

    /**
     * 验证密码
     * @param password 明文密码
     */
    verify(password: string): boolean {
        try {
            const db = getDatabase();

            // 1. 获取用户信息
            const user = db.prepare(`
                SELECT id, username, password_hash, salt FROM users LIMIT 1
            `).get() as UserRow | undefined;

            if (!user) {
                logger.warn('Verify attempted when no user exists');
                // 执行假哈希操作,防止时序攻击泄露用户是否存在
                this.hashPassword(password, this.generateSalt());
                return false;
            }

            // 2. 使用相同参数哈希输入密码
            const inputHash = this.hashPassword(password, user.salt);

            // 3. 时序安全比较哈希值
            const isValid = this.secureCompare(inputHash, user.password_hash);

            if (isValid) {
                logger.info('User authentication successful', {
                    userId: user.id,
                    username: user.username
                });
            } else {
                logger.warn('User authentication failed', {
                    userId: user.id,
                    username: user.username
                });
            }

            return isValid;
        } catch (error) {
            logger.error('Password verification failed', { error });
            return false;
        }
    }

    /**
     * 修改密码
     * @param oldPassword 旧密码
     * @param newPassword 新密码
     */
    changePassword(oldPassword: string, newPassword: string): AuthResult {
        try {
            const db = getDatabase();

            // 1. 验证旧密码
            if (!this.verify(oldPassword)) {
                logger.warn('Change password failed: old password incorrect');
                return {
                    success: false,
                    error: '原密码错误'
                };
            }

            // 2. 验证新密码
            if (!newPassword || newPassword.length < 6) {
                return {
                    success: false,
                    error: '新密码长度至少为 6 位'
                };
            }

            // 3. 生成新盐值和哈希
            const newSalt = this.generateSalt();
            const newPasswordHash = this.hashPassword(newPassword, newSalt);

            // 4. 更新数据库
            const result = db.prepare(`
                UPDATE users
                SET password_hash = ?, salt = ?
                WHERE id = (SELECT id FROM users LIMIT 1)
            `).run(newPasswordHash, newSalt);

            if (result.changes === 0) {
                return {
                    success: false,
                    error: '密码更新失败'
                };
            }

            logger.info('Password changed successfully');

            return { success: true };
        } catch (error) {
            logger.error('Change password failed', { error });
            return {
                success: false,
                error: '密码修改失败,请重试'
            };
        }
    }

    /**
     * 重置密码 (危险操作,仅用于管理员或找回密码场景)
     * @param newPassword 新密码
     */
    resetPassword(newPassword: string): AuthResult {
        try {
            const db = getDatabase();

            // 验证新密码
            if (!newPassword || newPassword.length < 6) {
                return {
                    success: false,
                    error: '新密码长度至少为 6 位'
                };
            }

            // 生成新盐值和哈希
            const newSalt = this.generateSalt();
            const newPasswordHash = this.hashPassword(newPassword, newSalt);

            // 更新数据库
            const result = db.prepare(`
                UPDATE users
                SET password_hash = ?, salt = ?
                WHERE id = (SELECT id FROM users LIMIT 1)
            `).run(newPasswordHash, newSalt);

            if (result.changes === 0) {
                return {
                    success: false,
                    error: '密码重置失败'
                };
            }

            logger.warn('Password reset performed (bypass old password verification)');

            return { success: true };
        } catch (error) {
            logger.error('Reset password failed', { error });
            return {
                success: false,
                error: '密码重置失败,请重试'
            };
        }
    }

    /**
     * 删除所有用户数据 (工厂重置)
     * 这将清空 users 表,允许重新注册
     */
    reset(): AuthResult {
        try {
            const db = getDatabase();

            // 删除所有用户
            db.prepare('DELETE FROM users').run();

            logger.warn('All users deleted (factory reset)');

            return { success: true };
        } catch (error) {
            logger.error('Factory reset failed', { error });
            return {
                success: false,
                error: '重置失败,请重试'
            };
        }
    }
}

export const authRepository = new AuthRepository();
