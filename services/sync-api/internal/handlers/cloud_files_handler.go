package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"xpaste-sync/internal/config"
	"xpaste-sync/internal/models"
)

type CloudFilesHandler struct {
	db *gorm.DB
}

func NewCloudFilesHandler(db *gorm.DB) *CloudFilesHandler {
	return &CloudFilesHandler{db: db}
}

func (h *CloudFilesHandler) RegisterRoutes(router *gin.RouterGroup) {
	g := router.Group("/cloud-files")
	{
		g.GET("/tree", h.Tree)
		g.GET("/meta", h.Meta)
		g.GET("/file", h.DownloadFile)
		g.PUT("/text", h.WriteText)
		g.POST("/upload", h.Upload)
		g.PATCH("/rename", h.Rename)
		g.DELETE("/file", h.Delete)

		g.GET("/trash", h.ListTrash)
		g.POST("/trash/restore", h.RestoreTrash)
		g.DELETE("/trash/item", h.DeleteTrashItem)
	}
}

const (
	cloudFilesTrashDirName   = ".xpaste-trash"
	cloudFilesBackupsDirName = ".xpaste-backups"
)

type cloudFilesTreeItem struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	IsDir     bool   `json:"is_dir"`
	SizeBytes int64  `json:"size_bytes,omitempty"`
	MtimeMs   int64  `json:"mtime_ms,omitempty"`
}

type cloudFilesMeta struct {
	Path       string `json:"path"`
	IsDir      bool   `json:"is_dir"`
	SizeBytes  int64  `json:"size_bytes,omitempty"`
	MtimeMs    int64  `json:"mtime_ms,omitempty"`
	Sha256     string `json:"sha256,omitempty"`
	BackupPath string `json:"backup_path,omitempty"`
}

type cloudFilesWriteTextRequest struct {
	Path        string `json:"path" binding:"required"`
	Content     string `json:"content"`
	IfMatchHash string `json:"if_match_hash"`
	Mode        string `json:"mode"`
	UseData     bool   `json:"use_data"`
}

type cloudFilesRenameRequest struct {
	FromPath string `json:"from_path" binding:"required"`
	ToPath   string `json:"to_path" binding:"required"`
	Mode     string `json:"mode"`
	UseData  bool   `json:"use_data"`
}

type cloudFilesTrashMeta struct {
	TrashID      string `json:"trash_id"`
	OriginalPath string `json:"original_path"`
	DeletedAtMs  int64  `json:"deleted_at_ms"`
	IsDir        bool   `json:"is_dir"`
	SizeBytes    int64  `json:"size_bytes,omitempty"`
	MtimeMs      int64  `json:"mtime_ms,omitempty"`
}

type cloudFilesRestoreTrashRequest struct {
	TrashID string `json:"trash_id" binding:"required"`
	Mode    string `json:"mode"`
	UseData bool   `json:"use_data"`
}

