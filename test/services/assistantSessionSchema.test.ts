import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const baseDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(baseDir, '../../electron/database/schema.sql');
const migrationsPath = resolve(baseDir, '../../electron/database/migrations.ts');

describe('assistant session schema baseline', () => {
  it('adds a canonical assistant_sessions table and session-aware chat message columns to schema.sql', () => {
    const schema = readFileSync(schemaPath, 'utf8');

    expect(schema).toContain('CREATE TABLE IF NOT EXISTS assistant_sessions');
    expect(schema).toContain('route_key TEXT NOT NULL UNIQUE');
    expect(schema).toContain('reply_context_json TEXT');
    expect(schema).toContain('session_id TEXT');
    expect(schema).toContain('CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id)');
  });

  it('adds a migration for canonical assistant sessions and reply-context metadata', () => {
    const migrations = readFileSync(migrationsPath, 'utf8');

    expect(migrations).toContain('version: 12');
    expect(migrations).toContain('Add canonical assistant sessions plus route and reply-context persistence');
    expect(migrations).toContain('ALTER TABLE chat_messages ADD COLUMN session_id TEXT');
    expect(migrations).toContain('CREATE TABLE IF NOT EXISTS assistant_sessions');
    expect(migrations).toContain('UPDATE chat_messages');
  });

  it('keeps checkpoints and compacted sessions compatible with the canonical session model', () => {
    const migrations = readFileSync(migrationsPath, 'utf8');

    expect(migrations).toContain('CREATE TABLE IF NOT EXISTS chat_checkpoints');
    expect(migrations).toContain('CREATE TABLE IF NOT EXISTS compacted_sessions');
    expect(migrations).toContain('conversation_id');
  });
});
