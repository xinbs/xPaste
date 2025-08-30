package handlers

import (
	"github.com/gin-gonic/gin"

	"xpaste-sync/internal/middleware"
	"xpaste-sync/internal/services"
)

// Handlers 处理器集合
type Handlers struct {
	AuthHandler    *AuthHandler
	DeviceHandler  *DeviceHandler
	ClipHandler    *ClipHandler
	SettingHandler *SettingHandler
}

// NewHandlers 创建处理器集合
func NewHandlers(services *services.Services) *Handlers {
	return &Handlers{
		AuthHandler:    NewAuthHandler(services.User, services.GetDB()),
		DeviceHandler:  NewDeviceHandler(services.Device, services.GetDB()),
		ClipHandler:    NewClipHandler(services.Clip, services.GetDB()),
		SettingHandler: NewSettingHandler(services.Setting),
	}
}

// RegisterRoutes 注册所有路由
func (h *Handlers) RegisterRoutes(router *gin.Engine) {
	// 设置全局中间件
	middleware.SetupMiddlewares(router, h.AuthHandler.db)

	// API 路由组（不包含认证中间件）
	api := router.Group("/api/v1")
	{
		// 注册认证路由（包含公开和需要认证的路由）
		h.AuthHandler.RegisterRoutes(api)

		// 需要认证的路由组
		authenticated := api.Group("")
		authenticated.Use(middleware.AuthMiddleware(h.AuthHandler.db))
		{
			// 注册需要认证的模块路由
			h.DeviceHandler.RegisterRoutes(authenticated)
			h.ClipHandler.RegisterRoutes(authenticated)
			h.SettingHandler.RegisterRoutes(authenticated)
		}
	}

	// 健康检查路由
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "ok",
			"service": "xPaste Sync API",
			"version": "1.0.0",
		})
	})

	// 根路径重定向到健康检查
	router.GET("/", func(c *gin.Context) {
		c.Redirect(302, "/health")
	})
}

// SetupRoutes 设置路由（兼容性函数）
func SetupRoutes(router *gin.Engine, services *services.Services) {
	handlers := NewHandlers(services)
	handlers.RegisterRoutes(router)
}