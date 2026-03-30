-- Schema version tracking for migrations
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- Markdown files storage
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    last_modified INTEGER NOT NULL,
    file_path TEXT,
    is_local INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);
CREATE INDEX IF NOT EXISTS idx_files_modified ON files(last_modified DESC);
CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);

-- AI Configuration (singleton pattern - only one row with id=1)
CREATE TABLE IF NOT EXISTS ai_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    provider TEXT NOT NULL DEFAULT 'gemini',
    model TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    base_url TEXT,
    api_key_encrypted TEXT,
    temperature REAL DEFAULT 0.7,
    language TEXT DEFAULT 'en' CHECK (language IN ('en', 'zh')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    conversation_id TEXT DEFAULT 'default',
    session_id TEXT,
    route_key TEXT,
    reply_context_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_chat_timestamp ON chat_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversation ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id);

-- Canonical assistant sessions
CREATE TABLE IF NOT EXISTS assistant_sessions (
    id TEXT PRIMARY KEY,
    route_kind TEXT NOT NULL,
    route_key TEXT NOT NULL UNIQUE,
    scope TEXT NOT NULL,
    origin TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    title TEXT,
    thread_id TEXT,
    parent_session_id TEXT,
    primary_participant_id TEXT,
    participants_json TEXT,
    reply_context_json TEXT,
    metadata_json TEXT,
    started_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    last_message_at INTEGER,
    FOREIGN KEY (parent_session_id) REFERENCES assistant_sessions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_assistant_sessions_status ON assistant_sessions(status);
CREATE INDEX IF NOT EXISTS idx_assistant_sessions_updated ON assistant_sessions(updated_at DESC);

-- Themes (both built-in and custom)
CREATE TABLE IF NOT EXISTS themes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('dark', 'light')),
    colors TEXT NOT NULL,  -- JSON blob
    is_custom INTEGER DEFAULT 0,
    is_builtin INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- Application settings (key-value store for misc settings)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- Quiz mistake records for review
CREATE TABLE IF NOT EXISTS mistake_records (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    user_answer TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    explanation TEXT,
    timestamp INTEGER NOT NULL,
    quiz_title TEXT,
    file_id TEXT,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_mistakes_timestamp ON mistake_records(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_mistakes_file ON mistake_records(file_id);

-- Insert default AI config if not exists
INSERT OR IGNORE INTO ai_config (id, provider, model, temperature, language)
VALUES (1, 'gemini', 'gemini-2.5-flash', 0.7, 'en');

-- Insert schema version
INSERT OR IGNORE INTO schema_version (version) VALUES (1);
