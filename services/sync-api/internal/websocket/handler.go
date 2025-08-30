package websocket

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"xpaste-sync/internal/models"
	"xpaste-sync/internal/services"
)

// Handler WebSocket 处理器
type Handler struct {
	manager       *Manager
	userService   *services.UserService
	deviceService *services.DeviceService
}

// NewHandler 创建 WebSocket 处理器
func NewHandler(manager *Manager, userService *services.UserService, deviceService *services.DeviceService) *Handler {
	return &Handler{
		manager:       manager,
		userService:   userService,
		deviceService: deviceService,
	}
}

// HandleWebSocket 处理 WebSocket 连接
// @Summary WebSocket 连接
// @Description 建立 WebSocket 连接进行实时同步
// @Tags WebSocket
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param device_id query string true "设备ID"
// @Success 101 "切换协议成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 500 {object} models.Response "服务器内部错误"
// @Router /ws [get]
func (h *Handler) HandleWebSocket(c *gin.Context) {
	// 获取用户ID
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	// 获取设备ID
	deviceID := c.Query("device_id")
	if deviceID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Device ID is required"))
		return
	}

	// 验证设备是否属于当前用户
	device, err := h.deviceService.GetDeviceByDeviceID(userID.(uint), deviceID)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid device ID: "+err.Error()))
		return
	}

	if device.UserID != userID.(uint) {
		c.JSON(http.StatusForbidden, models.ErrorResponse("Device does not belong to user"))
		return
	}

	// 升级 HTTP 连接为 WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade connection: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Failed to upgrade connection: "+err.Error()))
		return
	}

	// 创建客户端
	client := &Client{
		ID:       uuid.New().String(),
		UserID:   userID.(uint),
		DeviceID: deviceID,
		Conn:     conn,
		Send:     make(chan Message, 256),
		Manager:  h.manager,
		LastSeen: time.Now(),
	}

	// 注册客户端
	h.manager.register <- client

	// 更新设备在线状态
	go func() {
		if err := h.deviceService.UpdateDeviceOnlineStatus(device.UserID, device.DeviceID, true, ""); err != nil {
			log.Printf("Failed to update device status: %v", err)
		}
	}()

	// 启动读写协程
	go client.writePump()
	go client.readPump()

	log.Printf("WebSocket connection established for user %d, device %s", userID.(uint), deviceID)
}

// GetOnlineDevices 获取在线设备列表
// @Summary 获取在线设备
// @Description 获取当前用户的在线设备列表
// @Tags WebSocket
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {object} models.Response{data=[]string} "获取成功"
// @Failure 401 {object} models.Response "未授权"
// @Router /ws/devices/online [get]
func (h *Handler) GetOnlineDevices(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	devices := h.manager.GetOnlineDevices(userID.(uint))
	c.JSON(http.StatusOK, models.SuccessResponse("Online devices retrieved successfully", devices))
}

// GetConnectionStats 获取连接统计
// @Summary 获取连接统计
// @Description 获取 WebSocket 连接统计信息
// @Tags WebSocket
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {object} models.Response{data=gin.H} "获取成功"
// @Failure 401 {object} models.Response "未授权"
// @Router /ws/stats [get]
func (h *Handler) GetConnectionStats(c *gin.Context) {
	// 这里应该检查管理员权限，暂时跳过
	// TODO: 实现管理员权限检查

	total, byUser := h.manager.GetClientCount()

	stats := gin.H{
		"total_connections": total,
		"connections_by_user": byUser,
		"timestamp": time.Now().Unix(),
	}

	c.JSON(http.StatusOK, models.SuccessResponse("Connection stats retrieved successfully", stats))
}

// SendMessage 发送消息到指定设备
// @Summary 发送消息
// @Description 向指定设备发送 WebSocket 消息
// @Tags WebSocket
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body SendMessageRequest true "发送消息请求"
// @Success 200 {object} models.Response "发送成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Failure 404 {object} models.Response "设备不在线"
// @Router /ws/send [post]
func (h *Handler) SendMessage(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	var req SendMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid request parameters: "+err.Error()))
		return
	}

	// 验证设备是否属于当前用户
	device, err := h.deviceService.GetDeviceByDeviceID(userID.(uint), req.DeviceID)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid device ID: "+err.Error()))
		return
	}

	if device.UserID != userID.(uint) {
		c.JSON(http.StatusForbidden, models.ErrorResponse("Device does not belong to user"))
		return
	}

	// 检查设备是否在线
	if !h.manager.IsDeviceOnline(req.DeviceID) {
		c.JSON(http.StatusNotFound, models.ErrorResponse("Device is not online"))
		return
	}

	// 创建消息
	message := Message{
		Type:      MessageType(req.Type),
		Data:      req.Data,
		Timestamp: time.Now().Unix(),
		MessageID: uuid.New().String(),
	}

	// 发送消息
	h.manager.SendToDevice(req.DeviceID, message)

	c.JSON(http.StatusOK, models.SuccessResponse("Message sent successfully", gin.H{
		"message_id": message.MessageID,
		"device_id":  req.DeviceID,
	}))
}

// BroadcastMessage 广播消息到用户的所有设备
// @Summary 广播消息
// @Description 向用户的所有在线设备广播消息
// @Tags WebSocket
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body BroadcastMessageRequest true "广播消息请求"
// @Success 200 {object} models.Response "广播成功"
// @Failure 400 {object} models.Response "请求参数错误"
// @Failure 401 {object} models.Response "未授权"
// @Router /ws/broadcast [post]
func (h *Handler) BroadcastMessage(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}

	var req BroadcastMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid request parameters: "+err.Error()))
		return
	}

	// 创建消息
	message := Message{
		Type:      MessageType(req.Type),
		Data:      req.Data,
		Timestamp: time.Now().Unix(),
		MessageID: uuid.New().String(),
	}

	// 广播消息
	if req.ExcludeDeviceID != "" {
		h.manager.SendToUserExceptDevice(userID.(uint), req.ExcludeDeviceID, message)
	} else {
		h.manager.SendToUser(userID.(uint), message)
	}

	c.JSON(http.StatusOK, models.SuccessResponse("Message broadcasted successfully", gin.H{
		"message_id": message.MessageID,
		"user_id":    userID.(uint),
	}))
}

// SendMessageRequest 发送消息请求
type SendMessageRequest struct {
	DeviceID string      `json:"device_id" binding:"required"`
	Type     string      `json:"type" binding:"required"`
	Data     interface{} `json:"data"`
}

// BroadcastMessageRequest 广播消息请求
type BroadcastMessageRequest struct {
	Type            string      `json:"type" binding:"required"`
	Data            interface{} `json:"data"`
	ExcludeDeviceID string      `json:"exclude_device_id,omitempty"`
}

// RegisterRoutes 注册 WebSocket 相关路由
func (h *Handler) RegisterRoutes(router *gin.RouterGroup) {
	// WebSocket 连接路由
	router.GET("/ws", h.HandleWebSocket)

	// WebSocket 管理路由
	ws := router.Group("/ws")
	{
		ws.GET("/devices/online", h.GetOnlineDevices)
		ws.GET("/stats", h.GetConnectionStats)
		ws.POST("/send", h.SendMessage)
		ws.POST("/broadcast", h.BroadcastMessage)
	}
}