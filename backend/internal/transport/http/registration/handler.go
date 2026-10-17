// Package registration exposes the administrative registration job API.
package registration

import (
	"net/http"
	"strconv"

	registrationapp "github.com/chenyme/grok2api/backend/internal/application/registration"
	"github.com/chenyme/grok2api/backend/internal/shared/response"
	"github.com/gin-gonic/gin"
)

type Handler struct {
	service *registrationapp.Service
}

func NewHandler(service *registrationapp.Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) Register(router *gin.RouterGroup) {
	router.GET("/registration/status", h.status)
	router.GET("/registration/logs", h.logs)
	router.GET("/registration/settings", h.settings)
	router.PUT("/registration/settings", h.updateSettings)
	router.POST("/registration/start", h.start)
	router.POST("/registration/stop", h.stop)
}

func (h *Handler) settings(c *gin.Context) {
	response.Success(c, http.StatusOK, h.service.Settings())
}

func (h *Handler) updateSettings(c *gin.Context) {
	var settings registrationapp.Settings
	if c.ShouldBindJSON(&settings) != nil {
		response.Error(c, http.StatusBadRequest, "invalidRequest", "自动注册设置无效")
		return
	}
	if err := h.service.UpdateSettings(settings); err != nil {
		response.Error(c, http.StatusBadRequest, "registrationSettingsFailed", err.Error())
		return
	}
	response.Success(c, http.StatusOK, h.service.Settings())
}

type startRequest struct {
	Count       int    `json:"count"`
	ProxyNodeID string `json:"proxyNodeId"`
}

func (h *Handler) status(c *gin.Context) {
	response.Success(c, http.StatusOK, h.service.Status())
}

func (h *Handler) logs(c *gin.Context) {
	response.Success(c, http.StatusOK, gin.H{"entries": h.service.Logs()})
}

func (h *Handler) start(c *gin.Context) {
	var request startRequest
	if c.ShouldBindJSON(&request) != nil {
		response.Error(c, http.StatusBadRequest, "invalidRequest", "注册请求无效")
		return
	}
	proxyNodeID, err := strconv.ParseUint(request.ProxyNodeID, 10, 64)
	if err != nil || proxyNodeID == 0 {
		response.Error(c, http.StatusBadRequest, "invalidProxyNode", "请选择有效的 grok_web 代理节点")
		return
	}
	status, err := h.service.Start(c.Request.Context(), request.Count, proxyNodeID)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "registrationStartFailed", err.Error())
		return
	}
	response.Success(c, http.StatusOK, status)
}

func (h *Handler) stop(c *gin.Context) {
	h.service.Stop()
	response.Success(c, http.StatusOK, gin.H{"stopped": true})
}
