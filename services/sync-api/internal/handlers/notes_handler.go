package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"xpaste-sync/internal/config"
	"xpaste-sync/internal/models"
)

type NotesHandler struct {
	db *gorm.DB
}

func NewNotesHandler(db *gorm.DB) *NotesHandler {
	return &NotesHandler{db: db}
}

func (h *NotesHandler) RegisterRoutes(router *gin.RouterGroup) {
	g := router.Group("/notes")
	{
		g.POST("/push", h.PushNote)
		g.POST("/push-batch", h.PushBatch)
		g.GET("/list", h.ListNotes)
		g.GET("/get", h.GetNote)
		g.GET("/changes", h.GetChanges)
		g.POST("/ack", h.AckChanges)
	}
}

type PushNoteRequest struct {
	Content  string `json:"content" binding:"required"`
	FileName string `json:"filename" binding:"required"`
	NoteDir  string `json:"note_dir"`
	UseData  bool   `json:"use_data"`
}

type PushBatchRequest struct {
	Items []PushNoteRequest `json:"items" binding:"required"`
}

func (h *NotesHandler) PushNote(c *gin.Context) {
	uidRaw, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}
	uid := uidRaw.(uint)
	uname := ""
	if v, ok := c.Get("username"); ok {
		uname = strings.TrimSpace(v.(string))
	}
	deviceID := ""
	if v, ok := c.Get("device_id"); ok {
		deviceID = strings.TrimSpace(v.(string))
	}

	var req PushNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid request parameters"))
		return
	}
	content := strings.TrimSpace(req.Content)
	fileName := strings.TrimSpace(req.FileName)
	if content == "" || fileName == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Content and filename are required"))
		return
	}

	cfg, _ := config.Load()
	base := cfg.Upload.UploadPath
	if req.UseData {
		base = filepath.Join(".", "data", "uploads")
	}

	userKey := cleanFileName(uname)
	if userKey == "" {
		userKey = strconv.FormatUint(uint64(uid), 10)
	}
	userLayer := filepath.Join(base, "users", userKey)

	noteDir := cleanRelPath(req.NoteDir)
	dstDir := userLayer
	if noteDir != "" {
		dstDir = filepath.Join(dstDir, noteDir)
	}
	if err := os.MkdirAll(dstDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Create dir failed"))
		return
	}

	cleanName := cleanFileName(fileName)
	if cleanName == "" {
		cleanName = "note.md"
	}
	if filepath.Ext(cleanName) == "" {
		cleanName = cleanName + ".md"
	}
	dst := filepath.Join(dstDir, cleanName)

	if err := os.WriteFile(dst, []byte(content), 0o644); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Write file failed"))
		return
	}

	info, statErr := os.Stat(dst)
	if statErr == nil {
		storageScope := scopeFromUseData(req.UseData)
		noteKey := makeNoteKey(noteDir, cleanName)
		mtimeMs := info.ModTime().UnixMilli()
		sizeBytes := info.Size()
		hashHex := sha256Hex(content)
		_, _ = h.writeNoteUpsertEvent(uid, deviceID, storageScope, noteKey, mtimeMs, sizeBytes, hashHex)
	}

	rel := strings.TrimPrefix(dst, ".")
	rel = strings.TrimPrefix(rel, string(filepath.Separator))

	c.JSON(http.StatusOK, models.SuccessResponse("Note pushed", gin.H{
		"relative_path": rel,
		"filename":      cleanName,
		"user_id":       uid,
		"username":      userKey,
		"note_dir":      noteDir,
		"in_data_dir":   req.UseData,
	}))
}

