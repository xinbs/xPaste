package main

import (
	"log"
	"net/http"

	"admin-api/internal/routes"
	"admin-api/shared/database"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// CorsMiddleware CORS中间件 (已弃用，使用官方中间件)
func CorsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		method := c.Request.Method
		origin := c.Request.Header.Get("Origin")
		if origin != "" {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE, UPDATE")
			c.Header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization")
			c.Header("Access-Control-Expose-Headers", "Content-Length, Access-Control-Allow-Origin, Access-Control-Allow-Headers, Cache-Control, Content-Language, Content-Type")
			c.Header("Access-Control-Allow-Credentials", "true")
		} else {
			c.Header("Access-Control-Allow-Origin", "*")
			c.Header("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE, UPDATE")
			c.Header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization")
		}
		
		if method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func main() {
	// 初始化数据库
	if err := database.InitDatabase(); err != nil {
		log.Fatal("Failed to initialize database:", err)
	}

	// 设置Gin模式
	gin.SetMode(gin.DebugMode)

	// 创建路由
	router := gin.New()
	
	// 允许所有代理 - 必须在任何可能访问 ClientIP 的操作之前
	// 注意：Gin v1.8+ 中 SetTrustedProxies(nil) 表示不信任任何代理，
	// 如果应用程序运行在代理后面（如 Docker），这可能导致问题。
	// 我们显式信任 Docker 内部网络范围
	router.SetTrustedProxies([]string{"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.1"})
	
	// 使用官方 CORS 中间件，配置最宽松的策略
	config := cors.DefaultConfig()
	config.AllowAllOrigins = true
	config.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
	config.AllowHeaders = []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With"}
	config.AllowCredentials = true
	config.ExposeHeaders = []string{"Content-Length"}
	
	// 关键：使用 cors.New(config) 创建中间件并注册
	router.Use(cors.New(config))
	
	// CORS 中间件必须是第一个
	// router.Use(CorsMiddleware())
	
	router.Use(gin.Logger())
	router.Use(gin.Recovery())
	
	// 解决 403 Forbidden 问题：手动处理 OPTIONS 请求
	// 确保这个在 CORS 中间件之后，或者作为特定路由处理
	// router.OPTIONS("/*path", func(c *gin.Context) {
	// 	// 再次强制设置 CORS 头，双重保险
	// 	origin := c.Request.Header.Get("Origin")
	// 	if origin != "" {
	// 		c.Header("Access-Control-Allow-Origin", origin)
	// 		c.Header("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE, UPDATE")
	// 		c.Header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization")
	// 		c.Header("Access-Control-Expose-Headers", "Content-Length, Access-Control-Allow-Origin, Access-Control-Allow-Headers, Cache-Control, Content-Language, Content-Type")
	// 		c.Header("Access-Control-Allow-Credentials", "true")
	// 	}
	// 	c.AbortWithStatus(204)
	// })

	// 设置路由
	routes.SetupRoutes(router)

	// 启动服务器
	port := ":8081"
	log.Printf("Admin API server starting on port %s", port)
	if err := router.Run(port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}