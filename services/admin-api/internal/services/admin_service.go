package services

import (
	"errors"
	"time"

	"admin-api/shared/database"
	"admin-api/shared/models"
	"admin-api/shared/utils"
	"gorm.io/gorm"
)

type AdminService struct {
	db *gorm.DB
}

func NewAdminService() *AdminService {
	return &AdminService{
		db: database.GetDB(),
	}
}

// Login 管理员登录
func (s *AdminService) Login(req *models.AdminLoginRequest) (map[string]interface{}, error) {
	// 根据用户名或邮箱查找管理员
	var admin *models.Admin
	var err error
	
	if utils.IsEmail(req.Username) {
		admin, err = database.GetAdminByEmail(req.Username)
	} else {
		admin, err = database.GetAdminByUsername(req.Username)
	}
	
	if err != nil {
		return nil, errors.New("用户名或密码错误")
	}
	
	// 验证密码
	if !utils.CheckPasswordHash(req.Password, admin.Password) {
		return nil, errors.New("用户名或密码错误")
	}
	
	// 生成JWT令牌
	token, err := utils.GenerateToken(admin.ID, admin.Username, admin.Role)
	if err != nil {
		return nil, errors.New("生成令牌失败")
	}
	
	return map[string]interface{}{
		"token": token,
		"admin": admin,
	}, nil
}

// GetAdminByID 根据ID获取管理员
func (s *AdminService) GetAdminByID(id uint) (*models.Admin, error) {
	admin, err := database.GetAdminByID(id)
	if err != nil {
		return nil, errors.New("管理员不存在")
	}
	return admin, nil
}

// GetAllAdmins 获取所有管理员
func (s *AdminService) GetAllAdmins() ([]models.Admin, error) {
	return database.GetAllAdmins()
}

// CreateAdmin 创建管理员
func (s *AdminService) CreateAdmin(req *models.AdminCreateRequest) (*models.Admin, error) {
	// 检查用户名是否已存在
	existingAdmin, _ := database.GetAdminByUsername(req.Username)
	if existingAdmin != nil {
		return nil, errors.New("用户名已存在")
	}

	// 检查邮箱是否已存在
	existingAdmin, _ = database.GetAdminByEmail(req.Email)
	if existingAdmin != nil {
		return nil, errors.New("邮箱已存在")
	}

	// 加密密码
	hashedPassword, err := utils.HashPassword(req.Password)
	if err != nil {
		return nil, err
	}

	// 创建管理员
	admin := &models.Admin{
		Username: req.Username,
		Email:    req.Email,
		Password: hashedPassword,
		Role:     req.Role,
		Status:   "active",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	err = database.CreateAdmin(admin)
	if err != nil {
		return nil, err
	}

	return admin, nil
}

// UpdateAdmin 更新管理员
func (s *AdminService) UpdateAdmin(id uint, req *models.AdminUpdateRequest) (*models.Admin, error) {
	admin, err := s.GetAdminByID(id)
	if err != nil {
		return nil, err
	}

	// 更新字段
	if req.Email != "" {
		// 检查邮箱是否已被其他用户使用
		existingAdmin, err := database.GetAdminByEmail(req.Email)
		if err == nil && existingAdmin.ID != id {
			return nil, errors.New("邮箱已被使用")
		}
		admin.Email = req.Email
	}

	if req.Role != "" {
		admin.Role = req.Role
	}

	if req.Status != "" {
		admin.Status = req.Status
	}
	admin.UpdatedAt = time.Now()
	err = database.UpdateAdmin(admin)
	if err != nil {
		return nil, err
	}

	return admin, nil
}

// DeleteAdmin 删除管理员
func (s *AdminService) DeleteAdmin(id uint) error {
	// 检查是否为最后一个超级管理员
	superAdminCount := database.CountSuperAdmins()

	if superAdminCount <= 1 {
		admin, err := s.GetAdminByID(id)
		if err != nil {
			return err
		}
		if admin.Role == "super_admin" {
			return errors.New("不能删除最后一个超级管理员")
		}
	}

	return database.DeleteAdmin(id)
}

// ChangePassword 修改密码
func (s *AdminService) ChangePassword(id uint, req *models.ChangePasswordRequest) error {
	admin, err := s.GetAdminByID(id)
	if err != nil {
		return err
	}

	// 验证旧密码
	if !utils.CheckPasswordHash(req.OldPassword, admin.Password) {
		return errors.New("旧密码错误")
	}

	// 加密新密码
	hashedPassword, err := utils.HashPassword(req.NewPassword)
	if err != nil {
		return err
	}

	// 更新密码
	admin.Password = hashedPassword
	admin.UpdatedAt = time.Now()
	return database.UpdateAdmin(admin)
}

// GetDashboardStats 获取仪表盘统计数据
func (s *AdminService) GetDashboardStats() (map[string]interface{}, error) {
	stats := make(map[string]interface{})
	
	// 获取用户总数
	userCount := database.CountUsers()
	stats["totalUsers"] = userCount
	stats["activeDevices"] = userCount // 简化为用户数
	
	// 获取剪贴板总数
	clipboardCount := database.CountClipboards()
	stats["totalClipboards"] = clipboardCount
	
	// 获取今日剪贴板数
	today := time.Now().Format("2006-01-02")
	todayCount := database.CountTodayClipboards(today)
	stats["todayClipboards"] = todayCount
	
	return stats, nil
}