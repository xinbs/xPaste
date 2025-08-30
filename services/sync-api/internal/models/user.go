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

	// 基本信息
	Username     string `json:"username" gorm:"uniqueIndex;not null;size:100"`
	Email        string `json:"email" gorm:"uniqueIndex;not null;size:255"`
	PasswordHash string `json:"-" gorm:"not null;size:255"`
	DisplayName  string `json:"display_name" gorm:"size:100"`
	Avatar       string `json:"avatar" gorm:"size:500"`

	// 状态信息
	Status    UserStatus `json:"status" gorm:"default:1"`
	LastLogin *time.Time `json:"last_login"`
	LoginIP   string     `json:"login_ip" gorm:"size:45"`

	// 设置信息
	Timezone string `json:"timezone" gorm:"size:50;default:'UTC'"`
	Language string `json:"language" gorm:"size:10;default:'en'"`

	// 关联关系
	Devices   []Device   `json:"devices,omitempty" gorm:"foreignKey:UserID"`
	ClipItems []ClipItem `json:"clip_items,omitempty" gorm:"foreignKey:UserID"`
	Settings  []Setting  `json:"settings,omitempty" gorm:"foreignKey:UserID"`
}

// UserStatus 用户状态
type UserStatus int

const (
	UserStatusInactive UserStatus = 0 // 未激活
	UserStatusActive   UserStatus = 1 // 正常
	UserStatusSuspended UserStatus = 2 // 暂停
	UserStatusBanned   UserStatus = 3 // 封禁
)

// String 返回用户状态的字符串表示
func (s UserStatus) String() string {
	switch s {
	case UserStatusInactive:
		return "inactive"
	case UserStatusActive:
		return "active"
	case UserStatusSuspended:
		return "suspended"
	case UserStatusBanned:
		return "banned"
	default:
		return "unknown"
	}
}

// TableName 指定表名
func (User) TableName() string {
	return "users"
}

// BeforeCreate GORM 钩子：创建前
func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.DisplayName == "" {
		u.DisplayName = u.Username
	}
	return nil
}

// IsActive 检查用户是否处于活跃状态
func (u *User) IsActive() bool {
	return u.Status == UserStatusActive
}

// UpdateLastLogin 更新最后登录时间和IP
func (u *User) UpdateLastLogin(ip string) {
	now := time.Now()
	u.LastLogin = &now
	u.LoginIP = ip
}

// CreateUserRequest 创建用户请求
type CreateUserRequest struct {
	Username    string `json:"username" binding:"required,min=3,max=50"`
	Email       string `json:"email" binding:"required,email"`
	Password    string `json:"password" binding:"required,min=6"`
	DisplayName string `json:"display_name" binding:"max=100"`
}



// UserResponse 用户响应
type UserResponse struct {
	ID          uint       `json:"id"`
	Username    string     `json:"username"`
	Email       string     `json:"email"`
	DisplayName string     `json:"display_name"`
	Avatar      string     `json:"avatar"`
	Status      string     `json:"status"`
	LastLogin   *time.Time `json:"last_login"`
	Timezone    string     `json:"timezone"`
	Language    string     `json:"language"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// ToResponse 转换为响应格式
func (u *User) ToResponse() *UserResponse {
	return &UserResponse{
		ID:          u.ID,
		Username:    u.Username,
		Email:       u.Email,
		DisplayName: u.DisplayName,
		Avatar:      u.Avatar,
		Status:      u.Status.String(),
		LastLogin:   u.LastLogin,
		Timezone:    u.Timezone,
		Language:    u.Language,
		CreatedAt:   u.CreatedAt,
		UpdatedAt:   u.UpdatedAt,
	}
}