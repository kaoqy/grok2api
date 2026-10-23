package backup

import (
	"encoding/json"
	"net/http"
	"time"

	backupapp "github.com/chenyme/grok2api/backend/internal/application/backup"
	"github.com/chenyme/grok2api/backend/internal/shared/response"
	"github.com/gin-gonic/gin"
)

type Handler struct{ service *backupapp.Service }

func NewHandler(service *backupapp.Service) *Handler { return &Handler{service: service} }

func (h *Handler) Register(router *gin.RouterGroup) {
	router.GET("/system/backup", h.export)
	router.POST("/system/restore", h.restore)
}

type exportResponse struct {
	Format     string             `json:"format"`
	Version    int                `json:"version"`
	ExportedAt time.Time          `json:"exportedAt"`
	Document   json.RawMessage    `json:"document"`
}

// export writes the complete configuration backup as a downloadable file.
// The payload contains proxy addresses and account cookies, so it is never
// cached by the browser or by an intermediary.
func (h *Handler) export(c *gin.Context) {
	document, _, err := h.service.Export(c.Request.Context())
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "systemBackupFailed", "导出配置备份失败: "+err.Error())
		return
	}
	encoded, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "systemBackupFailed", "序列化配置备份失败: "+err.Error())
		return
	}
	filename := "grok2api-config-" + time.Now().UTC().Format("20060102T150405Z") + ".json"
	c.Header("Cache-Control", "no-store")
	c.Header("Pragma", "no-cache")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	c.Data(http.StatusOK, "application/json; charset=utf-8", encoded)
}

type restoreResponse struct {
	Restored backupapp.RestoreResult `json:"restored"`
}

// restore applies an uploaded backup document.
func (h *Handler) restore(c *gin.Context) {
	payload, err := c.GetRawData()
	if err != nil {
		response.Error(c, http.StatusBadRequest, "invalidRequest", "读取备份文件失败: "+err.Error())
		return
	}
	document, err := backupapp.Parse(payload)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "invalidBackup", err.Error())
		return
	}
	result, err := h.service.Restore(c.Request.Context(), document)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "systemRestoreFailed", "恢复配置备份失败: "+err.Error())
		return
	}
	response.Success(c, http.StatusOK, restoreResponse{Restored: result})
}
