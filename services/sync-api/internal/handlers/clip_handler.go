package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"xpaste-sync/internal/middleware"
	"xpaste-sync/internal/models"
	"xpaste-sync/internal/services"
)

// ClipHandler 剪贴板处理器
type ClipHandler struct {
	clipService *services.ClipService
	db          *gorm.DB
}

// NewClipHandler 创建剪贴板处理器
func NewClipHandler(clipService *services.ClipService, db *gorm.DB) *ClipHandler {
	return &ClipHandler{
		clipService: clipService,
		db:          db,
	}
}

// CreateClip 创建剪贴板项
// @Summary 创建剪贴板项
// @Description 创建新的剪贴板项
// @Tags 剪贴板
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body models.CreateClipRequest true "创建请求"
// @Success 201 {object} models.Response{data=models.ClipItemResponse} "创建成功"
// @Success 200 {object} models.Response{data=models.ClipItemResponse} "内容已存在，更新使用时间"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /clips [post]
func (h *ClipHandler) CreateClip(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	deviceID, _ := c.Get("device_id")

	var req models.CreateClipRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid request parameters: " + err.Error()))
		return
	}

	// 验证必填字段
	if req.Content == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Content is required"))
		return
	}

	// 如果没有提供设备ID，尝试从认证信息中获取
	if req.DeviceID == "" {
		if deviceID != nil {
			req.DeviceID = deviceID.(string)
		}
	}

	// 创建剪贴板项
	clip, err := h.clipService.CreateClipItem(userID.(uint), &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Failed to create clip item: " + err.Error()))
		return
	}

	c.JSON(http.StatusCreated, models.SuccessResponseWithMessage("Clip item created successfully", clip.ToResponse()))
}

