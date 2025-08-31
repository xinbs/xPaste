package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"

	"gorm.io/gorm"
)

// Device 设备模型
type Device struct {
	ID        uint           `json:"id" gorm:"primarykey"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`

	// 关联信息
	UserID uint `json:"user_id" gorm:"not null;index"`
	User   User `json:"user,omitempty" gorm:"foreignKey:UserID"`

	// 设备信息
	DeviceID    string       `json:"device_id" gorm:"uniqueIndex;not null;size:100"`
	Name        string       `json:"name" gorm:"not null;size:100"`
	Platform    DevicePlatform `json:"platform" gorm:"not null"`
	Version     string       `json:"version" gorm:"size:50"`
	Model       string       `json:"model" gorm:"size:100"`
	OSVersion   string       `json:"os_version" gorm:"size:50"`

	// 状态信息
	Status       DeviceStatus `json:"status" gorm:"default:1"`
	LastSeen     *time.Time   `json:"last_seen"`
	LastIP       string       `json:"last_ip" gorm:"size:45"`
	IsOnline     bool         `json:"is_online" gorm:"default:false"`
	LastSyncAt   *time.Time   `json:"last_sync_at"`

	// 设备特性
	Capabilities DeviceCapabilities `json:"capabilities" gorm:"type:text"`
	Settings     map[string]interface{} `json:"settings" gorm:"type:text;serializer:json"`

	// 关联关系 - 暂时移除以避免循环引用
	// ClipItems []ClipItem `json:"clip_items,omitempty" gorm:"foreignKey:DeviceID"`
}

// DevicePlatform 设备平台
type DevicePlatform string

const (
	PlatformWindows DevicePlatform = "windows"
	PlatformMacOS   DevicePlatform = "macos"
	PlatformLinux   DevicePlatform = "linux"
	PlatformAndroid DevicePlatform = "android"
	PlatformIOS     DevicePlatform = "ios"
	PlatformWeb     DevicePlatform = "web"
)

// DeviceStatus 设备状态
type DeviceStatus int

const (
	DeviceStatusInactive DeviceStatus = 0 // 未激活
	DeviceStatusActive   DeviceStatus = 1 // 正常
	DeviceStatusSuspended DeviceStatus = 2 // 暂停
	DeviceStatusRevoked  DeviceStatus = 3 // 已撤销
)

// String 返回设备状态的字符串表示
func (s DeviceStatus) String() string {
	switch s {
	case DeviceStatusInactive:
		return "inactive"
	case DeviceStatusActive:
		return "active"
	case DeviceStatusSuspended:
		return "suspended"
	case DeviceStatusRevoked:
		return "revoked"
	default:
		return "unknown"
	}
}

// DeviceCapabilities 设备能力
type DeviceCapabilities struct {
	ClipboardRead  bool `json:"clipboard_read"`
	ClipboardWrite bool `json:"clipboard_write"`
	FileUpload     bool `json:"file_upload"`
	ImageOCR       bool `json:"image_ocr"`
	Notifications  bool `json:"notifications"`
	WebSocket      bool `json:"websocket"`
}

// Value 实现 driver.Valuer 接口
func (dc DeviceCapabilities) Value() (driver.Value, error) {
	return json.Marshal(dc)
}

// Scan 实现 sql.Scanner 接口
func (dc *DeviceCapabilities) Scan(value interface{}) error {
	if value == nil {
		return nil
	}

	var bytes []byte
	switch v := value.(type) {
	case []byte:
		bytes = v
	case string:
		bytes = []byte(v)
	default:
		return fmt.Errorf("cannot scan %T into DeviceCapabilities", value)
	}

	return json.Unmarshal(bytes, dc)
}

// TableName 指定表名
func (Device) TableName() string {
	return "devices"
}

// BeforeCreate GORM 钩子：创建前
func (d *Device) BeforeCreate(tx *gorm.DB) error {
	if d.Settings == nil {
		d.Settings = make(map[string]interface{})
	}
	return nil
}

// IsActive 检查设备是否处于活跃状态
func (d *Device) IsActive() bool {
	return d.Status == DeviceStatusActive
}

// UpdateLastSeen 更新最后在线时间和IP
func (d *Device) UpdateLastSeen(ip string) {
	now := time.Now()
	d.LastSeen = &now
	d.LastIP = ip
	d.IsOnline = true
}

// SetOffline 设置设备离线
func (d *Device) SetOffline() {
	d.IsOnline = false
}

// UpdateSyncTime 更新同步时间
func (d *Device) UpdateSyncTime() {
	now := time.Now()
	d.LastSyncAt = &now
}

// RegisterDeviceRequest 注册设备请求
type RegisterDeviceRequest struct {
	DeviceID     string              `json:"device_id,omitempty"` // 前端传递的设备ID，可选
	Name         string              `json:"name" binding:"required,min=1,max=100"`
	Platform     DevicePlatform      `json:"platform" binding:"required"`
	Version      string              `json:"version" binding:"max=50"`
	Model        string              `json:"model" binding:"max=100"`
	OSVersion    string              `json:"os_version" binding:"max=50"`
	Capabilities DeviceCapabilities `json:"capabilities"`
}

// UpdateDeviceRequest 更新设备请求
type UpdateDeviceRequest struct {
	Name         *string              `json:"name" binding:"omitempty,min=1,max=100"`
	Version      *string              `json:"version" binding:"omitempty,max=50"`
	Model        *string              `json:"model" binding:"omitempty,max=100"`
	OSVersion    *string              `json:"os_version" binding:"omitempty,max=50"`
	Capabilities *DeviceCapabilities `json:"capabilities"`
	Settings     map[string]interface{} `json:"settings"`
}

// DeviceResponse 设备响应
type DeviceResponse struct {
	ID           uint                `json:"id"`
	DeviceID     string              `json:"device_id"`
	Name         string              `json:"name"`
	Platform     DevicePlatform      `json:"platform"`
	Version      string              `json:"version"`
	Model        string              `json:"model"`
	OSVersion    string              `json:"os_version"`
	Status       string              `json:"status"`
	LastSeen     *time.Time          `json:"last_seen"`
	IsOnline     bool                `json:"is_online"`
	LastSyncAt   *time.Time          `json:"last_sync_at"`
	Capabilities DeviceCapabilities `json:"capabilities"`
	RegisteredAt time.Time           `json:"registered_at"`
}

// ToResponse 转换为响应格式
func (d *Device) ToResponse() *DeviceResponse {
	return &DeviceResponse{
		ID:           d.ID,
		DeviceID:     d.DeviceID,
		Name:         d.Name,
		Platform:     d.Platform,
		Version:      d.Version,
		Model:        d.Model,
		OSVersion:    d.OSVersion,
		Status:       d.Status.String(),
		LastSeen:     d.LastSeen,
		IsOnline:     d.IsOnline,
		LastSyncAt:   d.LastSyncAt,
		Capabilities: d.Capabilities,
		RegisteredAt: d.CreatedAt,
	}
}