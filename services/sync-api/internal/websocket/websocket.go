package websocket

import (
	"log"
	"time"

	"github.com/gin-gonic/gin"

	"xpaste-sync/internal/middleware"
	"xpaste-sync/internal/services"
)

// WebSocketService WebSocket 服务
type WebSocketService struct {
	Manager  *Manager
	Handler  *Handler
	services *services.Services
}

// NewWebSocketService 创建 WebSocket 服务
func NewWebSocketService(services *services.Services) *WebSocketService {
	manager := NewManager()
	handler := NewHandler(manager, services.User, services.Device)

	return &WebSocketService{
		Manager:  manager,
		Handler:  handler,
		services: services,
	}
}

// Start 启动 WebSocket 服务
func (ws *WebSocketService) Start() {
	log.Println("Starting WebSocket manager...")
	go ws.Manager.Run()
}

// Stop 停止 WebSocket 服务
func (ws *WebSocketService) Stop() {
	log.Println("Stopping WebSocket service...")
	// 这里可以添加清理逻辑
}

// RegisterRoutes 注册 WebSocket 路由
func (ws *WebSocketService) RegisterRoutes(router *gin.RouterGroup) {
	// 应用 WebSocket 中间件
	middleware.SetupWebSocketMiddlewares(router, ws.services.GetDB())

	// 注册路由
	ws.Handler.RegisterRoutes(router)
}

// GetManager 获取 WebSocket 管理器
func (ws *WebSocketService) GetManager() *Manager {
	return ws.Manager
}

// GetHandler 获取 WebSocket 处理器
func (ws *WebSocketService) GetHandler() *Handler {
	return ws.Handler
}

// NotifyClipboardSync 通知剪贴板同步事件
func (ws *WebSocketService) NotifyClipboardSync(userID uint, excludeDeviceID string, event string, data interface{}) {
	var messageType MessageType

	switch event {
	case "new":
		messageType = MessageTypeClipNew
	case "update":
		messageType = MessageTypeClipUpdate
	case "delete":
		messageType = MessageTypeClipDelete
	default:
		messageType = MessageTypeClipSync
	}

	message := Message{
		Type:      messageType,
		Data:      data,
		Timestamp: time.Now().Unix(),
	}

	if excludeDeviceID != "" {
		ws.Manager.SendToUserExceptDevice(userID, excludeDeviceID, message)
	} else {
		ws.Manager.SendToUser(userID, message)
	}
}

// NotifyDeviceEvent 通知设备事件
func (ws *WebSocketService) NotifyDeviceEvent(userID uint, event string, data interface{}) {
	var messageType MessageType

	switch event {
	case "online":
		messageType = MessageTypeDeviceOnline
	case "offline":
		messageType = MessageTypeDeviceOffline
	case "update":
		messageType = MessageTypeDeviceUpdate
	default:
		return
	}

	message := Message{
		Type:      messageType,
		Data:      data,
		Timestamp: time.Now().Unix(),
	}

	ws.Manager.SendToUser(userID, message)
}

// GetConnectionStats 获取连接统计信息
func (ws *WebSocketService) GetConnectionStats() map[string]interface{} {
	return ws.Manager.GetStats()
}