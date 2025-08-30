package services

import (
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"

	"xpaste-sync/internal/models"
)

// DeviceService 设备服务
type DeviceService struct {
	db *gorm.DB
}

// NewDeviceService 创建设备服务
func NewDeviceService(db *gorm.DB) *DeviceService {
	return &DeviceService{db: db}
}

// RegisterDevice 注册设备
func (s *DeviceService) RegisterDevice(userID uint, req *models.RegisterDeviceRequest, clientIP string) (*models.Device, error) {
	// 生成设备ID
	deviceID := generateDeviceID(userID, req.Name)

	// 检查设备是否已存在
	var existingDevice models.Device
	if err := s.db.Where("user_id = ? AND device_id = ?", userID, deviceID).First(&existingDevice).Error; err == nil {
		// 设备已存在，更新信息
		existingDevice.Name = req.Name
		existingDevice.Platform = req.Platform
		existingDevice.Version = req.Version
		existingDevice.Model = req.Model
		existingDevice.OSVersion = req.OSVersion
		now := time.Now()
		existingDevice.LastSeen = &now
		existingDevice.LastIP = clientIP
		existingDevice.IsOnline = true
		existingDevice.Status = models.DeviceStatusActive
		existingDevice.Capabilities = req.Capabilities
		if err := s.db.Save(&existingDevice).Error; err != nil {
			return nil, fmt.Errorf("failed to update device: %w", err)
		}
		return &existingDevice, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("failed to check existing device: %w", err)
	}

	// 创建新设备
	now := time.Now()
	device := models.Device{
		UserID:       userID,
		DeviceID:     deviceID,
		Name:         req.Name,
		Platform:     req.Platform,
		Version:      req.Version,
		Model:        req.Model,
		OSVersion:    req.OSVersion,
		LastSeen:     &now,
		LastIP:       clientIP,
		IsOnline:     true,
		Status:       models.DeviceStatusActive,
		Capabilities: req.Capabilities,
	}

	if err := s.db.Create(&device).Error; err != nil {
		return nil, fmt.Errorf("failed to create device: %w", err)
	}

	return &device, nil
}

// GetDeviceByID 根据ID获取设备
func (s *DeviceService) GetDeviceByID(deviceID uint) (*models.Device, error) {
	var device models.Device
	if err := s.db.First(&device, deviceID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, models.ErrDeviceNotFound
		}
		return nil, fmt.Errorf("database error: %w", err)
	}
	return &device, nil
}

// GetDeviceByDeviceID 根据设备ID获取设备
func (s *DeviceService) GetDeviceByDeviceID(userID uint, deviceID string) (*models.Device, error) {
	var device models.Device
	if err := s.db.Where("user_id = ? AND device_id = ?", userID, deviceID).First(&device).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, models.ErrDeviceNotFound
		}
		return nil, fmt.Errorf("database error: %w", err)
	}
	return &device, nil
}

// GetUserDevices 获取用户的所有设备
func (s *DeviceService) GetUserDevices(userID uint, params *models.PaginationParams) ([]*models.Device, *models.PaginationResponse, error) {
	var devices []*models.Device
	var total int64

	// 计算总数
	if err := s.db.Model(&models.Device{}).Where("user_id = ?", userID).Count(&total).Error; err != nil {
		return nil, nil, fmt.Errorf("failed to count devices: %w", err)
	}

	// 获取设备列表
	query := s.db.Where("user_id = ?", userID).Order("last_seen DESC")
	if params != nil {
		query = query.Offset(params.GetOffset()).Limit(params.GetLimit())
	}

	if err := query.Find(&devices).Error; err != nil {
		return nil, nil, fmt.Errorf("failed to get devices: %w", err)
	}

	// 构建分页响应
	var pagination *models.PaginationResponse
	if params != nil {
		pagination = &models.PaginationResponse{
			Page:     params.Page,
			PageSize: params.PageSize,
			Total:    total,
		}
		pagination.CalculateTotalPages()
	}

	return devices, pagination, nil
}

// GetOnlineDevices 获取在线设备
func (s *DeviceService) GetOnlineDevices(userID uint) ([]*models.Device, error) {
	var devices []*models.Device
	if err := s.db.Where("user_id = ? AND is_online = ? AND status = ?", userID, true, models.DeviceStatusActive).Find(&devices).Error; err != nil {
		return nil, fmt.Errorf("failed to get online devices: %w", err)
	}
	return devices, nil
}

// UpdateDevice 更新设备信息
func (s *DeviceService) UpdateDevice(userID uint, deviceID string, req *models.UpdateDeviceRequest) (*models.Device, error) {
	var device models.Device
	if err := s.db.Where("user_id = ? AND device_id = ?", userID, deviceID).First(&device).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, models.ErrDeviceNotFound
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	// 更新字段
	if req.Name != nil {
		device.Name = *req.Name
	}
	if req.Version != nil {
		device.Version = *req.Version
	}
	if req.Model != nil {
		device.Model = *req.Model
	}
	if req.OSVersion != nil {
		device.OSVersion = *req.OSVersion
	}
	if req.Capabilities != nil {
		device.Capabilities = *req.Capabilities
	}
	if req.Settings != nil {
		device.Settings = req.Settings
	}

	if err := s.db.Save(&device).Error; err != nil {
		return nil, fmt.Errorf("failed to update device: %w", err)
	}

	return &device, nil
}

// UpdateDeviceOnlineStatus 更新设备在线状态
func (s *DeviceService) UpdateDeviceOnlineStatus(userID uint, deviceID string, isOnline bool, clientIP string) error {
	var device models.Device
	if err := s.db.Where("user_id = ? AND device_id = ?", userID, deviceID).First(&device).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.ErrDeviceNotFound
		}
		return fmt.Errorf("database error: %w", err)
	}

	if isOnline {
		device.UpdateLastSeen(clientIP)
	} else {
		device.SetOffline()
	}

	if err := s.db.Save(&device).Error; err != nil {
		return fmt.Errorf("failed to update device status: %w", err)
	}

	return nil
}

