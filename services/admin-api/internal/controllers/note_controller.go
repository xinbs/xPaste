package controllers

import (
    "io"
    "net/http"
    "os"
    "path/filepath"
    "strconv"
    "strings"
    "log"

    "github.com/gin-gonic/gin"
)

type NoteController struct{}

func NewNoteController() *NoteController {
    return &NoteController{}
}

func (ctrl *NoteController) ListNotes(c *gin.Context) {
    username := strings.TrimSpace(c.DefaultQuery("username", ""))
    userIDStr := strings.TrimSpace(c.DefaultQuery("user_id", ""))
    noteDirRaw := c.DefaultQuery("note_dir", "")

    userKey := cleanFileName(username)
    if userKey == "" && userIDStr != "" {
        userKey = strconv.FormatUint(parseUintDefault(userIDStr), 10)
    }
    base := getUploadBase()
    noteDir := cleanRelPath(noteDirRaw)
    var root string
    if userKey != "" {
        root = filepath.Join(filepath.Join(base, "users", userKey), noteDir)
    } else {
        root = filepath.Join(filepath.Join(base, "users"), noteDir)
    }

    items := []string{}
    _ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
        if err != nil {
            return nil
        }
        if d.IsDir() {
            return nil
        }
        if strings.EqualFold(filepath.Ext(d.Name()), ".md") {
            rel, rerr := filepath.Rel(root, path)
            if rerr == nil {
                rel = strings.TrimPrefix(rel, string(filepath.Separator))
                items = append(items, rel)
            }
        }
        return nil
    })

    c.JSON(http.StatusOK, gin.H{
        "message": "获取成功",
        "data": gin.H{
            "items": items,
            "count": len(items),
            "username": userKey,
            "note_dir": noteDir,
        },
    })
}

func (ctrl *NoteController) GetNote(c *gin.Context) {
    username := strings.TrimSpace(c.DefaultQuery("username", ""))
    userIDStr := strings.TrimSpace(c.DefaultQuery("user_id", ""))
    noteDirRaw := c.DefaultQuery("note_dir", "")
    filenameRaw := c.DefaultQuery("filename", "")
    if strings.TrimSpace(filenameRaw) == "" {
        filenameRaw = strings.TrimSpace(c.Param("filename"))
    }

    if strings.TrimSpace(filenameRaw) == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "缺少文件名"})
        return
    }

    userKey := cleanFileName(username)
    if userKey == "" && userIDStr != "" {
        userKey = strconv.FormatUint(parseUintDefault(userIDStr), 10)
    }

    base := getUploadBase()
    noteDir := cleanRelPath(noteDirRaw)
    rel := strings.TrimSpace(filenameRaw)
    rel = strings.ReplaceAll(rel, "\\", "/")
    rel = strings.TrimPrefix(rel, "/")
    if rel == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "缺少文件名"})
        return
    }
    parts := strings.Split(rel, "/")
    var cleanedParts []string
    for _, seg := range parts {
        seg = strings.TrimSpace(seg)
        if seg == "" || seg == "." || seg == ".." {
            continue
        }
        cleaned := cleanFileName(seg)
        if cleaned != "" {
            cleanedParts = append(cleanedParts, cleaned)
        }
    }
    rel = filepath.Join(cleanedParts...)
    if filepath.Ext(filepath.Base(rel)) == "" {
        rel = rel + ".md"
    }
    var dst string
    if userKey != "" {
        dst = filepath.Join(filepath.Join(base, "users", userKey), noteDir)
    } else {
        dst = filepath.Join(filepath.Join(base, "users"), noteDir)
    }
    target := filepath.Join(dst, rel)

    log.Printf("notes:get user=%s note_dir=%s rel=%s target=%s", userKey, noteDir, rel, target)
    b, err := os.ReadFile(target)
    if err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "文件不存在"})
        return
    }

    c.JSON(http.StatusOK, gin.H{
        "message": "获取成功",
        "data": gin.H{
            "filename": rel,
            "note_dir": noteDir,
            "content": string(b),
            "username": userKey,
        },
    })
}

