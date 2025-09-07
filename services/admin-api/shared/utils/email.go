package utils

import (
	"regexp"
	"strings"
)

// IsEmail 检查字符串是否为有效的邮箱地址
func IsEmail(email string) bool {
	if email == "" {
		return false
	}

	// 基本的邮箱格式验证正则表达式
	emailRegex := `^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`
	re := regexp.MustCompile(emailRegex)

	// 去除首尾空格并转换为小写
	email = strings.TrimSpace(strings.ToLower(email))

	// 检查长度限制
	if len(email) > 254 {
		return false
	}

	return re.MatchString(email)
}

// NormalizeEmail 标准化邮箱地址（去除空格，转换为小写）
func NormalizeEmail(email string) string {
	return strings.TrimSpace(strings.ToLower(email))
}