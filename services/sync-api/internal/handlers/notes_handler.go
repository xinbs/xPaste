package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

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

	paths := []string{}
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			return nil
		}
		lower := strings.ToLower(filepath.Ext(d.Name()))
		if lower == ".md" {
			rel := strings.TrimPrefix(path, ".")
			rel = strings.TrimPrefix(rel, string(filepath.Separator))
			paths = append(paths, rel)
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse("List failed"))
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse("Notes listed", gin.H{
		"items":       paths,
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
        "filename":      cleanName,
        "note_dir":      noteDir,
        "content":       string(b),
        "in_data_dir":   useData,
        "user_id":       uid,
        "username":      userKey,
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
