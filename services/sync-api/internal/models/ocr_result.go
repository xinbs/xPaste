package models

import (
	"time"

	"gorm.io/gorm"
)

// OcrResult OCR 识别结果模型
type OcrResult struct {
	ID        uint           `json:"id" gorm:"primarykey"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`

	// 关联信息
	ClipItemID uint     `json:"clip_item_id" gorm:"not null;index"`
	ClipItem   ClipItem `json:"clip_item,omitempty" gorm:"foreignKey:ClipItemID"`

	// 基本信息
	ResultID string    `json:"result_id" gorm:"uniqueIndex;not null;size:100"`
	Language string    `json:"language" gorm:"not null;size:10"`
	Engine   OcrEngine `json:"engine" gorm:"not null"`
	Text     string    `json:"text" gorm:"type:text"`

	// 识别详情
	Confidence float64           `json:"confidence" gorm:"default:0"`
	BoundingBoxes []BoundingBox  `json:"bounding_boxes" gorm:"type:text;serializer:json"`
	Words         []WordResult   `json:"words" gorm:"type:text;serializer:json"`
	Lines         []LineResult   `json:"lines" gorm:"type:text;serializer:json"`

	// 处理信息
	Status        OcrStatus `json:"status" gorm:"default:1"`
	ProcessingTime int64    `json:"processing_time" gorm:"default:0"` // 毫秒
	ErrorMessage  string    `json:"error_message" gorm:"type:text"`

	// 元数据
	Metadata OcrMetadata `json:"metadata" gorm:"type:text;serializer:json"`
}

// OcrEngine OCR 引擎类型
type OcrEngine string

const (
	OcrEngineLocal    OcrEngine = "local"    // 本地 OCR
	OcrEngineTesseract OcrEngine = "tesseract" // Tesseract
	OcrEngineCloud    OcrEngine = "cloud"    // 云端 OCR
	OcrEngineCustom   OcrEngine = "custom"   // 自定义引擎
)

// OcrStatus OCR 状态
type OcrStatus int

const (
	OcrStatusPending    OcrStatus = 0 // 待处理
	OcrStatusProcessing OcrStatus = 1 // 处理中
	OcrStatusCompleted  OcrStatus = 2 // 已完成
	OcrStatusFailed     OcrStatus = 3 // 处理失败
)

// String 返回 OCR 状态的字符串表示
func (s OcrStatus) String() string {
	switch s {
	case OcrStatusPending:
		return "pending"
	case OcrStatusProcessing:
		return "processing"
	case OcrStatusCompleted:
		return "completed"
	case OcrStatusFailed:
		return "failed"
	default:
		return "unknown"
	}
}

// BoundingBox 边界框
type BoundingBox struct {
	X      int `json:"x"`
	Y      int `json:"y"`
	Width  int `json:"width"`
	Height int `json:"height"`
}

// WordResult 单词识别结果
type WordResult struct {
	Text       string      `json:"text"`
	Confidence float64     `json:"confidence"`
	BoundingBox BoundingBox `json:"bounding_box"`
}

// LineResult 行识别结果
type LineResult struct {
	Text        string       `json:"text"`
	Confidence  float64      `json:"confidence"`
	BoundingBox BoundingBox  `json:"bounding_box"`
	Words       []WordResult `json:"words"`
}

// OcrMetadata OCR 元数据
type OcrMetadata struct {
	// 图片信息
	ImageWidth  int    `json:"image_width,omitempty"`
	ImageHeight int    `json:"image_height,omitempty"`
	ImageFormat string `json:"image_format,omitempty"`
	ImageSize   int64  `json:"image_size,omitempty"`

	// 处理参数
	Preprocessing []string `json:"preprocessing,omitempty"`
	DPI           int      `json:"dpi,omitempty"`
	PageSegMode   int      `json:"page_seg_mode,omitempty"`

	// 引擎信息
	EngineVersion string `json:"engine_version,omitempty"`
	ModelVersion  string `json:"model_version,omitempty"`

	// 其他信息
	Extra map[string]interface{} `json:"extra,omitempty"`
}

// TableName 指定表名
func (OcrResult) TableName() string {
	return "ocr_results"
}

// BeforeCreate GORM 钩子：创建前
func (o *OcrResult) BeforeCreate(tx *gorm.DB) error {
	if o.BoundingBoxes == nil {
		o.BoundingBoxes = []BoundingBox{}
	}
	if o.Words == nil {
		o.Words = []WordResult{}
	}
	if o.Lines == nil {
		o.Lines = []LineResult{}
	}
	return nil
}

// IsCompleted 检查 OCR 是否已完成
func (o *OcrResult) IsCompleted() bool {
	return o.Status == OcrStatusCompleted
}

// IsFailed 检查 OCR 是否失败
func (o *OcrResult) IsFailed() bool {
	return o.Status == OcrStatusFailed
}

// SetProcessing 设置为处理中状态
func (o *OcrResult) SetProcessing() {
	o.Status = OcrStatusProcessing
}

// SetCompleted 设置为完成状态
func (o *OcrResult) SetCompleted(text string, confidence float64) {
	o.Status = OcrStatusCompleted
	o.Text = text
	o.Confidence = confidence
	o.ErrorMessage = ""
}

// SetFailed 设置为失败状态
func (o *OcrResult) SetFailed(errorMsg string) {
	o.Status = OcrStatusFailed
	o.ErrorMessage = errorMsg
}

// GetAverageConfidence 获取平均置信度
func (o *OcrResult) GetAverageConfidence() float64 {
	if len(o.Words) == 0 {
		return o.Confidence
	}

	total := 0.0
	for _, word := range o.Words {
		total += word.Confidence
	}
	return total / float64(len(o.Words))
}

// CreateOcrRequest 创建 OCR 请求
type CreateOcrRequest struct {
	ClipItemID uint      `json:"clip_item_id" binding:"required"`
	Language   string    `json:"language" binding:"required,max=10"`
	Engine     OcrEngine `json:"engine" binding:"required"`
}

// OcrResultResponse OCR 结果响应
type OcrResultResponse struct {
	ID             uint            `json:"id"`
	ResultID       string          `json:"result_id"`
	Language       string          `json:"language"`
	Engine         OcrEngine       `json:"engine"`
	Text           string          `json:"text"`
	Confidence     float64         `json:"confidence"`
	BoundingBoxes  []BoundingBox   `json:"bounding_boxes"`
	Words          []WordResult    `json:"words"`
	Lines          []LineResult    `json:"lines"`
	Status         string          `json:"status"`
	ProcessingTime int64           `json:"processing_time"`
	ErrorMessage   string          `json:"error_message"`
	Metadata       OcrMetadata     `json:"metadata"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

// ToResponse 转换为响应格式
func (o *OcrResult) ToResponse() *OcrResultResponse {
	return &OcrResultResponse{
		ID:             o.ID,
		ResultID:       o.ResultID,
		Language:       o.Language,
		Engine:         o.Engine,
		Text:           o.Text,
		Confidence:     o.Confidence,
		BoundingBoxes:  o.BoundingBoxes,
		Words:          o.Words,
		Lines:          o.Lines,
		Status:         o.Status.String(),
		ProcessingTime: o.ProcessingTime,
		ErrorMessage:   o.ErrorMessage,
		Metadata:       o.Metadata,
		CreatedAt:      o.CreatedAt,
		UpdatedAt:      o.UpdatedAt,
	}
}