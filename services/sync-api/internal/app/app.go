package app

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"xpaste-sync/internal/config"
	"xpaste-sync/internal/database"
	"xpaste-sync/internal/handlers"
	"xpaste-sync/internal/logger"
	"xpaste-sync/internal/middleware"
	"xpaste-sync/internal/services"
	"xpaste-sync/internal/websocket"
)

// App 应用程序结构
type App struct {
	config    *config.Config
	server    *http.Server
	services  *services.Services
	handlers  *handlers.Handlers
	websocket *websocket.WebSocketService
}

// New 创建新的应用程序实例
func New() (*App, error) {
	// 加载配置
	cfg, err := config.Load()
	if err != nil {
		return nil, fmt.Errorf("failed to load config: %w", err)
	}

	// 初始化日志系统
	if err := logger.Initialize(cfg); err != nil {
		return nil, fmt.Errorf("failed to initialize logger: %w", err)
	}

	// 初始化数据库
	if err := database.Initialize(cfg); err != nil {
		return nil, fmt.Errorf("failed to initialize database: %w", err)
	}

	// 执行数据库迁移
	if err := database.Migrate(); err != nil {
		return nil, fmt.Errorf("failed to migrate database: %w", err)
	}

	// 初始化种子数据
	if err := database.SeedData(); err != nil {
		return nil, fmt.Errorf("failed to seed database: %w", err)
	}

	// 初始化服务层
	services := services.NewServices(database.GetDB())
	if err := services.InitializeServices(); err != nil {
		return nil, fmt.Errorf("failed to initialize services: %w", err)
	}

	// 初始化 WebSocket 服务
	websocketService := websocket.NewWebSocketService(services)

	// 初始化处理器
	handlers := handlers.NewHandlers(services)

	// 设置 Gin 模式
	gin.SetMode(cfg.Server.Mode)

	// 创建 Gin 引擎
	router := gin.New()

	// 添加全局中间件
	router.Use(logger.GinLogger())
	router.Use(logger.GinRecovery())
	router.Use(middleware.CORSMiddleware())
	router.Use(middleware.RequestIDMiddleware())
	router.Use(middleware.SecurityHeadersMiddleware())

	// 注册路由
	handlers.RegisterRoutes(router)
	websocketService.RegisterRoutes(router.Group("/ws"))

	// 创建 HTTP 服务器
	server := &http.Server{
		Addr:         cfg.GetAddr(),
		Handler:      router,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
		IdleTimeout:  cfg.Server.IdleTimeout,
	}

	return &App{
		config:    cfg,
		server:    server,
		services:  services,
		handlers:  handlers,
		websocket: websocketService,
	}, nil
}

// Run 启动应用程序
func (a *App) Run() error {
	// 启动 WebSocket 服务
	a.websocket.Start()

	// 启动 HTTP 服务器
	go func() {
		logger.Infof("Starting server on %s", a.config.GetAddr())
		if err := a.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatalf("Failed to start server: %v", err)
		}
	}()

	// 等待中断信号
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	// 优雅关闭
	return a.Shutdown()
}

// Shutdown 优雅关闭应用程序
func (a *App) Shutdown() error {
	// 创建关闭上下文，设置超时时间
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 停止 WebSocket 服务
	a.websocket.Stop()

	// 关闭 HTTP 服务器
	if err := a.server.Shutdown(ctx); err != nil {
		logger.Errorf("Server forced to shutdown: %v", err)
		return err
	}

	// 关闭数据库连接
	if err := database.Close(); err != nil {
		logger.Errorf("Failed to close database: %v", err)
		return err
	}

	logger.Info("Server exited")
	return nil
}

// GetConfig 获取配置
func (a *App) GetConfig() *config.Config {
	return a.config
}

// GetServices 获取服务层
func (a *App) GetServices() *services.Services {
	return a.services
}

// GetHandlers 获取处理器
func (a *App) GetHandlers() *handlers.Handlers {
	return a.handlers
}

// GetWebSocketService 获取 WebSocket 服务
func (a *App) GetWebSocketService() *websocket.WebSocketService {
	return a.websocket
}

// HealthCheck 健康检查
func (a *App) HealthCheck() map[string]interface{} {
	status := map[string]interface{}{
		"status":    "ok",
		"timestamp": time.Now().UTC(),
		"version":   "1.0.0",
		"services":  make(map[string]interface{}),
	}

	// 检查数据库健康状态
	if database.IsHealthy() {
		status["services"].(map[string]interface{})["database"] = "ok"
	} else {
		status["services"].(map[string]interface{})["database"] = "error"
		status["status"] = "degraded"
	}

	// 检查 WebSocket 服务状态
	if a.websocket != nil {
		status["services"].(map[string]interface{})["websocket"] = "ok"
		status["websocket_connections"] = a.websocket.GetConnectionStats()
	} else {
		status["services"].(map[string]interface{})["websocket"] = "error"
		status["status"] = "degraded"
	}

	return status
}

// GetMetrics 获取应用程序指标
func (a *App) GetMetrics() map[string]interface{} {
	metrics := map[string]interface{}{
		"timestamp": time.Now().UTC(),
		"uptime":    time.Since(time.Now()).String(), // 这里应该记录启动时间
	}

	// 获取 WebSocket 连接统计
	if a.websocket != nil {
		metrics["websocket"] = a.websocket.GetConnectionStats()
	}

	// 这里可以添加更多指标，如：
	// - 内存使用情况
	// - CPU 使用情况
	// - 请求统计
	// - 数据库连接池状态

	return metrics
}