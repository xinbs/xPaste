package websocket

import (
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"xpaste-sync/internal/models"
)

// WebSocket 升级器配置
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// 在生产环境中应该检查 Origin
		return true
	},
}

// MessageType 消息类型
type MessageType string

const (
	MessageTypeClipSync      MessageType = "clip_sync"      // 剪贴板同步
	MessageTypeClipNew       MessageType = "clip_new"       // 新剪贴板项
	MessageTypeClipUpdate    MessageType = "clip_update"    // 剪贴板项更新
	MessageTypeClipDelete    MessageType = "clip_delete"    // 剪贴板项删除
	MessageTypeDeviceOnline  MessageType = "device_online"  // 设备上线
	MessageTypeDeviceOffline MessageType = "device_offline" // 设备下线
	MessageTypeDeviceUpdate  MessageType = "device_update"  // 设备更新
	MessageTypeHeartbeat     MessageType = "heartbeat"      // 心跳
	MessageTypePing          MessageType = "ping"           // Ping
	MessageTypePong          MessageType = "pong"           // Pong
	MessageTypeError         MessageType = "error"          // 错误
)

// Message WebSocket 消息结构
type Message struct {
	Type      MessageType `json:"type"`
	Data      interface{} `json:"data,omitempty"`
	Timestamp int64       `json:"timestamp"`
	MessageID string      `json:"message_id,omitempty"`
}

// Client WebSocket 客户端
type Client struct {
	ID       string          // 客户端唯一标识
	UserID   uint            // 用户ID
	DeviceID string          // 设备ID
	Conn     *websocket.Conn // WebSocket 连接
	Send     chan Message    // 发送消息通道
	Manager  *Manager        // 管理器引用
	LastSeen time.Time       // 最后活跃时间
	mu       sync.RWMutex    // 读写锁
}

// Manager WebSocket 连接管理器
type Manager struct {
	clients       map[string]*Client // 所有客户端连接
	userClients   map[uint][]*Client // 按用户分组的客户端
	deviceClients map[string]*Client // 按设备分组的客户端
	register      chan *Client       // 注册客户端通道
	unregister    chan *Client       // 注销客户端通道
	broadcast     chan Message       // 广播消息通道
	mu            sync.RWMutex       // 读写锁
}

func (m *Manager) deviceKey(userID uint, deviceID string) string {
	return strconv.FormatUint(uint64(userID), 10) + ":" + deviceID
}

// NewManager 创建新的 WebSocket 管理器
func NewManager() *Manager {
	return &Manager{
		clients:       make(map[string]*Client),
		userClients:   make(map[uint][]*Client),
		deviceClients: make(map[string]*Client),
		register:      make(chan *Client),
		unregister:    make(chan *Client),
		broadcast:     make(chan Message),
	}
}

// Register 注册客户端
func (m *Manager) Register(client *Client) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.clients[client.ID] = client
	m.userClients[client.UserID] = append(m.userClients[client.UserID], client)
	m.deviceClients[m.deviceKey(client.UserID, client.DeviceID)] = client
}

// Unregister 注销客户端
func (m *Manager) Unregister(client *Client) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.clients[client.ID]; ok {
		delete(m.clients, client.ID)
	}

	if clients, ok := m.userClients[client.UserID]; ok {
		for i, c := range clients {
			if c == client {
				m.userClients[client.UserID] = append(clients[:i], clients[i+1:]...)
				break
			}
		}
		if len(m.userClients[client.UserID]) == 0 {
			delete(m.userClients, client.UserID)
		}
	}

	if _, ok := m.deviceClients[m.deviceKey(client.UserID, client.DeviceID)]; ok {
		delete(m.deviceClients, m.deviceKey(client.UserID, client.DeviceID))
	}
}

// Run 运行管理器
func (m *Manager) Run() {
	for {
		select {
		case client := <-m.register:
			m.Register(client)
		case client := <-m.unregister:
			m.Unregister(client)
		case message := <-m.broadcast:
			m.mu.RLock()
			for _, client := range m.clients {
				select {
				case client.Send <- message:
				default:
					go func(c *Client) { m.unregister <- c }(client)
				}
			}
			m.mu.RUnlock()
		}
	}
}

// SendToUser 向用户的所有设备发送消息
func (m *Manager) SendToUser(userID uint, message Message) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if clients, exists := m.userClients[userID]; exists {
		for _, client := range clients {
			select {
			case client.Send <- message:
			default:
				// 发送失败，关闭客户端
				go func(c *Client) {
					m.unregister <- c
				}(client)
			}
		}
	}
}

// SendToDevice 向指定设备发送消息
func (m *Manager) SendToDevice(userID uint, deviceID string, message Message) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if client, exists := m.deviceClients[m.deviceKey(userID, deviceID)]; exists {
		select {
		case client.Send <- message:
		default:
			// 发送失败，关闭客户端
			go func(c *Client) {
				m.unregister <- c
			}(client)
		}
	}
}

// SendToUserExceptDevice 向用户的其他设备发送消息（排除指定设备）
func (m *Manager) SendToUserExceptDevice(userID uint, excludeDeviceID string, message Message) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if clients, exists := m.userClients[userID]; exists {
		for _, client := range clients {
			if client.DeviceID != excludeDeviceID {
				select {
				case client.Send <- message:
				default:
					// 发送失败，关闭客户端
					go func(c *Client) {
						m.unregister <- c
					}(client)
				}
			}
		}
	}
}