func (h *CloudFilesHandler) Tree(c *gin.Context) {
	root, _, err := h.getUserRoot(c, parseUseDataQuery(c))
	if err != nil {
		return
	}

	rel := cleanRelPath(c.DefaultQuery("path", ""))
	if rel != "" && isReservedUserRelPath(rel) {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid path"))
		return
	}

	target := root
	if rel != "" {
		target = filepath.Join(root, rel)
	}

	info, err := os.Stat(target)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			c.JSON(http.StatusNotFound, models.ErrorResponse("Not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Stat failed"))
		return
	}
	if !info.IsDir() {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Path is not a directory"))
		return
	}

	recursive := strings.EqualFold(c.DefaultQuery("recursive", "0"), "1") || strings.EqualFold(c.DefaultQuery("recursive", "false"), "true")
	items := make([]cloudFilesTreeItem, 0)

	if recursive {
		err = filepath.WalkDir(target, func(p string, d os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if p == target {
				return nil
			}

			relPath, relErr := filepath.Rel(root, p)
			if relErr != nil {
				return relErr
			}
			relPath = strings.ReplaceAll(relPath, "\\", "/")
			relPath = strings.TrimLeft(relPath, "/")
			if relPath == "" {
				return nil
			}
			if isReservedUserRelPath(relPath) {
				if d.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}

			name := d.Name()
			if name == cloudFilesTrashDirName || name == cloudFilesBackupsDirName {
				if d.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}

			it := cloudFilesTreeItem{
				Name:  name,
				Path:  relPath,
				IsDir: d.IsDir(),
			}
			if fi, fiErr := d.Info(); fiErr == nil {
				it.MtimeMs = fi.ModTime().UnixMilli()
				if !d.IsDir() {
					it.SizeBytes = fi.Size()
				}
			}
			items = append(items, it)
			return nil
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("List failed", err.Error()))
			return
		}
	} else {
		entries, err := os.ReadDir(target)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse("List failed"))
			return
		}
		for _, e := range entries {
			name := e.Name()
			if name == cloudFilesTrashDirName || name == cloudFilesBackupsDirName {
				continue
			}

			childAbs := filepath.Join(target, name)
			childRel, _ := filepath.Rel(root, childAbs)
			childRel = strings.ReplaceAll(childRel, "\\", "/")
			childRel = strings.TrimLeft(childRel, "/")
			if childRel == "" || isReservedUserRelPath(childRel) {
				continue
			}

			it := cloudFilesTreeItem{
				Name:  name,
				Path:  childRel,
				IsDir: e.IsDir(),
			}
			if fi, fiErr := e.Info(); fiErr == nil {
				it.MtimeMs = fi.ModTime().UnixMilli()
				if !e.IsDir() {
					it.SizeBytes = fi.Size()
				}
			}
			items = append(items, it)
		}
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Tree ok", gin.H{
		"path":      strings.ReplaceAll(rel, "\\", "/"),
		"recursive": recursive,
		"items":     items,
	}))
}

func (h *CloudFilesHandler) Meta(c *gin.Context) {
	root, _, err := h.getUserRoot(c, parseUseDataQuery(c))
	if err != nil {
		return
	}

	rel := cleanRelPath(c.DefaultQuery("path", ""))
	if rel == "" || isReservedUserRelPath(rel) {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid path"))
		return
	}
	abs := filepath.Join(root, rel)

	meta, code, err := getCloudFileMeta(abs, rel)
	if err != nil {
		c.JSON(code, models.ErrorResponseWithMessage("Meta failed", err.Error()))
		return
	}
	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Meta ok", meta))
}

func (h *CloudFilesHandler) DownloadFile(c *gin.Context) {
	root, _, err := h.getUserRoot(c, parseUseDataQuery(c))
	if err != nil {
		return
	}

	rel := cleanRelPath(c.DefaultQuery("path", ""))
	if rel == "" || isReservedUserRelPath(rel) {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid path"))
		return
	}
	abs := filepath.Join(root, rel)

	fi, err := os.Stat(abs)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			c.JSON(http.StatusNotFound, models.ErrorResponse("Not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Stat failed"))
		return
	}
	if fi.IsDir() {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Path is a directory"))
		return
	}

	c.Header("X-File-Path", strings.ReplaceAll(rel, "\\", "/"))
	c.Header("X-File-Size", strconv.FormatInt(fi.Size(), 10))
	c.Header("X-File-Mtime-Ms", strconv.FormatInt(fi.ModTime().UnixMilli(), 10))
	c.File(abs)
}

