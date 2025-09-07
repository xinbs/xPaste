-- 更新设置表结构以匹配Go模型
-- 创建时间: 2024-01-20

-- 删除旧的设置表
DROP TABLE IF EXISTS settings;

-- 创建新的设置表
CREATE TABLE settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    
    -- 关联信息
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    
    -- 设置信息
    key TEXT NOT NULL,
    value TEXT,
    type TEXT NOT NULL DEFAULT 'string' CHECK (type IN ('string', 'number', 'boolean', 'json', 'array', 'object')),
    category TEXT DEFAULT 'general',
    description TEXT,
    
    -- 约束信息
    is_readonly INTEGER DEFAULT 0,
    is_encrypted INTEGER DEFAULT 0,
    default_value TEXT,
    validation TEXT,
    
    -- 元数据
    metadata TEXT DEFAULT '{}'
);

-- 创建索引
CREATE INDEX idx_settings_user_id ON settings(user_id);
CREATE INDEX idx_settings_key ON settings(key);
CREATE INDEX idx_settings_category ON settings(category);
CREATE INDEX idx_settings_deleted_at ON settings(deleted_at);
CREATE UNIQUE INDEX idx_settings_user_key ON settings(user_id, key) WHERE deleted_at IS NULL;

-- 插入默认系统设置
INSERT INTO settings (user_id, key, value, type, category, description, default_value, metadata) VALUES
(NULL, 'system.name', 'xPaste Sync Service', 'string', 'system', '系统名称', 'xPaste Sync Service', '{"display_name":"系统名称","group":"基本信息","order":1}'),
(NULL, 'system.version', '1.0.0', 'string', 'system', '系统版本', '1.0.0', '{"display_name":"系统版本","group":"基本信息","order":2,"is_readonly":true}'),
(NULL, 'system.max_file_size', '10485760', 'number', 'system', '最大文件大小（字节）', '10485760', '{"display_name":"最大文件大小","group":"存储限制","order":1,"min_value":1048576,"max_value":104857600}'),
(NULL, 'system.max_clip_items', '10000', 'number', 'system', '最大剪贴板项数', '10000', '{"display_name":"最大剪贴板项数","group":"存储限制","order":2,"min_value":100,"max_value":100000}'),
(NULL, 'system.retention_days', '30', 'number', 'system', '数据保留天数（0表示永久保留）', '30', '{"display_name":"数据保留天数","group":"数据管理","order":1,"min_value":0,"max_value":365}'),
(NULL, 'system.allow_registration', 'true', 'boolean', 'system', '是否允许用户注册', 'true', '{"display_name":"允许用户注册","group":"安全设置","order":1,"input_type":"checkbox"}');

-- 创建触发器用于自动更新 updated_at 字段
CREATE TRIGGER update_settings_updated_at_v2
    AFTER UPDATE ON settings
    FOR EACH ROW
BEGIN
    UPDATE settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;