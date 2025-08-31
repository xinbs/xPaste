package services

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"

	"xpaste-sync/internal/models"
)

// ClipService 剪贴板服务
type ClipService struct {
	db *gorm.DB
}

// NewClipService 创建剪贴板服务
func NewClipService(db *gorm.DB) *ClipService {
	return &ClipService{db: db}
}

// CreateClipItem 创建剪贴板项
func (s *ClipService) CreateClipItem(userID uint, req *models.CreateClipRequest) (*models.ClipItem, error) {
	// 创建新的剪贴板项
	clipItem := &models.ClipItem{
		UserID:      userID,
		DeviceID:    req.DeviceID,
		Type:        models.ClipType(req.Type),
		Content:     req.Content,
		Title:       req.Title,
		Description: req.Description,
		Tags:        req.Tags,
		Metadata:    req.Metadata,
		Status:      models.ClipStatusActive,
	}

	// 设置过期时间
	if req.ExpiresAt != nil {
		clipItem.ExpiresAt = req.ExpiresAt
	}

	if err := s.db.Create(clipItem).Error; err != nil {
		return nil, fmt.Errorf("failed to create clip item: %w", err)
	}

	return clipItem, nil
}

// GetClipItem 根据ID获取剪贴板项
func (s *ClipService) GetClipItem(userID uint, clipID uint) (*models.ClipItem, error) {
	var clipItem models.ClipItem
	if err := s.db.Where("id = ? AND user_id = ?", clipID, userID).First(&clipItem).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, models.ErrClipItemNotFound
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	// 检查是否过期
	if clipItem.ExpiresAt != nil && clipItem.ExpiresAt.Before(time.Now()) {
		return nil, models.ErrClipItemExpired
	}

	// 增加查看次数
	clipItem.ViewCount++
	s.db.Save(&clipItem)

	return &clipItem, nil
}

// GetUserClipItems 获取用户的剪贴板项列表
func (s *ClipService) GetUserClipItems(userID uint, params *ClipListParams) ([]*models.ClipItem, int64, error) {
	var clipItems []*models.ClipItem
	var total int64

	// 构建查询条件
	query := s.db.Model(&models.ClipItem{}).Where("user_id = ?", userID)

	// 过滤条件
	if params != nil {
		if params.Type != "" {
			query = query.Where("type = ?", params.Type)
		}
		if params.DeviceID != "" {
			query = query.Where("device_id = ?", params.DeviceID)
		}
		if params.Status != "" {
			query = query.Where("status = ?", params.Status)
		}
		if params.Search != "" {
			searchTerm := "%" + params.Search + "%"
			query = query.Where("title LIKE ? OR content LIKE ?", searchTerm, searchTerm)
		}
		if len(params.Tags) > 0 {
			// 使用JSON查询标签
			for _, tag := range params.Tags {
				query = query.Where("JSON_EXTRACT(tags, '$') LIKE ?", "%\""+tag+"\"%")
			}
		}
		if params.StartTime != nil {
			query = query.Where("created_at >= ?", *params.StartTime)
		}
		if params.EndTime != nil {
			query = query.Where("created_at <= ?", *params.EndTime)
		}
		if params.IncludeExpired != nil && !*params.IncludeExpired {
			query = query.Where("expires_at IS NULL OR expires_at > ?", time.Now())
		}
	}

	// 计算总数
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count clip items: %w", err)
	}

	// 排序和分页
	orderBy := "created_at DESC"
	if params != nil && params.OrderBy != "" {
		orderBy = params.OrderBy
	}
	query = query.Order(orderBy)

	if params != nil && params.PaginationParams != nil {
		query = query.Offset(params.GetOffset()).Limit(params.GetLimit())
	}

	if err := query.Find(&clipItems).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to get clip items: %w", err)
	}

	return clipItems, total, nil
}

// GetRecentClipItems 获取最近的剪贴板项
func (s *ClipService) GetRecentClipItems(userID uint, limit int) ([]*models.ClipItem, error) {
	var clipItems []*models.ClipItem
	query := s.db.Where("user_id = ? AND status = ?", userID, models.ClipStatusActive)
	query = query.Where("expires_at IS NULL OR expires_at > ?", time.Now())
	query = query.Order("last_used DESC").Limit(limit)

	if err := query.Find(&clipItems).Error; err != nil {
		return nil, fmt.Errorf("failed to get recent clip items: %w", err)
	}

	return clipItems, nil
}