func (h *NotesHandler) PushBatch(c *gin.Context) {
	uidRaw, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}
	uid := uidRaw.(uint)
	uname := ""
	if v, ok := c.Get("username"); ok {
		uname = strings.TrimSpace(v.(string))
	}
	deviceID := ""
	if v, ok := c.Get("device_id"); ok {
		deviceID = strings.TrimSpace(v.(string))
	}

	var req PushBatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid request parameters"))
		return
	}
	if len(req.Items) == 0 {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("No items to push"))
		return
	}

	cfg, _ := config.Load()
	base := cfg.Upload.UploadPath
	if req.Items[0].UseData {
		base = filepath.Join(".", "data", "uploads")
	}

	userKey := cleanFileName(uname)
	if userKey == "" {
		userKey = strconv.FormatUint(uint64(uid), 10)
	}
	userLayer := filepath.Join(base, "users", userKey)

	type Result struct {
		FileName     string `json:"filename"`
		NoteDir      string `json:"note_dir"`
		RelativePath string `json:"relative_path"`
		Success      bool   `json:"success"`
		Error        string `json:"error,omitempty"`
	}
	results := make([]Result, 0, len(req.Items))
	storageScope := scopeFromUseData(len(req.Items) > 0 && req.Items[0].UseData)

	for _, item := range req.Items {
		content := strings.TrimSpace(item.Content)
		fileName := strings.TrimSpace(item.FileName)
		if content == "" || fileName == "" {
			results = append(results, Result{FileName: fileName, NoteDir: item.NoteDir, Success: false, Error: "invalid content or filename"})
			continue
		}

		noteDir := cleanRelPath(item.NoteDir)
		dstDir := userLayer
		if noteDir != "" {
			dstDir = filepath.Join(dstDir, noteDir)
		}
		if err := os.MkdirAll(dstDir, 0o755); err != nil {
			results = append(results, Result{FileName: fileName, NoteDir: item.NoteDir, Success: false, Error: "create dir failed"})
			continue
		}

		cleanName := cleanFileName(fileName)
		if cleanName == "" {
			cleanName = "note.md"
		}
		if filepath.Ext(cleanName) == "" {
			cleanName = cleanName + ".md"
		}
		dst := filepath.Join(dstDir, cleanName)

		if err := os.WriteFile(dst, []byte(content), 0o644); err != nil {
			results = append(results, Result{FileName: cleanName, NoteDir: item.NoteDir, Success: false, Error: "write file failed"})
			continue
		}

		info, statErr := os.Stat(dst)
		if statErr == nil {
			noteKey := makeNoteKey(noteDir, cleanName)
			mtimeMs := info.ModTime().UnixMilli()
			sizeBytes := info.Size()
			hashHex := sha256Hex(content)
			_, _ = h.writeNoteUpsertEvent(uid, deviceID, storageScope, noteKey, mtimeMs, sizeBytes, hashHex)
		}

		rel := strings.TrimPrefix(dst, ".")
		rel = strings.TrimPrefix(rel, string(filepath.Separator))
		results = append(results, Result{FileName: cleanName, NoteDir: noteDir, RelativePath: rel, Success: true})
	}

	c.JSON(http.StatusOK, models.SuccessResponse("Batch notes pushed", gin.H{
		"results":     results,
		"user_id":     uid,
		"username":    userKey,
		"in_data_dir": len(req.Items) > 0 && req.Items[0].UseData,
	}))
}

func (h *NotesHandler) ListNotes(c *gin.Context) {
	uidRaw, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}
	uid := uidRaw.(uint)
	uname := ""
	if v, ok := c.Get("username"); ok {
		uname = strings.TrimSpace(v.(string))
	}

	noteDirRaw := c.DefaultQuery("note_dir", "")
	useData := strings.EqualFold(c.DefaultQuery("use_data", "false"), "true")

	cfg, _ := config.Load()
	base := cfg.Upload.UploadPath
	if useData {
		base = filepath.Join(".", "data", "uploads")
	}

	userKey := cleanFileName(uname)
	if userKey == "" {
		userKey = strconv.FormatUint(uint64(uid), 10)
	}
	userLayer := filepath.Join(base, "users", userKey)

	noteDir := cleanRelPath(noteDirRaw)
	root := userLayer
	if noteDir != "" {
		root = filepath.Join(root, noteDir)
	}

	type NoteItemMeta struct {
		Path      string `json:"path"`
		MtimeMs   int64  `json:"mtime_ms"`
		SizeBytes int64  `json:"size_bytes"`
	}

	if _, err := os.Stat(root); err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusOK, models.SuccessResponse("Notes listed", gin.H{
				"items":       []string{},
				"items_meta":  []NoteItemMeta{},
				"count":       0,
				"user_id":     uid,
				"username":    userKey,
				"note_dir":    noteDir,
				"in_data_dir": useData,
			}))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("List failed"))
		return
	}

	itemsMeta := []NoteItemMeta{}
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			return nil
		}
		if !strings.EqualFold(filepath.Ext(d.Name()), ".md") {
			return nil
		}

		rel := strings.TrimPrefix(path, ".")
		rel = strings.TrimPrefix(rel, string(filepath.Separator))

		info, infoErr := d.Info()
		if infoErr != nil {
			itemsMeta = append(itemsMeta, NoteItemMeta{Path: rel})
			return nil
		}
		itemsMeta = append(itemsMeta, NoteItemMeta{
			Path:      rel,
			MtimeMs:   info.ModTime().UnixMilli(),
			SizeBytes: info.Size(),
		})
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("List failed"))
		return
	}

	sort.Slice(itemsMeta, func(i, j int) bool {
		if itemsMeta[i].MtimeMs == itemsMeta[j].MtimeMs {
			return itemsMeta[i].Path < itemsMeta[j].Path
		}
		return itemsMeta[i].MtimeMs > itemsMeta[j].MtimeMs
	})

	paths := make([]string, 0, len(itemsMeta))
	for _, it := range itemsMeta {
		paths = append(paths, it.Path)
	}

	c.JSON(http.StatusOK, models.SuccessResponse("Notes listed", gin.H{
		"items":       paths,
		"items_meta":  itemsMeta,
		"count":       len(paths),
		"user_id":     uid,
		"username":    userKey,
		"note_dir":    noteDir,
		"in_data_dir": useData,
	}))
}