func (h *CloudFilesHandler) WriteText(c *gin.Context) {
	var req cloudFilesWriteTextRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponseWithMessage("Invalid request parameters", err.Error()))
		return
	}

	root, _, err := h.getUserRoot(c, req.UseData || parseUseDataQuery(c))
	if err != nil {
		return
	}

	rel := cleanRelPath(req.Path)
	if rel == "" || isReservedUserRelPath(rel) {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid path"))
		return
	}
	abs := filepath.Join(root, rel)

	mode := normalizeMode(req.Mode)
	if err := ensureParentDir(abs); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Create dir failed", err.Error()))
		return
	}

	var backupPath string
	if exists, _ := pathExists(abs); exists {
		if mode == "force" {
			bp, err := h.backupExisting(root, rel, abs, "overwrite")
			if err != nil {
				c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Backup failed", err.Error()))
				return
			}
			backupPath = bp
		} else {
			remoteHash, hashErr := sha256File(abs)
			if hashErr != nil {
				c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Hash failed", hashErr.Error()))
				return
			}
			if strings.TrimSpace(req.IfMatchHash) == "" || !strings.EqualFold(strings.TrimSpace(req.IfMatchHash), remoteHash) {
				writeCloudFilesConflict(c, rel, abs, remoteHash)
				return
			}
		}
	}

	if err := os.WriteFile(abs, []byte(req.Content), 0o644); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Write failed", err.Error()))
		return
	}

	meta, code, err := getCloudFileMeta(abs, rel)
	if err != nil {
		c.JSON(code, models.ErrorResponseWithMessage("Meta failed", err.Error()))
		return
	}
	if backupPath != "" {
		meta.BackupPath = backupPath
	}
	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Write ok", meta))
}

func (h *CloudFilesHandler) Upload(c *gin.Context) {
	root, _, err := h.getUserRoot(c, parseUseDataQuery(c))
	if err != nil {
		return
	}

	rel := cleanRelPath(c.DefaultQuery("path", ""))
	if rel == "" || isReservedUserRelPath(rel) {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid path"))
		return
	}
	abs := filepath.Join(root, rel)

	cfg, _ := config.Load()
	maxSize := cfg.Upload.MaxFileSize
	if err := c.Request.ParseMultipartForm(maxSize); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponseWithMessage("Invalid multipart form", err.Error()))
		return
	}

	file, _, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("File is required"))
		return
	}
	defer file.Close()

	mode := normalizeMode(c.DefaultQuery("mode", ""))
	ifMatchHash := strings.TrimSpace(c.DefaultQuery("if_match_hash", ""))

	if err := ensureParentDir(abs); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Create dir failed", err.Error()))
		return
	}

	var backupPath string
	if exists, _ := pathExists(abs); exists {
		if mode == "force" {
			bp, err := h.backupExisting(root, rel, abs, "overwrite")
			if err != nil {
				c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Backup failed", err.Error()))
				return
			}
			backupPath = bp
		} else {
			remoteHash, hashErr := sha256File(abs)
			if hashErr != nil {
				c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Hash failed", hashErr.Error()))
				return
			}
			if ifMatchHash == "" || !strings.EqualFold(ifMatchHash, remoteHash) {
				writeCloudFilesConflict(c, rel, abs, remoteHash)
				return
			}
		}
	}

	out, err := os.Create(abs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Create file failed", err.Error()))
		return
	}
	defer out.Close()

	hasher := sha256.New()
	w := io.MultiWriter(out, hasher)
	size, err := io.Copy(w, file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Write failed", err.Error()))
		return
	}
	sum := hex.EncodeToString(hasher.Sum(nil))

	fi, statErr := os.Stat(abs)
	if statErr == nil {
		c.Header("X-File-Size", strconv.FormatInt(fi.Size(), 10))
		c.Header("X-File-Mtime-Ms", strconv.FormatInt(fi.ModTime().UnixMilli(), 10))
	}

	resp := gin.H{
		"path":       strings.ReplaceAll(rel, "\\", "/"),
		"size_bytes": size,
		"sha256":     sum,
	}
	if backupPath != "" {
		resp["backup_path"] = backupPath
	}
	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Upload ok", resp))
}

