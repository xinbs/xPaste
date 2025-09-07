package controllers

import (
	"net/http"
	"strconv"

	"admin-api/internal/services"
	"github.com/gin-gonic/gin"
)

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

	clipboards, total, err := ctrl.clipboardService.GetAllClipboards(page, limit, contentType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "获取剪贴板列表失败",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "获取成功",
		"data": clipboards,
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