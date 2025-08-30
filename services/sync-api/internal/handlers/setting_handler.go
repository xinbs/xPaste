package handlers

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"

	"xpaste-sync/internal/models"
	"xpaste-sync/internal/services"
)

// SettingHandler 设置处理器
type SettingHandler struct {
	settingService *services.SettingService
}

// NewSettingHandler 创建设置处理器
func NewSettingHandler(settingService *services.SettingService) *SettingHandler {
	return &SettingHandler{
		settingService: settingService,
	}
}

// GetUserSetting 获取用户设置
// @Summary 获取用户设置
// @Description 根据键获取用户设置值
// @Tags 设置
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param key path string true "设置键"
// @Success 200 {object} models.Response{data=models.SettingResponse} "获取成功"
// @Failure 401 {object} models.Response "未授权"
// @Failure 404 {object} models.Response "设置不存在"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /settings/user/{key} [get]
func (h *SettingHandler) GetUserSetting(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	key := c.Param("key")
	if key == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Setting key is required"))
		return
	}

	setting, err := h.settingService.GetUserSetting(userID.(uint), key)
	if err != nil {
		if err == models.ErrSettingNotFound {
			c.JSON(http.StatusNotFound, models.ErrorResponse("Setting not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Failed to get user setting: "+err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse("User setting retrieved successfully", setting.ToResponse()))
}

// GetUserSettings 获取用户所有设置
// @Summary 获取用户所有设置
// @Description 获取用户的所有设置
// @Tags 设置
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param category query string false "设置分类筛选"
// @Success 200 {object} models.Response{data=[]models.SettingResponse} "获取成功"
// @Failure 401 {object} models.Response "未授权"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /settings/user [get]
func (h *SettingHandler) GetUserSettings(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	category := c.Query("category")

	settings, err := h.settingService.GetUserSettings(userID.(uint), category)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to get settings", err.Error()))
		return
	}

	// 转换为响应格式
	settingResponses := make([]models.SettingResponse, len(settings))
	for i, setting := range settings {
		settingResponses[i] = *setting.ToResponse()
	}

	c.JSON(http.StatusOK, models.SuccessResponse("User settings retrieved successfully", settingResponses))
}

// SetUserSetting 设置用户设置
// @Summary 设置用户设置
// @Description 设置或更新用户设置
// @Tags 设置
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param key path string true "设置键"
// @Param request body models.SetSettingRequest true "设置请求"
// @Success 200 {object} models.Response{data=models.SettingResponse} "设置成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 403 {object} models.Response "设置为只读"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /settings/user/{key} [put]
func (h *SettingHandler) SetUserSetting(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	key := c.Param("key")
	if key == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Setting key is required"))
		return
	}

	var req models.SetSettingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponseWithMessage("Invalid request parameters", err.Error()))
		return
	}

	createReq := &models.CreateSettingRequest{
		Key:   key,
		Value: fmt.Sprintf("%v", req.Value),
		Type:  models.SettingTypeString, // 默认为字符串类型
	}
	setting, err := h.settingService.SetUserSetting(userID.(uint), createReq)
	if err != nil {
		if err == models.ErrSettingReadOnly {
			c.JSON(http.StatusForbidden, models.ErrorResponse("Setting is read-only"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to set user setting", err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("User setting updated successfully", setting.ToResponse()))
}

// BatchSetUserSettings 批量设置用户设置
// @Summary 批量设置用户设置
// @Description 批量设置或更新用户设置
// @Tags 设置
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body models.BatchSetSettingsRequest true "批量设置请求"
// @Success 200 {object} models.Response{data=[]models.SettingResponse} "设置成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /settings/user/batch [put]
func (h *SettingHandler) BatchSetUserSettings(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	var req models.BatchSetSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponseWithMessage("Invalid request parameters", err.Error()))
		return
	}

	if len(req.Settings) == 0 {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("No settings provided"))
		return
	}

	// 转换为字符串映射
	settingsMap := make(map[string]string)
	for k, v := range req.Settings {
		settingsMap[k] = fmt.Sprintf("%v", v)
	}
	err := h.settingService.BulkSetUserSettings(userID.(uint), settingsMap)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to batch set user settings", err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("User settings updated successfully", nil))
}