func (h *CloudFilesHandler) Rename(c *gin.Context) {
	var req cloudFilesRenameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponseWithMessage("Invalid request parameters", err.Error()))
		return
	}

	root, _, err := h.getUserRoot(c, req.UseData || parseUseDataQuery(c))
	if err != nil {
		return
	}

	fromRel := cleanRelPath(req.FromPath)
	toRel := cleanRelPath(req.ToPath)
	if fromRel == "" || toRel == "" || isReservedUserRelPath(fromRel) || isReservedUserRelPath(toRel) {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid path"))
		return
	}

	fromAbs := filepath.Join(root, fromRel)
	toAbs := filepath.Join(root, toRel)

	fromInfo, err := os.Stat(fromAbs)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			c.JSON(http.StatusNotFound, models.ErrorResponse("Not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Stat failed"))
		return
	}

	mode := normalizeMode(req.Mode)
	var backupPath string
	if exists, _ := pathExists(toAbs); exists {
		if mode != "force" {
			writeCloudFilesConflictAuto(c, toRel, toAbs)
			return
		}

		if fromInfo.IsDir() {
			c.JSON(http.StatusBadRequest, models.ErrorResponse("Force rename directory is not supported"))
			return
		}

		bp, err := h.backupExisting(root, toRel, toAbs, "rename")
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Backup failed", err.Error()))
			return
		}
		backupPath = bp
	}

	if err := ensureParentDir(toAbs); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Create dir failed", err.Error()))
		return
	}

	if err := moveOrCopyPath(fromAbs, toAbs, fromInfo.IsDir()); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Rename failed", err.Error()))
		return
	}

	resp := gin.H{
		"from_path": strings.ReplaceAll(fromRel, "\\", "/"),
		"to_path":   strings.ReplaceAll(toRel, "\\", "/"),
	}
	if backupPath != "" {
		resp["backup_path"] = backupPath
	}
	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Rename ok", resp))
}

func (h *CloudFilesHandler) Delete(c *gin.Context) {
	root, _, err := h.getUserRoot(c, parseUseDataQuery(c))
	if err != nil {
		return
	}

	rel := cleanRelPath(c.DefaultQuery("path", ""))
	if rel == "" || isReservedUserRelPath(rel) {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid path"))
		return
	}

	abs := filepath.Join(root, rel)
	fi, err := os.Stat(abs)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			c.JSON(http.StatusNotFound, models.ErrorResponse("Not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Stat failed"))
		return
	}

	trash := !strings.EqualFold(c.DefaultQuery("trash", "1"), "0")
	if !trash {
		if err := os.RemoveAll(abs); err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Delete failed", err.Error()))
			return
		}
		c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Delete ok", gin.H{"path": strings.ReplaceAll(rel, "\\", "/")}))
		return
	}

	trashID, err := newTrashID()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Trash id failed", err.Error()))
		return
	}

	itemDir := filepath.Join(root, cloudFilesTrashDirName, "items", trashID)
	if err := os.MkdirAll(itemDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Create dir failed", err.Error()))
		return
	}

	payloadName := "payload"
	payloadAbs := filepath.Join(itemDir, payloadName)
	if err := moveOrCopyPath(abs, payloadAbs, fi.IsDir()); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Move failed", err.Error()))
		return
	}

	meta := cloudFilesTrashMeta{
		TrashID:      trashID,
		OriginalPath: strings.ReplaceAll(rel, "\\", "/"),
		DeletedAtMs:  time.Now().UnixMilli(),
		IsDir:        fi.IsDir(),
		MtimeMs:      fi.ModTime().UnixMilli(),
	}
	if !fi.IsDir() {
		meta.SizeBytes = fi.Size()
	}
	raw, _ := json.Marshal(meta)
	if err := os.WriteFile(filepath.Join(itemDir, "meta.json"), raw, 0o644); err != nil {
		_ = os.Rename(payloadAbs, abs)
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Write meta failed", err.Error()))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Trash ok", meta))
}

