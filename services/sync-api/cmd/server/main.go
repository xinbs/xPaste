package main

import (
	"log"

	"xpaste-sync/internal/app"
)

func main() {
	// 创建应用程序实例
	app, err := app.New()
	if err != nil {
		log.Fatalf("Failed to create application: %v", err)
	}

	// 启动应用程序
	if err := app.Run(); err != nil {
		log.Fatalf("Failed to run application: %v", err)
	}
}