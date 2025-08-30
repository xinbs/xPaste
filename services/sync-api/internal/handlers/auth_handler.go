package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"xpaste-sync/internal/middleware"
	"xpaste-sync/internal/models"
	"xpaste-sync/internal/services"
)

// AuthHandler 认证处理器
type AuthHandler struct {
	userService *services.UserService
	db          *gorm.DB
}

// NewAuthHandler 创建认证处理器
func NewAuthHandler(userService *services.UserService, db *gorm.DB) *AuthHandler {
	return &AuthHandler{
		userService: userService,
		db:          db,
	}
}

// Register 用户注册
// @Summary 用户注册
// @Description 创建新用户账户
// @Tags 认证
// @Accept json
// @Produce json
// @Param request body models.RegisterRequest true "注册请求"
// @Success 201 {object} models.Response{data=models.AuthResult} "注册成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 409 {object} models.Response "用户已存在"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /auth/register [post]
func (h *AuthHandler) Register(c *gin.Context) {
	var req models.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid request parameters: "+err.Error()))
		return
	}

	// 验证请求参数
	if req.Username == "" || req.Email == "" || req.Password == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Username, email and password are required"))
		return
	}



	// 注册用户
	user, err := h.userService.Register(&req)
	if err != nil {
		if err == models.ErrUserExists {
			c.JSON(http.StatusConflict, models.ErrorResponse("User already exists"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Failed to register user: "+err.Error()))
		return
	}

	// 生成令牌
	accessToken, err := middleware.GenerateToken(user.ID, user.Username, "")
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Failed to generate access token: "+err.Error()))
		return
	}

	refreshToken, err := middleware.GenerateRefreshToken(user.ID, user.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Failed to generate refresh token: "+err.Error()))
		return
	}

	// 构建响应
	authResult := &models.AuthResult{
		User:         user.ToResponse(),
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		TokenType:    "Bearer",
		ExpiresIn:    3600, // 1小时
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("User registered successfully", authResult))
}

// Login 用户登录
// @Summary 用户登录
// @Description 用户登录获取访问令牌
// @Tags 认证
// @Accept json
// @Produce json
// @Param request body models.LoginRequest true "登录请求"
// @Success 200 {object} models.Response{data=models.AuthResult} "登录成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "认证失败"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /auth/login [post]
func (h *AuthHandler) Login(c *gin.Context) {
	var req models.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid request parameters: "+err.Error()))
		return
	}

	// 验证请求参数
	if req.Username == "" || req.Password == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Username and password are required"))
		return
	}

	// 获取客户端IP
	clientIP := c.ClientIP()

	// 用户登录
	user, err := h.userService.Login(&req, clientIP)
	if err != nil {
		if err == models.ErrInvalidCredentials {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse("Invalid credentials"))
			return
		}
		if err == models.ErrUserNotFound {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse("User not found"))
			return
		}
		if err == models.ErrUserInactive {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse("User account is inactive"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Login failed: "+err.Error()))
		return
	}

	// 生成令牌
	accessToken, err := middleware.GenerateToken(user.ID, user.Username, req.DeviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Failed to generate access token: "+err.Error()))
		return
	}

	refreshToken, err := middleware.GenerateRefreshToken(user.ID, user.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Failed to generate refresh token: "+err.Error()))
		return
	}

	// 构建响应
	authResult := &models.AuthResult{
		User:         user.ToResponse(),
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		TokenType:    "Bearer",
		ExpiresIn:    3600, // 1小时
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Login successful", authResult))
}

// RefreshToken 刷新访问令牌
// @Summary 刷新访问令牌
// @Description 使用刷新令牌获取新的访问令牌
// @Tags 认证
// @Accept json
// @Produce json
// @Param request body models.RefreshTokenRequest true "刷新令牌请求"
// @Success 200 {object} models.Response{data=models.AuthResult} "令牌刷新成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "刷新令牌无效"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /auth/refresh [post]
func (h *AuthHandler) RefreshToken(c *gin.Context) {
	var req models.RefreshTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid request parameters: "+err.Error()))
		return
	}

	// 验证刷新令牌
	claims, err := middleware.ValidateRefreshToken(req.Token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Invalid refresh token: "+err.Error()))
		return
	}

	// 获取用户信息
	user, err := h.userService.GetUserByID(claims.UserID)
	if err != nil {
		if err == models.ErrUserNotFound {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse("User not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Failed to get user: "+err.Error()))
		return
	}

	// 检查用户状态
	if !user.IsActive() {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("User account is inactive"))
		return
	}

	// 生成新的访问令牌
	accessToken, err := middleware.GenerateToken(user.ID, user.Username, claims.DeviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Failed to generate access token: "+err.Error()))
		return
	}

	// 生成新的刷新令牌
	newRefreshToken, err := middleware.GenerateRefreshToken(user.ID, user.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Failed to generate refresh token: "+err.Error()))
		return
	}

	// 构建响应
	authResult := &models.AuthResult{
		User:         user.ToResponse(),
		AccessToken:  accessToken,
		RefreshToken: newRefreshToken,
		TokenType:    "Bearer",
		ExpiresIn:    3600, // 1小时
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Token refreshed successfully", authResult))
}

