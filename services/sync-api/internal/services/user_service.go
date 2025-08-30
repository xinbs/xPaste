package services

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"xpaste-sync/internal/models"
)

// UserService 用户服务
type UserService struct {
	db *gorm.DB
}

// NewUserService 创建用户服务
func NewUserService(db *gorm.DB) *UserService {
	return &UserService{db: db}
}

// Register 用户注册
func (s *UserService) Register(req *models.RegisterRequest) (*models.User, error) {
	// 检查用户名是否已存在
	var existingUser models.User
	if err := s.db.Where("username = ? OR email = ?", req.Username, req.Email).First(&existingUser).Error; err == nil {
		if existingUser.Username == req.Username {
			return nil, fmt.Errorf("username already exists")
		}
		if existingUser.Email == req.Email {
			return nil, fmt.Errorf("email already exists")
		}
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("database error: %w", err)
	}

	// 加密密码
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	// 创建用户
	user := &models.User{
		Username:     req.Username,
		Email:        req.Email,
		PasswordHash: string(hashedPassword),
		DisplayName:  req.Username, // 默认显示名称为用户名
		Status:       models.UserStatusActive,
		Timezone:     "UTC",
		Language:     "en",
	}

	if err := s.db.Create(user).Error; err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	return user, nil
}

// Login 用户登录
func (s *UserService) Login(req *models.LoginRequest, clientIP string) (*models.User, error) {
	// 查找用户
	var user models.User
	if err := s.db.Where("username = ? OR email = ?", req.Username, req.Username).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, models.ErrUserNotFound
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	// 检查用户状态
	if !user.IsActive() {
		return nil, fmt.Errorf("user account is inactive")
	}

	// 验证密码
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, models.ErrInvalidPassword
	}

	// 更新最后登录信息
	user.UpdateLastLogin(clientIP)
	if err := s.db.Save(&user).Error; err != nil {
		return nil, fmt.Errorf("failed to update login info: %w", err)
	}

	return &user, nil
}

// GetUserByID 根据ID获取用户
func (s *UserService) GetUserByID(userID uint) (*models.User, error) {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, models.ErrUserNotFound
		}
		return nil, fmt.Errorf("database error: %w", err)
	}
	return &user, nil
}

// GetUserByUsername 根据用户名获取用户
func (s *UserService) GetUserByUsername(username string) (*models.User, error) {
	var user models.User
	if err := s.db.Where("username = ?", username).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, models.ErrUserNotFound
		}
		return nil, fmt.Errorf("database error: %w", err)
	}
	return &user, nil
}

// GetUserByEmail 根据邮箱获取用户
func (s *UserService) GetUserByEmail(email string) (*models.User, error) {
	var user models.User
	if err := s.db.Where("email = ?", email).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, models.ErrUserNotFound
		}
		return nil, fmt.Errorf("database error: %w", err)
	}
	return &user, nil
}

// UpdateUser 更新用户信息
func (s *UserService) UpdateUser(userID uint, req *models.UpdateUserRequest) (*models.User, error) {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, models.ErrUserNotFound
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	// 更新字段
	if req.DisplayName != nil && *req.DisplayName != "" {
		user.DisplayName = *req.DisplayName
	}
	if req.Avatar != nil && *req.Avatar != "" {
		user.Avatar = *req.Avatar
	}
	if req.Timezone != nil && *req.Timezone != "" {
		user.Timezone = *req.Timezone
	}
	if req.Language != nil && *req.Language != "" {
		user.Language = *req.Language
	}

	if err := s.db.Save(&user).Error; err != nil {
		return nil, fmt.Errorf("failed to update user: %w", err)
	}

	return &user, nil
}

// ChangePassword 修改密码
func (s *UserService) ChangePassword(userID uint, oldPassword, newPassword string) error {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.ErrUserNotFound
		}
		return fmt.Errorf("database error: %w", err)
	}

	// 验证旧密码
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(oldPassword)); err != nil {
		return models.ErrInvalidPassword
	}

	// 加密新密码
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	// 更新密码
	user.PasswordHash = string(hashedPassword)
	if err := s.db.Save(&user).Error; err != nil {
		return fmt.Errorf("failed to update password: %w", err)
	}

	return nil
}

// DeactivateUser 停用用户
func (s *UserService) DeactivateUser(userID uint) error {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.ErrUserNotFound
		}
		return fmt.Errorf("database error: %w", err)
	}

	user.Status = models.UserStatusInactive
	if err := s.db.Save(&user).Error; err != nil {
		return fmt.Errorf("failed to deactivate user: %w", err)
	}

	return nil
}

