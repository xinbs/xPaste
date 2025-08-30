package models

import (
	"fmt"
	"time"

	"gorm.io/gorm"
)

// Setting 设置模型
type Setting struct {
	ID        uint           `json:"id" gorm:"primarykey"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`

	// 关联信息
	UserID *uint `json:"user_id" gorm:"index"` // 为空表示系统设置
	User   *User `json:"user,omitempty" gorm:"foreignKey:UserID"`

	// 设置信息
	Key         string      `json:"key" gorm:"not null;size:100;index"`
	Value       string      `json:"value" gorm:"type:text"`
	Type        SettingType `json:"type" gorm:"not null"`
	Category    string      `json:"category" gorm:"size:50;index"`
	Description string      `json:"description" gorm:"size:500"`

	// 约束信息
	IsReadonly   bool   `json:"is_readonly" gorm:"default:false"`
	IsEncrypted  bool   `json:"is_encrypted" gorm:"default:false"`
	DefaultValue string `json:"default_value" gorm:"type:text"`
	Validation   string `json:"validation" gorm:"type:text"` // JSON 格式的验证规则

	// 元数据
	Metadata SettingMetadata `json:"metadata" gorm:"type:text;serializer:json"`
}

// SettingType 设置类型
type SettingType string

const (
	SettingTypeString  SettingType = "string"
	SettingTypeNumber  SettingType = "number"
	SettingTypeBoolean SettingType = "boolean"
	SettingTypeJSON    SettingType = "json"
	SettingTypeArray   SettingType = "array"
	SettingTypeObject  SettingType = "object"
)

// SettingMetadata 设置元数据
type SettingMetadata struct {
	// 显示信息
	DisplayName string `json:"display_name,omitempty"`
	Placeholder string `json:"placeholder,omitempty"`
	HelpText    string `json:"help_text,omitempty"`
	Group       string `json:"group,omitempty"`
	Order       int    `json:"order,omitempty"`

	// 输入控制
	InputType string   `json:"input_type,omitempty"` // text, password, select, checkbox, etc.
	Options   []string `json:"options,omitempty"`    // 选择项
	MinValue  *float64 `json:"min_value,omitempty"`
	MaxValue  *float64 `json:"max_value,omitempty"`
	MinLength *int     `json:"min_length,omitempty"`
	MaxLength *int     `json:"max_length,omitempty"`

	// 其他信息
	Extra map[string]interface{} `json:"extra,omitempty"`
}

// TableName 指定表名
func (Setting) TableName() string {
	return "settings"
}

// BeforeCreate GORM 钩子：创建前
func (s *Setting) BeforeCreate(tx *gorm.DB) error {
	if s.DefaultValue == "" {
		s.DefaultValue = s.Value
	}
	return nil
}

// IsSystemSetting 检查是否为系统设置
func (s *Setting) IsSystemSetting() bool {
	return s.UserID == nil
}

// IsUserSetting 检查是否为用户设置
func (s *Setting) IsUserSetting() bool {
	return s.UserID != nil
}

// GetUniqueKey 获取唯一键（用于索引）
func (s *Setting) GetUniqueKey() string {
	if s.UserID != nil {
		return fmt.Sprintf("user_%d_%s", *s.UserID, s.Key)
	}
	return fmt.Sprintf("system_%s", s.Key)
}

// 预定义的设置键
const (
	// 系统设置
	SettingKeySystemName        = "system.name"
	SettingKeySystemVersion     = "system.version"
	SettingKeySystemMaintenance = "system.maintenance"
	SettingKeyMaxFileSize       = "system.max_file_size"
	SettingKeyMaxClipItems      = "system.max_clip_items"
	SettingKeyRetentionDays     = "system.retention_days"
	SettingKeyAllowRegistration = "system.allow_registration"

	// 用户设置
	SettingKeyUserTheme          = "user.theme"
	SettingKeyUserLanguage       = "user.language"
	SettingKeyUserTimezone       = "user.timezone"
	SettingKeyUserAutoSync       = "user.auto_sync"
	SettingKeyUserSyncInterval   = "user.sync_interval"
	SettingKeyUserMaxHistory     = "user.max_history"
	SettingKeyUserEnableOCR      = "user.enable_ocr"
	SettingKeyUserOCRLanguage    = "user.ocr_language"
	SettingKeyUserNotifications  = "user.notifications"
	SettingKeyUserHotkeys        = "user.hotkeys"
)

