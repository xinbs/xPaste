package main

import (
	"log"

	"admin-api/internal/routes"
	"admin-api/shared/database"
	"github.com/gin-gonic/gin"
)

func main() {
	// 初始化数据库
	if err := database.InitDatabase(); err != nil {
		log.Fatal("Failed to initialize database:", err)
	}

	// 设置Gin模式
	gin.SetMode(gin.DebugMode)

	// 创建路由
	router := gin.Default()

	// 配置可信代理 - 只信任本地和私有网络
	trustedProxies := []string{
		"127.0.0.1",      // 本地回环
		"::1",            // IPv6本地回环
		"10.0.0.0/8",     // 私有网络A类
		"172.16.0.0/12",  // 私有网络B类
		"192.168.0.0/16", // 私有网络C类
	}
	if err := router.SetTrustedProxies(trustedProxies); err != nil {
		log.Fatal("Failed to set trusted proxies:", err)
	}

	// 添加CORS中间件
	router.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// 设置路由
	routes.SetupRoutes(router)

	// 启动服务器
	port := ":8081"
	log.Printf("Admin API server starting on port %s", port)
	if err := router.Run(port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}