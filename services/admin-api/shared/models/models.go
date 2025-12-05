package models

import (
	"time"
	"gorm.io/gorm"
)

// User 用户模型
type User struct {
	ID        uint           `json:"id" gorm:"primarykey"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	Username  string         `json:"username" gorm:"uniqueIndex;not null"`
	Email     string         `json:"email" gorm:"uniqueIndex"`
	Password  string         `json:"-" gorm:"column:password_hash;not null"`
	Nickname  string         `json:"nickname" gorm:"column:display_name"`
	Status    int            `json:"status" gorm:"not null;default:1"`
	Devices   []Device       `json:"devices,omitempty" gorm:"foreignKey:UserID"`
}

// TableName 指定表名
func (User) TableName() string {
	return "users"
}

// DeviceStatus 设备状态枚举
type DeviceStatus int

const (
	DeviceStatusInactive DeviceStatus = 0 // 未激活
	DeviceStatusActive   DeviceStatus = 1 // 正常
	DeviceStatusSuspended DeviceStatus = 2 // 暂停
	DeviceStatusRevoked  DeviceStatus = 3 // 已撤销
)

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

// Device 设备模型 - 与sync-api保持一致
type Device struct {
	ID         uint           `json:"id" gorm:"primarykey"`
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at"`
	UserID     uint           `json:"user_id" gorm:"not null;index"`
	User       *User          `json:"user,omitempty" gorm:"foreignKey:UserID"`
	DeviceID   string         `json:"device_id" gorm:"uniqueIndex;not null"`
	Name       string         `json:"name" gorm:"not null"` // 对应sync-api的Name字段
	Platform   DevicePlatform `json:"platform" gorm:"not null"`
	Version    string         `json:"version"`
	Model      string         `json:"model"`
	OSVersion  string         `json:"os_version"`
	Status     DeviceStatus   `json:"status" gorm:"default:1"` // 使用枚举类型
	LastSeen   *time.Time     `json:"last_seen"`
	LastIP     string         `json:"last_ip"`        // 保留原字段用于兼容性
	PublicIP   string         `json:"public_ip"`      // 公网IP
	PrivateIP  string         `json:"private_ip"`     // 内网IP
	IsOnline   bool           `json:"is_online" gorm:"default:false"` // 真正的在线状态
	LastSyncAt *time.Time     `json:"last_sync_at"`
}

// TableName 指定表名
func (Device) TableName() string {
	return "devices"
}

// Clipboard 剪贴板模型 - 对应sync-api的ClipItem
type Clipboard struct {
	ID          uint       `json:"id" gorm:"primaryKey"`
	UserID      uint       `json:"user_id" gorm:"not null;index"`
	User        *User      `json:"user,omitempty" gorm:"foreignKey:UserID"`
	DeviceID    string     `json:"device_id" gorm:"size:255;not null;index"`
	Type        string     `json:"type" gorm:"size:20;not null;index"` // text, image, file, url
	Content     string     `json:"content" gorm:"type:text;not null"`
	Title       string     `json:"title" gorm:"size:255"`
	Description string     `json:"description" gorm:"type:text"`
	Tags        []string   `json:"tags" gorm:"type:json"`
	Metadata    interface{} `json:"metadata" gorm:"type:json"`
	Status      string     `json:"status" gorm:"size:20;not null;default:'active';index"` // active, expired
	ViewCount   int        `json:"view_count" gorm:"default:0"`
	UsedAt      *time.Time `json:"used_at" gorm:"index"`
	LastUsedAt  *time.Time `json:"last_used_at" gorm:"index"`
	ExpiresAt   *time.Time `json:"expires_at" gorm:"index"`
	CreatedAt   time.Time  `json:"created_at" gorm:"index"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// TableName 指定表名
func (Clipboard) TableName() string {
	return "clip_items"
}

// Admin 管理员模型
type Admin struct {
	ID           uint           `json:"id" gorm:"primarykey"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `json:"-" gorm:"index"`
	Username     string         `json:"username" gorm:"uniqueIndex;not null"`
	Email        string         `json:"email" gorm:"uniqueIndex"`
	Password     string         `json:"-" gorm:"not null"`
	Nickname     string         `json:"nickname"`
	Role         string         `json:"role" gorm:"default:admin"` // admin, super_admin
	Status       string         `json:"status" gorm:"default:active"` // active, inactive
	LastLoginAt  *time.Time     `json:"last_login_at"`
	LastLoginIP  string         `json:"last_login_ip"`
	LoginCount   int            `json:"login_count" gorm:"default:0"`
}

