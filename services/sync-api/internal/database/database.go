package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	_ "modernc.org/sqlite"

	"xpaste-sync/internal/config"
	"xpaste-sync/internal/models"
)

// DB 全局数据库实例
var DB *gorm.DB

// Initialize 初始化数据库连接
func Initialize(cfg *config.Config) error {
	// 确保数据目录存在
	dataDir := filepath.Dir(cfg.Database.DSN)
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return fmt.Errorf("failed to create data directory: %w", err)
	}

	// 配置 GORM 日志级别
	logLevel := logger.Warn
	switch cfg.Database.LogLevel {
	case "silent":
		logLevel = logger.Silent
	case "error":
		logLevel = logger.Error
	case "warn":
		logLevel = logger.Warn
	case "info":
		logLevel = logger.Info
	}

	// 创建 GORM 配置
	gormConfig := &gorm.Config{
		Logger: logger.Default.LogMode(logLevel),
		NowFunc: func() time.Time {
			return time.Now().UTC()
		},
	}

	// 连接数据库
	var err error
	switch cfg.Database.Driver {
	case "sqlite":
		// 使用纯Go SQLite驱动 (modernc.org/sqlite)
		sqlDB, err := sql.Open("sqlite", cfg.Database.DSN+"?_pragma=foreign_keys(1)")
		if err != nil {
			return fmt.Errorf("failed to open sqlite database: %w", err)
		}
		DB, err = gorm.Open(sqlite.Dialector{Conn: sqlDB}, gormConfig)
	default:
		return fmt.Errorf("unsupported database driver: %s", cfg.Database.Driver)
	}

	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	// 获取底层 sql.DB 实例
	sqlDB, err := DB.DB()
	if err != nil {
		return fmt.Errorf("failed to get sql.DB instance: %w", err)
	}

	// 配置连接池
	sqlDB.SetMaxOpenConns(cfg.Database.MaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.Database.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(cfg.Database.ConnMaxLifetime)
	sqlDB.SetConnMaxIdleTime(cfg.Database.ConnMaxIdleTime)

	// 测试连接
	if err := sqlDB.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	log.Println("Database connected successfully")
	return nil
}

// Migrate 执行数据库迁移
func Migrate() error {
	if DB == nil {
		return fmt.Errorf("database not initialized")
	}

	// 自动迁移所有模型
	err := DB.AutoMigrate(
		&models.User{},
		&models.Device{},
		&models.ClipItem{},
		&models.OcrResult{},
		&models.Setting{},
	)

	if err != nil {
		return fmt.Errorf("failed to migrate database: %w", err)
	}

	// 创建索引
	if err := createIndexes(); err != nil {
		return fmt.Errorf("failed to create indexes: %w", err)
	}

	log.Println("Database migration completed successfully")
	return nil
}

// createIndexes 创建数据库索引
func createIndexes() error {
	// 用户表索引
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)").Error; err != nil {
		return err
	}
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)").Error; err != nil {
		return err
	}
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)").Error; err != nil {
		return err
	}

	// 设备表索引
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id)").Error; err != nil {
		return err
	}
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id)").Error; err != nil {
		return err
	}
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_devices_platform ON devices(platform)").Error; err != nil {
		return err
	}
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status)").Error; err != nil {
		return err
	}
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_devices_is_online ON devices(is_online)").Error; err != nil {
		return err
	}

	// 剪贴板项表索引
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_clip_items_user_id ON clip_items(user_id)").Error; err != nil {
		return err
	}
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_clip_items_device_id ON clip_items(device_id)").Error; err != nil {
		return err
	}
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_clip_items_type ON clip_items(type)").Error; err != nil {
		return err
	}
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_clip_items_status ON clip_items(status)").Error; err != nil {
		return err
	}
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_clip_items_created_at ON clip_items(created_at)").Error; err != nil {
		return err
	}
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_clip_items_updated_at ON clip_items(updated_at)").Error; err != nil {
		return err
	}
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_clip_items_used_at ON clip_items(used_at)").Error; err != nil {
		return err
	}
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_clip_items_expires_at ON clip_items(expires_at)").Error; err != nil {
		return err
	}

	// OCR 结果表索引
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_ocr_results_clip_item_id ON ocr_results(clip_item_id)").Error; err != nil {
		return err
	}
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_ocr_results_language ON ocr_results(language)").Error; err != nil {
		return err
	}

	// 设置表索引
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id)").Error; err != nil {
		return err
	}
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key)").Error; err != nil {
		return err
	}
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category)").Error; err != nil {
		return err
	}


	// 复合索引
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_clip_items_user_status ON clip_items(user_id, status)").Error; err != nil {
		return err
	}
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_clip_items_user_type ON clip_items(user_id, type)").Error; err != nil {
		return err
	}
	if err := DB.Exec("CREATE INDEX IF NOT EXISTS idx_settings_user_key ON settings(user_id, key)").Error; err != nil {
		return err
	}


	return nil
}

// SeedData 初始化种子数据
func SeedData() error {
	if DB == nil {
		return fmt.Errorf("database not initialized")
	}

	// 初始化系统设置
	if err := seedSystemSettings(); err != nil {
		return fmt.Errorf("failed to seed system settings: %w", err)
	}

	log.Println("Database seed data initialized successfully")
	return nil
}

// seedSystemSettings 初始化系统设置
func seedSystemSettings() error {
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

	// 检查并插入系统设置
	for _, setting := range systemSettings {
		var existingSetting models.Setting
		result := DB.Where("key = ? AND user_id IS NULL", setting.Key).First(&existingSetting)
		if result.Error != nil {
			if result.Error == gorm.ErrRecordNotFound {
				// 设置不存在，创建新的
				if err := DB.Create(&setting).Error; err != nil {
					return fmt.Errorf("failed to create system setting %s: %w", setting.Key, err)
				}
				log.Printf("Created system setting: %s", setting.Key)
			} else {
				return fmt.Errorf("failed to check system setting %s: %w", setting.Key, result.Error)
			}
		} else {
			// 设置已存在，更新描述和分类（如果需要）
			if existingSetting.Description != setting.Description || existingSetting.Category != setting.Category {
				existingSetting.Description = setting.Description
				existingSetting.Category = setting.Category
				if err := DB.Save(&existingSetting).Error; err != nil {
					return fmt.Errorf("failed to update system setting %s: %w", setting.Key, err)
				}
				log.Printf("Updated system setting: %s", setting.Key)
			}
		}
	}

	return nil
}

// Close 关闭数据库连接
func Close() error {
	if DB == nil {
		return nil
	}

	sqlDB, err := DB.DB()
	if err != nil {
		return fmt.Errorf("failed to get sql.DB instance: %w", err)
	}

	if err := sqlDB.Close(); err != nil {
		return fmt.Errorf("failed to close database: %w", err)
	}

	log.Println("Database connection closed")
	return nil
}

// GetDB 获取数据库实例
func GetDB() *gorm.DB {
	return DB
}

// IsHealthy 检查数据库健康状态
func IsHealthy() bool {
	if DB == nil {
		return false
	}

	sqlDB, err := DB.DB()
	if err != nil {
		return false
	}

	return sqlDB.Ping() == nil
}