// CreateSettingRequest 创建设置请求
type CreateSettingRequest struct {
	Key         string           `json:"key" binding:"required,min=1,max=100"`
	Value       string           `json:"value" binding:"required"`
	Type        SettingType      `json:"type" binding:"required"`
	Category    string           `json:"category" binding:"max=50"`
	Description string           `json:"description" binding:"max=500"`
	IsReadonly  bool             `json:"is_readonly"`
	IsEncrypted bool             `json:"is_encrypted"`
	Metadata    SettingMetadata  `json:"metadata"`
}

// UpdateSettingRequest 更新设置请求
type UpdateSettingRequest struct {
	Value       *string          `json:"value"`
	Description *string          `json:"description" binding:"omitempty,max=500"`
	Metadata    *SettingMetadata `json:"metadata"`
}

// SettingResponse 设置响应
type SettingResponse struct {
	ID           uint             `json:"id"`
	Key          string           `json:"key"`
	Value        string           `json:"value"`
	Type         SettingType      `json:"type"`
	Category     string           `json:"category"`
	Description  string           `json:"description"`
	IsReadonly   bool             `json:"is_readonly"`
	IsEncrypted  bool             `json:"is_encrypted"`
	DefaultValue string           `json:"default_value"`
	Metadata     SettingMetadata  `json:"metadata"`
	CreatedAt    time.Time        `json:"created_at"`
	UpdatedAt    time.Time        `json:"updated_at"`
}

// ToResponse 转换为响应格式
func (s *Setting) ToResponse() *SettingResponse {
	return &SettingResponse{
		ID:           s.ID,
		Key:          s.Key,
		Value:        s.Value,
		Type:         s.Type,
		Category:     s.Category,
		Description:  s.Description,
		IsReadonly:   s.IsReadonly,
		IsEncrypted:  s.IsEncrypted,
		DefaultValue: s.DefaultValue,
		Metadata:     s.Metadata,
		CreatedAt:    s.CreatedAt,
		UpdatedAt:    s.UpdatedAt,
	}
}

// SettingsGroup 设置分组
type SettingsGroup struct {
	Category string             `json:"category"`
	Name     string             `json:"name"`
	Settings []*SettingResponse `json:"settings"`
}

// GetDefaultSystemSettings 获取默认系统设置
func GetDefaultSystemSettings() []Setting {
	return []Setting{
		{
			Key:          SettingKeySystemName,
			Value:        "xPaste Sync Service",
			Type:         SettingTypeString,
			Category:     "system",
			Description:  "系统名称",
			DefaultValue: "xPaste Sync Service",
			Metadata: SettingMetadata{
				DisplayName: "系统名称",
				Group:       "基本设置",
				Order:       1,
			},
		},
		{
			Key:          SettingKeyMaxFileSize,
			Value:        "10485760", // 10MB
			Type:         SettingTypeNumber,
			Category:     "system",
			Description:  "最大文件大小（字节）",
			DefaultValue: "10485760",
			Metadata: SettingMetadata{
				DisplayName: "最大文件大小",
				Group:       "限制设置",
				Order:       1,
				MinValue:    func() *float64 { v := 1024.0; return &v }(), // 1KB
				MaxValue:    func() *float64 { v := 104857600.0; return &v }(), // 100MB
			},
		},
		{
			Key:          SettingKeyMaxClipItems,
			Value:        "1000",
			Type:         SettingTypeNumber,
			Category:     "system",
			Description:  "每个用户最大剪贴板项数",
			DefaultValue: "1000",
			Metadata: SettingMetadata{
				DisplayName: "最大剪贴板项数",
				Group:       "限制设置",
				Order:       2,
				MinValue:    func() *float64 { v := 10.0; return &v }(),
				MaxValue:    func() *float64 { v := 10000.0; return &v }(),
			},
		},
		{
			Key:          SettingKeyRetentionDays,
			Value:        "30",
			Type:         SettingTypeNumber,
			Category:     "system",
			Description:  "数据保留天数（0表示永久保留）",
			DefaultValue: "30",
			Metadata: SettingMetadata{
				DisplayName: "数据保留天数",
				Group:       "数据管理",
				Order:       1,
				MinValue:    func() *float64 { v := 0.0; return &v }(),
				MaxValue:    func() *float64 { v := 365.0; return &v }(),
			},
		},
		{
			Key:          SettingKeyAllowRegistration,
			Value:        "true",
			Type:         SettingTypeBoolean,
			Category:     "system",
			Description:  "是否允许用户注册",
			DefaultValue: "true",
			Metadata: SettingMetadata{
				DisplayName: "允许用户注册",
				Group:       "安全设置",
				Order:       1,
				InputType:   "checkbox",
			},
		},
	}
}