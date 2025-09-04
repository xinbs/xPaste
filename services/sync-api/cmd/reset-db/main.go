package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"xpaste-sync/internal/config"
	"xpaste-sync/internal/database"
	"xpaste-sync/internal/logger"
)

func main() {
	var (
		force = flag.Bool("force", false, "强制重置数据库，不询问确认")
		check = flag.Bool("check", false, "仅检查数据库健康状态")
	)
	flag.Parse()

	// 加载配置
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// 初始化日志系统
	if err := logger.Initialize(cfg); err != nil {
		log.Fatalf("Failed to initialize logger: %v", err)
	}

	// 初始化数据库连接
	if err := database.Initialize(cfg); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	if *check {
		// 仅检查数据库健康状态
		checkDatabaseHealth()
		return
	}

	// 重置数据库
	resetDatabase(*force)
}

func checkDatabaseHealth() {
	fmt.Println("🔍 检查数据库健康状态...")

	if err := database.CheckDatabaseHealth(); err != nil {
		fmt.Printf("❌ 数据库健康检查失败: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✅ 数据库健康状态良好")
}

func resetDatabase(force bool) {
	fmt.Println("🗃️  数据库重置工具")
	fmt.Println("================")

	if !force {
		fmt.Println("⚠️  警告: 此操作将删除所有数据库表和数据！")
		fmt.Print("确认要继续吗？(输入 'yes' 确认): ")

		var confirmation string
		fmt.Scanln(&confirmation)

		if confirmation != "yes" {
			fmt.Println("操作已取消")
			return
		}
	}

	fmt.Println("🔄 开始重置数据库...")

	// 执行数据库重置
	if err := database.ResetDatabase(); err != nil {
		fmt.Printf("❌ 数据库重置失败: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✅ 数据库重置完成！")
	fmt.Println("")
	fmt.Println("📊 重置结果:")
	fmt.Println("  - 所有表已重新创建")
	fmt.Println("  - 索引已重新建立")
	fmt.Println("  - 系统设置已初始化")
	fmt.Println("")
	fmt.Println("🎉 数据库现在可以正常使用了！")
}