// Logout 用户登出
// @Summary 用户登出
// @Description 用户登出（客户端应删除令牌）
// @Tags 认证
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {object} models.Response "登出成功"
// @Failure 401 {object} models.Response "未授权"
// @Router /auth/logout [post]
func (h *AuthHandler) Logout(c *gin.Context) {
	// 获取用户信息
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	// 这里可以添加令牌黑名单逻辑，或者记录登出日志
	// 目前只是简单返回成功，客户端需要删除本地存储的令牌

	c.JSON(http.StatusOK, models.SuccessResponse("Logout successful", gin.H{
		"user_id": userID,
		"message": "Please delete the token from client storage",
	}))
}

// GetProfile 获取用户资料
// @Summary 获取用户资料
// @Description 获取当前登录用户的资料信息
// @Tags 认证
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {object} models.Response{data=models.UserResponse} "获取成功"
// @Failure 401 {object} models.Response "未授权"
// @Failure 404 {object} models.Response "用户不存在"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /auth/profile [get]
func (h *AuthHandler) GetProfile(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	user, err := h.userService.GetUserByID(userID.(uint))
	if err != nil {
		if err == models.ErrUserNotFound {
			c.JSON(http.StatusNotFound, models.ErrorResponse("User not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Failed to get user profile: "+err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Profile retrieved successfully", user.ToResponse()))
}

// UpdateProfile 更新用户资料
// @Summary 更新用户资料
// @Description 更新当前登录用户的资料信息
// @Tags 认证
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body models.UpdateUserRequest true "更新请求"
// @Success 200 {object} models.Response{data=models.UserResponse} "更新成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 404 {object} models.Response "用户不存在"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /auth/profile [put]
func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	var req models.UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid request parameters: "+err.Error()))
		return
	}

	user, err := h.userService.UpdateUser(userID.(uint), &req)
	if err != nil {
		if err == models.ErrUserNotFound {
			c.JSON(http.StatusNotFound, models.ErrorResponse("User not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Failed to update profile: "+err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Profile updated successfully", user.ToResponse()))
}

// ChangePassword 修改密码
// @Summary 修改密码
// @Description 修改当前登录用户的密码
// @Tags 认证
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body models.ChangePasswordRequest true "修改密码请求"
// @Success 200 {object} models.Response "密码修改成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权或原密码错误"
// @Failure 404 {object} models.Response "用户不存在"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /auth/change-password [post]
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	var req models.ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid request parameters: "+err.Error()))
		return
	}

	// 验证请求参数
	if req.OldPassword == "" || req.NewPassword == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Old password and new password are required"))
		return
	}

	err := h.userService.ChangePassword(userID.(uint), req.OldPassword, req.NewPassword)
	if err != nil {
		if err == models.ErrUserNotFound {
			c.JSON(http.StatusNotFound, models.ErrorResponse("User not found"))
			return
		}
		if err == models.ErrInvalidCredentials {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse("Invalid old password"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Failed to change password: "+err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Password changed successfully", nil))
}

// GetUserStats 获取用户统计信息
// @Summary 获取用户统计信息
// @Description 获取当前登录用户的统计信息
// @Tags 认证
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {object} models.Response{data=services.UserStats} "获取成功"
// @Failure 401 {object} models.Response "未授权"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /auth/stats [get]
func (h *AuthHandler) GetUserStats(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	stats, err := h.userService.GetUserStats(userID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Failed to get user stats: "+err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("User stats retrieved successfully", stats))
}

// RegisterRoutes 注册认证相关路由
func (h *AuthHandler) RegisterRoutes(router *gin.RouterGroup) {
	auth := router.Group("/auth")
	{
		// 公开路由（不需要认证）
		auth.POST("/register", h.Register)
		auth.POST("/login", h.Login)
		auth.POST("/refresh", h.RefreshToken)

		// 需要认证的路由
		authenticated := auth.Group("")
		authenticated.Use(middleware.AuthMiddleware(h.db))
		{
			authenticated.POST("/logout", h.Logout)
			authenticated.GET("/profile", h.GetProfile)
			authenticated.PUT("/profile", h.UpdateProfile)
			authenticated.POST("/change-password", h.ChangePassword)
			authenticated.GET("/stats", h.GetUserStats)
		}
	}
}