type SaveNoteRequest struct {
    Username string `json:"username"`
    UserID   uint   `json:"user_id"`
    NoteDir  string `json:"note_dir"`
    FileName string `json:"filename"` 
    Content  string `json:"content"`
}

func (ctrl *NoteController) SaveNote(c *gin.Context) {
    var req SaveNoteRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "请求参数错误"})
        return
    }
    content := strings.TrimSpace(req.Content)
    fileName := strings.TrimSpace(req.FileName)
    if content == "" || fileName == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "内容或文件名为空"})
        return
    }

    userKey := cleanFileName(req.Username)
    if userKey == "" && req.UserID != 0 {
        userKey = strconv.FormatUint(uint64(req.UserID), 10)
    }

    base := getUploadBase()
    noteDir := cleanRelPath(req.NoteDir)
    var dst string
    if userKey != "" {
        dst = filepath.Join(filepath.Join(base, "users", userKey), noteDir)
    } else {
        dst = filepath.Join(filepath.Join(base, "users"), noteDir)
    }
    rel := cleanRelPath(fileName)
    if rel == "" {
        rel = "note.md"
    }
    if filepath.Ext(filepath.Base(rel)) == "" {
        rel = rel + ".md"
    }
    target := filepath.Join(dst, rel)
    if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "目录创建失败"})
        return
    }
    log.Printf("notes:save user=%s note_dir=%s rel=%s target=%s size=%d", userKey, noteDir, rel, target, len(content))
    if err := os.WriteFile(target, []byte(content), 0o644); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "写入失败"})
        return
    }

    c.JSON(http.StatusOK, gin.H{
        "message": "保存成功",
        "data": gin.H{
            "filename": rel,
            "note_dir": noteDir,
            "username": userKey,
        },
    })
}

func (ctrl *NoteController) DeleteNote(c *gin.Context) {
    username := strings.TrimSpace(c.DefaultQuery("username", ""))
    userIDStr := strings.TrimSpace(c.DefaultQuery("user_id", ""))
    noteDirRaw := c.DefaultQuery("note_dir", "")
    filenameRaw := c.DefaultQuery("filename", "")
    if strings.TrimSpace(filenameRaw) == "" {
        filenameRaw = strings.TrimSpace(c.Param("filename"))
    }

    if strings.TrimSpace(filenameRaw) == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "缺少文件名"})
        return
    }

    userKey := cleanFileName(username)
    if userKey == "" && userIDStr != "" {
        userKey = strconv.FormatUint(parseUintDefault(userIDStr), 10)
    }

    base := getUploadBase()
    noteDir := cleanRelPath(noteDirRaw)
    rel := cleanRelPath(filenameRaw)
    if rel == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "缺少文件名"})
        return
    }
    if filepath.Ext(filepath.Base(rel)) == "" {
        rel = rel + ".md"
    }
    var dst string
    if userKey != "" {
        dst = filepath.Join(filepath.Join(base, "users", userKey), noteDir)
    } else {
        dst = filepath.Join(filepath.Join(base, "users"), noteDir)
    }
    target := filepath.Join(dst, rel)

    log.Printf("notes:delete user=%s note_dir=%s rel=%s target=%s", userKey, noteDir, rel, target)
    if err := os.Remove(target); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
        return
    }

    c.JSON(http.StatusOK, gin.H{"message": "删除成功"})
}