func (h *CloudFilesHandler) ListTrash(c *gin.Context) {
	root, _, err := h.getUserRoot(c, parseUseDataQuery(c))
	if err != nil {
		return
	}

	itemsRoot := filepath.Join(root, cloudFilesTrashDirName, "items")
	if _, err := os.Stat(itemsRoot); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Trash ok", gin.H{"items": []cloudFilesTrashMeta{}}))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Stat failed"))
		return
	}

	entries, err := os.ReadDir(itemsRoot)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("List failed", err.Error()))
		return
	}

	items := make([]cloudFilesTrashMeta, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		metaAbs := filepath.Join(itemsRoot, e.Name(), "meta.json")
		raw, err := os.ReadFile(metaAbs)
		if err != nil {
			continue
		}
		var meta cloudFilesTrashMeta
		if err := json.Unmarshal(raw, &meta); err != nil {
			continue
		}
		if strings.TrimSpace(meta.TrashID) == "" {
			meta.TrashID = e.Name()
		}
		items = append(items, meta)
	}

	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Trash ok", gin.H{"items": items}))
}

func (h *CloudFilesHandler) RestoreTrash(c *gin.Context) {
	var req cloudFilesRestoreTrashRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponseWithMessage("Invalid request parameters", err.Error()))
		return
	}
	root, _, err := h.getUserRoot(c, req.UseData || parseUseDataQuery(c))
	if err != nil {
		return
	}

	trashID := cleanFileName(strings.TrimSpace(req.TrashID))
	if trashID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid trash_id"))
		return
	}

	itemDir := filepath.Join(root, cloudFilesTrashDirName, "items", trashID)
	raw, err := os.ReadFile(filepath.Join(itemDir, "meta.json"))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			c.JSON(http.StatusNotFound, models.ErrorResponse("Not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Read meta failed", err.Error()))
		return
	}

	var meta cloudFilesTrashMeta
	if err := json.Unmarshal(raw, &meta); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Parse meta failed", err.Error()))
		return
	}

	origRel := cleanRelPath(meta.OriginalPath)
	if origRel == "" || isReservedUserRelPath(origRel) {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid original path"))
		return
	}

	payloadAbs := filepath.Join(itemDir, "payload")
	targetAbs := filepath.Join(root, origRel)

	mode := normalizeMode(req.Mode)
	var backupPath string
	if exists, _ := pathExists(targetAbs); exists {
		if mode != "force" {
			writeCloudFilesConflictAuto(c, origRel, targetAbs)
			return
		}
		bp, err := h.backupExisting(root, origRel, targetAbs, "restore")
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Backup failed", err.Error()))
			return
		}
		backupPath = bp
	}

	if err := ensureParentDir(targetAbs); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Create dir failed", err.Error()))
		return
	}

	if err := moveOrCopyPath(payloadAbs, targetAbs, meta.IsDir); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Restore failed", err.Error()))
		return
	}

	_ = os.RemoveAll(itemDir)
	resp := gin.H{
		"trash_id":       trashID,
		"original_path":  strings.ReplaceAll(origRel, "\\", "/"),
		"restored_at_ms": time.Now().UnixMilli(),
	}
	if backupPath != "" {
		resp["backup_path"] = backupPath
	}
	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Restore ok", resp))
}

func (h *CloudFilesHandler) DeleteTrashItem(c *gin.Context) {
	root, _, err := h.getUserRoot(c, parseUseDataQuery(c))
	if err != nil {
		return
	}

	trashID := cleanFileName(strings.TrimSpace(c.DefaultQuery("trash_id", "")))
	if trashID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("trash_id is required"))
		return
	}

	itemDir := filepath.Join(root, cloudFilesTrashDirName, "items", trashID)
	if err := os.RemoveAll(itemDir); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Delete failed", err.Error()))
		return
	}
	c.JSON(http.StatusOK, models.SuccessResponseWithMessage("Delete ok", gin.H{"trash_id": trashID}))
}

func parseUseDataQuery(c *gin.Context) bool {
	dirOpt := strings.ToLower(strings.TrimSpace(c.DefaultQuery("dir", "")))
	useData := strings.EqualFold(c.DefaultQuery("use_data", "false"), "true")
	return useData || dirOpt == "data"
}

