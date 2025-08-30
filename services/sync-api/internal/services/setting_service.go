package services

import (
	"errors"
	"fmt"

	"gorm.io/gorm"

	"xpaste-sync/internal/models"
)

// 错误定义
var (
	ErrSettingNotFound = errors.New("setting not found")
	ErrSettingReadOnly = errors.New("setting is read-only")
)

// SettingService 设置服务
type SettingService struct {
	db *gorm.DB
}

// NewSettingService 创建设置服务
func NewSettingService(db *gorm.DB) *SettingService {
	return &SettingService{db: db}
}

// GetUserSetting 获取用户设置
func (s *SettingService) GetUserSetting(userID uint, key string) (*models.Setting, error) {
	var setting models.Setting
	if err := s.db.Where("user_id = ? AND key = ?", userID, key).First(&setting).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrSettingNotFound
		}
		return nil, fmt.Errorf("database error: %w", err)
	}
	return &setting, nil
}

// GetSystemSetting 获取系统设置
func (s *SettingService) GetSystemSetting(key string) (*models.Setting, error) {
	var setting models.Setting
	if err := s.db.Where("user_id IS NULL AND key = ?", key).First(&setting).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrSettingNotFound
		}
		return nil, fmt.Errorf("database error: %w", err)
	}
	return &setting, nil
}

// GetUserSettings 获取用户所有设置
func (s *SettingService) GetUserSettings(userID uint, category string) ([]*models.Setting, error) {
	var settings []*models.Setting
	query := s.db.Where("user_id = ?", userID)
	if category != "" {
		query = query.Where("category = ?", category)
	}
	query = query.Order("category, sort_order, key")

	if err := query.Find(&settings).Error; err != nil {
		return nil, fmt.Errorf("failed to get user settings: %w", err)
	}
	return settings, nil
}

// GetSystemSettings 获取系统设置
func (s *SettingService) GetSystemSettings(category string) ([]*models.Setting, error) {
	var settings []*models.Setting
	query := s.db.Where("user_id IS NULL")
	if category != "" {
		query = query.Where("category = ?", category)
	}
	query = query.Order("category, sort_order, key")

	if err := query.Find(&settings).Error; err != nil {
		return nil, fmt.Errorf("failed to get system settings: %w", err)
	}
	return settings, nil
}

// SetUserSetting 设置用户设置
func (s *SettingService) SetUserSetting(userID uint, req *models.CreateSettingRequest) (*models.Setting, error) {
	// 检查是否已存在
	var existingSetting models.Setting
	if err := s.db.Where("user_id = ? AND key = ?", userID, req.Key).First(&existingSetting).Error; err == nil {
		// 检查是否为只读设置
		if existingSetting.IsReadonly {
			return nil, ErrSettingReadOnly
		}

		// 更新现有设置
		existingSetting.Value = req.Value
		if req.Description != "" {
			existingSetting.Description = req.Description
		}
		if err := s.db.Save(&existingSetting).Error; err != nil {
			return nil, fmt.Errorf("failed to update setting: %w", err)
		}
		return &existingSetting, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("database error: %w", err)
	}

	// 创建新设置
	setting := &models.Setting{
		UserID:      &userID,
		Key:         req.Key,
		Value:       req.Value,
		Type:        req.Type,
		Category:    req.Category,
		Description: req.Description,
		IsReadonly:  false,
		IsEncrypted: req.IsEncrypted,
		Metadata:    req.Metadata,
	}

	if err := s.db.Create(setting).Error; err != nil {
		return nil, fmt.Errorf("failed to create setting: %w", err)
	}

	return setting, nil
}

// SetSystemSetting 设置系统设置（仅管理员）
func (s *SettingService) SetSystemSetting(req *models.CreateSettingRequest) (*models.Setting, error) {
	// 检查是否已存在
	var existingSetting models.Setting
	if err := s.db.Where("user_id IS NULL AND key = ?", req.Key).First(&existingSetting).Error; err == nil {
		// 检查是否为只读设置
		if existingSetting.IsReadonly {
			return nil, ErrSettingReadOnly
		}

		// 更新现有设置
		existingSetting.Value = req.Value
		if req.Description != "" {
			existingSetting.Description = req.Description
		}
		if err := s.db.Save(&existingSetting).Error; err != nil {
			return nil, fmt.Errorf("failed to update system setting: %w", err)
		}
		return &existingSetting, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("database error: %w", err)
	}

	// 创建新系统设置
	setting := &models.Setting{
		UserID:      nil, // 系统设置
		Key:         req.Key,
		Value:       req.Value,
		Type:        req.Type,
		Category:    req.Category,
		Description: req.Description,
		IsReadonly:  req.IsReadonly,
		IsEncrypted: req.IsEncrypted,
		Metadata:    req.Metadata,
	}

	if err := s.db.Create(setting).Error; err != nil {
		return nil, fmt.Errorf("failed to create system setting: %w", err)
	}

	return setting, nil
}

