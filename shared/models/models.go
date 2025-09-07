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
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
	Username  string         `json:"username" gorm:"uniqueIndex;not null"`
	Email     string         `json:"email" gorm:"uniqueIndex"`
	Password  string         `json:"-" gorm:"not null"`
	Nickname  string         `json:"nickname"`
	Status    string         `json:"status" gorm:"default:active"` // active, inactive, banned
	Devices   []Device       `json:"devices,omitempty" gorm:"foreignKey:UserID"`
}

// TableName 指定表名
func (User) TableName() string {
	return "users"
}

// Device 设备模型
type Device struct {
	ID         uint           `json:"id" gorm:"primarykey"`
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at"`
	DeletedAt  gorm.DeletedAt `json:"-" gorm:"index"`
	UserID     uint           `json:"user_id" gorm:"not null;index"`
	User       *User          `json:"user,omitempty" gorm:"foreignKey:UserID"`
	DeviceID   string         `json:"device_id" gorm:"uniqueIndex;not null"`
	DeviceName string         `json:"device_name" gorm:"not null"`
	DeviceType string         `json:"device_type"` // desktop, mobile, web
	OS         string         `json:"os"`
	Version    string         `json:"version"`
	Status     string         `json:"status" gorm:"default:online"` // online, offline
	LastSeen   *time.Time     `json:"last_seen"`
	IPAddress  string         `json:"ip_address"`
}

// TableName 指定表名
func (Device) TableName() string {
	return "devices"
}

// Clipboard 剪贴板模型
type Clipboard struct {
	ID          uint       `json:"id" gorm:"primaryKey"`
	UserID      uint       `json:"user_id" gorm:"not null;index"`
	DeviceID    string     `json:"device_id" gorm:"size:255;not null;index"`
	Type        string     `json:"type" gorm:"size:20;not null;index"`
	Content     string     `json:"content" gorm:"type:text;not null"`
	Title       string     `json:"title" gorm:"size:255"`
	Description string     `json:"description" gorm:"type:text"`
	Tags        string     `json:"tags" gorm:"type:json"`
	Metadata    string     `json:"metadata" gorm:"type:json"`
	Status      string     `json:"status" gorm:"size:20;not null;default:'active';index"`
	ViewCount   int        `json:"view_count" gorm:"default:0"`
	UsedAt      *time.Time `json:"used_at" gorm:"index"`
	LastUsedAt  *time.Time `json:"last_used_at" gorm:"index"`
	ExpiresAt   *time.Time `json:"expires_at" gorm:"index"`
	CreatedAt   time.Time  `json:"created_at" gorm:"index"`
	UpdatedAt   time.Time  `json:"updated_at"`
	
	// 关联
	User *User `json:"user,omitempty" gorm:"foreignKey:UserID"`
}

// TableName 指定表名
func (Clipboard) TableName() string {
	return "clip_items"
}

// Admin 管理员模型
type Admin struct {
	ID        uint           `json:"id" gorm:"primarykey"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
	Username  string         `json:"username" gorm:"uniqueIndex;not null"`
	Email     string         `json:"email" gorm:"uniqueIndex"`
	Password  string         `json:"-" gorm:"not null"`
	Nickname  string         `json:"nickname"`
	Role      string         `json:"role" gorm:"default:admin"` // admin, super_admin
	Status    string         `json:"status" gorm:"default:active"` // active, inactive
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
	Email    string `json:"email" binding:"omitempty,email"`
	Password string `json:"password" binding:"omitempty,min=6"`
	Nickname string `json:"nickname" binding:"omitempty,max=100"`
	Status   string `json:"status" binding:"omitempty,oneof=active inactive banned"`
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