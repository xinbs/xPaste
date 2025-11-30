package services

import (
    "errors"
    "fmt"

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
    result := s.db.Model(&models.User{}).Order("created_at DESC").Find(&users)
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
        Status:    1,
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

	// 检查用户名是否已被其他用户使用
	if req.Username != "" && req.Username != user.Username {
		var existingUser models.User
		result := s.db.Where("username = ? AND id != ?", req.Username, id).First(&existingUser)
		if result.Error == nil {
			return nil, errors.New("用户名已存在")
		}
		if !errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, result.Error
		}
	}

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
	}

	updateMap := map[string]interface{}{}
	if req.Username != "" {
		updateMap["username"] = req.Username
	}
	if req.Email != "" {
		updateMap["email"] = req.Email
	}
	if req.Password != "" {
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			return nil, fmt.Errorf("密码加密失败: %v", err)
		}
		updateMap["password_hash"] = string(hashedPassword)
	}
	if req.Status != "" {
		// 将字符串状态映射为整型：inactive=0, active=1, suspended=2, banned=3
		switch req.Status {
		case "inactive":
			updateMap["status"] = 0
		case "active":
			updateMap["status"] = 1
		case "suspended":
			updateMap["status"] = 2
		case "banned":
			updateMap["status"] = 3
		default:
			// 忽略未知值
		}
	}

	if len(updateMap) == 0 {
		return &user, nil
	}

	if err := s.db.Model(&user).Updates(updateMap).Error; err != nil {
		return nil, err
	}

	return s.GetUserByID(id)
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