// GetClip 获取剪贴板项
// @Summary 获取剪贴板项
// @Description 根据ID获取剪贴板项详细信息
// @Tags 剪贴板
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "剪贴板项ID"
// @Success 200 {object} models.Response{data=models.ClipItemResponse} "获取成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 404 {object} models.Response "剪贴板项不存在"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /clips/{id} [get]
func (h *ClipHandler) GetClip(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid clip ID: " + err.Error()))
		return
	}

	clip, err := h.clipService.GetClipItem(userID.(uint), uint(id))
	if err != nil {
		if err == models.ErrClipNotFound {
			c.JSON(http.StatusNotFound, models.ErrorResponse("Clip item not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Failed to get clip item: " + err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Clip item retrieved successfully", clip.ToResponse()))
}

// GetClips 获取剪贴板项列表
// @Summary 获取剪贴板项列表
// @Description 获取当前用户的剪贴板项列表
// @Tags 剪贴板
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param page query int false "页码" default(1)
// @Param limit query int false "每页数量" default(20)
// @Param type query string false "类型筛选" Enums(text,image,file,url)
// @Param device_id query string false "设备ID筛选"
// @Param status query string false "状态筛选" Enums(active,expired)
// @Param search query string false "搜索关键词"
// @Param tags query string false "标签筛选（逗号分隔）"
// @Param start_time query string false "开始时间（RFC3339格式）"
// @Param end_time query string false "结束时间（RFC3339格式）"
// @Param include_expired query bool false "包含过期项" default(false)
// @Param sort query string false "排序方式" Enums(created_at,updated_at,used_at) default(updated_at)
// @Param order query string false "排序顺序" Enums(asc,desc) default(desc)
// @Success 200 {object} models.Response{data=models.ListResponse} "获取成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /clips [get]
func (h *ClipHandler) GetClips(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

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
	params := &services.ClipListParams{
		PaginationParams: &models.PaginationParams{
			Page:     page,
			PageSize: limit,
		},
		Type:           c.Query("type"),
		DeviceID:       c.Query("device_id"),
		Status:         c.Query("status"),
		Search:         c.Query("search"),
		IncludeExpired: func() *bool { b := c.Query("include_expired") == "true"; return &b }(),
		OrderBy:        c.DefaultQuery("sort", "updated_at") + " " + c.DefaultQuery("order", "desc"),
	}

	// 解析标签
	if tagsStr := c.Query("tags"); tagsStr != "" {
		params.Tags = strings.Split(tagsStr, ",")
		for i, tag := range params.Tags {
			params.Tags[i] = strings.TrimSpace(tag)
		}
	}

	// 解析时间范围
	if startTimeStr := c.Query("start_time"); startTimeStr != "" {
		if startTime, err := time.Parse(time.RFC3339, startTimeStr); err == nil {
			params.StartTime = &startTime
		}
	}
	if endTimeStr := c.Query("end_time"); endTimeStr != "" {
		if endTime, err := time.Parse(time.RFC3339, endTimeStr); err == nil {
			params.EndTime = &endTime
		}
	}

	// 获取剪贴板项列表
	clips, total, err := h.clipService.GetUserClipItems(userID.(uint), params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Failed to get clip items: " + err.Error()))
		return
	}

	// 转换为响应格式
	clipResponses := make([]models.ClipItemResponse, len(clips))
	for i, clip := range clips {
		clipResponses[i] = *clip.ToResponse()
	}

	response := &models.ListResponse{
		Items: clipResponses,
		Pagination: &models.PaginationResponse{
			Page:       page,
			PageSize:   limit,
			Total:      total,
			TotalPages: int((total + int64(limit) - 1) / int64(limit)),
		},
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Clip items retrieved successfully", response))
}

// GetRecentClips 获取最近剪贴板项
// @Summary 获取最近剪贴板项
// @Description 获取用户最近使用的剪贴板项
// @Tags 剪贴板
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param limit query int false "数量限制" default(10)
// @Success 200 {object} models.Response{data=[]models.ClipItemResponse} "获取成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /clips/recent [get]
func (h *ClipHandler) GetRecentClips(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	if limit < 1 || limit > 50 {
		limit = 10
	}

	clips, err := h.clipService.GetRecentClipItems(userID.(uint), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to get recent clip items", err.Error()))
		return
	}

	// 转换为响应格式
	clipResponses := make([]models.ClipItemResponse, len(clips))
	for i, clip := range clips {
		clipResponses[i] = *clip.ToResponse()
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Recent clip items retrieved successfully", clipResponses))
}

// UpdateClip 更新剪贴板项
// @Summary 更新剪贴板项
// @Description 更新剪贴板项信息
// @Tags 剪贴板
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "剪贴板项ID"
// @Param request body models.UpdateClipRequest true "更新请求"
// @Success 200 {object} models.Response{data=models.ClipItemResponse} "更新成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 404 {object} models.Response "剪贴板项不存在"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /clips/{id} [put]
func (h *ClipHandler) UpdateClip(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid clip ID: " + err.Error()))
		return
	}

	var req models.UpdateClipRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponseWithMessage("Invalid request parameters", err.Error()))
		return
	}

	// 更新剪贴板项
	clip, err := h.clipService.UpdateClipItem(userID.(uint), uint(id), &req)
	if err != nil {
		if err == models.ErrClipNotFound {
			c.JSON(http.StatusNotFound, models.ErrorResponse("Clip item not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to update clip item", err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Clip item updated successfully", clip.ToResponse()))
}

// DeleteClip 删除剪贴板项
// @Summary 删除剪贴板项
// @Description 软删除指定剪贴板项
// @Tags 剪贴板
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "剪贴板项ID"
// @Success 200 {object} models.Response "删除成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 404 {object} models.Response "剪贴板项不存在"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /clips/{id} [delete]
func (h *ClipHandler) DeleteClip(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid clip ID: " + err.Error()))
		return
	}

	// 删除剪贴板项
	err = h.clipService.DeleteClipItem(userID.(uint), uint(id))
	if err != nil {
		if err == models.ErrClipNotFound {
			c.JSON(http.StatusNotFound, models.ErrorResponse("Clip item not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to delete clip item", err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse("Clip item deleted successfully", gin.H{
		"id": id,
	}))
}

// DeleteClips 批量删除剪贴板项
// @Summary 批量删除剪贴板项
// @Description 批量软删除剪贴板项
// @Tags 剪贴板
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body models.BatchDeleteClipsRequest true "批量删除请求"
// @Success 200 {object} models.Response "删除成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /clips/batch-delete [post]
func (h *ClipHandler) DeleteClips(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	var req models.BatchDeleteClipsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid request parameters: " + err.Error()))
		return
	}

	if len(req.IDs) == 0 {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("No clip IDs provided"))
		return
	}

	// 批量删除剪贴板项
	err := h.clipService.DeleteClipItems(userID.(uint), req.IDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to delete clip items", err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse("Clip items deleted successfully", gin.H{
		"deleted_count": len(req.IDs),
		"ids":           req.IDs,
	}))
}

// MarkAsUsed 标记剪贴板项为已使用
// @Summary 标记剪贴板项为已使用
// @Description 标记剪贴板项为已使用，更新使用时间
// @Tags 剪贴板
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "剪贴板项ID"
// @Success 200 {object} models.Response "标记成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 404 {object} models.Response "剪贴板项不存在"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /clips/{id}/use [post]
func (h *ClipHandler) MarkAsUsed(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid clip ID: " + err.Error()))
		return
	}

	// 标记为已使用
	err = h.clipService.MarkAsUsed(userID.(uint), uint(id))
	if err != nil {
		if err == models.ErrClipNotFound {
			c.JSON(http.StatusNotFound, models.ErrorResponse("Clip item not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to mark clip item as used", err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse("Clip item marked as used", gin.H{
		"id": id,
	}))
}

// SyncClips 同步剪贴板项
// @Summary 同步剪贴板项
// @Description 获取指定时间后更新的剪贴板项
// @Tags 剪贴板
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param device_id query string true "设备ID"
// @Param last_sync query string false "上次同步时间（RFC3339格式）"
// @Param limit query int false "数量限制" default(100)
// @Success 200 {object} models.Response{data=services.SyncResult} "同步成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /clips/sync [get]
func (h *ClipHandler) SyncClips(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	deviceID := c.Query("device_id")
	if deviceID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Device ID is required"))
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	if limit < 1 || limit > 1000 {
		limit = 100
	}

	var lastSync *time.Time
	if lastSyncStr := c.Query("last_sync"); lastSyncStr != "" {
		if parsedTime, err := time.Parse(time.RFC3339, lastSyncStr); err == nil {
			lastSync = &parsedTime
		}
	}

	// 同步剪贴板项
	syncResult, err := h.clipService.SyncClipItems(userID.(uint), deviceID, lastSync)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to sync clip items", err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Clip items synced successfully", syncResult))
}

// GetClipStats 获取剪贴板统计信息
// @Summary 获取剪贴板统计信息
// @Description 获取当前用户的剪贴板统计信息
// @Tags 剪贴板
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {object} models.Response{data=services.ClipStats} "获取成功"
// @Failure 401 {object} models.Response "未授权"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /clips/stats [get]
func (h *ClipHandler) GetClipStats(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	stats, err := h.clipService.GetClipStats(userID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to get clip stats", err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Clip stats retrieved successfully", stats))
}

// SearchClips 搜索剪贴板项
// @Summary 搜索剪贴板项
// @Description 根据关键词搜索剪贴板项
// @Tags 剪贴板
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param q query string true "搜索关键词"
// @Param page query int false "页码" default(1)
// @Param limit query int false "每页数量" default(20)
// @Success 200 {object} models.Response{data=models.ListResponse} "搜索成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /clips/search [get]
func (h *ClipHandler) SearchClips(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Search query is required"))
		return
	}

	// 解析分页参数
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	params := &models.PaginationParams{
		Page:     page,
		PageSize: limit,
	}

	// 搜索剪贴板项
	clips, pagination, err := h.clipService.SearchClipItems(userID.(uint), query, params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Failed to search clip items", err.Error()))
		return
	}

	// 转换为响应格式
	clipResponses := make([]models.ClipItemResponse, len(clips))
	for i, clip := range clips {
		clipResponses[i] = *clip.ToResponse()
	}

	response := &models.ListResponse{
		Items:      clipResponses,
		Pagination: pagination,
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Clip items searched successfully", response))
}

// RegisterRoutes 注册剪贴板相关路由
func (h *ClipHandler) RegisterRoutes(router *gin.RouterGroup) {
	clips := router.Group("/clips")
	clips.Use(middleware.AuthMiddleware(h.db)) // 所有剪贴板接口都需要认证
	{
		clips.POST("", h.CreateClip)
		clips.GET("", h.GetClips)
		clips.GET("/recent", h.GetRecentClips)
		clips.GET("/sync", h.SyncClips)
		clips.GET("/stats", h.GetClipStats)
		clips.GET("/search", h.SearchClips)
		clips.POST("/batch-delete", h.DeleteClips)
		clips.GET("/:id", h.GetClip)
		clips.PUT("/:id", h.UpdateClip)
		clips.DELETE("/:id", h.DeleteClip)
		clips.POST("/:id/use", h.MarkAsUsed)
	}
}