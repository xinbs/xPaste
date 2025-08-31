package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

// JSON is a custom type for handling JSON data in GORM
type JSON map[string]interface{}

// Value implements the driver.Valuer interface
func (j JSON) Value() (driver.Value, error) {
	if j == nil {
		return nil, nil
	}
	return json.Marshal(j)
}

// Scan implements the sql.Scanner interface
func (j *JSON) Scan(value interface{}) error {
	if value == nil {
		*j = nil
		return nil
	}

	switch v := value.(type) {
	case []byte:
		return json.Unmarshal(v, j)
	case string:
		return json.Unmarshal([]byte(v), j)
	default:
		return fmt.Errorf("cannot scan %T into JSON", value)
	}
}

// ClipType 剪贴板项类型
type ClipType string

const (
	ClipTypeText  ClipType = "text"
	ClipTypeImage ClipType = "image"
	ClipTypeFile  ClipType = "file"
	ClipTypeURL   ClipType = "url"
)

// ClipStatus 剪贴板项状态
type ClipStatus string

const (
	ClipStatusActive  ClipStatus = "active"
	ClipStatusExpired ClipStatus = "expired"
)

// ClipItem 剪贴板项模型
type ClipItem struct {
	ID          uint        `json:"id" gorm:"primaryKey"`
	UserID      uint        `json:"user_id" gorm:"not null;index"`
	DeviceID    string      `json:"device_id" gorm:"size:255;not null;index"`
	Type        ClipType    `json:"type" gorm:"size:20;not null;index"`
	Content     string      `json:"content" gorm:"type:text;not null"`
	Title       string      `json:"title" gorm:"size:255"`
	Description string      `json:"description" gorm:"type:text"`
	Tags        []string    `json:"tags" gorm:"type:json"`
	Metadata     JSON        `json:"metadata" gorm:"type:json"`
	Status      ClipStatus  `json:"status" gorm:"size:20;not null;default:'active';index"`
	ViewCount   int         `json:"view_count" gorm:"default:0"`
	UsedAt      *time.Time  `json:"used_at" gorm:"index"`
	LastUsedAt  *time.Time  `json:"last_used_at" gorm:"index"`
	ExpiresAt   *time.Time  `json:"expires_at" gorm:"index"`
	CreatedAt   time.Time   `json:"created_at" gorm:"index"`
	UpdatedAt   time.Time   `json:"updated_at"`

	// 关联
	User User `json:"-" gorm:"foreignKey:UserID"`
	// Device Device `json:"-" gorm:"foreignKey:DeviceID;references:DeviceID"` // 暂时移除设备关联以避免循环引用
}

// TableName 指定表名
func (ClipItem) TableName() string {
	return "clip_items"
}

// ToResponse 转换为响应格式
func (c *ClipItem) ToResponse() *ClipItemResponse {
	return &ClipItemResponse{
		ID:          c.ID,
		Type:        string(c.Type),
		Content:     c.Content,
		Title:       c.Title,
		Description: c.Description,
		Tags:        c.Tags,
		Metadata:    c.Metadata,
		Status:      string(c.Status),
		ViewCount:   c.ViewCount,
		UsedAt:      c.UsedAt,
		LastUsedAt:  c.LastUsedAt,
		ExpiresAt:   c.ExpiresAt,
		CreatedAt:   c.CreatedAt,
		UpdatedAt:   c.UpdatedAt,
	}
}

// CreateClipRequest 创建剪贴板项请求
type CreateClipRequest struct {
	DeviceID    string      `json:"device_id,omitempty"`
	Type        string      `json:"type" binding:"required,oneof=text image file url"`
	Content     string      `json:"content" binding:"required"`
	Title       string      `json:"title,omitempty"`
	Description string      `json:"description,omitempty"`
	Tags        []string    `json:"tags,omitempty"`
	Metadata    JSON        `json:"metadata,omitempty"`
	ExpiresAt   *time.Time  `json:"expires_at,omitempty"`
}

// UpdateClipRequest 更新剪贴板项请求
type UpdateClipRequest struct {
	Title       *string     `json:"title,omitempty"`
	Description *string     `json:"description,omitempty"`
	Tags        []string    `json:"tags,omitempty"`
	Metadata    *JSON       `json:"metadata,omitempty"`
	ExpiresAt   *time.Time  `json:"expires_at,omitempty"`
}

// ClipItemResponse 剪贴板项响应
type ClipItemResponse struct {
	ID          uint        `json:"id"`
	Type        string      `json:"type"`
	Content     string      `json:"content"`
	Title       string      `json:"title"`
	Description string      `json:"description"`
	Tags        []string    `json:"tags"`
	Metadata    interface{} `json:"metadata"`
	Status      string      `json:"status"`
	ViewCount   int         `json:"view_count"`
	UsedAt      *time.Time  `json:"used_at"`
	LastUsedAt  *time.Time  `json:"last_used_at"`
	ExpiresAt   *time.Time  `json:"expires_at"`
	CreatedAt   time.Time   `json:"created_at"`
	UpdatedAt   time.Time   `json:"updated_at"`
}

// ClipSyncRequest 剪贴板同步请求
type ClipSyncRequest struct {
	Items []CreateClipRequest `json:"items" binding:"required"`
}

// ClipSyncResponse 剪贴板同步响应
type ClipSyncResponse struct {
	Accepted   int      `json:"accepted"`
	Duplicates int      `json:"duplicates"`
	Errors     []string `json:"errors"`
}

// BatchDeleteClipsRequest 批量删除剪贴板项请求
type BatchDeleteClipsRequest struct {
	IDs []uint `json:"ids" binding:"required,min=1"`
}