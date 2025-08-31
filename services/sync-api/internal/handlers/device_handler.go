package handlers

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"xpaste-sync/internal/middleware"
	"xpaste-sync/internal/models"
	"xpaste-sync/internal/services"
)

// DeviceHandler 设备处理器
type DeviceHandler struct {
	deviceService *services.DeviceService
	db            *gorm.DB
}

// NewDeviceHandler 创建设备处理器
func NewDeviceHandler(deviceService *services.DeviceService, db *gorm.DB) *DeviceHandler {
	return &DeviceHandler{
		deviceService: deviceService,
		db:            db,
	}
}

// RegisterDevice 注册设备
// @Summary 注册设备
// @Description 注册或更新设备信息
// @Tags 设备
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body models.RegisterDeviceRequest true "设备注册请求"
// @Success 201 {object} models.Response{data=models.DeviceResponse} "注册成功"
// @Success 200 {object} models.Response{data=models.DeviceResponse} "更新成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /devices/register [post]
func (h *DeviceHandler) RegisterDevice(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	var req models.RegisterDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponseWithMessage("Invalid request parameters", err.Error()))
		return
	}

	// 验证必填字段
	if req.Name == "" || req.Platform == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Device name and platform are required"))
		return
	}

	// 获取客户端IP
	clientIP := c.ClientIP()

	// 注册设备
	device, err := h.deviceService.RegisterDevice(userID.(uint), &req, clientIP)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to register device", err.Error()))
		return
	}

	c.JSON(http.StatusCreated, models.SuccessResponseWithMessage("Device registered successfully", device.ToResponse()))
}

// GetDevice 获取设备信息
// @Summary 获取设备信息
// @Description 根据设备ID获取设备详细信息
// @Tags 设备
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param device_id path string true "设备ID"
// @Success 200 {object} models.Response{data=models.DeviceResponse} "获取成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 404 {object} models.Response "设备不存在"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /devices/{device_id} [get]
func (h *DeviceHandler) GetDevice(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	deviceID := c.Param("device_id")
	if deviceID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Device ID is required"))
		return
	}

	device, err := h.deviceService.GetDeviceByDeviceID(userID.(uint), deviceID)
	if err != nil {
		if err == models.ErrDeviceNotFound {
			c.JSON(http.StatusNotFound, models.ErrorResponse("Device not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to get device", err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Device retrieved successfully", device.ToResponse()))
}

// GetDevices 获取设备列表
// @Summary 获取设备列表
// @Description 获取当前用户的所有设备列表
// @Tags 设备
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param page query int false "页码" default(1)
// @Param limit query int false "每页数量" default(20)
// @Param platform query string false "平台筛选"
// @Param status query string false "状态筛选" Enums(active,inactive)
// @Param online_only query bool false "仅显示在线设备"
// @Success 200 {object} models.Response{data=models.ListResponse} "获取成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /devices [get]
func (h *DeviceHandler) GetDevices(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	// 添加调试日志
	fmt.Printf("[DEBUG] GetDevices called for userID: %v\n", userID)

	// 解析分页参数
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	// 解析筛选参数
	platform := c.Query("platform")
	status := c.Query("status")
	onlineOnly := c.Query("online_only") == "true"

	fmt.Printf("[DEBUG] Query params - page: %d, limit: %d, platform: %s, status: %s, onlineOnly: %v\n", page, limit, platform, status, onlineOnly)

	params := &models.PaginationParams{
		Page:     page,
		PageSize: limit,
	}

	var devices []*models.Device
	var total int64
	var err error

	if onlineOnly {
		devices, err = h.deviceService.GetOnlineDevices(userID.(uint))
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse("Failed to get online devices: "+err.Error()))
			return
		}
		total = int64(len(devices))
		// 手动分页
		start := (page - 1) * limit
		end := start + limit
		if start >= len(devices) {
			devices = []*models.Device{}
		} else {
			if end > len(devices) {
				end = len(devices)
			}
			devices = devices[start:end]
		}
	} else if platform != "" {
		devices, err = h.deviceService.GetDevicesByPlatform(userID.(uint), models.DevicePlatform(platform))
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse("Failed to get devices by platform: "+err.Error()))
			return
		}
		total = int64(len(devices))
	} else {
		var pagination *models.PaginationResponse
		devices, pagination, err = h.deviceService.GetUserDevices(userID.(uint), params)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse("Failed to get user devices: "+err.Error()))
			return
		}
		if pagination != nil {
			total = pagination.Total
		} else {
			total = int64(len(devices))
		}
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to get devices", err.Error()))
		return
	}

	// 根据状态筛选
	if status != "" && !onlineOnly {
		filteredDevices := make([]*models.Device, 0)
		for _, device := range devices {
			if (status == "active" && device.IsActive()) || (status == "inactive" && !device.IsActive()) {
				filteredDevices = append(filteredDevices, device)
			}
		}
		devices = filteredDevices
		total = int64(len(devices))
	}

	// 转换为响应格式
	deviceResponses := make([]models.DeviceResponse, len(devices))
	fmt.Printf("[DEBUG] Converting %d devices to response format\n", len(devices))
	for i, device := range devices {
		deviceResponse := device.ToResponse()
		fmt.Printf("[DEBUG] Device %d response: ID=%d, DeviceID=%s, Name=%s\n", i, deviceResponse.ID, deviceResponse.DeviceID, deviceResponse.Name)
		deviceResponses[i] = *deviceResponse
	}

	fmt.Printf("[DEBUG] Final deviceResponses length: %d\n", len(deviceResponses))

	response := &models.ListResponse{
		Items: deviceResponses,
		Pagination: &models.PaginationResponse{
			Page:       page,
			PageSize:   limit,
			Total:      total,
			TotalPages: int((total + int64(limit) - 1) / int64(limit)),
		},
	}

	fmt.Printf("[DEBUG] Final response items length: %d\n", len(response.Items.([]models.DeviceResponse)))

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Devices retrieved successfully", response))
}

