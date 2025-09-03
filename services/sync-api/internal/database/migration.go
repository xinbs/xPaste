package database

import (
	"fmt"
	"log"

	"xpaste-sync/internal/models"
)

// MigrateDatabase 执行数据库迁移
// 这是统一的迁移入口，替代原来的双重迁移系统
func MigrateDatabase() error {
	if DB == nil {
		return fmt.Errorf("database not initialized")
	}

	// 检查是否需要迁移
	needsMigration, err := checkIfMigrationNeeded()
	if err != nil {
		return fmt.Errorf("failed to check migration status: %w", err)
	}

	if !needsMigration {
		log.Println("Database is up to date, skipping migration")
		return nil
	}

	log.Println("Starting database migration...")

	// 1. 首先检查是否需要清理旧的不兼容表结构
	if err := cleanupIncompatibleTables(); err != nil {
		return fmt.Errorf("failed to cleanup incompatible tables: %w", err)
	}

	// 2. 执行 GORM 自动迁移
	if err := autoMigrateModels(); err != nil {
		return fmt.Errorf("failed to auto migrate models: %w", err)
	}

	// 3. 创建必要的索引
	if err := createCustomIndexes(); err != nil {
		return fmt.Errorf("failed to create custom indexes: %w", err)
	}

	// 4. 初始化种子数据
	if err := seedInitialData(); err != nil {
		return fmt.Errorf("failed to seed initial data: %w", err)
	}

	// 5. 记录迁移完成状态
	if err := recordMigrationStatus(); err != nil {
		return fmt.Errorf("failed to record migration status: %w", err)
	}

	log.Println("Database migration completed successfully")
	return nil
}

