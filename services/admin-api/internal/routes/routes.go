package routes

import (
	"admin-api/internal/controllers"
	"admin-api/internal/middleware"
	"github.com/gin-gonic/gin"
)

// SetupRoutes 设置路由
func SetupRoutes(r *gin.Engine) {
	// 创建控制器实例
	adminController := controllers.NewAdminController()
	userController := controllers.NewUserController()
	deviceController := controllers.NewDeviceController()
	clipboardController := controllers.NewClipboardController()

	// API版本分组
	v1 := r.Group("/api/v1")
	{
		// 公开路由（不需要认证）
		public := v1.Group("/auth")
		{
			public.POST("/login", adminController.Login)
		}

		// 需要认证的路由
		protected := v1.Group("/")
		protected.Use(middleware.AuthMiddleware())
		{
			// 管理员个人信息
			protected.GET("/profile", adminController.GetProfile)
			protected.POST("/change-password", adminController.ChangePassword)
			
			// 仪表盘统计数据
			protected.GET("/stats", adminController.GetStats)

			// 用户管理路由
			users := protected.Group("/users")
			{
				users.GET("/", userController.GetAllUsers)
				users.GET("/:id", userController.GetUserByID)
				users.POST("/", userController.CreateUser)
				users.PUT("/:id", userController.UpdateUser)
				users.DELETE("/:id", userController.DeleteUser)
			}

			// 设备管理路由
			devices := protected.Group("/devices")
			{
				devices.GET("/", deviceController.GetAllDevices)
				devices.GET("/:id", deviceController.GetDeviceByID)
				devices.POST("/:id/disconnect", deviceController.DisconnectDevice)
				devices.DELETE("/:id", deviceController.DeleteDevice)
				devices.POST("/batch-delete", deviceController.BatchDeleteDevices)
			}

			// 剪贴板管理路由
			clipboard := protected.Group("/clipboard")
			{
				clipboard.GET("/", clipboardController.GetAllClipboards)
				clipboard.GET("/:id", clipboardController.GetClipboardByID)
				clipboard.DELETE("/:id", clipboardController.DeleteClipboard)
				clipboard.POST("/batch-delete", clipboardController.BatchDeleteClipboards)
				clipboard.POST("/:id/restore", clipboardController.RestoreClipboard)
				clipboard.POST("/clear-all", clipboardController.ClearAllClipboards)
				clipboard.GET("/stats", clipboardController.GetClipboardStats)
			}

			// 管理员管理路由（需要管理员权限）
			admins := protected.Group("/admins")
			admins.Use(middleware.AdminMiddleware())
			{
				admins.GET("/", adminController.GetAllAdmins)
				admins.GET("/:id", adminController.GetAdminByID)
				admins.POST("/", adminController.CreateAdmin)
				admins.PUT("/:id", adminController.UpdateAdmin)
				admins.DELETE("/:id", adminController.DeleteAdmin)
			}
		}
	}

	// 健康检查
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status": "ok",
			"service": "admin-api",
		})
	})
}