// UpdateDeviceSyncTime 更新设备同步时间
func (s *DeviceService) UpdateDeviceSyncTime(userID uint, deviceID string) error {
	var device models.Device
	if err := s.db.Where("user_id = ? AND device_id = ?", userID, deviceID).First(&device).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.ErrDeviceNotFound
		}
		return fmt.Errorf("database error: %w", err)
	}

	device.UpdateSyncTime()
	if err := s.db.Save(&device).Error; err != nil {
		return fmt.Errorf("failed to update sync time: %w", err)
	}

	return nil
}

// DeactivateDevice 停用设备
func (s *DeviceService) DeactivateDevice(userID uint, deviceID string) error {
	var device models.Device
	if err := s.db.Where("user_id = ? AND device_id = ?", userID, deviceID).First(&device).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.ErrDeviceNotFound
		}
		return fmt.Errorf("database error: %w", err)
	}

	device.Status = models.DeviceStatusInactive
	device.SetOffline()
	if err := s.db.Save(&device).Error; err != nil {
		return fmt.Errorf("failed to deactivate device: %w", err)
	}

	return nil
}

// DeleteDevice 删除设备（软删除）
func (s *DeviceService) DeleteDevice(userID uint, deviceID string) error {
	if err := s.db.Where("user_id = ? AND device_id = ?", userID, deviceID).Delete(&models.Device{}).Error; err != nil {
		return fmt.Errorf("failed to delete device: %w", err)
	}
	return nil
}

// GetDeviceStats 获取设备统计信息
func (s *DeviceService) GetDeviceStats(userID uint, deviceID string) (*DeviceStats, error) {
	var stats DeviceStats

	// 获取设备信息
	device, err := s.GetDeviceByDeviceID(userID, deviceID)
	if err != nil {
		return nil, err
	}

	stats.Device = device

	// 获取剪贴板项数量
	if err := s.db.Model(&models.ClipItem{}).Where("user_id = ? AND device_id = ? AND deleted_at IS NULL", userID, deviceID).Count(&stats.ClipItemCount).Error; err != nil {
		return nil, fmt.Errorf("failed to count clip items: %w", err)
	}

	// 获取今日剪贴板项数量
	today := time.Now().Truncate(24 * time.Hour)
	if err := s.db.Model(&models.ClipItem{}).Where("user_id = ? AND device_id = ? AND created_at >= ? AND deleted_at IS NULL", userID, deviceID, today).Count(&stats.TodayClipItemCount).Error; err != nil {
		return nil, fmt.Errorf("failed to count today's clip items: %w", err)
	}

	// 获取最后同步时间
	var lastSyncTime time.Time
	if err := s.db.Model(&models.ClipItem{}).Where("user_id = ? AND device_id = ? AND deleted_at IS NULL", userID, deviceID).Select("MAX(updated_at)").Scan(&lastSyncTime).Error; err != nil {
		return nil, fmt.Errorf("failed to get last sync time: %w", err)
	}
	stats.LastSyncTime = &lastSyncTime

	return &stats, nil
}

// DeviceStats 设备统计信息
type DeviceStats struct {
	Device             *models.Device `json:"device"`
	ClipItemCount      int64          `json:"clip_item_count"`
	TodayClipItemCount int64          `json:"today_clip_item_count"`
	LastSyncTime       *time.Time     `json:"last_sync_time"`
}

// CleanupOfflineDevices 清理离线设备（将长时间未活动的设备标记为离线）
func (s *DeviceService) CleanupOfflineDevices(offlineThreshold time.Duration) error {
	thresholdTime := time.Now().Add(-offlineThreshold)

	// 将长时间未活动的设备标记为离线
	if err := s.db.Model(&models.Device{}).Where("is_online = ? AND last_seen < ?", true, thresholdTime).Update("is_online", false).Error; err != nil {
		return fmt.Errorf("failed to cleanup offline devices: %w", err)
	}

	return nil
}

// GetDevicesByPlatform 根据平台获取设备
func (s *DeviceService) GetDevicesByPlatform(userID uint, platform models.DevicePlatform) ([]*models.Device, error) {
	var devices []*models.Device
	if err := s.db.Where("user_id = ? AND platform = ? AND status = ?", userID, platform, models.DeviceStatusActive).Find(&devices).Error; err != nil {
		return nil, fmt.Errorf("failed to get devices by platform: %w", err)
	}
	return devices, nil
}

// GetActiveDevicesCount 获取活跃设备数量
func (s *DeviceService) GetActiveDevicesCount(userID uint) (int64, error) {
	var count int64
	if err := s.db.Model(&models.Device{}).Where("user_id = ? AND status = ?", userID, models.DeviceStatusActive).Count(&count).Error; err != nil {
		return 0, fmt.Errorf("failed to count active devices: %w", err)
	}
	return count, nil
}

// BulkUpdateDeviceStatus 批量更新设备状态
func (s *DeviceService) BulkUpdateDeviceStatus(userID uint, deviceIDs []string, status models.DeviceStatus) error {
	if err := s.db.Model(&models.Device{}).Where("user_id = ? AND device_id IN ?", userID, deviceIDs).Update("status", status).Error; err != nil {
		return fmt.Errorf("failed to bulk update device status: %w", err)
	}
	return nil
}

// generateDeviceID 生成设备ID
func generateDeviceID(userID uint, deviceName string) string {
	return fmt.Sprintf("%d-%s-%d", userID, deviceName, time.Now().Unix())
}