// notifyDeviceStatus 通知设备状态变化
func (m *Manager) notifyDeviceStatus(userID uint, deviceID string, online bool) {
	messageType := MessageTypeDeviceOnline
	if !online {
		messageType = MessageTypeDeviceOffline
	}

	message := Message{
		Type: messageType,
		Data: gin.H{
			"device_id": deviceID,
			"online":    online,
		},
		Timestamp: time.Now().Unix(),
	}

	// 通知用户的其他设备
	m.SendToUserExceptDevice(userID, deviceID, message)
}

// GetOnlineDevices 获取用户的在线设备列表
func (m *Manager) GetOnlineDevices(userID uint) []string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var devices []string
	if clients, exists := m.userClients[userID]; exists {
		for _, client := range clients {
			devices = append(devices, client.DeviceID)
		}
	}
	return devices
}

// IsDeviceOnline 检查设备是否在线
func (m *Manager) IsDeviceOnline(userID uint, deviceID string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	_, exists := m.deviceClients[m.deviceKey(userID, deviceID)]
	return exists
}

// GetClientCount 获取连接数统计
func (m *Manager) GetClientCount() (total int, byUser map[string]int) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	total = len(m.clients)
	byUser = make(map[string]int)

	for userID, clients := range m.userClients {
		key := strconv.FormatUint(uint64(userID), 10)
		byUser[key] = len(clients)
	}

	return
}

// GetStats 获取连接统计信息
func (m *Manager) GetStats() map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()

	total, byUser := m.GetClientCount()

	return map[string]interface{}{
		"total_connections":   total,
		"users_online":        len(byUser),
		"connections_by_user": byUser,
		"devices_online":      len(m.deviceClients),
	}
}

// Close 关闭客户端连接
func (c *Client) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.Conn != nil {
		c.Conn.Close()
		c.Conn = nil
	}

	if c.Send != nil {
		close(c.Send)
		c.Send = nil
	}
}

// writePump 处理向客户端写入消息
func (c *Client) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.Manager.unregister <- c
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.Conn.WriteJSON(message); err != nil {
				log.Printf("Error writing message to client %s: %v", c.ID, err)
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("Error sending ping to client %s: %v", c.ID, err)
				return
			}
		}
	}
}

// readPump 处理从客户端读取消息
func (c *Client) readPump() {
	defer func() {
		c.Manager.unregister <- c
	}()

	c.Conn.SetReadLimit(512)
	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		c.LastSeen = time.Now()
		return nil
	})

	for {
		var message Message
		err := c.Conn.ReadJSON(&message)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error from client %s: %v", c.ID, err)
			}
			break
		}

		c.LastSeen = time.Now()
		c.handleMessage(message)
	}
}

// handleMessage 处理客户端消息
func (c *Client) handleMessage(message Message) {
	switch message.Type {
	case MessageTypePing:
		// 响应 Pong
		pongMessage := Message{
			Type:      MessageTypePong,
			Timestamp: time.Now().Unix(),
			MessageID: message.MessageID,
		}
		select {
		case c.Send <- pongMessage:
		default:
			log.Printf("Failed to send pong to client %s", c.ID)
		}

	case MessageTypeHeartbeat:
		// 更新最后活跃时间
		c.LastSeen = time.Now()

	case MessageTypeClipSync:
		// 处理剪贴板同步请求
		c.handleClipSync(message)

	default:
		log.Printf("Unknown message type from client %s: %s", c.ID, message.Type)
	}
}

// handleClipSync 处理剪贴板同步
func (c *Client) handleClipSync(message Message) {
	// 这里可以添加剪贴板同步的具体逻辑
	// 例如：获取最新的剪贴板数据并发送给客户端
	log.Printf("Handling clip sync for client %s", c.ID)
}

// NotifyClipNew 通知新剪贴板项
func (m *Manager) NotifyClipNew(userID uint, excludeDeviceID string, clipItem *models.ClipItem) {
	message := Message{
		Type:      MessageTypeClipNew,
		Data:      clipItem.ToResponse(),
		Timestamp: time.Now().Unix(),
	}

	m.SendToUserExceptDevice(userID, excludeDeviceID, message)
}

// NotifyClipUpdate 通知剪贴板项更新
func (m *Manager) NotifyClipUpdate(userID uint, excludeDeviceID string, clipItem *models.ClipItem) {
	message := Message{
		Type:      MessageTypeClipUpdate,
		Data:      clipItem.ToResponse(),
		Timestamp: time.Now().Unix(),
	}

	m.SendToUserExceptDevice(userID, excludeDeviceID, message)
}

// NotifyClipDelete 通知剪贴板项删除
func (m *Manager) NotifyClipDelete(userID uint, excludeDeviceID string, clipID uint) {
	message := Message{
		Type: MessageTypeClipDelete,
		Data: gin.H{
			"clip_id": clipID,
		},
		Timestamp: time.Now().Unix(),
	}

	m.SendToUserExceptDevice(userID, excludeDeviceID, message)
}

// NotifyDeviceUpdate 通知设备信息更新
func (m *Manager) NotifyDeviceUpdate(userID uint, device *models.Device) {
	message := Message{
		Type:      MessageTypeDeviceUpdate,
		Data:      device.ToResponse(),
		Timestamp: time.Now().Unix(),
	}

	m.SendToUser(userID, message)
}
