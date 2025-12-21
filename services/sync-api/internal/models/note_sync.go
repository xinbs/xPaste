package models

import "time"

type NoteItem struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	UserID       uint      `json:"user_id" gorm:"not null;index;uniqueIndex:idx_note_items_user_scope_key,priority:1"`
	StorageScope string    `json:"storage_scope" gorm:"not null;size:20;index;uniqueIndex:idx_note_items_user_scope_key,priority:2"`
	NoteKey      string    `json:"note_key" gorm:"not null;size:500;index;uniqueIndex:idx_note_items_user_scope_key,priority:3"`
	MtimeMs      int64     `json:"mtime_ms" gorm:"not null;default:0;index"`
	SizeBytes    int64     `json:"size_bytes" gorm:"not null;default:0"`
	ContentHash  string    `json:"content_hash" gorm:"size:80"`
	IsDeleted    bool      `json:"is_deleted" gorm:"not null;default:false;index"`
}

func (NoteItem) TableName() string {
	return "note_items"
}

type NoteEvent struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	CreatedAt    time.Time `json:"created_at"`
	UserID       uint      `json:"user_id" gorm:"not null;index"`
	StorageScope string    `json:"storage_scope" gorm:"not null;size:20;index"`
	NoteKey      string    `json:"note_key" gorm:"not null;size:500;index"`
	EventType    string    `json:"event_type" gorm:"not null;size:20;index"`
	MtimeMs      int64     `json:"mtime_ms" gorm:"not null;default:0"`
	SizeBytes    int64     `json:"size_bytes" gorm:"not null;default:0"`
	ContentHash  string    `json:"content_hash" gorm:"size:80"`
}

func (NoteEvent) TableName() string {
	return "note_events"
}

type NoteDeviceCursor struct {
	ID           uint       `json:"id" gorm:"primaryKey"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	UserID       uint       `json:"user_id" gorm:"not null;index;uniqueIndex:idx_note_cursor_user_device_scope,priority:1"`
	DeviceID     string     `json:"device_id" gorm:"not null;size:120;index;uniqueIndex:idx_note_cursor_user_device_scope,priority:2"`
	StorageScope string     `json:"storage_scope" gorm:"not null;size:20;index;uniqueIndex:idx_note_cursor_user_device_scope,priority:3"`
	LastToken    uint       `json:"last_token" gorm:"not null;default:0"`
	LastPullAt   *time.Time `json:"last_pull_at"`
	LastPushAt   *time.Time `json:"last_push_at"`
}

func (NoteDeviceCursor) TableName() string {
	return "note_device_cursors"
}