func (h *NotesHandler) GetNote(c *gin.Context) {
	uidRaw, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}
	uid := uidRaw.(uint)
	uname := ""
	if v, ok := c.Get("username"); ok {
		uname = strings.TrimSpace(v.(string))
	}

	noteDirRaw := c.DefaultQuery("note_dir", "")
	fileNameRaw := c.DefaultQuery("filename", "")
	useData := strings.EqualFold(c.DefaultQuery("use_data", "false"), "true")

	if strings.TrimSpace(fileNameRaw) == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Filename is required"))
		return
	}

	cfg, _ := config.Load()
	base := cfg.Upload.UploadPath
	if useData {
		base = filepath.Join(".", "data", "uploads")
	}

	userKey := cleanFileName(uname)
	if userKey == "" {
		userKey = strconv.FormatUint(uint64(uid), 10)
	}
	userLayer := filepath.Join(base, "users", userKey)

	noteDir := cleanRelPath(noteDirRaw)
	cleanName := cleanFileName(fileNameRaw)
	if filepath.Ext(cleanName) == "" {
		cleanName = cleanName + ".md"
	}

	dstDir := userLayer
	if noteDir != "" {
		dstDir = filepath.Join(dstDir, noteDir)
	}
	target := filepath.Join(dstDir, cleanName)

	b, err := os.ReadFile(target)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse("Note not found"))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse("Note retrieved", gin.H{
		"filename":    cleanName,
		"note_dir":    noteDir,
		"content":     string(b),
		"in_data_dir": useData,
		"user_id":     uid,
		"username":    userKey,
	}))
}

type NoteChangeItem struct {
	Token       uint   `json:"token"`
	EventType   string `json:"event_type"`
	NoteKey     string `json:"note_key"`
	MtimeMs     int64  `json:"mtime_ms"`
	SizeBytes   int64  `json:"size_bytes"`
	ContentHash string `json:"content_hash"`
}

func (h *NotesHandler) GetChanges(c *gin.Context) {
	uidRaw, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}
	uid := uidRaw.(uint)
	uname := ""
	if v, ok := c.Get("username"); ok {
		uname = strings.TrimSpace(v.(string))
	}

	useData := strings.EqualFold(c.DefaultQuery("use_data", "false"), "true")
	scope := scopeFromUseData(useData)

	sinceU64, _ := strconv.ParseUint(c.DefaultQuery("since", "0"), 10, 64)
	since := uint(sinceU64)
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "200"))
	if limit < 1 || limit > 2000 {
		limit = 200
	}

	h.ensureBaselineNoteItems(uid, uname, useData, scope)

	var maxToken uint
	_ = h.db.Model(&models.NoteEvent{}).
		Where("user_id = ? AND storage_scope = ?", uid, scope).
		Select("COALESCE(MAX(id), 0)").Scan(&maxToken).Error

	var events []models.NoteEvent
	if err := h.db.
		Where("user_id = ? AND storage_scope = ? AND id > ?", uid, scope, since).
		Order("id ASC").
		Limit(limit).
		Find(&events).Error; err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Get changes failed"))
		return
	}

	items := make([]NoteChangeItem, 0, len(events))
	var nextToken uint = since
	for _, ev := range events {
		nextToken = ev.ID
		items = append(items, NoteChangeItem{
			Token:       ev.ID,
			EventType:   ev.EventType,
			NoteKey:     ev.NoteKey,
			MtimeMs:     ev.MtimeMs,
			SizeBytes:   ev.SizeBytes,
			ContentHash: ev.ContentHash,
		})
	}

	c.JSON(http.StatusOK, models.SuccessResponse("Note changes", gin.H{
		"items":      items,
		"since":      since,
		"next_token": nextToken,
		"max_token":  maxToken,
		"has_more":   nextToken < maxToken,
	}))
}

