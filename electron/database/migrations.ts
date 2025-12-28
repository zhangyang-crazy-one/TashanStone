import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

/**
 * 数据库迁移接口
 */
export interface Migration {
    version: number;
    description: string;
    up: (db: Database.Database) => void;
    down?: (db: Database.Database) => void;
}

/**
 * 迁移管理器
 * 负责管理数据库 schema 版本和执行迁移
 */
export class MigrationManager {
    private db: Database.Database;
    private migrations: Migration[] = [];

    constructor(db: Database.Database) {
        this.db = db;
    }

    /**
     * 注册迁移
     */
    register(migration: Migration): void {
        this.migrations.push(migration);
        // 按版本号排序
        this.migrations.sort((a, b) => a.version - b.version);
    }

    /**
     * 批量注册迁移
     */
    registerAll(migrations: Migration[]): void {
        migrations.forEach(m => this.register(m));
    }

    /**
     * 获取当前数据库版本
     */
    getCurrentVersion(): number {
        try {
            const result = this.db.prepare(`
                SELECT MAX(version) as version FROM schema_version
            `).get() as { version: number | null };

            return result?.version || 0;
        } catch (error) {
            logger.warn('schema_version table not found, assuming version 0', error);
            return 0;
        }
    }

    /**
     * 设置数据库版本
     */
    private setVersion(version: number): void {
        this.db.prepare(`
            INSERT INTO schema_version (version, applied_at)
            VALUES (?, ?)
        `).run(version, Date.now());
    }

