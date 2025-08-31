package middleware

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// SetupMiddlewares 设置所有中间件
func SetupMiddlewares(r *gin.Engine, db *gorm.DB) {
	// 恢复中间件（必须在最前面）
	r.Use(gin.Recovery())

	// CORS 中间件
	r.Use(CORSMiddleware())

	// 日志中间件
	r.Use(LoggerMiddleware())

	// 全局限流中间件
	r.Use(CreateRateLimitMiddleware(1000, 100, IPKeyFunc))
}

// SetupAuthMiddlewares 设置认证相关中间件
func SetupAuthMiddlewares(r *gin.RouterGroup, db *gorm.DB) {
	// 认证限流中间件
	r.Use(CreateRateLimitMiddleware(100, 10, IPKeyFunc))
}

// SetupAPIMiddlewares 设置API相关中间件
func SetupAPIMiddlewares(r *gin.RouterGroup, db *gorm.DB) {
	// 认证中间件
	r.Use(AuthMiddleware(db))

	// API限流中间件
	r.Use(CreateRateLimitMiddleware(500, 50, UserKeyFunc))
}

// SetupUploadMiddlewares 设置上传相关中间件
func SetupUploadMiddlewares(r *gin.RouterGroup, db *gorm.DB) {
	// 认证中间件
	r.Use(AuthMiddleware(db))

	// 上传限流中间件
	r.Use(CreateRateLimitMiddleware(50, 5, UserKeyFunc))
}

// SetupWebSocketMiddlewares 设置WebSocket相关中间件
func SetupWebSocketMiddlewares(r *gin.RouterGroup, db *gorm.DB) {
	// WebSocket连接限流中间件 - 更宽松的限制
	r.Use(CreateRateLimitMiddleware(50, 50, func(c *gin.Context) string {
		// 基于用户ID的限流，如果没有用户信息则使用IP
		userID, exists := GetUserIDFromContext(c)
		if exists {
			return fmt.Sprintf("ws:user:%d", userID)
		}
		return fmt.Sprintf("ws:ip:%s", c.ClientIP())
	}))

	// 可选认证中间件（WebSocket可能需要在连接后进行认证）
	r.Use(OptionalAuthMiddleware(db))
}

// ErrorHandlerMiddleware 错误处理中间件
func ErrorHandlerMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		// 处理错误
		if len(c.Errors) > 0 {
			err := c.Errors.Last()
			switch err.Type {
			case gin.ErrorTypeBind:
				c.JSON(400, gin.H{"error": "Invalid request format", "details": err.Error()})
			case gin.ErrorTypePublic:
				c.JSON(500, gin.H{"error": err.Error()})
			default:
				c.JSON(500, gin.H{"error": "Internal server error"})
			}
		}
	}
}

// RequestIDMiddleware 请求ID中间件
func RequestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 生成请求ID
		requestID := fmt.Sprintf("%d-%s", time.Now().UnixNano(), c.ClientIP())
		c.Header("X-Request-ID", requestID)
		c.Set("request_id", requestID)
		c.Next()
	}
}

// SecurityHeadersMiddleware 安全头中间件
func SecurityHeadersMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 设置安全头
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("Content-Security-Policy", "default-src 'self'")
		c.Next()
	}
}

// TimeoutMiddleware 超时中间件
func TimeoutMiddleware(timeout time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 设置超时
		ctx := c.Request.Context()
		ctx, cancel := context.WithTimeout(ctx, timeout)
		defer cancel()

		c.Request = c.Request.WithContext(ctx)
		c.Next()
	}
}

// CompressionMiddleware 压缩中间件
func CompressionMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 检查是否支持gzip
		if !strings.Contains(c.GetHeader("Accept-Encoding"), "gzip") {
			c.Next()
			return
		}

		// 设置压缩头
		c.Header("Content-Encoding", "gzip")
		c.Header("Vary", "Accept-Encoding")

		c.Next()
	}
}

// HealthCheckMiddleware 健康检查中间件
func HealthCheckMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.URL.Path == "/health" {
			c.JSON(200, gin.H{
				"status": "ok",
				"timestamp": time.Now().Unix(),
				"version": "1.0.0",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}