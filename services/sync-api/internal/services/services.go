package services

import (
	"gorm.io/gorm"
)

// Services 服务集合
type Services struct {
	db      *gorm.DB
	User    *UserService
	Device  *DeviceService
	Clip    *ClipService
	Setting *SettingService
}

// NewServices 创建服务集合
func NewServices(db *gorm.DB) *Services {
	return &Services{
		db:      db,
		User:    NewUserService(db),
		Device:  NewDeviceService(db),
		Clip:    NewClipService(db),
		Setting: NewSettingService(db),
	}
}

// GetDB 获取数据库实例
func (s *Services) GetDB() *gorm.DB {
	return s.db
}

// InitializeServices 初始化服务（创建默认数据等）
func (s *Services) InitializeServices() error {
	// 初始化默认系统设置
	if err := s.Setting.InitializeDefaultSettings(); err != nil {
		return err
	}

	return nil
}