// DeleteUserSetting 删除用户设置
// @Summary 删除用户设置
// @Description 删除用户设置（恢复为默认值）
// @Tags 设置
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param key path string true "设置键"
// @Success 200 {object} models.Response "删除成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 404 {object} models.Response "设置不存在"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /settings/user/{key} [delete]
func (h *SettingHandler) DeleteUserSetting(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	key := c.Param("key")
	if key == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Setting key is required"))
		return
	}

	userIDPtr := userID.(uint)
	err := h.settingService.DeleteSetting(&userIDPtr, key)
	if err != nil {
		if err == models.ErrSettingNotFound {
			c.JSON(http.StatusNotFound, models.ErrorResponse("Setting not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to delete user setting", err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("User setting deleted successfully", gin.H{
		"key": key,
	}))
}

// ResetUserSettings 重置用户设置
// @Summary 重置用户设置
// @Description 重置用户所有设置为默认值
// @Tags 设置
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param category query string false "设置分类（可选，不指定则重置所有）"
// @Success 200 {object} models.Response "重置成功"
// @Failure 401 {object} models.Response "未授权"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /settings/user/reset [post]
func (h *SettingHandler) ResetUserSettings(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	category := c.Query("category")

	err := h.settingService.ResetUserSettings(userID.(uint), category)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to reset user settings", err.Error()))
		return
	}

	message := "All user settings reset successfully"
	if category != "" {
		message = "User settings in category '" + category + "' reset successfully"
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage(message, gin.H{
		"category": category,
	}))
}

// ExportUserSettings 导出用户设置
// @Summary 导出用户设置
// @Description 导出用户设置（不包含加密设置）
// @Tags 设置
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {object} models.Response{data=map[string]interface{}} "导出成功"
// @Failure 401 {object} models.Response "未授权"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /settings/user/export [get]
func (h *SettingHandler) ExportUserSettings(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	settings, err := h.settingService.ExportUserSettings(userID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to export user settings", err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("User settings exported successfully", settings))
}

// ImportUserSettings 导入用户设置
// @Summary 导入用户设置
// @Description 导入用户设置
// @Tags 设置
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body models.ImportSettingsRequest true "导入请求"
// @Success 200 {object} models.Response "导入成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /settings/user/import [post]
func (h *SettingHandler) ImportUserSettings(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	var req models.ImportSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponseWithMessage("Invalid request parameters", err.Error()))
		return
	}

	if len(req.Settings) == 0 {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("No settings provided"))
		return
	}

	// 转换为字符串映射
	settingsMap := make(map[string]string)
	for k, v := range req.Settings {
		settingsMap[k] = fmt.Sprintf("%v", v)
	}
	err := h.settingService.ImportUserSettings(userID.(uint), settingsMap)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to import user settings", err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("User settings imported successfully", gin.H{
		"imported_count": len(req.Settings),
	}))
}

