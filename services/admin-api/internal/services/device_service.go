package services

import (
	"errors"
	"time"

	"admin-api/shared/database"
	"admin-api/shared/models"
	"gorm.io/gorm"
)

type DeviceService struct {
	db *gorm.DB
}

func NewDeviceService() *DeviceService {
	return &DeviceService{
		db: database.GetDB(),
	}
}

// GetAllDevices 获取所有设备
func (s *DeviceService) GetAllDevices() ([]models.Device, error) {
	var devices []models.Device
	result := s.db.Find(&devices)
	return devices, result.Error
}

// GetDeviceByID 根据ID获取设备
func (s *DeviceService) GetDeviceByID(id uint) (*models.Device, error) {
	var device models.Device
	result := s.db.First(&device, id)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("设备不存在")
		}
		return nil, result.Error
	}
	return &device, nil
}

// DisconnectDevice 断开设备连接
func (s *DeviceService) DisconnectDevice(id uint) error {
	var device models.Device
	result := s.db.First(&device, id)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return errors.New("设备不存在")
		}
		return result.Error
	}

	device.Status = "offline"
	now := time.Now()
	device.LastSeen = &now
	device.UpdatedAt = time.Now()

	result = s.db.Save(&device)
	return result.Error
}

// DeleteDevice 删除设备
func (s *DeviceService) DeleteDevice(id uint) error {
	result := s.db.Delete(&models.Device{}, id)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return errors.New("设备不存在")
	}
	return nil
}

// BatchDeleteDevices 批量删除设备
func (s *DeviceService) BatchDeleteDevices(deviceIDs []uint) error {
	if len(deviceIDs) == 0 {
		return errors.New("设备ID列表不能为空")
	}

	result := s.db.Delete(&models.Device{}, deviceIDs)
	if result.Error != nil {
		return result.Error
	}

	if result.RowsAffected == 0 {
		return errors.New("没有找到要删除的设备")
	}

	return nil
}