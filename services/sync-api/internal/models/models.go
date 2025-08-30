package models

import (
	"errors"
	"fmt"
	"time"
)

// 导出所有模型，方便其他包使用

// 认证相关结构
type AuthResult struct {
	User         *UserResponse `json:"user"`
	AccessToken  string        `json:"access_token"`
	RefreshToken string        `json:"refresh_token"`
	TokenType    string        `json:"token_type"`
	ExpiresIn    int           `json:"expires_in"`
}

// LoginRequest 登录请求
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
	DeviceID string `json:"device_id,omitempty"`
}

// 注册请求
type RegisterRequest struct {
	Username string `json:"username" binding:"required,min=3,max=50"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

// 刷新令牌请求
type RefreshTokenRequest struct {
	Token string `json:"token" binding:"required"`
}

// 更新用户请求
type UpdateUserRequest struct {
	Email       string  `json:"email,omitempty" binding:"omitempty,email"`
	DisplayName *string `json:"display_name,omitempty" binding:"omitempty,max=100"`
	Avatar      *string `json:"avatar,omitempty" binding:"omitempty,max=500"`
	Timezone    *string `json:"timezone,omitempty" binding:"omitempty,max=50"`
	Language    *string `json:"language,omitempty" binding:"omitempty,max=10"`
}

// 修改密码请求
type ChangePasswordRequest struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

// 同步相关结构
type SyncResult struct {
	Accepted   int      `json:"accepted"`
	Duplicates int      `json:"duplicates"`
	Errors     []string `json:"errors"`
}

// 分页参数
type PaginationParams struct {
	Page     int `form:"page,default=1" binding:"min=1"`
	PageSize int `form:"page_size,default=20" binding:"min=1,max=100"`
}

// 分页响应
type PaginationResponse struct {
	Page       int   `json:"page"`
	PageSize   int   `json:"page_size"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
	HasMore    bool  `json:"has_more"`
}

// 计算总页数
func (p *PaginationResponse) CalculateTotalPages() {
	if p.PageSize > 0 {
		p.TotalPages = int((p.Total + int64(p.PageSize) - 1) / int64(p.PageSize))
		p.HasMore = p.Page < p.TotalPages
	}
}

// 获取偏移量
func (p *PaginationParams) GetOffset() int {
	return (p.Page - 1) * p.PageSize
}

// 获取限制数量
func (p *PaginationParams) GetLimit() int {
	return p.PageSize
}

// 通用响应结构
type Response struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// 成功响应
func SuccessResponse(message string, data interface{}) *Response {
	return &Response{
		Success: true,
		Message: message,
		Data:    data,
	}
}

// 成功响应带消息
func SuccessResponseWithMessage(message string, data interface{}) *Response {
	return &Response{
		Success: true,
		Message: message,
		Data:    data,
	}
}

// 错误响应
func ErrorResponse(message string) *Response {
	return &Response{
		Success: false,
		Message: message,
	}
}

// 错误响应带详细信息
func ErrorResponseWithMessage(message string, details string) *Response {
	return &Response{
		Success: false,
		Message: message,
		Error:   details,
	}
}

// 列表响应
type ListResponse struct {
	Items      interface{}          `json:"items"`
	Pagination *PaginationResponse `json:"pagination,omitempty"`
}

// WebSocket 消息类型
type WSMessageType string

const (
	WSMessageTypeClipSync     WSMessageType = "clip_sync"
	WSMessageTypeClipUpdate   WSMessageType = "clip_update"
	WSMessageTypeClipDelete   WSMessageType = "clip_delete"
	WSMessageTypeDeviceOnline WSMessageType = "device_online"
	WSMessageTypeDeviceOffline WSMessageType = "device_offline"
	WSMessageTypeHeartbeat    WSMessageType = "heartbeat"
	WSMessageTypeError        WSMessageType = "error"
)

// WebSocket 消息
type WSMessage struct {
	Type      WSMessageType `json:"type"`
	Data      interface{}   `json:"data,omitempty"`
	Timestamp int64         `json:"timestamp"`
	MessageID string        `json:"message_id,omitempty"`
}

// 创建 WebSocket 消息
func NewWSMessage(msgType WSMessageType, data interface{}) *WSMessage {
	return &WSMessage{
		Type:      msgType,
		Data:      data,
		Timestamp: time.Now().Unix(),
		MessageID: fmt.Sprintf("%d_%s", time.Now().UnixNano(), msgType),
	}
}

// 设置相关请求结构
type SetSettingRequest struct {
	Value interface{} `json:"value" binding:"required"`
}

type BatchSetSettingsRequest struct {
	Settings map[string]interface{} `json:"settings" binding:"required"`
}

type ImportSettingsRequest struct {
	Settings map[string]interface{} `json:"settings" binding:"required"`
}

// 错误定义
var (
	ErrUserExists        = errors.New("user already exists")
	ErrUserNotFound      = errors.New("user not found")
	ErrInvalidPassword   = errors.New("invalid password")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrUserInactive      = errors.New("user account is inactive")
	ErrTokenExpired      = errors.New("token expired")
	ErrInvalidToken      = errors.New("invalid token")
	ErrDeviceNotFound    = errors.New("device not found")
	ErrClipItemNotFound  = errors.New("clip item not found")
	ErrClipNotFound      = errors.New("clip item not found")
	ErrClipItemExpired   = errors.New("clip item expired")
	ErrSettingNotFound   = errors.New("setting not found")
	ErrSettingReadOnly   = errors.New("setting is read-only")
)