package controllers

import (
	"fmt"
	"net/http"

	"admin-api/internal/services"
	"admin-api/shared/models"
	"github.com/gin-gonic/gin"
)

type UserController struct {
	userService *services.UserService
}

func NewUserController() *UserController {
	return &UserController{
		userService: services.NewUserService(),
	}
}

// convertUserToResponse 将数据库用户模型转换为前端响应格式
func (ctrl *UserController) convertUserToResponse(user models.User) models.UserResponse {
	// 将整型状态映射为字符串
	statusStr := "unknown"
	switch user.Status {
	case 0:
		statusStr = "inactive"
	case 1:
		statusStr = "active"
	case 2:
		statusStr = "suspended"
	case 3:
		statusStr = "banned"
	}

	// 转换活跃状态
	isActive := user.Status == 1

	// 格式化时间
	createdAt := user.CreatedAt.Format("2006-01-02 15:04:05")

	return models.UserResponse{
		ID:          fmt.Sprintf("%d", user.ID),
		Username:    user.Username,
		Email:       user.Email,
		Role:        "user", // 普通用户角色
		CreatedAt:   createdAt,
		LastLoginAt: "", // 暂时为空，可以后续添加
		IsActive:    isActive,
		UserType:    "user",
		Status:      statusStr,
	}
}

// GetAllUsers 获取所有用户
func (ctrl *UserController) GetAllUsers(c *gin.Context) {
	users, err := ctrl.userService.GetAllUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("获取用户列表失败: %v", err),
		})
		return
	}

	var userResponses []models.UserResponse
	for _, user := range users {
		userResponses = append(userResponses, ctrl.convertUserToResponse(user))
	}

	c.JSON(http.StatusOK, gin.H{
		"data": userResponses,
	})
}

// GetUserByID 获取用户详情
func (ctrl *UserController) GetUserByID(c *gin.Context) {
	var req struct {
		ID uint `uri:"id" binding:"required"`
	}
	if err := c.ShouldBindUri(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的用户ID"})
		return
	}

	user, err := ctrl.userService.GetUserByID(req.ID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": ctrl.convertUserToResponse(*user)})
}

// CreateUser 创建用户
func (ctrl *UserController) CreateUser(c *gin.Context) {
	var req models.UserCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := ctrl.userService.CreateUser(&req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": ctrl.convertUserToResponse(*user)})
}

// UpdateUser 更新用户
func (ctrl *UserController) UpdateUser(c *gin.Context) {
	var uri struct {
		ID uint `uri:"id" binding:"required"`
	}
	if err := c.ShouldBindUri(&uri); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的用户ID"})
		return
	}

	var req models.UserUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := ctrl.userService.UpdateUser(uri.ID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": ctrl.convertUserToResponse(*user)})
}

// DeleteUser 删除用户
func (ctrl *UserController) DeleteUser(c *gin.Context) {
	var req struct {
		ID uint `uri:"id" binding:"required"`
	}
	if err := c.ShouldBindUri(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的用户ID"})
		return
	}

	if err := ctrl.userService.DeleteUser(req.ID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "用户已删除"})
}