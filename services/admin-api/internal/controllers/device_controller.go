package controllers

import (
	"fmt"
	"net/http"
	"strconv"
	"net"

	"admin-api/internal/services"
	"admin-api/shared/models"
	"admin-api/shared/utils"
	"github.com/gin-gonic/gin"
)

type DeviceController struct {
	deviceService *services.DeviceService
}

func NewDeviceController() *DeviceController {
	return &DeviceController{
		deviceService: services.NewDeviceService(),
	}
}

// convertDeviceToResponse 将数据库设备模型转换为前端响应格式
func (ctrl *DeviceController) convertDeviceToResponse(device models.Device) models.DeviceResponse {
	// 获取用户名
	username := ""
	if device.User != nil {
		username = device.User.Username
	}

	// 转换在线状态 - 使用正确的IsOnline字段
	isOnline := device.IsOnline

	// 格式化时间
	lastActiveAt := ""
	if device.LastSeen != nil {
		lastActiveAt = device.LastSeen.Format("2006-01-02 15:04:05")
	}

	createdAt := device.CreatedAt.Format("2006-01-02 15:04:05")

	// 使用新的PublicIP和PrivateIP字段
	publicIP := device.PublicIP
	privateIP := device.PrivateIP
	ipType := "unknown"
	
	// 确定IP类型
	if publicIP != "" && privateIP != "" {
		ipType = "both"
	} else if publicIP != "" {
		ipType = "public"
	} else if privateIP != "" {
		ipType = "private"
	} else if device.LastIP != "" {
		// 兼容性处理：如果新字段为空，从LastIP推断
		ip := net.ParseIP(device.LastIP)
		if ip != nil {
			if utils.IsPrivateIP(ip) {
				privateIP = device.LastIP
				ipType = "private"
			} else {
				publicIP = device.LastIP
				ipType = "public"
			}
		}
	}

	return models.DeviceResponse{
		ID:           fmt.Sprintf("%d", device.ID),
		DeviceID:     device.DeviceID,
		DeviceName:   device.Name, // 使用Name字段
		DeviceType:   string(device.Platform), // 使用Platform字段
		Platform:     device.OSVersion, // 使用OSVersion字段
		Version:      device.Version,
		UserID:       fmt.Sprintf("%d", device.UserID),
		Username:     username,
		IsOnline:     isOnline,
		LastActiveAt: lastActiveAt,
		CreatedAt:    createdAt,
		IPAddress:    device.LastIP, // 使用LastIP字段（兼容性保留）
		PublicIP:     publicIP,      // 公网IP
		PrivateIP:    privateIP,     // 内网IP
		IPType:       ipType,        // IP类型
		UserAgent:    "", // 暂时为空
	}
}

// GetAllDevices 获取所有设备
func (ctrl *DeviceController) GetAllDevices(c *gin.Context) {
	devices, err := ctrl.deviceService.GetAllDevices()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "获取设备列表失败",
			"details": err.Error(),
		})
		return
	}

	// 转换为前端期望的格式
	var deviceResponses []models.DeviceResponse
	for _, device := range devices {
		deviceResponses = append(deviceResponses, ctrl.convertDeviceToResponse(device))
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "获取成功",
		"data": deviceResponses,
	})
}

// GetDeviceByID 根据ID获取设备
func (ctrl *DeviceController) GetDeviceByID(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "无效的设备ID",
		})
		return
	}

	device, err := ctrl.deviceService.GetDeviceByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "获取成功",
		"data": device,
	})
}

// DisconnectDevice 断开设备连接
func (ctrl *DeviceController) DisconnectDevice(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "无效的设备ID",
		})
		return
	}

	err = ctrl.deviceService.DisconnectDevice(uint(id))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "设备已断开连接",
	})
}

// DeleteDevice 删除设备
func (ctrl *DeviceController) DeleteDevice(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "无效的设备ID",
		})
		return
	}

	err = ctrl.deviceService.DeleteDevice(uint(id))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "删除成功",
	})
}

// BatchDeleteDevices 批量删除设备
func (ctrl *DeviceController) BatchDeleteDevices(c *gin.Context) {
	var req struct {
		DeviceIDs []uint `json:"deviceIds" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "请求参数错误",
			"details": err.Error(),
		})
		return
	}

	err := ctrl.deviceService.BatchDeleteDevices(req.DeviceIDs)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "批量删除成功",
	})
}