// UpdateClipItem 更新剪贴板项
func (s *ClipService) UpdateClipItem(userID uint, clipID uint, req *models.UpdateClipRequest) (*models.ClipItem, error) {
	var clipItem models.ClipItem
	if err := s.db.Where("id = ? AND user_id = ?", clipID, userID).First(&clipItem).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, models.ErrClipItemNotFound
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	// 更新字段
	if req.Title != nil {
		clipItem.Title = *req.Title
	}
	if req.Tags != nil {
		clipItem.Tags = req.Tags
	}
	if req.ExpiresAt != nil {
		clipItem.ExpiresAt = req.ExpiresAt
	}

	if err := s.db.Save(&clipItem).Error; err != nil {
		return nil, fmt.Errorf("failed to update clip item: %w", err)
	}

	return &clipItem, nil
}

// DeleteClipItem 删除剪贴板项（软删除）
func (s *ClipService) DeleteClipItem(userID uint, clipID uint) error {
	if err := s.db.Where("id = ? AND user_id = ?", clipID, userID).Delete(&models.ClipItem{}).Error; err != nil {
		return fmt.Errorf("failed to delete clip item: %w", err)
	}
	return nil
}

// BatchDeleteClipItems 批量删除剪贴板项
func (s *ClipService) BatchDeleteClipItems(userID uint, clipIDs []uint) error {
	if err := s.db.Where("id IN ? AND user_id = ?", clipIDs, userID).Delete(&models.ClipItem{}).Error; err != nil {
		return fmt.Errorf("failed to batch delete clip items: %w", err)
	}
	return nil
}

// MarkClipItemAsUsed 标记剪贴板项为已使用
func (s *ClipService) MarkClipItemAsUsed(userID uint, clipID uint) error {
	var clipItem models.ClipItem
	if err := s.db.Where("id = ? AND user_id = ?", clipID, userID).First(&clipItem).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.ErrClipItemNotFound
		}
		return fmt.Errorf("database error: %w", err)
	}

// 标记为已使用
	now := time.Now()
	clipItem.LastUsedAt = &now
	clipItem.ViewCount++
	if err := s.db.Save(&clipItem).Error; err != nil {
		return fmt.Errorf("failed to mark clip item as used: %w", err)
	}

	return nil
}

// GetClipItemsByDevice 获取指定设备的剪贴板项
func (s *ClipService) GetClipItemsByDevice(userID uint, deviceID string, params *models.PaginationParams) ([]*models.ClipItem, *models.PaginationResponse, error) {
	var clipItems []*models.ClipItem
	var total int64

	// 计算总数
	if err := s.db.Model(&models.ClipItem{}).Where("user_id = ? AND device_id = ?", userID, deviceID).Count(&total).Error; err != nil {
		return nil, nil, fmt.Errorf("failed to count clip items: %w", err)
	}

	// 获取列表
	query := s.db.Where("user_id = ? AND device_id = ?", userID, deviceID).Order("created_at DESC")
	if params != nil {
		query = query.Offset(params.GetOffset()).Limit(params.GetLimit())
	}

	if err := query.Find(&clipItems).Error; err != nil {
		return nil, nil, fmt.Errorf("failed to get clip items: %w", err)
	}

	// 构建分页响应
	var pagination *models.PaginationResponse
	if params != nil {
		pagination = &models.PaginationResponse{
			Page:     params.Page,
			PageSize: params.PageSize,
			Total:    total,
		}
		pagination.CalculateTotalPages()
	}

	return clipItems, pagination, nil
}

// SyncClipItems 同步剪贴板项
func (s *ClipService) SyncClipItems(userID uint, deviceID string, lastSyncTime *time.Time) (*SyncResult, error) {
	var result SyncResult

	// 获取需要同步的剪贴板项（在lastSyncTime之后更新的）
	query := s.db.Where("user_id = ?", userID)
	if lastSyncTime != nil {
		query = query.Where("updated_at > ?", *lastSyncTime)
	}

	var clipItems []*models.ClipItem
	if err := query.Order("updated_at ASC").Find(&clipItems).Error; err != nil {
		return nil, fmt.Errorf("failed to get clip items for sync: %w", err)
	}

	result.ClipItems = clipItems
	result.Count = len(clipItems)
	result.LastSyncTime = time.Now()

	// 更新设备同步时间
	if err := s.db.Model(&models.Device{}).Where("user_id = ? AND device_id = ?", userID, deviceID).Update("last_sync_at", result.LastSyncTime).Error; err != nil {
		return nil, fmt.Errorf("failed to update device sync time: %w", err)
	}

	return &result, nil
}