func (h *CloudFilesHandler) getUserRoot(c *gin.Context, useData bool) (string, string, error) {
	uidRaw, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse("Unauthorized"))
		return "", "", errors.New("unauthorized")
	}
	uid := uidRaw.(uint)
	uname := ""
	if v, ok := c.Get("username"); ok {
		uname = strings.TrimSpace(v.(string))
	}

	cfg, _ := config.Load()
	base := cfg.Upload.UploadPath
	if useData {
		if st, err := os.Stat("/data"); err == nil && st.IsDir() {
			base = filepath.Join("/data", "uploads")
		} else {
			base = filepath.Join(".", "data", "uploads")
		}
	}

	userKey := cleanFileName(uname)
	if userKey == "" {
		userKey = strconv.FormatUint(uint64(uid), 10)
	}
	userLayer := filepath.Join(base, "users", userKey)
	if err := os.MkdirAll(userLayer, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Create dir failed", err.Error()))
		return "", "", err
	}

	if err := os.MkdirAll(filepath.Join(userLayer, cloudFilesTrashDirName, "items"), 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Create dir failed", err.Error()))
		return "", "", err
	}
	if err := os.MkdirAll(filepath.Join(userLayer, cloudFilesBackupsDirName), 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponseWithMessage("Create dir failed", err.Error()))
		return "", "", err
	}

	return userLayer, userKey, nil
}

func isReservedUserRelPath(rel string) bool {
	rel = strings.ReplaceAll(strings.TrimSpace(rel), "\\", "/")
	rel = strings.TrimLeft(rel, "/")
	if rel == "" {
		return false
	}
	parts := strings.Split(rel, "/")
	for _, seg := range parts {
		if seg == cloudFilesTrashDirName || seg == cloudFilesBackupsDirName {
			return true
		}
	}
	return false
}

func normalizeMode(mode string) string {
	mode = strings.ToLower(strings.TrimSpace(mode))
	if mode == "force" {
		return "force"
	}
	return "safe"
}

func ensureParentDir(p string) error {
	dir := filepath.Dir(p)
	return os.MkdirAll(dir, 0o755)
}

func pathExists(p string) (bool, error) {
	_, err := os.Stat(p)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return false, err
}

func sha256File(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func getCloudFileMeta(absPath string, relPath string) (*cloudFilesMeta, int, error) {
	fi, err := os.Stat(absPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, http.StatusNotFound, err
		}
		return nil, http.StatusInternalServerError, err
	}
	meta := &cloudFilesMeta{
		Path:    strings.ReplaceAll(relPath, "\\", "/"),
		IsDir:   fi.IsDir(),
		MtimeMs: fi.ModTime().UnixMilli(),
	}
	if !fi.IsDir() {
		meta.SizeBytes = fi.Size()
		sum, err := sha256File(absPath)
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		meta.Sha256 = sum
	}
	return meta, http.StatusOK, nil
}

func writeCloudFilesConflict(c *gin.Context, relPath string, absPath string, remoteHash string) {
	fi, _ := os.Stat(absPath)
	remote := gin.H{
		"path": strings.ReplaceAll(relPath, "\\", "/"),
	}
	if fi != nil {
		remote["mtime_ms"] = fi.ModTime().UnixMilli()
		remote["size_bytes"] = fi.Size()
	}
	if strings.TrimSpace(remoteHash) != "" {
		remote["sha256"] = remoteHash
	}
	c.JSON(http.StatusConflict, &models.Response{
		Success: false,
		Message: "Conflict",
		Data: gin.H{
			"path":   strings.ReplaceAll(relPath, "\\", "/"),
			"remote": remote,
		},
	})
}

func writeCloudFilesConflictAuto(c *gin.Context, relPath string, absPath string) {
	fi, err := os.Stat(absPath)
	if err != nil {
		c.JSON(http.StatusConflict, models.ErrorResponseWithMessage("Conflict", "Destination exists"))
		return
	}

	var remoteHash string
	if !fi.IsDir() {
		if h, err := sha256File(absPath); err == nil {
			remoteHash = h
		}
	}
	writeCloudFilesConflict(c, relPath, absPath, remoteHash)
}

