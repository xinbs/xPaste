package utils

import (
	"net"
	"strings"

	"github.com/gin-gonic/gin"
)

// IPInfo IP地址信息
type IPInfo struct {
	ClientIP  string `json:"client_ip"`  // 客户端IP（可能是代理IP）
	RealIP    string `json:"real_ip"`    // 真实IP（从X-Real-IP获取）
	PublicIP  string `json:"public_ip"`  // 公网IP
	PrivateIP string `json:"private_ip"` // 内网IP
	IsPrivate bool   `json:"is_private"` // 是否为私有IP
}

// GetClientIPInfo 获取客户端IP信息
func GetClientIPInfo(c *gin.Context) *IPInfo {
	info := &IPInfo{}
	
	// 1. 获取Gin的ClientIP（可能受代理影响）
	info.ClientIP = c.ClientIP()
	
	// 2. 尝试从X-Real-IP头获取真实IP
	if realIP := c.GetHeader("X-Real-IP"); realIP != "" {
		info.RealIP = realIP
	}
	
	// 3. 尝试从X-Forwarded-For头获取原始IP
	if forwardedFor := c.GetHeader("X-Forwarded-For"); forwardedFor != "" {
		// X-Forwarded-For可能包含多个IP，第一个通常是客户端IP
		ips := strings.Split(forwardedFor, ",")
		if len(ips) > 0 {
			firstIP := strings.TrimSpace(ips[0])
			if info.RealIP == "" {
				info.RealIP = firstIP
			}
		}
	}
	
	// 4. 如果没有获取到真实IP，使用ClientIP
	if info.RealIP == "" {
		info.RealIP = info.ClientIP
	}
	
	// 5. 判断IP类型并分类
	info.classifyIP()
	
	return info
}

// classifyIP 分类IP地址
func (info *IPInfo) classifyIP() {
	ip := net.ParseIP(info.RealIP)
	if ip == nil {
		return
	}
	
	// 判断是否为私有IP
	info.IsPrivate = IsPrivateIP(ip)
	
	if info.IsPrivate {
		info.PrivateIP = info.RealIP
	} else {
		info.PublicIP = info.RealIP
	}
}

// IsPrivateIP 判断是否为私有IP地址
func IsPrivateIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return true
	}
	
	// IPv4私有地址范围
	if ip4 := ip.To4(); ip4 != nil {
		// 10.0.0.0/8
		if ip4[0] == 10 {
			return true
		}
		// 172.16.0.0/12
		if ip4[0] == 172 && ip4[1] >= 16 && ip4[1] <= 31 {
			return true
		}
		// 192.168.0.0/16
		if ip4[0] == 192 && ip4[1] == 168 {
			return true
		}
		// 169.254.0.0/16 (链路本地地址)
		if ip4[0] == 169 && ip4[1] == 254 {
			return true
		}
	}
	
	// IPv6私有地址
	if len(ip) == 16 {
		// fc00::/7 (唯一本地地址)
		if ip[0] >= 0xfc && ip[0] <= 0xfd {
			return true
		}
		// fe80::/10 (链路本地地址)
		if ip[0] == 0xfe && (ip[1]&0xc0) == 0x80 {
			return true
		}
	}
	
	return false
}

// GetBestIP 获取最佳IP地址（优先公网IP）
func (info *IPInfo) GetBestIP() string {
	if info.PublicIP != "" {
		return info.PublicIP
	}
	if info.PrivateIP != "" {
		return info.PrivateIP
	}
	return info.ClientIP
}

// GetDisplayIP 获取用于显示的IP地址
func (info *IPInfo) GetDisplayIP() string {
	bestIP := info.GetBestIP()
	if info.IsPrivate {
		return bestIP + " (内网)"
	}
	return bestIP + " (公网)"
}