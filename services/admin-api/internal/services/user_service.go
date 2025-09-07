package services

import (
	"errors"
	"fmt"
	"time"

	"admin-api/shared/database"
	"admin-api/shared/models"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type UserService struct {
	db *gorm.DB
}

func NewUserService() *UserService {
	return &UserService{
		db: database.GetDB(),
	}
}

// GetAllUsers 获取所有用户
func (s *UserService) GetAllUsers() ([]models.User, error) {
	var users []models.User
	result := s.db.Find(&users)
	return users, result.Error
}

// GetUserByID 根据ID获取用户
func (s *UserService) GetUserByID(id uint) (*models.User, error) {
	var user models.User
	result := s.db.First(&user, id)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("用户不存在")
		}
		return nil, result.Error
	}
	return &user, nil
}

// CreateUser 创建用户
func (s *UserService) CreateUser(req *models.UserCreateRequest) (*models.User, error) {
	// 检查用户名是否已存在
	var existingUser models.User
	result := s.db.Where("username = ?", req.Username).First(&existingUser)
	if result.Error == nil {
		return nil, errors.New("用户名已存在")
	}
	if !errors.Is(result.Error, gorm.ErrRecordNotFound) {
		return nil, result.Error
	}

	// 检查邮箱是否已存在
	if req.Email != "" {
		result = s.db.Where("email = ?", req.Email).First(&existingUser)
		if result.Error == nil {
			return nil, errors.New("邮箱已存在")
		}
		if !errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, result.Error
		}
	}

	// 加密密码
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("密码加密失败: %v", err)
	}

	user := &models.User{
		Username:  req.Username,
		Email:     req.Email,
		Password:  string(hashedPassword),
		Nickname:  req.Nickname,
		Status:    "active",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	result = s.db.Create(user)
	if result.Error != nil {
		return nil, result.Error
	}

	return user, nil
}

// UpdateUser 更新用户
func (s *UserService) UpdateUser(id uint, req *models.UserUpdateRequest) (*models.User, error) {
	var user models.User
	result := s.db.First(&user, id)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("用户不存在")
		}
		return nil, result.Error
	}

	// 用户名不允许修改，跳过用户名检查

	// 检查邮箱是否已被其他用户使用
	if req.Email != "" && req.Email != user.Email {
		var existingUser models.User
		result := s.db.Where("email = ? AND id != ?", req.Email, id).First(&existingUser)
		if result.Error == nil {
			return nil, errors.New("邮箱已存在")
		}
		if !errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, result.Error
		}
		user.Email = req.Email
	}

	if req.Nickname != "" {
		user.Nickname = req.Nickname
	}

	if req.Status != "" {
		user.Status = req.Status
	}

	user.UpdatedAt = time.Now()

	result = s.db.Save(&user)
	if result.Error != nil {
		return nil, result.Error
	}

	return &user, nil
}

// DeleteUser 删除用户
func (s *UserService) DeleteUser(id uint) error {
	result := s.db.Delete(&models.User{}, id)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return errors.New("用户不存在")
	}
	return nil
}