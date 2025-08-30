package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config 应用配置
type Config struct {
	Server   ServerConfig   `json:"server"`
	Database DatabaseConfig `json:"database"`
	JWT      JWTConfig      `json:"jwt"`
	CORS     CORSConfig     `json:"cors"`
	Log      LogConfig      `json:"log"`
	Upload   UploadConfig   `json:"upload"`
	Sync     SyncConfig     `json:"sync"`
}

// ServerConfig 服务器配置
type ServerConfig struct {
	Host         string        `json:"host"`
	Port         int           `json:"port"`
	Mode         string        `json:"mode"` // debug, release, test
	ReadTimeout  time.Duration `json:"read_timeout"`
	WriteTimeout time.Duration `json:"write_timeout"`
	IdleTimeout  time.Duration `json:"idle_timeout"`
}

// DatabaseConfig 数据库配置
type DatabaseConfig struct {
	Driver          string        `json:"driver"`
	DSN             string        `json:"dsn"`
	MaxOpenConns    int           `json:"max_open_conns"`
	MaxIdleConns    int           `json:"max_idle_conns"`
	ConnMaxLifetime time.Duration `json:"conn_max_lifetime"`
	ConnMaxIdleTime time.Duration `json:"conn_max_idle_time"`
	LogLevel        string        `json:"log_level"` // silent, error, warn, info
}

// JWTConfig JWT 配置
type JWTConfig struct {
	Secret           string        `json:"secret"`
	AccessTokenTTL   time.Duration `json:"access_token_ttl"`
	RefreshTokenTTL  time.Duration `json:"refresh_token_ttl"`
	Issuer           string        `json:"issuer"`
	Audience         string        `json:"audience"`
}

// CORSConfig CORS 配置
type CORSConfig struct {
	AllowOrigins     []string      `json:"allow_origins"`
	AllowMethods     []string      `json:"allow_methods"`
	AllowHeaders     []string      `json:"allow_headers"`
	ExposeHeaders    []string      `json:"expose_headers"`
	AllowCredentials bool          `json:"allow_credentials"`
	MaxAge           time.Duration `json:"max_age"`
}

// LogConfig 日志配置
type LogConfig struct {
	Level      string `json:"level"`      // debug, info, warn, error
	Format     string `json:"format"`     // json, text
	Output     string `json:"output"`     // stdout, stderr, file
	FilePath   string `json:"file_path"`  // 日志文件路径
	MaxSize    int    `json:"max_size"`   // 日志文件最大大小（MB）
	MaxBackups int    `json:"max_backups"` // 保留的日志文件数量
	MaxAge     int    `json:"max_age"`    // 日志文件保留天数
	Compress   bool   `json:"compress"`   // 是否压缩旧日志文件
}

// UploadConfig 上传配置
type UploadConfig struct {
	MaxFileSize   int64    `json:"max_file_size"`   // 最大文件大小（字节）
	AllowedTypes  []string `json:"allowed_types"`   // 允许的文件类型
	UploadPath    string   `json:"upload_path"`     // 上传文件保存路径
	URLPrefix     string   `json:"url_prefix"`      // 文件访问URL前缀
	ImageMaxWidth int      `json:"image_max_width"` // 图片最大宽度
	ImageMaxHeight int     `json:"image_max_height"` // 图片最大高度
	ImageQuality  int      `json:"image_quality"`   // 图片压缩质量
}

// SyncConfig 同步配置
type SyncConfig struct {
	MaxClipItems      int           `json:"max_clip_items"`      // 每个用户最大剪贴板项数
	ClipItemTTL       time.Duration `json:"clip_item_ttl"`       // 剪贴板项默认过期时间
	MaxContentSize    int64         `json:"max_content_size"`    // 剪贴板内容最大大小
	CleanupInterval   time.Duration `json:"cleanup_interval"`    // 清理过期数据间隔
	SyncBatchSize     int           `json:"sync_batch_size"`     // 同步批次大小
	WebSocketTimeout  time.Duration `json:"websocket_timeout"`   // WebSocket 连接超时
	HeartbeatInterval time.Duration `json:"heartbeat_interval"`  // 心跳间隔
}

