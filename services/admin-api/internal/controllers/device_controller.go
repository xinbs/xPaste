package controllers

import (
	"net/http"
	"strconv"

	"admin-api/internal/services"
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

	c.JSON(http.StatusOK, gin.H{
		"message": "获取成功",
		"data": devices,
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