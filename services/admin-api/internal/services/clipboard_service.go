package services

import (
	"errors"

	"admin-api/shared/database"
	"admin-api/shared/models"
	"gorm.io/gorm"
)

type ClipboardService struct {
	db *gorm.DB
}

func NewClipboardService() *ClipboardService {
	return &ClipboardService{
		db: database.GetDB(),
	}
}

// GetAllClipboards 获取所有剪贴板内容（分页）
func (s *ClipboardService) GetAllClipboards(page, limit int, contentType, search, startDate, endDate string, userID uint) ([]models.Clipboard, int64, error) {
	var clipboards []models.Clipboard
	var total int64

	query := s.db.Model(&models.Clipboard{}).Preload("User")

	if contentType != "" {
		query = query.Where("type = ?", contentType)
	}

	if search != "" {
		query = query.Where("content LIKE ?", "%"+search+"%")
	}

	if startDate != "" {
		query = query.Where("created_at >= ?", startDate)
	}

	if endDate != "" {
		query = query.Where("created_at <= ?", endDate)
	}

	if userID != 0 {
		query = query.Where("user_id = ?", userID)
	}

	// 获取总数
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// 分页查询
	offset := (page - 1) * limit
	if err := query.Offset(offset).Limit(limit).Order("created_at DESC").Find(&clipboards).Error; err != nil {
		return nil, 0, err
	}

	return clipboards, total, nil
}

// GetClipboardByID 根据ID获取剪贴板内容
func (s *ClipboardService) GetClipboardByID(id uint) (*models.Clipboard, error) {
	var clipboard models.Clipboard
	result := s.db.First(&clipboard, id)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("剪贴板内容不存在")
		}
		return nil, result.Error
	}
	return &clipboard, nil
}

// DeleteClipboard 删除剪贴板内容
func (s *ClipboardService) DeleteClipboard(id uint) error {
	result := s.db.Delete(&models.Clipboard{}, id)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return errors.New("剪贴板内容不存在")
	}
	return nil
}

// BatchDeleteClipboards 批量删除剪贴板内容
func (s *ClipboardService) BatchDeleteClipboards(clipboardIDs []uint) error {
	if len(clipboardIDs) == 0 {
		return errors.New("剪贴板ID列表不能为空")
	}

	result := s.db.Delete(&models.Clipboard{}, clipboardIDs)
	if result.Error != nil {
		return result.Error
	}

	if result.RowsAffected == 0 {
		return errors.New("没有找到要删除的剪贴板内容")
	}

	return nil
}

// RestoreClipboard 恢复剪贴板内容（软删除恢复）
func (s *ClipboardService) RestoreClipboard(id uint) error {
	// 如果使用软删除，这里应该恢复deleted_at字段
	// 目前简单实现，假设有is_deleted字段
	result := s.db.Model(&models.Clipboard{}).Where("id = ?", id).Update("is_deleted", false)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return errors.New("剪贴板内容不存在")
	}
	return nil
}

// ClearAllClipboards 清空所有剪贴板内容
func (s *ClipboardService) ClearAllClipboards() error {
	result := s.db.Where("1 = 1").Delete(&models.Clipboard{})
	if result.Error != nil {
		return result.Error
	}
	return nil
}

// GetClipboardStats 获取剪贴板统计信息
func (s *ClipboardService) GetClipboardStats() (map[string]interface{}, error) {
	stats := make(map[string]interface{})

	// 总数
	var total int64
	if err := s.db.Model(&models.Clipboard{}).Count(&total).Error; err != nil {
		return nil, err
	}
	stats["total"] = total

	// 按类型统计
	var typeStats []struct {
		ContentType string `json:"content_type"`
		Count       int64  `json:"count"`
	}
	if err := s.db.Model(&models.Clipboard{}).Select("content_type, count(*) as count").Group("content_type").Scan(&typeStats).Error; err != nil {
		return nil, err
	}
	stats["by_type"] = typeStats

	// 今日新增
	var todayCount int64
	if err := s.db.Model(&models.Clipboard{}).Where("DATE(created_at) = CURDATE()").Count(&todayCount).Error; err != nil {
		return nil, err
	}
	stats["today"] = todayCount

	return stats, nil
}