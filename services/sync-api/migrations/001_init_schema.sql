-- xPaste 同步服务数据库初始化脚本 (SQLite)
-- 创建时间: 2024-01-20

-- 启用外键约束
PRAGMA foreign_keys = ON;

-- 创建用户表
CREATE TABLE users (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);

-- 创建设备表
CREATE TABLE devices (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('windows', 'macos', 'linux')),
    version TEXT NOT NULL,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_last_seen ON devices(last_seen_at DESC);

-- 创建剪贴板项表
CREATE TABLE clip_items (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('text', 'image', 'file', 'html')),
    hash TEXT NOT NULL,
    content TEXT,
    content_ref TEXT,
    note TEXT,
    favorite INTEGER DEFAULT 0,
    deleted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX idx_clip_items_user_id ON clip_items(user_id);
CREATE INDEX idx_clip_items_device_id ON clip_items(device_id);
CREATE INDEX idx_clip_items_hash ON clip_items(hash);
CREATE INDEX idx_clip_items_created_at ON clip_items(created_at DESC);
CREATE INDEX idx_clip_items_type ON clip_items(type);
CREATE INDEX idx_clip_items_favorite ON clip_items(favorite) WHERE favorite = 1;
CREATE INDEX idx_clip_items_deleted ON clip_items(deleted) WHERE deleted = 0;

-- 创建 OCR 结果表
CREATE TABLE ocr_results (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    clip_item_id TEXT NOT NULL REFERENCES clip_items(id) ON DELETE CASCADE,
    recognized_text TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'auto',
    confidence REAL DEFAULT 0.0,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX idx_ocr_results_clip_item_id ON ocr_results(clip_item_id);
CREATE INDEX idx_ocr_results_language ON ocr_results(language);

-- 创建设置表
CREATE TABLE settings (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX idx_settings_user_id ON settings(user_id);
CREATE INDEX idx_settings_key ON settings(key);
CREATE UNIQUE INDEX idx_settings_user_key ON settings(user_id, key);

-- 初始化数据
INSERT INTO settings (key, value, category) VALUES
('max_history_items', '1000', 'storage'),
('auto_cleanup_days', '30', 'storage'),
('enable_ocr', 'true', 'features'),
('ocr_language', 'auto', 'features'),
('sync_interval', '300', 'sync'),
('enable_notifications', 'true', 'ui');

-- 创建触发器用于自动更新 updated_at 字段
CREATE TRIGGER update_users_updated_at
    AFTER UPDATE ON users
    FOR EACH ROW
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER update_clip_items_updated_at
    AFTER UPDATE ON clip_items
    FOR EACH ROW
BEGIN
    UPDATE clip_items SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER update_settings_updated_at
    AFTER UPDATE ON settings
    FOR EACH ROW
BEGIN
    UPDATE settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;