func newTrashID() (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return strconv.FormatInt(time.Now().UnixMilli(), 10) + "-" + hex.EncodeToString(b), nil
}

func (h *CloudFilesHandler) backupExisting(root string, relPath string, absPath string, op string) (string, error) {
	relPath = cleanRelPath(relPath)
	if relPath == "" {
		return "", errors.New("invalid path")
	}
	if isReservedUserRelPath(relPath) {
		return "", errors.New("reserved path")
	}

	fi, err := os.Stat(absPath)
	if err != nil {
		return "", err
	}

	date := time.Now().Format("20060102")
	ts := strconv.FormatInt(time.Now().UnixMilli(), 10)
	dir := filepath.Dir(relPath)
	base := filepath.Base(relPath)
	if dir == "." {
		dir = ""
	}

	backupDir := filepath.Join(root, cloudFilesBackupsDirName, date, dir)
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		return "", err
	}

	dstName := base + "__" + ts + "__" + cleanFileName(op) + ".bak"
	dstAbs := filepath.Join(backupDir, dstName)

	if fi.IsDir() {
		if err := moveOrCopyPath(absPath, dstAbs, true); err != nil {
			return "", err
		}
		return filepath.ToSlash(filepath.Join(cloudFilesBackupsDirName, date, dir, dstName)), nil
	}

	if err := moveOrCopyFile(absPath, dstAbs); err != nil {
		return "", err
	}
	return filepath.ToSlash(filepath.Join(cloudFilesBackupsDirName, date, dir, dstName)), nil
}

func moveOrCopyFile(src string, dst string) error {
	if err := os.Rename(src, dst); err == nil {
		return nil
	}

	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	if err := out.Sync(); err != nil {
		return err
	}
	return os.Remove(src)
}

func isCrossDeviceRenameError(err error) bool {
	var linkErr *os.LinkError
	if errors.As(err, &linkErr) {
		return errors.Is(linkErr.Err, syscall.EXDEV)
	}
	return errors.Is(err, syscall.EXDEV)
}

func copyDirRecursive(src string, dst string) error {
	fi, err := os.Stat(src)
	if err != nil {
		return err
	}
	if !fi.IsDir() {
		return errors.New("source is not a directory")
	}

	if err := os.MkdirAll(dst, fi.Mode().Perm()); err != nil {
		return err
	}

	return filepath.WalkDir(src, func(p string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if p == src {
			return nil
		}

		rel, err := filepath.Rel(src, p)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)

		if d.Type()&os.ModeSymlink != 0 {
			return errors.New("symlink is not supported")
		}

		if d.IsDir() {
			if info, err := d.Info(); err == nil {
				return os.MkdirAll(target, info.Mode().Perm())
			}
			return os.MkdirAll(target, 0o755)
		}

		in, err := os.Open(p)
		if err != nil {
			return err
		}

		if err := ensureParentDir(target); err != nil {
			_ = in.Close()
			return err
		}

		out, err := os.Create(target)
		if err != nil {
			_ = in.Close()
			return err
		}

		if _, err := io.Copy(out, in); err != nil {
			_ = out.Close()
			_ = in.Close()
			return err
		}
		if err := out.Sync(); err != nil {
			_ = out.Close()
			_ = in.Close()
			return err
		}
		if err := out.Close(); err != nil {
			_ = in.Close()
			return err
		}
		_ = in.Close()

		if info, err := d.Info(); err == nil {
			_ = os.Chmod(target, info.Mode().Perm())
		}
		return nil
	})
}

func moveOrCopyPath(src string, dst string, isDir bool) error {
	if err := os.Rename(src, dst); err == nil {
		return nil
	} else if !isCrossDeviceRenameError(err) {
		return err
	}

	if isDir {
		if err := copyDirRecursive(src, dst); err != nil {
			return err
		}
		return os.RemoveAll(src)
	}

	return moveOrCopyFile(src, dst)
}
