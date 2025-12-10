package middleware

import (
	"net/http"
	"strings"
    "log"

	"admin-api/shared/utils"
	"github.com/gin-gonic/gin"
)

// AuthMiddleware JWT认证中间件
func AuthMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        authHeader := c.GetHeader("Authorization")
        var token string
        var source string
        if strings.TrimSpace(authHeader) != "" {
            parts := strings.SplitN(authHeader, " ", 2)
            if len(parts) == 2 && parts[0] == "Bearer" {
                token = parts[1]
                source = "header"
            }
        }
        if token == "" {
            q := strings.TrimSpace(c.Query("token"))
            if q != "" {
                token = q
                source = "query"
            }
        }
        if token == "" {
            if ck, err := c.Cookie("admin_token"); err == nil && strings.TrimSpace(ck) != "" {
                token = ck
                source = "cookie"
            }
        }
        if token == "" {
            log.Printf("auth: missing token path=%s", c.Request.URL.Path)
            c.JSON(http.StatusUnauthorized, gin.H{
                "error": "缺少认证令牌",
            })
            c.Abort()
            return
        }

        log.Printf("auth: token source=%s len=%d path=%s", source, len(token), c.Request.URL.Path)
        claims, err := utils.ParseToken(token)
        if err != nil {
            log.Printf("auth: invalid token source=%s path=%s", source, c.Request.URL.Path)
            c.JSON(http.StatusUnauthorized, gin.H{
                "error": "无效的认证令牌",
            })
            c.Abort()
            return
        }

		// 将用户信息存储到上下文中
		c.Set("user_id", claims.AdminID)
		c.Set("username", claims.Username)
		c.Set("role", claims.Role)

		c.Next()
	}
}

// AdminMiddleware 管理员权限中间件
func AdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("role")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "未认证",
			})
			c.Abort()
			return
		}

		// 检查是否为管理员
		if role != "admin" && role != "super_admin" {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "权限不足",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// SuperAdminMiddleware 超级管理员权限中间件
func SuperAdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("role")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "未认证",
			})
			c.Abort()
			return
		}

		// 检查是否为超级管理员
		if role != "super_admin" {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "需要超级管理员权限",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// RequireSuperAdmin 超级管理员权限中间件
func RequireSuperAdmin() gin.HandlerFunc {
	return SuperAdminMiddleware()
}

// RequireAdmin 管理员权限中间件（包括超级管理员）
func RequireAdmin() gin.HandlerFunc {
	return AdminMiddleware()
}