// ActivateUser 激活用户
func (s *UserService) ActivateUser(userID uint) error {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.ErrUserNotFound
		}
		return fmt.Errorf("database error: %w", err)
	}

	user.Status = models.UserStatusActive
	if err := s.db.Save(&user).Error; err != nil {
		return fmt.Errorf("failed to activate user: %w", err)
	}

	return nil
}

// DeleteUser 删除用户（软删除）
func (s *UserService) DeleteUser(userID uint) error {
	if err := s.db.Delete(&models.User{}, userID).Error; err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}
	return nil
}

// GetUserStats 获取用户统计信息
func (s *UserService) GetUserStats(userID uint) (*UserStats, error) {
	var stats UserStats

	// 获取设备数量
	if err := s.db.Model(&models.Device{}).Where("user_id = ? AND deleted_at IS NULL", userID).Count(&stats.DeviceCount).Error; err != nil {
		return nil, fmt.Errorf("failed to count devices: %w", err)
	}

	// 获取剪贴板项数量
	if err := s.db.Model(&models.ClipItem{}).Where("user_id = ? AND deleted_at IS NULL", userID).Count(&stats.ClipItemCount).Error; err != nil {
		return nil, fmt.Errorf("failed to count clip items: %w", err)
	}

	// 获取今日剪贴板项数量
	today := time.Now().Truncate(24 * time.Hour)
	if err := s.db.Model(&models.ClipItem{}).Where("user_id = ? AND created_at >= ? AND deleted_at IS NULL", userID, today).Count(&stats.TodayClipItemCount).Error; err != nil {
		return nil, fmt.Errorf("failed to count today's clip items: %w", err)
	}

	// 获取存储使用量（字节）
	var totalSize sql.NullInt64
	if err := s.db.Model(&models.ClipItem{}).Where("user_id = ? AND deleted_at IS NULL", userID).Select("COALESCE(SUM(size), 0)").Scan(&totalSize).Error; err != nil {
		return nil, fmt.Errorf("failed to calculate storage usage: %w", err)
	}
	stats.StorageUsage = totalSize.Int64

	return &stats, nil
}

// UserStats 用户统计信息
type UserStats struct {
	DeviceCount        int64 `json:"device_count"`
	ClipItemCount      int64 `json:"clip_item_count"`
	TodayClipItemCount int64 `json:"today_clip_item_count"`
	StorageUsage       int64 `json:"storage_usage"` // 字节
}

// ListUsers 获取用户列表（管理员功能）
func (s *UserService) ListUsers(params *models.PaginationParams) ([]*models.User, *models.PaginationResponse, error) {
	var users []*models.User
	var total int64

	// 计算总数
	if err := s.db.Model(&models.User{}).Count(&total).Error; err != nil {
		return nil, nil, fmt.Errorf("failed to count users: %w", err)
	}

	// 获取用户列表
	if err := s.db.Offset(params.GetOffset()).Limit(params.GetLimit()).Find(&users).Error; err != nil {
		return nil, nil, fmt.Errorf("failed to get users: %w", err)
	}

	// 构建分页响应
	pagination := &models.PaginationResponse{
		Page:     params.Page,
		PageSize: params.PageSize,
		Total:    total,
	}
	pagination.CalculateTotalPages()

	return users, pagination, nil
}

// SearchUsers 搜索用户
func (s *UserService) SearchUsers(query string, params *models.PaginationParams) ([]*models.User, *models.PaginationResponse, error) {
	var users []*models.User
	var total int64

	// 构建搜索条件
	searchQuery := s.db.Model(&models.User{}).Where("username LIKE ? OR email LIKE ? OR display_name LIKE ?", 
		"%"+query+"%", "%"+query+"%", "%"+query+"%")

	// 计算总数
	if err := searchQuery.Count(&total).Error; err != nil {
		return nil, nil, fmt.Errorf("failed to count users: %w", err)
	}

	// 获取用户列表
	if err := searchQuery.Offset(params.GetOffset()).Limit(params.GetLimit()).Find(&users).Error; err != nil {
		return nil, nil, fmt.Errorf("failed to search users: %w", err)
	}

	// 构建分页响应
	pagination := &models.PaginationResponse{
		Page:     params.Page,
		PageSize: params.PageSize,
		Total:    total,
	}
	pagination.CalculateTotalPages()

	return users, pagination, nil
}