    /**
     * 执行所有待处理的迁移
     * @returns 成功执行的迁移数量
     */
    migrateToLatest(): number {
        const currentVersion = this.getCurrentVersion();
        const pendingMigrations = this.migrations.filter(m => m.version > currentVersion);

        if (pendingMigrations.length === 0) {
            logger.info('Database is up to date', { currentVersion });
            return 0;
        }

        logger.info('Pending migrations found', {
            currentVersion,
            pendingCount: pendingMigrations.length,
            targetVersion: pendingMigrations[pendingMigrations.length - 1].version
        });

        let appliedCount = 0;

        for (const migration of pendingMigrations) {
            try {
                this.applyMigration(migration);
                appliedCount++;
            } catch (error) {
                logger.error('Migration failed', {
                    version: migration.version,
                    description: migration.description,
                    error
                });
                throw new Error(`Migration ${migration.version} failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        logger.info('Migrations completed successfully', { appliedCount });
        return appliedCount;
    }

    /**
     * 应用单个迁移（在事务中执行）
     */
    private applyMigration(migration: Migration): void {
        logger.info('Applying migration', {
            version: migration.version,
            description: migration.description
        });

        // 使用事务确保原子性
        const transaction = this.db.transaction(() => {
            migration.up(this.db);
            this.setVersion(migration.version);
        });

        transaction();

        logger.info('Migration applied successfully', {
            version: migration.version
        });
    }

    /**
     * 回滚到指定版本（谨慎使用）
     * @param targetVersion 目标版本号
     */
    rollbackTo(targetVersion: number): void {
        const currentVersion = this.getCurrentVersion();

        if (targetVersion >= currentVersion) {
            logger.warn('Target version is not lower than current version', {
                currentVersion,
                targetVersion
            });
            return;
        }

        const migrationsToRollback = this.migrations
            .filter(m => m.version > targetVersion && m.version <= currentVersion)
            .sort((a, b) => b.version - a.version); // 倒序回滚

        for (const migration of migrationsToRollback) {
            if (!migration.down) {
                throw new Error(`Migration ${migration.version} does not support rollback`);
            }

            logger.warn('Rolling back migration', {
                version: migration.version,
                description: migration.description
            });

            const transaction = this.db.transaction(() => {
                migration.down!(this.db);
                this.db.prepare('DELETE FROM schema_version WHERE version = ?').run(migration.version);
            });

            transaction();
        }

        logger.info('Rollback completed', { targetVersion });
    }

    /**
     * 验证迁移完整性
     */
    validate(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        const versions = new Set<number>();

        // 检查版本号唯一性
        for (const migration of this.migrations) {
            if (versions.has(migration.version)) {
                errors.push(`Duplicate migration version: ${migration.version}`);
            }
            versions.add(migration.version);
        }

        // 检查版本号连续性（建议但不强制）
        const sortedVersions = Array.from(versions).sort((a, b) => a - b);
        for (let i = 1; i < sortedVersions.length; i++) {
            if (sortedVersions[i] - sortedVersions[i - 1] > 1) {
                logger.warn('Gap in migration versions', {
                    from: sortedVersions[i - 1],
                    to: sortedVersions[i]
                });
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * 获取迁移历史
     */
    getHistory(): { version: number; applied_at: number }[] {
        try {
            const rows = this.db.prepare(`
                SELECT version, applied_at
                FROM schema_version
                ORDER BY version ASC
            `).all() as { version: number; applied_at: number }[];

            return rows;
        } catch (error) {
            logger.warn('Failed to get migration history', error);
            return [];
        }
    }
}

/**
 * 预定义的迁移示例
 * 未来可以添加更多迁移
 */
export const migrations: Migration[] = [
    // Version 2: RAG 向量存储持久化
    {
        version: 2,
        description: 'Add vector_chunks table for RAG persistence',
        up: (db) => {
            db.exec(`
                -- 向量块存储表 (无外键约束，允许独立于files表存储)
                CREATE TABLE IF NOT EXISTS vector_chunks (
                    id TEXT PRIMARY KEY,
                    file_id TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    embedding BLOB,
                    chunk_start INTEGER NOT NULL,
                    chunk_end INTEGER NOT NULL,
                    file_name TEXT NOT NULL,
                    file_last_modified INTEGER NOT NULL,
                    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                    UNIQUE(file_id, chunk_index)
                );

                -- 索引: 按文件ID查询
                CREATE INDEX IF NOT EXISTS idx_chunks_file ON vector_chunks(file_id);
                -- 索引: 按文件ID和修改时间查询(用于检查是否需要重新索引)
                CREATE INDEX IF NOT EXISTS idx_chunks_file_modified ON vector_chunks(file_id, file_last_modified);

                -- 向量索引元数据表 (无外键约束)
                CREATE TABLE IF NOT EXISTS vector_index_meta (
                    file_id TEXT PRIMARY KEY,
                    last_modified INTEGER NOT NULL,
                    chunk_count INTEGER NOT NULL,
                    indexed_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                    embedding_model TEXT,
                    embedding_provider TEXT
                );
            `);
            logger.info('RAG vector persistence tables created successfully');
        },
        down: (db) => {
            db.exec(`
                DROP TABLE IF EXISTS vector_index_meta;
                DROP TABLE IF EXISTS vector_chunks;
            `);
            logger.warn('RAG vector persistence tables dropped');
        }
    },
    // Version 3: 修复外键约束问题 - 重建无外键的向量表
    {
        version: 3,
        description: 'Rebuild vector tables without foreign key constraints',
        up: (db) => {
            db.exec(`
                -- 删除旧表（如果存在）
                DROP TABLE IF EXISTS vector_chunks;
                DROP TABLE IF EXISTS vector_index_meta;

                -- 重建向量块存储表（无外键约束）
                CREATE TABLE vector_chunks (
                    id TEXT PRIMARY KEY,
                    file_id TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    embedding BLOB,
                    chunk_start INTEGER NOT NULL,
                    chunk_end INTEGER NOT NULL,
                    file_name TEXT NOT NULL,
                    file_last_modified INTEGER NOT NULL,
                    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                    UNIQUE(file_id, chunk_index)
                );

                -- 索引
                CREATE INDEX idx_chunks_file ON vector_chunks(file_id);
                CREATE INDEX idx_chunks_file_modified ON vector_chunks(file_id, file_last_modified);

                -- 重建向量索引元数据表（无外键约束）
                CREATE TABLE vector_index_meta (
                    file_id TEXT PRIMARY KEY,
                    last_modified INTEGER NOT NULL,
                    chunk_count INTEGER NOT NULL,
                    indexed_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                    embedding_model TEXT,
                    embedding_provider TEXT
                );
            `);
            logger.info('Vector tables rebuilt without foreign key constraints');
        },
        down: (db) => {
            // Version 3 down 不做任何事，因为版本2也能处理
            logger.warn('Version 3 rollback - no action needed');
        }
    },
    // Version 4: 用户认证表
    {
        version: 4,
        description: 'Add users table for authentication',
        up: (db) => {
            db.exec(`
                -- 用户认证表
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    salt TEXT NOT NULL,
                    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
                );

                -- 索引: 按用户名查询
                CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
            `);
            logger.info('Users authentication table created successfully');
        },
        down: (db) => {
            db.exec(`
                DROP INDEX IF EXISTS idx_users_username;
                DROP TABLE IF EXISTS users;
            `);
            logger.warn('Users authentication table dropped');
        }
    },
    // Version 5: 代码片段表
    {
        version: 5,
        description: 'Add snippets table for code/text snippets',
        up: (db) => {
            db.exec(`
                -- 代码片段表
                CREATE TABLE IF NOT EXISTS snippets (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    content TEXT NOT NULL,
                    category TEXT DEFAULT 'text',
                    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
                );

                -- 索引: 按分类和创建时间查询
                CREATE INDEX IF NOT EXISTS idx_snippets_category ON snippets(category);
                CREATE INDEX IF NOT EXISTS idx_snippets_created ON snippets(created_at DESC);
            `);
            logger.info('Snippets table created successfully');
        },
        down: (db) => {
            db.exec(`
                DROP INDEX IF EXISTS idx_snippets_created;
                DROP INDEX IF EXISTS idx_snippets_category;
                DROP TABLE IF EXISTS snippets;
            `);
            logger.warn('Snippets table dropped');
        }
    },
    // Version 6: 学习计划表
    {
        version: 6,
        description: 'Add study_plans and review_tasks tables for spaced repetition',
        up: (db) => {
            db.exec(`
                -- 学习计划表
                CREATE TABLE IF NOT EXISTS study_plans (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    created_date INTEGER NOT NULL,
                    progress INTEGER DEFAULT 0,
                    tags TEXT
                );

                -- 复习任务表（外键关联学习计划，级联删除）
                CREATE TABLE IF NOT EXISTS review_tasks (
                    id TEXT PRIMARY KEY,
                    plan_id TEXT NOT NULL,
                    scheduled_date INTEGER NOT NULL,
                    completed_date INTEGER,
                    interval_label TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    FOREIGN KEY (plan_id) REFERENCES study_plans(id) ON DELETE CASCADE
                );

                -- 索引: 按计划ID查询任务
                CREATE INDEX IF NOT EXISTS idx_review_tasks_plan ON review_tasks(plan_id);
                -- 索引: 按状态和计划日期查询
                CREATE INDEX IF NOT EXISTS idx_review_tasks_status_date ON review_tasks(status, scheduled_date);
                -- 索引: 按创建日期查询学习计划
                CREATE INDEX IF NOT EXISTS idx_study_plans_created ON study_plans(created_date DESC);
            `);
            logger.info('Study plans and review tasks tables created successfully');
        },
        down: (db) => {
            db.exec(`
                DROP INDEX IF EXISTS idx_study_plans_created;
                DROP INDEX IF EXISTS idx_review_tasks_status_date;
                DROP INDEX IF EXISTS idx_review_tasks_plan;
                DROP TABLE IF EXISTS review_tasks;
                DROP TABLE IF EXISTS study_plans;
            `);
            logger.warn('Study plans and review tasks tables dropped');
        }
    },
    // Version 7: 考试结果表
    {
        version: 7,
        description: 'Add exam_results table for quiz history tracking',
        up: (db) => {
            db.exec(`
                -- 考试结果表
                CREATE TABLE IF NOT EXISTS exam_results (
                    id TEXT PRIMARY KEY,
                    quiz_title TEXT NOT NULL,
                    date INTEGER NOT NULL,
                    score REAL NOT NULL,
                    total_questions INTEGER NOT NULL,
                    correct_count INTEGER NOT NULL,
                    duration INTEGER NOT NULL,
                    tags TEXT,
                    source_file_id TEXT,
                    FOREIGN KEY (source_file_id) REFERENCES files(id) ON DELETE SET NULL
                );

                -- 索引: 按日期查询
                CREATE INDEX IF NOT EXISTS idx_exam_results_date ON exam_results(date DESC);
                -- 索引: 按源文件查询
                CREATE INDEX IF NOT EXISTS idx_exam_results_file ON exam_results(source_file_id);
            `);
            logger.info('Exam results table created successfully');
        },
        down: (db) => {
            db.exec(`
                DROP INDEX IF EXISTS idx_exam_results_file;
                DROP INDEX IF EXISTS idx_exam_results_date;
                DROP TABLE IF EXISTS exam_results;
            `);
            logger.warn('Exam results table dropped');
        }
    },
    // Version 8: 笔记布局表 (3D Note Space)
    {
        version: 8,
        description: 'Add note_layouts table for 3D note space positioning',
        up: (db) => {
            db.exec(`
                -- 笔记布局表 (3D空间位置信息)
                CREATE TABLE IF NOT EXISTS note_layouts (
                    id TEXT PRIMARY KEY,
                    file_id TEXT NOT NULL UNIQUE,
                    x REAL DEFAULT 0,
                    y REAL DEFAULT 0,
                    z REAL DEFAULT 0,
                    rotation REAL DEFAULT 0,
                    width REAL DEFAULT 300,
                    height REAL DEFAULT 200,
                    scale REAL DEFAULT 1,
                    color TEXT,
                    is_pinned INTEGER DEFAULT 0,
                    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
                );

                -- 索引: 按文件ID查询 (UNIQUE约束已自动创建索引)
                -- 索引: 按固定状态查询
                CREATE INDEX IF NOT EXISTS idx_note_layouts_pinned ON note_layouts(is_pinned);
            `);
            logger.info('Note layouts table created successfully');
        },
        down: (db) => {
            db.exec(`
                DROP INDEX IF EXISTS idx_note_layouts_pinned;
                DROP TABLE IF EXISTS note_layouts;
            `);
            logger.warn('Note layouts table dropped');
        }
    },
    // Version 9: 上下文工程 - 消息压缩标记、检查点、中期记忆
    {
        version: 9,
        description: 'Add context engineering tables: checkpoints, compacted_sessions, message compression markers',
        up: (db) => {
            db.exec(`
                -- 扩展 chat_messages 表，添加压缩和截断标记字段
                ALTER TABLE chat_messages ADD COLUMN is_summary INTEGER DEFAULT 0;
                ALTER TABLE chat_messages ADD COLUMN condense_id TEXT;
                ALTER TABLE chat_messages ADD COLUMN condense_parent TEXT;
                ALTER TABLE chat_messages ADD COLUMN is_truncation_marker INTEGER DEFAULT 0;
                ALTER TABLE chat_messages ADD COLUMN truncation_id TEXT;
                ALTER TABLE chat_messages ADD COLUMN truncation_parent TEXT;
                ALTER TABLE chat_messages ADD COLUMN checkpoint_id TEXT;
                ALTER TABLE chat_messages ADD COLUMN token_count INTEGER;

                -- 检查点表
                CREATE TABLE IF NOT EXISTS chat_checkpoints (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    message_count INTEGER NOT NULL,
                    token_count INTEGER NOT NULL,
                    summary TEXT NOT NULL,
                    messages_snapshot TEXT NOT NULL,
                    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
                );

                -- 索引: 按会话ID查询检查点
                CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON chat_checkpoints(session_id);
                -- 索引: 按创建时间查询
                CREATE INDEX IF NOT EXISTS idx_checkpoints_created ON chat_checkpoints(created_at DESC);

                -- 中期记忆摘要表
                CREATE TABLE IF NOT EXISTS compacted_sessions (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    key_topics TEXT,
                    decisions TEXT,
                    message_start INTEGER NOT NULL,
                    message_end INTEGER NOT NULL,
                    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
                );

                -- 索引: 按会话ID查询
                CREATE INDEX IF NOT EXISTS idx_compacted_session ON compacted_sessions(session_id);
                -- 索引: 按创建时间查询
                CREATE INDEX IF NOT EXISTS idx_compacted_created ON compacted_sessions(created_at DESC);
            `);
            logger.info('Context engineering tables created successfully');
        },
        down: (db) => {
            db.exec(`
                -- 删除中期记忆摘要表
                DROP INDEX IF EXISTS idx_compacted_created;
                DROP INDEX IF EXISTS idx_compacted_session;
                DROP TABLE IF EXISTS compacted_sessions;

                -- 删除检查点表
                DROP INDEX IF EXISTS idx_checkpoints_created;
                DROP INDEX IF EXISTS idx_checkpoints_session;
                DROP TABLE IF EXISTS chat_checkpoints;

                -- 移除 chat_messages 的压缩标记列
                ALTER TABLE chat_messages DROP COLUMN token_count;
                ALTER TABLE chat_messages DROP COLUMN checkpoint_id;
                ALTER TABLE chat_messages DROP COLUMN truncation_parent;
                ALTER TABLE chat_messages DROP COLUMN truncation_id;
                ALTER TABLE chat_messages DROP COLUMN is_truncation_marker;
                ALTER TABLE chat_messages DROP COLUMN condense_parent;
                ALTER TABLE chat_messages DROP COLUMN condense_id;
                ALTER TABLE chat_messages DROP COLUMN is_summary;
            `);
            logger.warn('Context engineering tables and columns dropped');
        }
    }
];
