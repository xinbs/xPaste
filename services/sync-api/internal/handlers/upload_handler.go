package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"

	"xpaste-sync/internal/config"
	"xpaste-sync/internal/logger"
	"xpaste-sync/internal/models"
)

type UploadHandler struct {
	db *gorm.DB
}

func NewUploadHandler(db *gorm.DB) *UploadHandler {
	return &UploadHandler{db: db}
}

func (h *UploadHandler) RegisterRoutes(router *gin.RouterGroup) {
	g := router.Group("/uploads")
	{
		g.POST("/file", h.UploadFile)
	}
}

func (h *UploadHandler) UploadFile(c *gin.Context) {
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

	cfg, _ := config.Load()
	maxSize := cfg.Upload.MaxFileSize

	if err := c.Request.ParseMultipartForm(maxSize); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("Invalid multipart form"))
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse("File is required"))
		return
	}
	defer file.Close()

	dirOpt := strings.ToLower(strings.TrimSpace(c.DefaultQuery("dir", "")))
	useData := strings.EqualFold(c.DefaultQuery("use_data", "false"), "true")
	subdir := strings.TrimSpace(c.DefaultQuery("subdir", "attachments"))
	if v := c.PostForm("subdir"); v != "" {
		subdir = v
	}
	rawNoteDir := c.DefaultQuery("note_dir", "")
	if v := c.PostForm("note_dir"); v != "" {
		rawNoteDir = v
	}
	rawPathRel := c.DefaultQuery("path_rel", "")
	if v := c.PostForm("path_rel"); v != "" {
		rawPathRel = v
	}
	nameParam := strings.TrimSpace(c.DefaultQuery("filename", ""))
	if v := strings.TrimSpace(c.PostForm("filename")); v != "" {
		nameParam = v
	}

	logger.WithFields(logrus.Fields{
		"uid":      uid,
		"username": uname,
		"note_dir": rawNoteDir,
		"path_rel": rawPathRel,
		"subdir":   subdir,
		"filename": nameParam,
		"use_data": useData || dirOpt == "data",
	}).Info("Upload attachment request")

	base := cfg.Upload.UploadPath
	if useData || dirOpt == "data" {
		base = filepath.Join(".", "data", "uploads")
	}

	noteDir := sanitizeRelPath(rawNoteDir)
	relDir := sanitizeRelPath(rawPathRel)

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext == "" {
		ext = ".bin"
	}

	hasher := sha256.New()
	if _, err := hasher.Write([]byte(header.Filename)); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Hash error"))
		return
	}
	ts := time.Now().Format("20060102-150405")
	var name string
	if nameParam != "" {
		clean := sanitizeFileName(nameParam)
		if filepath.Ext(clean) == "" {
			name = clean + ext
		} else {
			name = clean
		}
	} else {
		name = ts + ext
	}

	userKey := sanitizeFileName(uname)
	if userKey == "" {
		userKey = strconv.FormatUint(uint64(uid), 10)
	}
	userLayer := filepath.Join(base, "users", userKey)
	dstDir := userLayer
	if noteDir != "" {
		dstDir = filepath.Join(dstDir, noteDir)
	}
	if relDir != "" {
		dstDir = filepath.Join(dstDir, relDir)
	} else {
		dstDir = filepath.Join(dstDir, subdir)
	}
	if err := os.MkdirAll(dstDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Create dir failed"))
		return
	}
	dst := filepath.Join(dstDir, name)

	out, err := os.Create(dst)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("Create file failed"))
		return
	}
	defer out.Close()

	buf := make([]byte, 32*1024)
	var size int64
	for {
		n, rerr := file.Read(buf)
		if n > 0 {
			if _, werr := out.Write(buf[:n]); werr != nil {
				c.JSON(http.StatusInternalServerError, models.ErrorResponse("Write file failed"))
				return
			}
			hasher.Write(buf[:n])
			size += int64(n)
		}
		if rerr != nil {
			if rerr == io.EOF {
				break
			}
			c.JSON(http.StatusInternalServerError, models.ErrorResponse("Read file failed"))
			return
		}
	}

	sum := hex.EncodeToString(hasher.Sum(nil))
	rel := strings.TrimPrefix(dst, ".")
	rel = strings.TrimPrefix(rel, string(filepath.Separator))

	logger.WithFields(logrus.Fields{
		"relative_path": rel,
		"size":          size,
		"sha256":        sum,
	}).Info("Upload attachment success")

	c.JSON(http.StatusOK, models.SuccessResponse("Upload ok", gin.H{
		"file_name":     name,
		"size":          size,
		"sha256":        sum,
		"relative_path": rel,
		"in_data_dir":   useData || dirOpt == "data",
		"user_id":       uid,
		"username":      userKey,
	}))
}

func sanitizeRelPath(p string) string {
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
		seg = sanitizeFileName(seg)
		if seg != "" {
			cleaned = append(cleaned, seg)
		}
	}
	if len(cleaned) == 0 {
		return ""
	}
	return filepath.Join(cleaned...)
}

func sanitizeFileName(s string) string {
	r := strings.NewReplacer("<", "", ">", "", ":", "", "\"", "", "/", "", "\\", "", "|", "", "?", "", "*", "", "\n", "", "\r", "", "\t", "")
	s = r.Replace(s)
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, " ", "_")
	return s
}
