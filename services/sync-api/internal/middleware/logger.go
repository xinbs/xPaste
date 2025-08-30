package middleware

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

// LoggerConfig 日志配置
type LoggerConfig struct {
	Output    io.Writer
	Formatter LogFormatter
	SkipPaths []string
}

// LogFormatter 日志格式化器
type LogFormatter func(param LogFormatterParams) string

// LogFormatterParams 日志格式化参数
type LogFormatterParams struct {
	Request    *gin.Context
	TimeStamp  time.Time
	Latency    time.Duration
	ClientIP   string
	Method     string
	Path       string
	StatusCode int
	BodySize   int
	UserAgent  string
	ErrorMessage string
	Keys       map[string]interface{}
}

// DefaultLogFormatter 默认日志格式化器
func DefaultLogFormatter(param LogFormatterParams) string {
	var statusColor, methodColor, resetColor string
	if gin.IsDebugging() {
		statusColor = getStatusColor(param.StatusCode)
		methodColor = getMethodColor(param.Method)
		resetColor = "\033[0m"
	}

	if param.Latency > time.Minute {
		param.Latency = param.Latency.Truncate(time.Second)
	}

	return fmt.Sprintf("[GIN] %v |%s %3d %s| %13v | %15s |%s %-7s %s %#v\n%s",
		param.TimeStamp.Format("2006/01/02 - 15:04:05"),
		statusColor, param.StatusCode, resetColor,
		param.Latency,
		param.ClientIP,
		methodColor, param.Method, resetColor,
		param.Path,
		param.ErrorMessage,
	)
}

// JSONLogFormatter JSON格式日志格式化器
func JSONLogFormatter(param LogFormatterParams) string {
	return fmt.Sprintf(`{"time":"%s","status":%d,"latency":"%s","client_ip":"%s","method":"%s","path":"%s","user_agent":"%s","body_size":%d,"error":"%s"}%s`,
		param.TimeStamp.Format(time.RFC3339),
		param.StatusCode,
		param.Latency,
		param.ClientIP,
		param.Method,
		param.Path,
		param.UserAgent,
		param.BodySize,
		param.ErrorMessage,
		"\n",
	)
}

// getStatusColor 获取状态码颜色
func getStatusColor(code int) string {
	switch {
	case code >= 200 && code < 300:
		return "\033[97;42m" // 绿色背景
	case code >= 300 && code < 400:
		return "\033[90;47m" // 白色背景
	case code >= 400 && code < 500:
		return "\033[90;43m" // 黄色背景
	default:
		return "\033[97;41m" // 红色背景
	}
}

// getMethodColor 获取方法颜色
func getMethodColor(method string) string {
	switch method {
	case "GET":
		return "\033[94m" // 蓝色
	case "POST":
		return "\033[92m" // 绿色
	case "PUT":
		return "\033[93m" // 黄色
	case "DELETE":
		return "\033[91m" // 红色
	case "PATCH":
		return "\033[95m" // 紫色
	case "HEAD":
		return "\033[96m" // 青色
	case "OPTIONS":
		return "\033[90m" // 灰色
	default:
		return "\033[97m" // 白色
	}
}

// LoggerMiddleware 日志中间件
func LoggerMiddleware() gin.HandlerFunc {
	return LoggerWithConfig(LoggerConfig{})
}