// checkIfMigrationNeeded 检查是否需要执行迁移
func checkIfMigrationNeeded() (bool, error) {
	// 检查必要的表是否存在
	requiredTables := []string{"users", "devices", "clip_items", "ocr_results", "settings"}

	for _, table := range requiredTables {
		var exists bool
		err := DB.Raw("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&exists).Error
		if err != nil {
			return false, err
		}
		if !exists {
			log.Printf("Table %s does not exist, migration needed", table)
			return true, nil
		}
	}

	// 检查迁移版本
	version, err := getCurrentMigrationVersion()
	if err != nil {
		// 如果无法获取版本，说明是新数据库或需要迁移
		log.Println("Cannot get migration version, migration needed")
		return true, nil
	}

	currentVersion := getCurrentCodeVersion()
	if version < currentVersion {
		log.Printf("Database version %d is older than code version %d, migration needed", version, currentVersion)
		return true, nil
	}

	return false, nil
}

// getCurrentMigrationVersion 获取当前数据库迁移版本
func getCurrentMigrationVersion() (int, error) {
	// 检查迁移表是否存在
	var exists bool
	err := DB.Raw("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").Scan(&exists).Error
	if err != nil {
		return 0, err
	}

	if !exists {
		return 0, fmt.Errorf("schema_migrations table does not exist")
	}

	var version int
	err = DB.Raw("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").Scan(&version).Error
	if err != nil {
		return 0, err
	}

	return version, nil
}

// getCurrentCodeVersion 获取当前代码版本
func getCurrentCodeVersion() int {
	// 这里定义当前代码的数据库版本
	// 每次修改数据库结构时，需要增加这个版本号
	return 1
}

// recordMigrationStatus 记录迁移状态
func recordMigrationStatus() error {
	// 创建迁移表（如果不存在）
	err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`).Error
	if err != nil {
		return err
	}

	// 记录当前版本
	currentVersion := getCurrentCodeVersion()
	err = DB.Exec(`
		INSERT OR REPLACE INTO schema_migrations (version, applied_at) 
		VALUES (?, CURRENT_TIMESTAMP)
	`, currentVersion).Error

	if err != nil {
		return err
	}

	log.Printf("Recorded migration version: %d", currentVersion)
	return nil
}

// cleanupIncompatibleTables 清理不兼容的表结构
func cleanupIncompatibleTables() error {
	log.Println("Checking for incompatible table structures...")

	// 检查是否存在使用 TEXT 主键的旧表
	var tableExists bool

	// 检查 users 表的主键类型
	err := DB.Raw("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").Scan(&tableExists).Error
	if err != nil {
		return err
	}

	if tableExists {
		// 检查主键类型
		var columnInfo struct {
			Type string `json:"type"`
		}
		err := DB.Raw("PRAGMA table_info(users)").Where("name = ? AND pk = 1", "id").Scan(&columnInfo).Error
		if err == nil && columnInfo.Type == "TEXT" {
			log.Println("Found incompatible table structure with TEXT primary keys, cleaning up...")

			// 删除所有相关表（按依赖顺序）
			tables := []string{"ocr_results", "clip_items", "settings", "devices", "users"}
			for _, table := range tables {
				if err := DB.Exec(fmt.Sprintf("DROP TABLE IF EXISTS %s", table)).Error; err != nil {
					log.Printf("Warning: failed to drop table %s: %v", table, err)
				} else {
					log.Printf("Dropped incompatible table: %s", table)
				}
			}
		}
	}

	return nil
}

// autoMigrateModels 执行 GORM 自动迁移
func autoMigrateModels() error {
	log.Println("Running GORM auto migration...")

	// 按依赖顺序迁移模型
	models := []interface{}{
		&models.User{},
		&models.Device{},
		&models.ClipItem{},
		&models.OcrResult{},
		&models.Setting{},
	}

	for _, model := range models {
		if err := DB.AutoMigrate(model); err != nil {
			return fmt.Errorf("failed to migrate %T: %w", model, err)
		}
		log.Printf("Successfully migrated model: %T", model)
	}

	return nil
}

// createCustomIndexes 创建自定义索引
func createCustomIndexes() error {
	log.Println("Creating custom indexes...")

	indexes := []struct {
		name  string
		query string
	}{
		// 用户表索引
		{"idx_users_username", "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)"},
		{"idx_users_email", "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)"},
		{"idx_users_status", "CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)"},
		{"idx_users_last_login", "CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login)"},

		// 设备表索引
		{"idx_devices_user_id", "CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id)"},
		{"idx_devices_device_id", "CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id)"},
		{"idx_devices_platform", "CREATE INDEX IF NOT EXISTS idx_devices_platform ON devices(platform)"},
		{"idx_devices_status", "CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status)"},
		{"idx_devices_is_online", "CREATE INDEX IF NOT EXISTS idx_devices_is_online ON devices(is_online)"},
		{"idx_devices_last_seen", "CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen)"},

		// 剪贴板项表索引
		{"idx_clip_items_user_id", "CREATE INDEX IF NOT EXISTS idx_clip_items_user_id ON clip_items(user_id)"},
		{"idx_clip_items_device_id", "CREATE INDEX IF NOT EXISTS idx_clip_items_device_id ON clip_items(device_id)"},
		{"idx_clip_items_type", "CREATE INDEX IF NOT EXISTS idx_clip_items_type ON clip_items(type)"},
		{"idx_clip_items_status", "CREATE INDEX IF NOT EXISTS idx_clip_items_status ON clip_items(status)"},
		{"idx_clip_items_created_at", "CREATE INDEX IF NOT EXISTS idx_clip_items_created_at ON clip_items(created_at DESC)"},
		{"idx_clip_items_updated_at", "CREATE INDEX IF NOT EXISTS idx_clip_items_updated_at ON clip_items(updated_at DESC)"},
		{"idx_clip_items_used_at", "CREATE INDEX IF NOT EXISTS idx_clip_items_used_at ON clip_items(used_at DESC)"},
		{"idx_clip_items_expires_at", "CREATE INDEX IF NOT EXISTS idx_clip_items_expires_at ON clip_items(expires_at)"},

		// OCR 结果表索引
		{"idx_ocr_results_clip_item_id", "CREATE INDEX IF NOT EXISTS idx_ocr_results_clip_item_id ON ocr_results(clip_item_id)"},
		{"idx_ocr_results_language", "CREATE INDEX IF NOT EXISTS idx_ocr_results_language ON ocr_results(language)"},

		// 设置表索引
		{"idx_settings_user_id", "CREATE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id)"},
		{"idx_settings_key", "CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key)"},
		{"idx_settings_category", "CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category)"},

		// 复合索引
		{"idx_clip_items_user_status", "CREATE INDEX IF NOT EXISTS idx_clip_items_user_status ON clip_items(user_id, status)"},
		{"idx_clip_items_user_type", "CREATE INDEX IF NOT EXISTS idx_clip_items_user_type ON clip_items(user_id, type)"},
		{"idx_settings_user_key", "CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_user_key ON settings(user_id, key) WHERE user_id IS NOT NULL"},
		{"idx_settings_global_key", "CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_global_key ON settings(key) WHERE user_id IS NULL"},
	}

	for _, idx := range indexes {
		if err := DB.Exec(idx.query).Error; err != nil {
			log.Printf("Warning: failed to create index %s: %v", idx.name, err)
		} else {
			log.Printf("Created index: %s", idx.name)
		}
	}

	return nil
}

// seedInitialData 初始化种子数据
func seedInitialData() error {
	log.Println("Seeding initial data...")

	// 检查是否已有系统设置
	var count int64
	if err := DB.Model(&models.Setting{}).Where("user_id IS NULL").Count(&count).Error; err != nil {
		return err
	}

	if count > 0 {
		log.Println("System settings already exist, skipping seed data")
		return nil
	}

	// 创建系统默认设置
	systemSettings := []models.Setting{
		{
			Key:         "max_clip_items_per_user",
			Value:       "1000",
			Type:        models.SettingTypeNumber,
			Description: "每个用户最大剪贴板项数",
			Category:    "sync",
			UserID:      nil,
			IsReadonly:  true,
		},
		{
			Key:         "clip_item_default_ttl",
			Value:       "720h", // 30 days
			Type:        models.SettingTypeString,
			Description: "剪贴板项默认过期时间",
			Category:    "sync",
			UserID:      nil,
			IsReadonly:  false,
		},
		{
			Key:         "max_content_size",
			Value:       "1048576", // 1MB
			Type:        models.SettingTypeNumber,
			Description: "剪贴板内容最大大小（字节）",
			Category:    "sync",
			UserID:      nil,
			IsReadonly:  true,
		},
		{
			Key:         "enable_ocr",
			Value:       "true",
			Type:        models.SettingTypeBoolean,
			Description: "是否启用 OCR 功能",
			Category:    "feature",
			UserID:      nil,
			IsReadonly:  false,
		},
		{
			Key:         "enable_file_upload",
			Value:       "true",
			Type:        models.SettingTypeBoolean,
			Description: "是否启用文件上传功能",
			Category:    "feature",
			UserID:      nil,
			IsReadonly:  false,
		},
		{
			Key:         "max_devices_per_user",
			Value:       "10",
			Type:        models.SettingTypeNumber,
			Description: "每个用户最大设备数",
			Category:    "device",
			UserID:      nil,
			IsReadonly:  true,
		},
		{
			Key:         "device_offline_timeout",
			Value:       "300s", // 5 minutes
			Type:        models.SettingTypeString,
			Description: "设备离线超时时间",
			Category:    "device",
			UserID:      nil,
			IsReadonly:  false,
		},
		{
			Key:         "enable_registration",
			Value:       "true",
			Type:        models.SettingTypeBoolean,
			Description: "是否允许用户注册",
			Category:    "auth",
			UserID:      nil,
			IsReadonly:  false,
		},
		{
			Key:         "password_min_length",
			Value:       "6",
			Type:        models.SettingTypeNumber,
			Description: "密码最小长度",
			Category:    "auth",
			UserID:      nil,
			IsReadonly:  true,
		},
		{
			Key:         "session_timeout",
			Value:       "24h",
			Type:        models.SettingTypeString,
			Description: "会话超时时间",
			Category:    "auth",
			UserID:      nil,
			IsReadonly:  false,
		},
	}

	// 批量创建设置
	if err := DB.Create(&systemSettings).Error; err != nil {
		return fmt.Errorf("failed to create system settings: %w", err)
	}

	log.Printf("Created %d system settings", len(systemSettings))
	return nil
}

// ResetDatabase 重置数据库（开发环境使用）
func ResetDatabase() error {
	if DB == nil {
		return fmt.Errorf("database not initialized")
	}

	log.Println("Resetting database...")

	// 删除所有表
	tables := []string{"ocr_results", "clip_items", "settings", "devices", "users"}
	for _, table := range tables {
		if err := DB.Exec(fmt.Sprintf("DROP TABLE IF EXISTS %s", table)).Error; err != nil {
			log.Printf("Warning: failed to drop table %s: %v", table, err)
		} else {
			log.Printf("Dropped table: %s", table)
		}
	}

	// 重新创建
	return MigrateDatabase()
}

// CheckDatabaseHealth 检查数据库健康状态
func CheckDatabaseHealth() error {
	if DB == nil {
		return fmt.Errorf("database not initialized")
	}

	// 检查连接
	sqlDB, err := DB.DB()
	if err != nil {
		return fmt.Errorf("failed to get sql.DB: %w", err)
	}

	if err := sqlDB.Ping(); err != nil {
		return fmt.Errorf("database ping failed: %w", err)
	}

	// 检查必要的表是否存在
	requiredTables := []string{"users", "devices", "clip_items", "ocr_results", "settings"}
	for _, table := range requiredTables {
		var exists bool
		err := DB.Raw("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&exists).Error
		if err != nil || !exists {
			return fmt.Errorf("required table %s does not exist", table)
		}
	}

	return nil
}