func (ctrl *NoteController) ListAttachments(c *gin.Context) {
    username := strings.TrimSpace(c.DefaultQuery("username", ""))
    userIDStr := strings.TrimSpace(c.DefaultQuery("user_id", ""))
    noteDirRaw := c.DefaultQuery("note_dir", "")
    subdirRaw := c.DefaultQuery("subdir", "attachments")

    userKey := cleanFileName(username)
    if userKey == "" && userIDStr != "" {
        userKey = strconv.FormatUint(parseUintDefault(userIDStr), 10)
    }
    base := getUploadBase()
    noteDir := cleanRelPath(noteDirRaw)
    subdir := cleanRelPath(subdirRaw)
    var root string
    if userKey != "" {
        root = filepath.Join(filepath.Join(filepath.Join(base, "users", userKey), noteDir), subdir)
    } else {
        root = filepath.Join(base, "users")
    }

    files := []string{}
    log.Printf("attachments:list user=%s note_dir=%s subdir=%s root=%s", userKey, noteDir, subdir, root)
    _ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
        if err != nil {
            log.Printf("attachments:list walkerr path=%s err=%v", path, err)
            return nil
        }
        if d.IsDir() {
            return nil
        }
        if strings.EqualFold(filepath.Ext(d.Name()), ".md") {
            return nil
        }
        rel, rerr := filepath.Rel(root, path)
        if rerr == nil {
            rel = strings.TrimPrefix(rel, string(filepath.Separator))
            if userKey == "" {
                if subdir != "" {
                    parts := strings.Split(rel, string(filepath.Separator))
                    include := false
                    for _, seg := range parts {
                        if seg == subdir {
                            include = true
                            break
                        }
                    }
                    if !include {
                        return nil
                    }
                }
            }
            files = append(files, rel)
        }
        return nil
    })

    c.JSON(http.StatusOK, gin.H{
        "message": "获取成功",
        "data": gin.H{
            "items": files,
            "count": len(files),
            "username": userKey,
            "note_dir": noteDir,
        },
    })
}

func (ctrl *NoteController) UploadAttachment(c *gin.Context) {
    username := strings.TrimSpace(c.DefaultQuery("username", ""))
    userIDStr := strings.TrimSpace(c.DefaultQuery("user_id", ""))
    noteDirRaw := c.DefaultQuery("note_dir", "")
    subdirRaw := c.DefaultQuery("subdir", "attachments")
    nameParam := strings.TrimSpace(c.DefaultQuery("filename", ""))

    userKey := cleanFileName(username)
    if userKey == "" && userIDStr != "" {
        userKey = strconv.FormatUint(parseUintDefault(userIDStr), 10)
    }

    file, header, err := c.Request.FormFile("file")
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "缺少文件"})
        return
    }
    defer file.Close()

    base := getUploadBase()
    noteDir := cleanRelPath(noteDirRaw)
    subdir := cleanRelPath(subdirRaw)
    var dst string
    if userKey != "" {
        dst = filepath.Join(filepath.Join(filepath.Join(base, "users", userKey), noteDir), subdir)
    } else {
        dst = filepath.Join(filepath.Join(filepath.Join(base, "users"), noteDir), subdir)
    }
    if err := os.MkdirAll(dst, 0o755); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "目录创建失败"})
        return
    }

    ext := strings.ToLower(filepath.Ext(header.Filename))
    if ext == "" {
        ext = ".bin"
    }

    var name string
    if nameParam != "" {
        clean := cleanFileName(nameParam)
        if filepath.Ext(clean) == "" {
            name = clean + ext
        } else {
            name = clean
        }
    } else {
        name = cleanFileName(header.Filename)
        if name == "" {
            name = "file" + ext
        }
    }

    target := filepath.Join(dst, name)
    log.Printf("attachments:upload user=%s note_dir=%s subdir=%s name=%s dst=%s", userKey, noteDir, subdir, name, target)
    out, err := os.Create(target)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "创建文件失败"})
        return
    }
    defer out.Close()

    buf := make([]byte, 32*1024)
    var size int64
    for {
        n, rerr := file.Read(buf)
        if n > 0 {
            if _, werr := out.Write(buf[:n]); werr != nil {
                c.JSON(http.StatusInternalServerError, gin.H{"error": "写入失败"})
                return
            }
            size += int64(n)
        }
        if rerr != nil {
            if rerr == io.EOF {
                break
            }
            c.JSON(http.StatusInternalServerError, gin.H{"error": "读取失败"})
            return
        }
    }

    c.JSON(http.StatusOK, gin.H{
        "message": "上传成功",
        "data": gin.H{
            "file_name": name,
            "size": size,
            "username": userKey,
            "note_dir": noteDir,
        },
    })
}