// GetClipItemStats 获取剪贴板项统计信息
func (s *ClipService) GetClipItemStats(userID uint) (*ClipStats, error) {
	var stats ClipStats

	// 总数
	if err := s.db.Model(&models.ClipItem{}).Where("user_id = ?", userID).Count(&stats.TotalCount).Error; err != nil {
		return nil, fmt.Errorf("failed to count total clip items: %w", err)
	}

	// 今日新增
	today := time.Now().Truncate(24 * time.Hour)
	if err := s.db.Model(&models.ClipItem{}).Where("user_id = ? AND created_at >= ?", userID, today).Count(&stats.TodayCount).Error; err != nil {
		return nil, fmt.Errorf("failed to count today's clip items: %w", err)
	}

	// 按类型统计
	stats.TypeStats = make(map[string]int64)
	rows, err := s.db.Model(&models.ClipItem{}).Select("type, COUNT(*) as count").Where("user_id = ?", userID).Group("type").Rows()
	if err != nil {
		return nil, fmt.Errorf("failed to get type stats: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var clipType string
		var count int64
		if err := rows.Scan(&clipType, &count); err != nil {
			return nil, fmt.Errorf("failed to scan type stats: %w", err)
		}
		stats.TypeStats[clipType] = count
	}

	// 总存储大小
	var totalSize sql.NullInt64
	if err := s.db.Model(&models.ClipItem{}).Select("SUM(size)").Where("user_id = ?", userID).Scan(&totalSize).Error; err != nil {
		return nil, fmt.Errorf("failed to calculate total size: %w", err)
	}
	if totalSize.Valid {
		stats.TotalSize = totalSize.Int64
	}

	return &stats, nil
}

// CleanupExpiredClipItems 清理过期的剪贴板项
func (s *ClipService) CleanupExpiredClipItems() error {
	now := time.Now()
	if err := s.db.Where("expires_at IS NOT NULL AND expires_at <= ?", now).Delete(&models.ClipItem{}).Error; err != nil {
		return fmt.Errorf("failed to cleanup expired clip items: %w", err)
	}
	return nil
}

// SearchClipItems 搜索剪贴板项
func (s *ClipService) SearchClipItems(userID uint, query string, params *models.PaginationParams) ([]*models.ClipItem, *models.PaginationResponse, error) {
	var clipItems []*models.ClipItem
	var total int64

	searchTerm := "%" + strings.ToLower(query) + "%"
	dbQuery := s.db.Model(&models.ClipItem{}).Where("user_id = ?", userID)
	dbQuery = dbQuery.Where("LOWER(title) LIKE ? OR LOWER(content) LIKE ?", searchTerm, searchTerm)

	// 计算总数
	if err := dbQuery.Count(&total).Error; err != nil {
		return nil, nil, fmt.Errorf("failed to count search results: %w", err)
	}

	// 获取结果
	if params != nil {
		dbQuery = dbQuery.Offset(params.GetOffset()).Limit(params.GetLimit())
	}
	dbQuery = dbQuery.Order("last_used_at DESC")

	if err := dbQuery.Find(&clipItems).Error; err != nil {
		return nil, nil, fmt.Errorf("failed to search clip items: %w", err)
	}

	// 构建分页响应
	var pagination *models.PaginationResponse
	if params != nil {
		pagination = &models.PaginationResponse{
			Page:     params.Page,
			PageSize: params.PageSize,
			Total:    total,
		}
		pagination.CalculateTotalPages()
	}

	return clipItems, pagination, nil
}

// ClipListParams 剪贴板列表查询参数
type ClipListParams struct {
	*models.PaginationParams
	Type           string     `json:"type"`
	DeviceID       string     `json:"device_id"`
	Status         string     `json:"status"`
	Search         string     `json:"search"`
	Tags           []string   `json:"tags"`
	StartTime      *time.Time `json:"start_time"`
	EndTime        *time.Time `json:"end_time"`
	OrderBy        string     `json:"order_by"`
	IncludeExpired *bool      `json:"include_expired"`
}

// SyncResult 同步结果
type SyncResult struct {
	ClipItems    []*models.ClipItem `json:"clip_items"`
	Count        int                `json:"count"`
	LastSyncTime time.Time          `json:"last_sync_time"`
}

// ClipStats 剪贴板统计信息
type ClipStats struct {
	TotalCount int64            `json:"total_count"`
	TodayCount int64            `json:"today_count"`
	TypeStats  map[string]int64 `json:"type_stats"`
	TotalSize  int64            `json:"total_size"`
}

// DeleteClipItems 批量删除剪贴板项（别名）
func (s *ClipService) DeleteClipItems(userID uint, clipIDs []uint) error {
	return s.BatchDeleteClipItems(userID, clipIDs)
}

// MarkAsUsed 标记剪贴板项为已使用（别名）
func (s *ClipService) MarkAsUsed(userID uint, clipID uint) error {
	return s.MarkClipItemAsUsed(userID, clipID)
}

// GetClipStats 获取剪贴板统计信息（别名）
func (s *ClipService) GetClipStats(userID uint) (*ClipStats, error) {
	return s.GetClipItemStats(userID)
}