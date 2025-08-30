package logger

import (
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
	"gopkg.in/natefinch/lumberjack.v2"

	"xpaste-sync/internal/config"
)

// Logger 全局日志实例
var Logger *logrus.Logger

// Initialize 初始化日志系统
func Initialize(cfg *config.Config) error {
	Logger = logrus.New()

	// 设置日志级别
	level, err := logrus.ParseLevel(cfg.Log.Level)
	if err != nil {
		level = logrus.InfoLevel
	}
	Logger.SetLevel(level)

	// 设置日志格式
	switch cfg.Log.Format {
	case "json":
		Logger.SetFormatter(&logrus.JSONFormatter{
			TimestampFormat: time.RFC3339,
		})
	case "text":
		Logger.SetFormatter(&logrus.TextFormatter{
			FullTimestamp:   true,
			TimestampFormat: time.RFC3339,
		})
	default:
		Logger.SetFormatter(&logrus.JSONFormatter{
			TimestampFormat: time.RFC3339,
		})
	}

	// 设置输出目标
	var output io.Writer
	switch cfg.Log.Output {
	case "stdout":
		output = os.Stdout
	case "stderr":
		output = os.Stderr
	case "file":
		// 确保日志目录存在
		logDir := filepath.Dir(cfg.Log.FilePath)
		if err := os.MkdirAll(logDir, 0755); err != nil {
			return err
		}

		// 使用 lumberjack 进行日志轮转
		output = &lumberjack.Logger{
			Filename:   cfg.Log.FilePath,
			MaxSize:    cfg.Log.MaxSize,
			MaxBackups: cfg.Log.MaxBackups,
			MaxAge:     cfg.Log.MaxAge,
			Compress:   cfg.Log.Compress,
		}
	default:
		output = os.Stdout
	}

	Logger.SetOutput(output)

	// 在开发模式下同时输出到控制台
	if cfg.IsDevelopment() && cfg.Log.Output == "file" {
		Logger.SetOutput(io.MultiWriter(output, os.Stdout))
	}

	Logger.Info("Logger initialized successfully")
	return nil
}

// GetLogger 获取日志实例
func GetLogger() *logrus.Logger {
	return Logger
}

// WithFields 创建带字段的日志条目
func WithFields(fields logrus.Fields) *logrus.Entry {
	return Logger.WithFields(fields)
}

// WithField 创建带单个字段的日志条目
func WithField(key string, value interface{}) *logrus.Entry {
	return Logger.WithField(key, value)
}

// WithError 创建带错误的日志条目
func WithError(err error) *logrus.Entry {
	return Logger.WithError(err)
}

// Debug 记录调试日志
func Debug(args ...interface{}) {
	Logger.Debug(args...)
}

// Debugf 记录格式化调试日志
func Debugf(format string, args ...interface{}) {
	Logger.Debugf(format, args...)
}

// Info 记录信息日志
func Info(args ...interface{}) {
	Logger.Info(args...)
}

// Infof 记录格式化信息日志
func Infof(format string, args ...interface{}) {
	Logger.Infof(format, args...)
}

// Warn 记录警告日志
func Warn(args ...interface{}) {
	Logger.Warn(args...)
}

// Warnf 记录格式化警告日志
func Warnf(format string, args ...interface{}) {
	Logger.Warnf(format, args...)
}

// Error 记录错误日志
func Error(args ...interface{}) {
	Logger.Error(args...)
}

// Errorf 记录格式化错误日志
func Errorf(format string, args ...interface{}) {
	Logger.Errorf(format, args...)
}

// Fatal 记录致命错误日志并退出程序
func Fatal(args ...interface{}) {
	Logger.Fatal(args...)
}

// Fatalf 记录格式化致命错误日志并退出程序
func Fatalf(format string, args ...interface{}) {
	Logger.Fatalf(format, args...)
}

// Panic 记录恐慌日志并触发 panic
func Panic(args ...interface{}) {
	Logger.Panic(args...)
}

// Panicf 记录格式化恐慌日志并触发 panic
func Panicf(format string, args ...interface{}) {
	Logger.Panicf(format, args...)
}

