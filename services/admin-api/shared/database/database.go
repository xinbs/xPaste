package database

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"admin-api/shared/models"
	"admin-api/shared/utils"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"github.com/glebarez/sqlite"
)

var DB *gorm.DB

// InitDatabase 初始化SQLite数据库连接
func InitDatabase() error {
	// 获取数据库文件路径
	dbPath := getEnv("DB_PATH", "../sync-api/data/xpaste.db")
	
	// 确保数据库文件路径是绝对路径
	if !filepath.IsAbs(dbPath) {
		wd, _ := os.Getwd()
		dbPath = filepath.Join(wd, dbPath)
	}

	// 连接SQLite数据库 - 使用sync-api的数据库文件
	var err error
	DB, err = gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return fmt.Errorf("连接数据库失败: %v", err)
	}

	log.Printf("SQLite数据库连接成功: %s", dbPath)

	// 自动迁移管理员表
	err = AutoMigrate()
	if err != nil {
		return fmt.Errorf("数据库迁移失败: %v", err)
	}

	// 创建默认管理员
	err = createDefaultAdmin()
	if err != nil {
		return fmt.Errorf("创建默认管理员失败: %v", err)
	}

	log.Println("数据库初始化完成")
	return nil
}

// createDefaultAdmin 创建默认管理员
func createDefaultAdmin() error {
	// 检查是否已存在管理员
	var count int64
	DB.Model(&models.Admin{}).Count(&count)
	if count > 0 {
		return nil // 已存在管理员，跳过创建
	}

	// 生成密码哈希
	hashedPassword, err := utils.HashPassword("password")
	if err != nil {
		return fmt.Errorf("生成密码哈希失败: %v", err)
	}

	admin := &models.Admin{
		Username:  "admin",
		Email:     "admin@xpaste.com",
		Password:  hashedPassword,
		Role:      "admin",
		Status:    "active",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	result := DB.Create(admin)
	if result.Error != nil {
		return result.Error
	}

	log.Println("默认管理员创建成功")
	return nil
}

// GetDB 获取数据库实例
func GetDB() *gorm.DB {
	return DB
}

// GetAdminByUsername 根据用户名获取管理员
func GetAdminByUsername(username string) (*models.Admin, error) {
	var admin models.Admin
	result := DB.Where("username = ?", username).First(&admin)
	if result.Error != nil {
		return nil, result.Error
	}
	return &admin, nil
}

// GetAdminByEmail 根据邮箱获取管理员
func GetAdminByEmail(email string) (*models.Admin, error) {
	var admin models.Admin
	result := DB.Where("email = ?", email).First(&admin)
	if result.Error != nil {
		return nil, result.Error
	}
	return &admin, nil
}

// GetAdminByID 根据ID获取管理员
func GetAdminByID(id uint) (*models.Admin, error) {
	var admin models.Admin
	result := DB.First(&admin, id)
	if result.Error != nil {
		return nil, result.Error
	}
	return &admin, nil
}

// GetAllAdmins 获取所有管理员
func GetAllAdmins() ([]models.Admin, error) {
	var admins []models.Admin
	result := DB.Find(&admins)
	if result.Error != nil {
		return nil, result.Error
	}
	return admins, nil
}

// CreateAdmin 创建管理员
func CreateAdmin(admin *models.Admin) error {
	result := DB.Create(admin)
	return result.Error
}

// UpdateAdmin 更新管理员
func UpdateAdmin(admin *models.Admin) error {
	result := DB.Save(admin)
	return result.Error
}

// DeleteAdmin 删除管理员
func DeleteAdmin(id uint) error {
	result := DB.Delete(&models.Admin{}, id)
	return result.Error
}

// CountSuperAdmins 统计超级管理员数量
func CountSuperAdmins() int {
	var count int64
	DB.Model(&models.Admin{}).Where("role = ?", "super_admin").Count(&count)
	return int(count)
}

// CountUsers 统计用户数量
func CountUsers() int {
	var count int64
	DB.Model(&models.User{}).Count(&count)
	return int(count)
}

// CountClipboards 统计剪贴板数量
func CountClipboards() int {
	var count int64
	DB.Model(&models.Clipboard{}).Count(&count)
	return int(count)
}

// CountTodayClipboards 统计今日剪贴板数量
func CountTodayClipboards(today string) int {
	var count int64
	DB.Model(&models.Clipboard{}).Where("DATE(created_at) = ?", today).Count(&count)
	return int(count)
}

// AutoMigrate 自动迁移数据库表
func AutoMigrate() error {
    migrateAll := getEnv("ADMIN_API_MIGRATE_ALL", "false")
    if migrateAll == "true" {
        return DB.AutoMigrate(
            &models.User{},
            &models.Device{},
            &models.Clipboard{},
            &models.Admin{},
        )
    }
    return DB.AutoMigrate(&models.Admin{})
}

// getEnv 获取环境变量
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