type AckChangesRequest struct {
	LastToken uint `json:"last_token"`
	UseData   bool `json:"use_data"`
}

func (h *NotesHandler) AckChanges(c *gin.Context) {
	uidRaw, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return
	}
	uid := uidRaw.(uint)
	deviceID := ""
	if v, ok := c.Get("device_id"); ok {
		deviceID = strings.TrimSpace(v.(string))
	}
	if deviceID == "" {
		deviceID = "unknown"
	}

	var req AckChangesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid request parameters"))
		return
	}
	scope := scopeFromUseData(req.UseData)

	now := time.Now()
	cursor := models.NoteDeviceCursor{}
	err := h.db.Where("user_id = ? AND device_id = ? AND storage_scope = ?", uid, deviceID, scope).First(&cursor).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Ack failed"))
		return
	}

	if errors.Is(err, gorm.ErrRecordNotFound) {
		cursor = models.NoteDeviceCursor{
			UserID:       uid,
			DeviceID:     deviceID,
			StorageScope: scope,
			LastToken:    req.LastToken,
			LastPullAt:   &now,
		}
		if err := h.db.Create(&cursor).Error; err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse("Ack failed"))
			return
		}
	} else {
		updates := map[string]interface{}{
			"last_pull_at": &now,
		}
		if req.LastToken > cursor.LastToken {
			updates["last_token"] = req.LastToken
		}
		if err := h.db.Model(&models.NoteDeviceCursor{}).Where("id = ?", cursor.ID).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse("Ack failed"))
			return
		}
	}

	c.JSON(http.StatusOK, models.SuccessResponse("Ack ok", gin.H{
		"last_token": req.LastToken,
		"device_id":  deviceID,
		"scope":      scope,
	}))
}

func cleanRelPath(p string) string {
	if p == "" {
		return ""
	}
	p = strings.ReplaceAll(p, "\\", "/")
	parts := strings.Split(p, "/")
	var cleaned []string
	for _, seg := range parts {
		seg = strings.TrimSpace(seg)
		if seg == "" || seg == "." || seg == ".." {
			continue
		}
		seg = cleanFileName(seg)
		if seg != "" {
			cleaned = append(cleaned, seg)
		}
	}
	if len(cleaned) == 0 {
		return ""
	}
	return filepath.Join(cleaned...)
}

func cleanFileName(s string) string {
	r := strings.NewReplacer("<", "", ">", "", ":", "", "\"", "", "/", "", "\\", "", "|", "", "?", "", "*", "", "\n", "", "\r", "", "\t", "")
	s = r.Replace(s)
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, " ", "_")
	return s
}

func scopeFromUseData(useData bool) string {
	if useData {
		return "data"
	}
	return "uploads"
}

func makeNoteKey(noteDir string, fileName string) string {
	dir := strings.ReplaceAll(strings.TrimSpace(noteDir), "\\", "/")
	dir = strings.Trim(dir, "/")
	name := strings.ReplaceAll(strings.TrimSpace(fileName), "\\", "/")
	name = strings.TrimLeft(name, "/")
	if dir == "" {
		return name
	}
	return dir + "/" + name
}

func sha256Hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