// TableName 指定表名
func (Admin) TableName() string {
	return "admins"
}

// 请求结构体
type UserCreateRequest struct {
	Username string `json:"username" binding:"required,min=3,max=50"`
	Email    string `json:"email" binding:"omitempty,email"`
	Password string `json:"password" binding:"required,min=6"`
	Nickname string `json:"nickname" binding:"omitempty,max=100"`
}

type UserUpdateRequest struct {
	Username string `json:"username" binding:"omitempty,min=3,max=50"`
	Email    string `json:"email" binding:"omitempty,email"`
	Password string `json:"password" binding:"omitempty,min=6"`
	Nickname string `json:"nickname" binding:"omitempty,max=100"`
	Status   string `json:"status" binding:"omitempty,oneof=active inactive banned suspended"`
}

type AdminLoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type AdminCreateRequest struct {
	Username string `json:"username" binding:"required,min=3,max=50"`
	Email    string `json:"email" binding:"omitempty,email"`
	Password string `json:"password" binding:"required,min=6"`
	Nickname string `json:"nickname" binding:"omitempty,max=100"`
	Role     string `json:"role" binding:"omitempty,oneof=admin super_admin"`
}

type AdminUpdateRequest struct {
	Username string `json:"username" binding:"omitempty,min=3,max=50"`
	Email    string `json:"email" binding:"omitempty,email"`
	Password string `json:"password" binding:"omitempty,min=6"`
	Nickname string `json:"nickname" binding:"omitempty,max=100"`
	Role     string `json:"role" binding:"omitempty,oneof=admin super_admin"`
	Status   string `json:"status" binding:"omitempty,oneof=active inactive"`
}

type ChangePasswordRequest struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

// DeviceResponse 设备响应DTO - 匹配前端期望的字段格式
type DeviceResponse struct {
	ID           string `json:"id"`
	DeviceID     string `json:"deviceId"`
	DeviceName   string `json:"deviceName"`
	DeviceType   string `json:"deviceType"`
	Platform     string `json:"platform"`     // 对应数据库的OS字段
	Version      string `json:"version"`
	UserID       string `json:"userId"`
	Username     string `json:"username"`
	IsOnline     bool   `json:"isOnline"`     // 根据Status字段转换
	LastActiveAt string `json:"lastActiveAt"` // 对应数据库的LastSeen字段
	CreatedAt    string `json:"createdAt"`
	IPAddress    string `json:"ipAddress"`    // 原始IP地址（兼容性保留）
	PublicIP     string `json:"publicIP"`     // 公网IP地址
	PrivateIP    string `json:"privateIP"`    // 内网IP地址
	IPType       string `json:"ipType"`       // IP类型：public/private
	UserAgent    string `json:"userAgent"`    // 暂时为空，可以后续添加
}

// UserResponse 用户响应DTO - 匹配前端期望的字段格式
type UserResponse struct {
	ID           string `json:"id"`
	Username     string `json:"username"`
	Email        string `json:"email"`
	Role         string `json:"role"`
	CreatedAt    string `json:"createdAt"`
	LastLoginAt  string `json:"lastLoginAt,omitempty"`
	IsActive     bool   `json:"isActive"`
	UserType     string `json:"userType"`
	Status       string `json:"status"`
}