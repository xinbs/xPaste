package main

import (
	"log"
	"os"

	"admin-api/internal/routes"
	"admin-api/shared/database"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// 加载环境变量
	if err := godotenv.Load(); err != nil {
		log.Println("Warning: .env file not found")
	}

	// 初始化数据库
	if err := database.InitDatabase(); err != nil {
		log.Fatal("Failed to initialize database:", err)
	}

	// 设置Gin模式
	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.DebugMode)
	}

    r := gin.Default()
    r.SetTrustedProxies([]string{"0.0.0.0/0", "::/0"})

    config := cors.DefaultConfig()
    if os.Getenv("CORS_ALLOW_ALL") == "true" {
        config.AllowAllOrigins = true
    } else {
        config.AllowOrigins = []string{"http://localhost:3000", "http://localhost:3001", "http://localhost:3010", "http://localhost:5173"}
    }
    config.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
    config.AllowHeaders = []string{"Origin", "Content-Type", "content-type", "Accept", "Authorization", "X-Requested-With", "X-CSRF-Token", "Sec-Fetch-Mode", "Sec-Fetch-Site", "Sec-Fetch-Dest"}
    config.ExposeHeaders = []string{"Content-Length"}
    config.AllowCredentials = true
    r.Use(cors.New(config))

	// 设置路由
	routes.SetupRoutes(r)

	// 获取端口
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	log.Printf("Admin API server starting on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