// GetSystemSetting 获取系统设置
// @Summary 获取系统设置
// @Description 根据键获取系统设置值（管理员权限）
// @Tags 设置
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param key path string true "设置键"
// @Success 200 {object} models.Response{data=models.SettingResponse} "获取成功"
// @Failure 401 {object} models.Response "未授权"
// @Failure 403 {object} models.Response "权限不足"
// @Failure 404 {object} models.Response "设置不存在"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /settings/system/{key} [get]
func (h *SettingHandler) GetSystemSetting(c *gin.Context) {
	// 这里应该检查管理员权限，暂时跳过
	// TODO: 实现管理员权限检查

	key := c.Param("key")
	if key == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Setting key is required"))
		return
	}

	setting, err := h.settingService.GetSystemSetting(key)
	if err != nil {
		if err == models.ErrSettingNotFound {
			c.JSON(http.StatusNotFound, models.ErrorResponse("Setting not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to get system setting", err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("System setting retrieved successfully", setting.ToResponse()))
}

// GetSystemSettings 获取系统所有设置
// @Summary 获取系统所有设置
// @Description 获取系统的所有设置（管理员权限）
// @Tags 设置
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param category query string false "设置分类筛选"
// @Success 200 {object} models.Response{data=[]models.SettingResponse} "获取成功"
// @Failure 401 {object} models.Response "未授权"
// @Failure 403 {object} models.Response "权限不足"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /settings/system [get]
func (h *SettingHandler) GetSystemSettings(c *gin.Context) {
	// 这里应该检查管理员权限，暂时跳过
	// TODO: 实现管理员权限检查

	category := c.Query("category")

	settings, err := h.settingService.GetSystemSettings(category)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to get system settings", err.Error()))
		return
	}

	// 转换为响应格式
	settingResponses := make([]models.SettingResponse, len(settings))
	for i, setting := range settings {
		settingResponses[i] = *setting.ToResponse()
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("System settings retrieved successfully", settingResponses))
}

// SetSystemSetting 设置系统设置
// @Summary 设置系统设置
// @Description 设置或更新系统设置（管理员权限）
// @Tags 设置
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param key path string true "设置键"
// @Param request body models.SetSettingRequest true "设置请求"
// @Success 200 {object} models.Response{data=models.SettingResponse} "设置成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 403 {object} models.Response "权限不足或设置为只读"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /settings/system/{key} [put]
func (h *SettingHandler) SetSystemSetting(c *gin.Context) {
	// 这里应该检查管理员权限，暂时跳过
	// TODO: 实现管理员权限检查

	key := c.Param("key")
	if key == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Setting key is required"))
		return
	}

	var req models.SetSettingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponseWithMessage("Invalid request parameters", err.Error()))
		return
	}

	createReq := &models.CreateSettingRequest{
		Key:   key,
		Value: fmt.Sprintf("%v", req.Value),
		Type:  models.SettingTypeString,
	}
	setting, err := h.settingService.SetSystemSetting(createReq)
	if err != nil {
		if err == models.ErrSettingReadOnly {
			c.JSON(http.StatusForbidden, models.ErrorResponse("Setting is read-only"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to set system setting", err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("System setting updated successfully", setting.ToResponse()))
}

// GetSettingsByCategory 根据分类获取设置
// @Summary 根据分类获取设置
// @Description 根据分类获取用户设置（带默认值）
// @Tags 设置
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param category path string true "设置分类"
// @Success 200 {object} models.Response{data=[]models.SettingResponse} "获取成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /settings/category/{category} [get]
func (h *SettingHandler) GetSettingsByCategory(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	category := c.Param("category")
	if category == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Category is required"))
		return
	}

	userIDPtr := userID.(uint)
	settings, err := h.settingService.GetSettingsByCategory(&userIDPtr, category)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to get settings by category", err.Error()))
		return
	}

	// 转换为响应格式
	settingResponses := make([]models.SettingResponse, len(settings))
	for i, setting := range settings {
		settingResponses[i] = *setting.ToResponse()
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Settings retrieved successfully", settingResponses))
}

// RegisterRoutes 注册设置相关路由
func (h *SettingHandler) RegisterRoutes(router *gin.RouterGroup) {
	settings := router.Group("/settings")
	// settings.Use(middleware.AuthMiddleware()) // TODO: 添加认证中间件
	{
		// 用户设置路由
		userSettings := settings.Group("/user")
		{
			userSettings.GET("", h.GetUserSettings)
			userSettings.PUT("/batch", h.BatchSetUserSettings)
			userSettings.POST("/reset", h.ResetUserSettings)
			userSettings.GET("/export", h.ExportUserSettings)
			userSettings.POST("/import", h.ImportUserSettings)
			userSettings.GET("/:key", h.GetUserSetting)
			userSettings.PUT("/:key", h.SetUserSetting)
			userSettings.DELETE("/:key", h.DeleteUserSetting)
		}

		// 系统设置路由（需要管理员权限）
		systemSettings := settings.Group("/system")
		{
			systemSettings.GET("", h.GetSystemSettings)
			systemSettings.GET("/:key", h.GetSystemSetting)
			systemSettings.PUT("/:key", h.SetSystemSetting)
		}

		// 分类设置路由
		settings.GET("/category/:category", h.GetSettingsByCategory)
	}
}