func (h *NotesHandler) writeNoteUpsertEvent(userID uint, deviceID string, scope string, noteKey string, mtimeMs int64, sizeBytes int64, contentHash string) (uint, error) {
	returnToken := uint(0)
	err := h.db.Transaction(func(tx *gorm.DB) error {
		var item models.NoteItem
		findErr := tx.Where("user_id = ? AND storage_scope = ? AND note_key = ?", userID, scope, noteKey).First(&item).Error
		if findErr != nil && !errors.Is(findErr, gorm.ErrRecordNotFound) {
			return findErr
		}
		if errors.Is(findErr, gorm.ErrRecordNotFound) {
			item = models.NoteItem{
				UserID:       userID,
				StorageScope: scope,
				NoteKey:      noteKey,
			}
		}
		item.MtimeMs = mtimeMs
		item.SizeBytes = sizeBytes
		item.ContentHash = contentHash
		item.IsDeleted = false
		if err := tx.Save(&item).Error; err != nil {
			return err
		}

		ev := models.NoteEvent{
			UserID:       userID,
			StorageScope: scope,
			NoteKey:      noteKey,
			EventType:    "upsert",
			MtimeMs:      mtimeMs,
			SizeBytes:    sizeBytes,
			ContentHash:  contentHash,
		}
		if err := tx.Create(&ev).Error; err != nil {
			return err
		}
		returnToken = ev.ID

		if strings.TrimSpace(deviceID) != "" {
			now := time.Now()
			cur := models.NoteDeviceCursor{}
			curErr := tx.Where("user_id = ? AND device_id = ? AND storage_scope = ?", userID, deviceID, scope).First(&cur).Error
			if curErr == nil {
				updates := map[string]interface{}{"last_push_at": &now}
				if returnToken > cur.LastToken {
					updates["last_token"] = returnToken
				}
				_ = tx.Model(&models.NoteDeviceCursor{}).Where("id = ?", cur.ID).Updates(updates).Error
			} else if errors.Is(curErr, gorm.ErrRecordNotFound) {
				_ = tx.Create(&models.NoteDeviceCursor{
					UserID:       userID,
					DeviceID:     deviceID,
					StorageScope: scope,
					LastToken:    returnToken,
					LastPushAt:   &now,
				}).Error
			}
		}

		return nil
	})
	return returnToken, err
}

func (h *NotesHandler) ensureBaselineNoteItems(userID uint, username string, useData bool, scope string) {
	var cnt int64
	if err := h.db.Model(&models.NoteItem{}).Where("user_id = ? AND storage_scope = ?", userID, scope).Count(&cnt).Error; err == nil && cnt > 0 {
		return
	}

	cfg, _ := config.Load()
	base := cfg.Upload.UploadPath
	if useData {
		base = filepath.Join(".", "data", "uploads")
	}
	userKey := cleanFileName(username)
	if userKey == "" {
		userKey = strconv.FormatUint(uint64(userID), 10)
	}
	userLayer := filepath.Join(base, "users", userKey)

	type meta struct {
		noteKey   string
		mtimeMs   int64
		sizeBytes int64
	}
	collected := make([]meta, 0, 256)
	_ = filepath.WalkDir(userLayer, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			return nil
		}
		if !strings.EqualFold(filepath.Ext(d.Name()), ".md") {
			return nil
		}
		info, infoErr := d.Info()
		if infoErr != nil {
			return nil
		}
		rel, relErr := filepath.Rel(userLayer, p)
		if relErr != nil {
			return nil
		}
		rel = strings.ReplaceAll(rel, "\\", "/")
		rel = strings.TrimLeft(rel, "/")
		if rel == "" {
			return nil
		}
		collected = append(collected, meta{noteKey: rel, mtimeMs: info.ModTime().UnixMilli(), sizeBytes: info.Size()})
		return nil
	})

	if len(collected) == 0 {
		return
	}

	chunk := 200
	_ = h.db.Transaction(func(tx *gorm.DB) error {
		for i := 0; i < len(collected); i += chunk {
			end := i + chunk
			if end > len(collected) {
				end = len(collected)
			}
			rows := make([]models.NoteItem, 0, end-i)
			for _, it := range collected[i:end] {
				rows = append(rows, models.NoteItem{
					UserID:       userID,
					StorageScope: scope,
					NoteKey:      it.noteKey,
					MtimeMs:      it.mtimeMs,
					SizeBytes:    it.sizeBytes,
					ContentHash:  "",
					IsDeleted:    false,
				})
			}
			_ = tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&rows).Error
		}
		return nil
	})
}