// UpdateSetting 更新设置
func (s *SettingService) UpdateSetting(userID *uint, key string, req *models.UpdateSettingRequest) (*models.Setting, error) {
	var setting models.Setting
	query := s.db.Where("key = ?", key)
	if userID != nil {
		query = query.Where("user_id = ?", *userID)
	} else {
		query = query.Where("user_id IS NULL")
	}

	if err := query.First(&setting).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrSettingNotFound
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	// 检查是否为只读设置
	if setting.IsReadonly {
		return nil, ErrSettingReadOnly
	}

	// 更新字段
	if req.Value != nil && *req.Value != "" {
		setting.Value = *req.Value
	}
	if req.Description != nil && *req.Description != "" {
		setting.Description = *req.Description
	}
	if req.Metadata != nil {
		setting.Metadata = *req.Metadata
	}

	if err := s.db.Save(&setting).Error; err != nil {
		return nil, fmt.Errorf("failed to update setting: %w", err)
	}

	return &setting, nil
}

// DeleteSetting 删除设置
func (s *SettingService) DeleteSetting(userID *uint, key string) error {
	var setting models.Setting
	query := s.db.Where("key = ?", key)
	if userID != nil {
		query = query.Where("user_id = ?", *userID)
	} else {
		query = query.Where("user_id IS NULL")
	}

	if err := query.First(&setting).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrSettingNotFound
		}
		return fmt.Errorf("database error: %w", err)
	}

	// 检查是否为只读设置
	if setting.IsReadonly {
		return ErrSettingReadOnly
	}

	if err := s.db.Delete(&setting).Error; err != nil {
		return fmt.Errorf("failed to delete setting: %w", err)
	}

	return nil
}

// GetSettingsByCategory 根据分类获取设置
func (s *SettingService) GetSettingsByCategory(userID *uint, category string) ([]*models.Setting, error) {
	var settings []*models.Setting
	query := s.db.Where("category = ?", category)
	if userID != nil {
		query = query.Where("user_id = ?", *userID)
	} else {
		query = query.Where("user_id IS NULL")
	}
	query = query.Order("sort_order, key")

	if err := query.Find(&settings).Error; err != nil {
		return nil, fmt.Errorf("failed to get settings by category: %w", err)
	}
	return settings, nil
}

// InitializeDefaultSettings 初始化默认设置
func (s *SettingService) InitializeDefaultSettings() error {
	defaultSettings := models.GetDefaultSystemSettings()

	for _, setting := range defaultSettings {
		// 检查设置是否已存在
		var existingSetting models.Setting
		if err := s.db.Where("user_id IS NULL AND key = ?", setting.Key).First(&existingSetting).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				// 创建默认设置
				if err := s.db.Create(&setting).Error; err != nil {
					return fmt.Errorf("failed to create default setting %s: %w", setting.Key, err)
				}
			} else {
				return fmt.Errorf("database error checking setting %s: %w", setting.Key, err)
			}
		}
	}

	return nil
}

// GetUserSettingWithDefault 获取用户设置，如果不存在则返回默认值
func (s *SettingService) GetUserSettingWithDefault(userID uint, key string) (*models.Setting, error) {
	// 先尝试获取用户设置
	userSetting, err := s.GetUserSetting(userID, key)
	if err == nil {
		return userSetting, nil
	}
	if !errors.Is(err, ErrSettingNotFound) {
		return nil, err
	}

	// 获取系统默认设置
	systemSetting, err := s.GetSystemSetting(key)
	if err != nil {
		return nil, err
	}

	return systemSetting, nil
}

// BulkSetUserSettings 批量设置用户设置
func (s *SettingService) BulkSetUserSettings(userID uint, settings map[string]string) error {
	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	for key, value := range settings {
		// 检查是否已存在
		var existingSetting models.Setting
		if err := tx.Where("user_id = ? AND key = ?", userID, key).First(&existingSetting).Error; err == nil {
			// 检查是否为只读设置
			if existingSetting.IsReadonly {
				tx.Rollback()
				return ErrSettingReadOnly
			}

			// 更新现有设置
			existingSetting.Value = value
			if err := tx.Save(&existingSetting).Error; err != nil {
				tx.Rollback()
				return fmt.Errorf("failed to update setting %s: %w", key, err)
			}
		} else if errors.Is(err, gorm.ErrRecordNotFound) {
			// 创建新设置
			setting := &models.Setting{
				UserID: &userID,
				Key:    key,
				Value:  value,
				Type:   models.SettingTypeString,
			}
			if err := tx.Create(setting).Error; err != nil {
				tx.Rollback()
				return fmt.Errorf("failed to create setting %s: %w", key, err)
			}
		} else {
			tx.Rollback()
			return fmt.Errorf("database error for setting %s: %w", key, err)
		}
	}

	return tx.Commit().Error
}

// ResetUserSettings 重置用户设置为默认值
func (s *SettingService) ResetUserSettings(userID uint, category string) error {
	// 删除用户的指定分类设置
	query := s.db.Where("user_id = ?", userID)
	if category != "" {
		query = query.Where("category = ?", category)
	}

	if err := query.Delete(&models.Setting{}).Error; err != nil {
		return fmt.Errorf("failed to reset user settings: %w", err)
	}

	return nil
}

// ExportUserSettings 导出用户设置
func (s *SettingService) ExportUserSettings(userID uint) (map[string]interface{}, error) {
	settings, err := s.GetUserSettings(userID, "")
	if err != nil {
		return nil, err
	}

	export := make(map[string]interface{})
	for _, setting := range settings {
		if !setting.IsEncrypted { // 不导出加密设置
			export[setting.Key] = setting.Value
		}
	}

	return export, nil
}

// ImportUserSettings 导入用户设置
func (s *SettingService) ImportUserSettings(userID uint, settings map[string]string) error {
	return s.BulkSetUserSettings(userID, settings)
}