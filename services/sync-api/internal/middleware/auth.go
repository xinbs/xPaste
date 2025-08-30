package middleware

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"

	"xpaste-sync/internal/models"
)

// JWT 密钥，实际使用时应该从环境变量或配置文件读取
var jwtSecret = []byte("xpaste-secret-key-change-in-production")

// JWT Claims
type Claims struct {
	UserID   uint   `json:"user_id"`
	Username string `json:"username"`
	DeviceID string `json:"device_id,omitempty"`
	jwt.RegisteredClaims
}

// AuthMiddleware 认证中间件
func AuthMiddleware(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 从 Header 中获取 Authorization
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse("Missing authorization header"))
			c.Abort()
			return
		}

		// 检查 Bearer 前缀
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse("Invalid authorization header format"))
			c.Abort()
			return
		}

		// 解析 JWT 令牌
		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			// 验证签名方法
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return jwtSecret, nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse("Invalid token"))
			c.Abort()
			return
		}

		// 检查令牌是否过期
		if claims.ExpiresAt != nil && claims.ExpiresAt.Time.Before(time.Now()) {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse("Token expired"))
			c.Abort()
			return
		}

		// 验证用户是否存在且状态正常
		var user models.User
		if err := db.First(&user, claims.UserID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusUnauthorized, models.ErrorResponse("User not found"))
			} else {
				c.JSON(http.StatusInternalServerError, models.ErrorResponse("Database error"))
			}
			c.Abort()
			return
		}

		// 检查用户状态
		if !user.IsActive() {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse("User account is inactive"))
			c.Abort()
			return
		}

		// 将用户信息存储到上下文中
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("user", &user)
		if claims.DeviceID != "" {
			c.Set("device_id", claims.DeviceID)
		}

		c.Next()
	}
}

// OptionalAuthMiddleware 可选认证中间件（不强制要求认证）
func OptionalAuthMiddleware(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 首先尝试从 Authorization 头获取 token
		authHeader := c.GetHeader("Authorization")
		var tokenString string
		
		if authHeader != "" {
			tokenString = strings.TrimPrefix(authHeader, "Bearer ")
			if tokenString == authHeader {
				tokenString = ""
			}
		}
		
		// 如果 Authorization 头中没有 token，尝试从 URL 参数获取（用于 WebSocket）
		if tokenString == "" {
			tokenString = c.Query("token")
		}
		
		// 如果没有找到 token，直接继续
		if tokenString == "" {
			c.Next()
			return
		}

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return jwtSecret, nil
		})

		if err == nil && token.Valid && claims.ExpiresAt != nil && claims.ExpiresAt.Time.After(time.Now()) {
			var user models.User
			if err := db.First(&user, claims.UserID).Error; err == nil && user.IsActive() {
				c.Set("user_id", claims.UserID)
				c.Set("username", claims.Username)
				c.Set("user", &user)
				if claims.DeviceID != "" {
					c.Set("device_id", claims.DeviceID)
				}
			}
		}

		c.Next()
	}
}

// GenerateToken 生成 JWT 令牌
func GenerateToken(userID uint, username string, deviceID string) (string, error) {
	expirationTime := time.Now().Add(24 * time.Hour) // 24小时过期

	claims := &Claims{
		UserID:   userID,
		Username: username,
		DeviceID: deviceID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "xpaste-sync-api",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

// GenerateRefreshToken 生成刷新令牌
func GenerateRefreshToken(userID uint, username string) (string, error) {
	expirationTime := time.Now().Add(7 * 24 * time.Hour) // 7天过期

	claims := &Claims{
		UserID:   userID,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "xpaste-sync-api-refresh",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

// ValidateRefreshToken 验证刷新令牌
func ValidateRefreshToken(tokenString string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return jwtSecret, nil
	})

	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid refresh token")
	}

	// 检查是否是刷新令牌
	if claims.Issuer != "xpaste-sync-api-refresh" {
		return nil, fmt.Errorf("not a refresh token")
	}

	// 检查是否过期
	if claims.ExpiresAt != nil && claims.ExpiresAt.Time.Before(time.Now()) {
		return nil, fmt.Errorf("refresh token expired")
	}

	return claims, nil
}

// GetUserFromContext 从上下文中获取用户信息
func GetUserFromContext(c *gin.Context) (*models.User, bool) {
	user, exists := c.Get("user")
	if !exists {
		return nil, false
	}
	return user.(*models.User), true
}

// GetUserIDFromContext 从上下文中获取用户ID
func GetUserIDFromContext(c *gin.Context) (uint, bool) {
	userID, exists := c.Get("user_id")
	if !exists {
		return 0, false
	}
	return userID.(uint), true
}

// GetDeviceIDFromContext 从上下文中获取设备ID
func GetDeviceIDFromContext(c *gin.Context) (string, bool) {
	deviceID, exists := c.Get("device_id")
	if !exists {
		return "", false
	}
	return deviceID.(string), true
}