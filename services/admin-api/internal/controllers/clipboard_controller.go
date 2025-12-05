package controllers

import (
	"net/http"
	"strconv"
	"time"

	"admin-api/internal/services"
	"admin-api/shared/models"
	"github.com/gin-gonic/gin"
)

// ClipboardResponse 剪贴板响应结构体
type ClipboardResponse struct {
	ID         string    `json:"id"`
	Content    string    `json:"content"`
	Type       string    `json:"type"`
	UserID     string    `json:"userId"`
	Username   string    `json:"username"`
	DeviceID   string    `json:"deviceId"`
	DeviceName string    `json:"deviceName"`
	Size       int       `json:"size"`
	CreatedAt  string    `json:"createdAt"`
	SyncedAt   string    `json:"syncedAt"`
	IsDeleted  bool      `json:"isDeleted"`
	Tags       []string  `json:"tags"`
}

// convertToResponse 转换为响应格式
func convertToResponse(clipboard models.Clipboard) ClipboardResponse {
	username := "Unknown"
	if clipboard.User != nil {
		username = clipboard.User.Username
	}

	return ClipboardResponse{
		ID:         strconv.Itoa(int(clipboard.ID)),
		Content:    clipboard.Content,
		Type:       clipboard.Type,
		UserID:     strconv.Itoa(int(clipboard.UserID)),
		Username:   username,
		DeviceID:   clipboard.DeviceID,
		DeviceName: clipboard.DeviceID, // 暂时使用DeviceID作为DeviceName
		Size:       len(clipboard.Content),
		CreatedAt:  clipboard.CreatedAt.Format(time.RFC3339),
		SyncedAt:   clipboard.UpdatedAt.Format(time.RFC3339),
		IsDeleted:  clipboard.Status == "deleted",
		Tags:       []string{}, // 暂时返回空数组
	}
}

type ClipboardController struct {
	clipboardService *services.ClipboardService
}

func NewClipboardController() *ClipboardController {
	return &ClipboardController{
		clipboardService: services.NewClipboardService(),
	}
}

// GetAllClipboards 获取所有剪贴板内容
func (ctrl *ClipboardController) GetAllClipboards(c *gin.Context) {
	// 获取查询参数
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	contentType := c.Query("type")
	search := c.Query("search")
	startDate := c.Query("start_date")
	endDate := c.Query("end_date")
	userIDStr := c.Query("user_id")
	var userID uint
	if userIDStr != "" {
		id, _ := strconv.ParseUint(userIDStr, 10, 32)
		userID = uint(id)
	}

	clipboards, total, err := ctrl.clipboardService.GetAllClipboards(page, limit, contentType, search, startDate, endDate, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "获取剪贴板列表失败",
			"details": err.Error(),
		})
		return
	}

	// 转换为响应格式
	responseData := make([]ClipboardResponse, len(clipboards))
	for i, clipboard := range clipboards {
		responseData[i] = convertToResponse(clipboard)
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "获取成功",
		"data": responseData,
		"pagination": gin.H{
			"page":  page,
			"limit": limit,
			"total": total,
		},
	})
}

// GetClipboardByID 根据ID获取剪贴板内容
func (ctrl *ClipboardController) GetClipboardByID(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "无效的剪贴板ID",
		})
		return
	}

	clipboard, err := ctrl.clipboardService.GetClipboardByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "获取成功",
		"data": clipboard,
	})
}

// DeleteClipboard 删除剪贴板内容
func (ctrl *ClipboardController) DeleteClipboard(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "无效的剪贴板ID",
		})
		return
	}

	err = ctrl.clipboardService.DeleteClipboard(uint(id))
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

// BatchDeleteClipboards 批量删除剪贴板内容
func (ctrl *ClipboardController) BatchDeleteClipboards(c *gin.Context) {
	var req struct {
		ClipboardIDs []uint `json:"clipboardIds" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "请求参数错误",
			"details": err.Error(),
		})
		return
	}

	err := ctrl.clipboardService.BatchDeleteClipboards(req.ClipboardIDs)
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

// RestoreClipboard 恢复剪贴板内容
func (ctrl *ClipboardController) RestoreClipboard(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "无效的剪贴板ID",
		})
		return
	}

	err = ctrl.clipboardService.RestoreClipboard(uint(id))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "恢复成功",
	})
}

// ClearAllClipboards 清空所有剪贴板内容
func (ctrl *ClipboardController) ClearAllClipboards(c *gin.Context) {
	err := ctrl.clipboardService.ClearAllClipboards()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "清空失败",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "清空成功",
	})
}

// GetClipboardStats 获取剪贴板统计信息
func (ctrl *ClipboardController) GetClipboardStats(c *gin.Context) {
	stats, err := ctrl.clipboardService.GetClipboardStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "获取统计信息失败",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "获取成功",
		"data": stats,
	})
}