package middleware

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"xpaste-sync/internal/models"
)

// RateLimiter 限流器接口
type RateLimiter interface {
	Allow(key string) bool
	Reset(key string)
}

// TokenBucket 令牌桶限流器
type TokenBucket struct {
	capacity int           // 桶容量
	refillRate int         // 每秒补充令牌数
	buckets map[string]*bucket
	mu      sync.RWMutex
	cleanup time.Duration  // 清理间隔
}

type bucket struct {
	tokens   int
	lastRefill time.Time
	mu       sync.Mutex
}

// NewTokenBucket 创建令牌桶限流器
func NewTokenBucket(capacity, refillRate int, cleanup time.Duration) *TokenBucket {
	tb := &TokenBucket{
		capacity:   capacity,
		refillRate: refillRate,
		buckets:    make(map[string]*bucket),
		cleanup:    cleanup,
	}

	// 启动清理协程
	go tb.cleanupRoutine()

	return tb
}

// Allow 检查是否允许请求
func (tb *TokenBucket) Allow(key string) bool {
	tb.mu.RLock()
	b, exists := tb.buckets[key]
	tb.mu.RUnlock()

	if !exists {
		tb.mu.Lock()
		// 双重检查
		if b, exists = tb.buckets[key]; !exists {
			b = &bucket{
				tokens:     tb.capacity,
				lastRefill: time.Now(),
			}
			tb.buckets[key] = b
		}
		tb.mu.Unlock()
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	// 补充令牌
	now := time.Now()
	elapsed := now.Sub(b.lastRefill)
	tokensToAdd := int(elapsed.Seconds()) * tb.refillRate
	if tokensToAdd > 0 {
		b.tokens += tokensToAdd
		if b.tokens > tb.capacity {
			b.tokens = tb.capacity
		}
		b.lastRefill = now
	}

	// 检查是否有可用令牌
	if b.tokens > 0 {
		b.tokens--
		return true
	}

	return false
}

// Reset 重置指定键的限流状态
func (tb *TokenBucket) Reset(key string) {
	tb.mu.Lock()
	defer tb.mu.Unlock()
	delete(tb.buckets, key)
}

// cleanupRoutine 清理过期的桶
func (tb *TokenBucket) cleanupRoutine() {
	ticker := time.NewTicker(tb.cleanup)
	defer ticker.Stop()

	for range ticker.C {
		tb.mu.Lock()
		now := time.Now()
		for key, b := range tb.buckets {
			b.mu.Lock()
			// 如果桶超过1小时没有使用，则删除
			if now.Sub(b.lastRefill) > time.Hour {
				delete(tb.buckets, key)
			}
			b.mu.Unlock()
		}
		tb.mu.Unlock()
	}
}

// RateLimitConfig 限流配置
type RateLimitConfig struct {
	Capacity   int           // 桶容量
	RefillRate int           // 每秒补充令牌数
	KeyFunc    func(*gin.Context) string // 获取限流键的函数
	SkipFunc   func(*gin.Context) bool   // 跳过限流的函数
	Message    string        // 限流时返回的消息
}

// DefaultRateLimitConfig 默认限流配置
func DefaultRateLimitConfig() *RateLimitConfig {
	return &RateLimitConfig{
		Capacity:   100,  // 100个令牌
		RefillRate: 10,   // 每秒补充10个令牌
		KeyFunc:    IPKeyFunc,
		SkipFunc:   nil,
		Message:    "Too many requests",
	}
}

// IPKeyFunc 基于IP的键函数
func IPKeyFunc(c *gin.Context) string {
	return c.ClientIP()
}



// UserKeyFunc 基于用户ID的键函数
func UserKeyFunc(c *gin.Context) string {
	userID, exists := GetUserIDFromContext(c)
	if !exists {
		return c.ClientIP() // 如果没有用户信息，回退到IP
	}
	return fmt.Sprintf("user:%d", userID)
}

// UserIPKeyFunc 基于用户ID和IP的键函数
func UserIPKeyFunc(c *gin.Context) string {
	userID, exists := GetUserIDFromContext(c)
	if !exists {
		return c.ClientIP()
	}
	return fmt.Sprintf("user:%d:ip:%s", userID, c.ClientIP())
}

// RateLimitMiddleware 限流中间件
func RateLimitMiddleware(limiter RateLimiter, config *RateLimitConfig) gin.HandlerFunc {
	if config == nil {
		config = DefaultRateLimitConfig()
	}

	return func(c *gin.Context) {
		// 检查是否跳过限流
		if config.SkipFunc != nil && config.SkipFunc(c) {
			c.Next()
			return
		}

		// 获取限流键
		key := config.KeyFunc(c)

		// 检查是否允许请求
		if !limiter.Allow(key) {
			c.JSON(http.StatusTooManyRequests, models.ErrorResponse(config.Message))
			c.Abort()
			return
		}

		c.Next()
	}
}

// CreateRateLimitMiddleware 创建限流中间件
func CreateRateLimitMiddleware(capacity, refillRate int, keyFunc func(*gin.Context) string) gin.HandlerFunc {
	limiter := NewTokenBucket(capacity, refillRate, 5*time.Minute)
	config := &RateLimitConfig{
		Capacity:   capacity,
		RefillRate: refillRate,
		KeyFunc:    keyFunc,
		Message:    "Too many requests, please try again later",
	}
	return RateLimitMiddleware(limiter, config)
}

// 预定义的限流中间件

// GlobalRateLimitMiddleware 全局限流中间件（基于IP）
func GlobalRateLimitMiddleware() gin.HandlerFunc {
	return CreateRateLimitMiddleware(1000, 100, IPKeyFunc) // 1000个令牌，每秒补充100个
}

// AuthRateLimitMiddleware 认证接口限流中间件
func AuthRateLimitMiddleware() gin.HandlerFunc {
	return CreateRateLimitMiddleware(10, 1, IPKeyFunc) // 10个令牌，每秒补充1个
}

// APIRateLimitMiddleware API接口限流中间件（基于用户）
func APIRateLimitMiddleware() gin.HandlerFunc {
	return CreateRateLimitMiddleware(200, 20, UserKeyFunc) // 200个令牌，每秒补充20个
}

// UploadRateLimitMiddleware 上传接口限流中间件
func UploadRateLimitMiddleware() gin.HandlerFunc {
	return CreateRateLimitMiddleware(50, 5, UserIPKeyFunc) // 50个令牌，每秒补充5个
}

// WebSocketRateLimitMiddleware WebSocket连接限流中间件
func WebSocketRateLimitMiddleware() gin.HandlerFunc {
	return CreateRateLimitMiddleware(5, 1, func(c *gin.Context) string {
		// WebSocket连接限流，每个IP最多5个连接
		return fmt.Sprintf("ws:%s", c.ClientIP())
	})
}