// LoggerWithConfig 使用配置的日志中间件
func LoggerWithConfig(config LoggerConfig) gin.HandlerFunc {
	formatter := config.Formatter
	if formatter == nil {
		formatter = DefaultLogFormatter
	}

	out := config.Output
	if out == nil {
		out = gin.DefaultWriter
	}

	notlogged := config.SkipPaths

	var skip map[string]struct{}
	if length := len(notlogged); length > 0 {
		skip = make(map[string]struct{}, length)
		for _, path := range notlogged {
			skip[path] = struct{}{}
		}
	}

	return gin.LoggerWithConfig(gin.LoggerConfig{
		Formatter: func(param gin.LogFormatterParams) string {
			// 转换参数格式
			logParam := LogFormatterParams{
				TimeStamp:    param.TimeStamp,
				Latency:      param.Latency,
				ClientIP:     param.ClientIP,
				Method:       param.Method,
				Path:         param.Path,
				StatusCode:   param.StatusCode,
				BodySize:     param.BodySize,
				UserAgent:    param.Request.UserAgent(),
				ErrorMessage: param.ErrorMessage,
				Keys:         param.Keys,
			}
			return formatter(logParam)
		},
		Output:    out,
		SkipPaths: notlogged,
	})
}

// FileLoggerMiddleware 文件日志中间件
func FileLoggerMiddleware(filename string) gin.HandlerFunc {
	// 创建日志文件
	file, err := os.OpenFile(filename, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		log.Printf("Failed to open log file %s: %v", filename, err)
		return gin.Logger()
	}

	return LoggerWithConfig(LoggerConfig{
		Output:    file,
		Formatter: JSONLogFormatter,
	})
}

// RequestResponseLoggerMiddleware 请求响应日志中间件（记录请求体和响应体）
func RequestResponseLoggerMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		raw := c.Request.URL.RawQuery

		// 读取请求体
		var requestBody []byte
		if c.Request.Body != nil {
			requestBody, _ = io.ReadAll(c.Request.Body)
			c.Request.Body = io.NopCloser(bytes.NewBuffer(requestBody))
		}

		// 创建响应写入器
		blw := &bodyLogWriter{body: bytes.NewBufferString(""), ResponseWriter: c.Writer}
		c.Writer = blw

		c.Next()

		// 计算延迟
		latency := time.Since(start)

		// 构建完整路径
		if raw != "" {
			path = path + "?" + raw
		}

		// 获取用户信息
		userID := "anonymous"
		if uid, exists := GetUserIDFromContext(c); exists {
			userID = fmt.Sprintf("%d", uid)
		}

		// 记录详细日志
		log.Printf("[REQUEST] %s %s | User: %s | IP: %s | Status: %d | Latency: %v | Request: %s | Response: %s",
			c.Request.Method,
			path,
			userID,
			c.ClientIP(),
			c.Writer.Status(),
			latency,
			string(requestBody),
			blw.body.String(),
		)
	}
}

// bodyLogWriter 响应体日志写入器
type bodyLogWriter struct {
	gin.ResponseWriter
	body *bytes.Buffer
}

func (w bodyLogWriter) Write(b []byte) (int, error) {
	w.body.Write(b)
	return w.ResponseWriter.Write(b)
}

// AccessLogMiddleware 访问日志中间件
func AccessLogMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		raw := c.Request.URL.RawQuery

		c.Next()

		latency := time.Since(start)
		clientIP := c.ClientIP()
		method := c.Request.Method
		statusCode := c.Writer.Status()
		bodySize := c.Writer.Size()
		_ = c.Request.UserAgent() // 避免未使用变量警告

		if raw != "" {
			path = path + "?" + raw
		}

		// 获取用户信息
		userInfo := "anonymous"
		if uid, exists := GetUserIDFromContext(c); exists {
			userInfo = fmt.Sprintf("user(%d)", uid)
		}

		// 记录访问日志
		log.Printf("[ACCESS] %s | %s | %s %s | %d | %v | %d bytes | %s",
			time.Now().Format("2006-01-02 15:04:05"),
			clientIP,
			method,
			path,
			statusCode,
			latency,
			bodySize,
			userInfo,
		)

		// 记录错误
		if len(c.Errors) > 0 {
			log.Printf("[ERROR] %s | %s | %s %s | Errors: %v",
				time.Now().Format("2006-01-02 15:04:05"),
				clientIP,
				method,
				path,
				c.Errors.String(),
			)
		}
	}
}