func (ctrl *NoteController) DeleteAttachment(c *gin.Context) {
    username := strings.TrimSpace(c.DefaultQuery("username", ""))
    userIDStr := strings.TrimSpace(c.DefaultQuery("user_id", ""))
    noteDirRaw := c.DefaultQuery("note_dir", "")
    subdirRaw := c.DefaultQuery("subdir", "attachments")
    filenameRaw := c.DefaultQuery("filename", "")
    if strings.TrimSpace(filenameRaw) == "" {
        filenameRaw = strings.TrimSpace(c.Param("filename"))
    }

    if strings.TrimSpace(filenameRaw) == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "缺少文件名"})
        return
    }

    userKey := cleanFileName(username)
    if userKey == "" && userIDStr != "" {
        userKey = strconv.FormatUint(parseUintDefault(userIDStr), 10)
    }

    base := getUploadBase()
    noteDir := cleanRelPath(noteDirRaw)
    subdir := cleanRelPath(subdirRaw)
    rel := strings.TrimSpace(filenameRaw)
    rel = strings.ReplaceAll(rel, "\\", "/")
    rel = strings.TrimPrefix(rel, "/")
    if rel == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "缺少文件名"})
        return
    }
    parts := strings.Split(rel, "/")
    var cleanedParts []string
    for _, seg := range parts {
        seg = strings.TrimSpace(seg)
        if seg == "" || seg == "." || seg == ".." {
            continue
        }
        cleaned := cleanFileName(seg)
        if cleaned != "" {
            cleanedParts = append(cleanedParts, cleaned)
        }
    }
    rel = filepath.Join(cleanedParts...)
    var root string
    if userKey != "" {
        root = filepath.Join(filepath.Join(filepath.Join(base, "users", userKey), noteDir), subdir)
    } else {
        root = filepath.Join(base, "users")
    }
    target := filepath.Join(root, rel)
    log.Printf("attachments:delete user=%s note_dir=%s subdir=%s rel=%s target=%s", userKey, noteDir, subdir, rel, target)

    if err := os.Remove(target); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
        return
    }

    c.JSON(http.StatusOK, gin.H{"message": "删除成功"})
}

func (ctrl *NoteController) DownloadAttachment(c *gin.Context) {
    username := strings.TrimSpace(c.DefaultQuery("username", ""))
    userIDStr := strings.TrimSpace(c.DefaultQuery("user_id", ""))
    noteDirRaw := c.DefaultQuery("note_dir", "")
    subdirRaw := c.DefaultQuery("subdir", "attachments")
    filenameRaw := c.DefaultQuery("filename", "")
    if strings.TrimSpace(filenameRaw) == "" {
        filenameRaw = strings.TrimSpace(c.Param("filename"))
    }

    if strings.TrimSpace(filenameRaw) == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "缺少文件名"})
        return
    }

    userKey := cleanFileName(username)
    if userKey == "" && userIDStr != "" {
        userKey = strconv.FormatUint(parseUintDefault(userIDStr), 10)
    }

    base := getUploadBase()
    noteDir := cleanRelPath(noteDirRaw)
    subdir := cleanRelPath(subdirRaw)
    rel := cleanRelPath(filenameRaw)
    if rel == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "缺少文件名"})
        return
    }
    var root string
    if userKey != "" {
        root = filepath.Join(filepath.Join(filepath.Join(base, "users", userKey), noteDir), subdir)
    } else {
        root = filepath.Join(base, "users")
    }
    target := filepath.Join(root, rel)
    log.Printf("attachments:download user=%s note_dir=%s subdir=%s rel=%s target=%s", userKey, noteDir, subdir, rel, target)

    if _, err := os.Stat(target); err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "文件不存在"})
        return
    }

    c.File(target)
}

func parseUintDefault(s string) uint64 {
    v, _ := strconv.ParseUint(s, 10, 64)
    return v
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

func getUploadBase() string {
    if v := os.Getenv("UPLOAD_BASE"); strings.TrimSpace(v) != "" {
        // 统一分隔符
        v = strings.ReplaceAll(v, "\\", "/")
        return v
    }
    return "/data/uploads"
}

func cleanFileName(s string) string {
    r := strings.NewReplacer("<", "", ">", "", ":", "", "\"", "", "/", "", "\\", "", "|", "", "?", "", "*", "", "\n", "", "\r", "", "\t", "")
    s = r.Replace(s)
    s = strings.TrimSpace(s)
    s = strings.ReplaceAll(s, " ", "_")
    return s
}