// GinLogger 返回 Gin 框架的日志中间件
func GinLogger() gin.HandlerFunc {
	return gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
		// 使用结构化日志记录请求信息
		fields := logrus.Fields{
			"timestamp":   param.TimeStamp.Format(time.RFC3339),
			"status":      param.StatusCode,
			"latency":     param.Latency,
			"client_ip":   param.ClientIP,
			"method":      param.Method,
			"path":        param.Path,
			"user_agent":  param.Request.UserAgent(),
			"body_size":   param.BodySize,
		}

		if param.ErrorMessage != "" {
			fields["error"] = param.ErrorMessage
		}

		// 根据状态码选择日志级别
		entry := Logger.WithFields(fields)
		if param.StatusCode >= 500 {
			entry.Error("HTTP request completed with server error")
		} else if param.StatusCode >= 400 {
			entry.Warn("HTTP request completed with client error")
		} else {
			entry.Info("HTTP request completed")
		}

		return ""
	})
}

// GinRecovery 返回 Gin 框架的恢复中间件
func GinRecovery() gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, recovered interface{}) {
		fields := logrus.Fields{
			"panic":     recovered,
			"method":    c.Request.Method,
			"path":      c.Request.URL.Path,
			"client_ip": c.ClientIP(),
		}

		Logger.WithFields(fields).Error("Panic recovered")
		c.AbortWithStatus(500)
	})
}

// RequestLogger 记录请求开始和结束
type RequestLogger struct {
	entry *logrus.Entry
}

// NewRequestLogger 创建请求日志记录器
func NewRequestLogger(userID uint, deviceID string, action string) *RequestLogger {
	fields := logrus.Fields{
		"user_id":   userID,
		"device_id": deviceID,
		"action":    action,
	}

	return &RequestLogger{
		entry: Logger.WithFields(fields),
	}
}

// Start 记录请求开始
func (rl *RequestLogger) Start() {
	rl.entry.Info("Request started")
}

// Success 记录请求成功
func (rl *RequestLogger) Success(message string, fields ...logrus.Fields) {
	entry := rl.entry
	if len(fields) > 0 {
		entry = entry.WithFields(fields[0])
	}
	entry.Info(message)
}

// Error 记录请求错误
func (rl *RequestLogger) Error(err error, message string, fields ...logrus.Fields) {
	entry := rl.entry.WithError(err)
	if len(fields) > 0 {
		entry = entry.WithFields(fields[0])
	}
	entry.Error(message)
}

// Warn 记录请求警告
func (rl *RequestLogger) Warn(message string, fields ...logrus.Fields) {
	entry := rl.entry
	if len(fields) > 0 {
		entry = entry.WithFields(fields[0])
	}
	entry.Warn(message)
}

// DatabaseLogger 数据库操作日志记录器
type DatabaseLogger struct {
	entry *logrus.Entry
}

// NewDatabaseLogger 创建数据库日志记录器
func NewDatabaseLogger(operation string) *DatabaseLogger {
	return &DatabaseLogger{
		entry: Logger.WithField("operation", operation),
	}
}

// Success 记录数据库操作成功
func (dl *DatabaseLogger) Success(message string, fields ...logrus.Fields) {
	entry := dl.entry
	if len(fields) > 0 {
		entry = entry.WithFields(fields[0])
	}
	entry.Debug(message)
}

// Error 记录数据库操作错误
func (dl *DatabaseLogger) Error(err error, message string, fields ...logrus.Fields) {
	entry := dl.entry.WithError(err)
	if len(fields) > 0 {
		entry = entry.WithFields(fields[0])
	}
	entry.Error(message)
}

// WebSocketLogger WebSocket 日志记录器
type WebSocketLogger struct {
	entry *logrus.Entry
}

// NewWebSocketLogger 创建 WebSocket 日志记录器
func NewWebSocketLogger(clientID string, userID uint, deviceID string) *WebSocketLogger {
	fields := logrus.Fields{
		"client_id": clientID,
		"user_id":   userID,
		"device_id": deviceID,
		"component": "websocket",
	}

	return &WebSocketLogger{
		entry: Logger.WithFields(fields),
	}
}

// Connect 记录连接事件
func (wl *WebSocketLogger) Connect() {
	wl.entry.Info("WebSocket client connected")
}

// Disconnect 记录断开连接事件
func (wl *WebSocketLogger) Disconnect(reason string) {
	wl.entry.WithField("reason", reason).Info("WebSocket client disconnected")
}

// Message 记录消息事件
func (wl *WebSocketLogger) Message(messageType string, direction string) {
	wl.entry.WithFields(logrus.Fields{
		"message_type": messageType,
		"direction":    direction, // "in" or "out"
	}).Debug("WebSocket message")
}

// Error 记录 WebSocket 错误
func (wl *WebSocketLogger) Error(err error, message string) {
	wl.entry.WithError(err).Error(message)
}