// Load 加载配置
func Load() (*Config, error) {
	config := &Config{
		Server: ServerConfig{
			Host:         getEnv("SERVER_HOST", "0.0.0.0"),
			Port:         getEnvAsInt("SERVER_PORT", 8080),
			Mode:         getEnv("GIN_MODE", "debug"),
			ReadTimeout:  getEnvAsDuration("SERVER_READ_TIMEOUT", "30s"),
			WriteTimeout: getEnvAsDuration("SERVER_WRITE_TIMEOUT", "30s"),
			IdleTimeout:  getEnvAsDuration("SERVER_IDLE_TIMEOUT", "60s"),
		},
		Database: DatabaseConfig{
			Driver:          getEnv("DB_DRIVER", "sqlite"),
			DSN:             getEnv("DB_DSN", "./data/xpaste.db"),
			MaxOpenConns:    getEnvAsInt("DB_MAX_OPEN_CONNS", 25),
			MaxIdleConns:    getEnvAsInt("DB_MAX_IDLE_CONNS", 5),
			ConnMaxLifetime: getEnvAsDuration("DB_CONN_MAX_LIFETIME", "5m"),
			ConnMaxIdleTime: getEnvAsDuration("DB_CONN_MAX_IDLE_TIME", "5m"),
			LogLevel:        getEnv("DB_LOG_LEVEL", "warn"),
		},
		JWT: JWTConfig{
			Secret:          getEnv("JWT_SECRET", "xpaste-secret-key-change-in-production"),
			AccessTokenTTL:  getEnvAsDuration("JWT_ACCESS_TOKEN_TTL", "24h"),
			RefreshTokenTTL: getEnvAsDuration("JWT_REFRESH_TOKEN_TTL", "168h"), // 7 days
			Issuer:          getEnv("JWT_ISSUER", "xpaste"),
			Audience:        getEnv("JWT_AUDIENCE", "xpaste-users"),
		},
		CORS: CORSConfig{
			AllowOrigins:     getEnvAsSlice("CORS_ALLOW_ORIGINS", []string{"*"}),
			AllowMethods:     getEnvAsSlice("CORS_ALLOW_METHODS", []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}),
			AllowHeaders:     getEnvAsSlice("CORS_ALLOW_HEADERS", []string{"Origin", "Content-Type", "Authorization"}),
			ExposeHeaders:    getEnvAsSlice("CORS_EXPOSE_HEADERS", []string{"Content-Length"}),
			AllowCredentials: getEnvAsBool("CORS_ALLOW_CREDENTIALS", true),
			MaxAge:           getEnvAsDuration("CORS_MAX_AGE", "12h"),
		},
		Log: LogConfig{
			Level:      getEnv("LOG_LEVEL", "info"),
			Format:     getEnv("LOG_FORMAT", "json"),
			Output:     getEnv("LOG_OUTPUT", "stdout"),
			FilePath:   getEnv("LOG_FILE_PATH", "./logs/app.log"),
			MaxSize:    getEnvAsInt("LOG_MAX_SIZE", 100),
			MaxBackups: getEnvAsInt("LOG_MAX_BACKUPS", 3),
			MaxAge:     getEnvAsInt("LOG_MAX_AGE", 28),
			Compress:   getEnvAsBool("LOG_COMPRESS", true),
		},
		Upload: UploadConfig{
			MaxFileSize:    getEnvAsInt64("UPLOAD_MAX_FILE_SIZE", 10*1024*1024), // 10MB
			AllowedTypes:   getEnvAsSlice("UPLOAD_ALLOWED_TYPES", []string{"image/jpeg", "image/png", "image/gif", "image/webp"}),
			UploadPath:     getEnv("UPLOAD_PATH", "./uploads"),
			URLPrefix:      getEnv("UPLOAD_URL_PREFIX", "/uploads"),
			ImageMaxWidth:  getEnvAsInt("UPLOAD_IMAGE_MAX_WIDTH", 1920),
			ImageMaxHeight: getEnvAsInt("UPLOAD_IMAGE_MAX_HEIGHT", 1080),
			ImageQuality:   getEnvAsInt("UPLOAD_IMAGE_QUALITY", 85),
		},
		Sync: SyncConfig{
			MaxClipItems:      getEnvAsInt("SYNC_MAX_CLIP_ITEMS", 1000),
			ClipItemTTL:       getEnvAsDuration("SYNC_CLIP_ITEM_TTL", "720h"), // 30 days
			MaxContentSize:    getEnvAsInt64("SYNC_MAX_CONTENT_SIZE", 1024*1024), // 1MB
			CleanupInterval:   getEnvAsDuration("SYNC_CLEANUP_INTERVAL", "1h"),
			SyncBatchSize:     getEnvAsInt("SYNC_BATCH_SIZE", 100),
			WebSocketTimeout:  getEnvAsDuration("SYNC_WEBSOCKET_TIMEOUT", "60s"),
			HeartbeatInterval: getEnvAsDuration("SYNC_HEARTBEAT_INTERVAL", "30s"),
		},
	}

	return config, nil
}

// GetAddr 获取服务器地址
func (c *Config) GetAddr() string {
	return fmt.Sprintf("%s:%d", c.Server.Host, c.Server.Port)
}

// IsDevelopment 是否为开发模式
func (c *Config) IsDevelopment() bool {
	return c.Server.Mode == "debug"
}

// IsProduction 是否为生产模式
func (c *Config) IsProduction() bool {
	return c.Server.Mode == "release"
}

// 环境变量辅助函数

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvAsInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getEnvAsInt64(key string, defaultValue int64) int64 {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.ParseInt(value, 10, 64); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getEnvAsBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolValue, err := strconv.ParseBool(value); err == nil {
			return boolValue
		}
	}
	return defaultValue
}

func getEnvAsDuration(key string, defaultValue string) time.Duration {
	value := getEnv(key, defaultValue)
	if duration, err := time.ParseDuration(value); err == nil {
		return duration
	}
	// 如果解析失败，尝试解析默认值
	if duration, err := time.ParseDuration(defaultValue); err == nil {
		return duration
	}
	// 如果都失败，返回 0
	return 0
}

func getEnvAsSlice(key string, defaultValue []string) []string {
	if value := os.Getenv(key); value != "" {
		return strings.Split(value, ",")
	}
	return defaultValue
}