// UpdateDevice 更新设备信息
// @Summary 更新设备信息
// @Description 更新设备的基本信息
// @Tags 设备
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param device_id path string true "设备ID"
// @Param request body models.UpdateDeviceRequest true "更新请求"
// @Success 200 {object} models.Response{data=models.DeviceResponse} "更新成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 404 {object} models.Response "设备不存在"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /devices/{device_id} [put]
func (h *DeviceHandler) UpdateDevice(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	deviceID := c.Param("device_id")
	if deviceID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Device ID is required"))
		return
	}

	var req models.UpdateDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponseWithMessage("Invalid request parameters", err.Error()))
		return
	}

	// 先获取设备确保存在且属于当前用户
	_, err := h.deviceService.GetDeviceByDeviceID(userID.(uint), deviceID)
	if err != nil {
		if err == models.ErrDeviceNotFound {
			c.JSON(http.StatusNotFound, models.ErrorResponse("Device not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to get device", err.Error()))
		return
	}

	// 更新设备信息
	updatedDevice, err := h.deviceService.UpdateDevice(userID.(uint), deviceID, &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to update device", err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Device updated successfully", updatedDevice.ToResponse()))
}

// UpdateDeviceStatus 更新设备在线状态
// @Summary 更新设备在线状态
// @Description 更新设备的在线状态
// @Tags 设备
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param device_id path string true "设备ID"
// @Param request body models.UpdateDeviceStatusRequest true "状态更新请求"
// @Success 200 {object} models.Response "更新成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 404 {object} models.Response "设备不存在"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /devices/{device_id}/status [put]
func (h *DeviceHandler) UpdateDeviceStatus(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	deviceID := c.Param("device_id")
	if deviceID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Device ID is required"))
		return
	}

	var req struct {
		IsOnline bool   `json:"is_online"`
		Location string `json:"location,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponseWithMessage("Invalid request parameters", err.Error()))
		return
	}

	// 先获取设备确保存在且属于当前用户
	_, err := h.deviceService.GetDeviceByDeviceID(userID.(uint), deviceID)
	if err != nil {
		if err == models.ErrDeviceNotFound {
			c.JSON(http.StatusNotFound, models.ErrorResponse("Device not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to get device", err.Error()))
		return
	}

	// 更新在线状态
	err = h.deviceService.UpdateDeviceOnlineStatus(userID.(uint), deviceID, req.IsOnline, req.Location)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to update device status", err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Device status updated successfully", gin.H{
		"device_id": deviceID,
		"is_online": req.IsOnline,
	}))
}

// DeactivateDevice 停用设备
// @Summary 停用设备
// @Description 停用指定设备
// @Tags 设备
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param device_id path string true "设备ID"
// @Success 200 {object} models.Response "停用成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 404 {object} models.Response "设备不存在"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /devices/{device_id}/deactivate [post]
func (h *DeviceHandler) DeactivateDevice(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	deviceID := c.Param("device_id")
	if deviceID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Device ID is required"))
		return
	}

	// 先获取设备确保存在且属于当前用户
	_, err := h.deviceService.GetDeviceByDeviceID(userID.(uint), deviceID)
	if err != nil {
		if err == models.ErrDeviceNotFound {
			c.JSON(http.StatusNotFound, models.ErrorResponse("Device not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to get device", err.Error()))
		return
	}

	// 停用设备
	err = h.deviceService.DeactivateDevice(userID.(uint), deviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to deactivate device", err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Device deactivated successfully", gin.H{
		"device_id": deviceID,
	}))
}

// DeleteDevice 删除设备
// @Summary 删除设备
// @Description 软删除指定设备
// @Tags 设备
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param device_id path string true "设备ID"
// @Success 200 {object} models.Response "删除成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 404 {object} models.Response "设备不存在"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /devices/{device_id} [delete]
func (h *DeviceHandler) DeleteDevice(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	deviceID := c.Param("device_id")
	if deviceID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Device ID is required"))
		return
	}

	// 先获取设备确保存在且属于当前用户
	_, err := h.deviceService.GetDeviceByDeviceID(userID.(uint), deviceID)
	if err != nil {
		if err == models.ErrDeviceNotFound {
			c.JSON(http.StatusNotFound, models.ErrorResponse("Device not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to get device", err.Error()))
		return
	}

	// 删除设备
	err = h.deviceService.DeleteDevice(userID.(uint), deviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to delete device", err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Device deleted successfully", gin.H{
		"device_id": deviceID,
	}))
}

// GetDeviceStats 获取设备统计信息
// @Summary 获取设备统计信息
// @Description 获取指定设备的统计信息
// @Tags 设备
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param device_id path string true "设备ID"
// @Success 200 {object} models.Response{data=services.DeviceStats} "获取成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 404 {object} models.Response "设备不存在"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /devices/{device_id}/stats [get]
func (h *DeviceHandler) GetDeviceStats(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	deviceID := c.Param("device_id")
	if deviceID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Device ID is required"))
		return
	}

	// 先获取设备确保存在且属于当前用户
	_, err := h.deviceService.GetDeviceByDeviceID(userID.(uint), deviceID)
	if err != nil {
		if err == models.ErrDeviceNotFound {
			c.JSON(http.StatusNotFound, models.ErrorResponse("Device not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to get device", err.Error()))
		return
	}

	// 获取设备统计信息
	stats, err := h.deviceService.GetDeviceStats(userID.(uint), deviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to get device stats", err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Device stats retrieved successfully", stats))
}

// RegisterRoutes 注册设备相关路由
func (h *DeviceHandler) RegisterRoutes(router *gin.RouterGroup) {
	devices := router.Group("/devices")
	devices.Use(middleware.AuthMiddleware(h.db)) // 所有设备接口都需要认证
	{
		devices.POST("/register", h.RegisterDevice)
		devices.GET("", h.GetDevices)
		devices.GET("/:device_id", h.GetDevice)
		devices.PUT("/:device_id", h.UpdateDevice)
		devices.PUT("/:device_id/status", h.UpdateDeviceStatus)
		devices.POST("/:device_id/deactivate", h.DeactivateDevice)
		devices.DELETE("/:device_id", h.DeleteDevice)
		devices.GET("/:device_id/stats", h.GetDeviceStats)
	}
}