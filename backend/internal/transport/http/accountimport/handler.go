package accountimport

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	accountimportapp "github.com/chenyme/grok2api/backend/internal/application/accountimport"
	"github.com/chenyme/grok2api/backend/internal/shared/response"
	"github.com/gin-gonic/gin"
)

type importService interface {
	ImportBuild(context.Context, accountimportapp.Input) (accountimportapp.Result, error)
}

type importKeyService interface {
	AccountImportKeyConfigured() bool
	CreateAccountImportKey(context.Context) (string, error)
	RevokeAccountImportKey(context.Context) error
}

type Handler struct {
	service importService
	keys    importKeyService
}

type createBuildRequest struct {
	Email        string `json:"email"`
	Name         string `json:"name"`
	ClientID     string `json:"clientId"`
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	IDToken      string `json:"idToken"`
	ExpiresAt    string `json:"expiresAt"`
	ProxyName    string `json:"proxyName"`
	ProxyURL     string `json:"proxyUrl"`
}

type createBuildResponse struct {
	Created          int      `json:"created"`
	Updated          int      `json:"updated"`
	Skipped          int      `json:"skipped"`
	Failed           int      `json:"failed"`
	AccountID        string   `json:"accountId,omitempty"`
	AccountIDs       []string `json:"accountIds"`
	EgressNodeID     string   `json:"egressNodeId"`
	EgressNodeName   string   `json:"egressNodeName"`
	ProxyDisplay     string   `json:"proxyDisplay"`
	ReusedEgressNode bool     `json:"reusedEgressNode"`
}

func NewHandler(service importService, keys importKeyService) *Handler {
	return &Handler{service: service, keys: keys}
}

func (h *Handler) Register(router *gin.RouterGroup) {
	router.POST("/account-imports/build", h.createBuild)
	router.GET("/account-imports/key", h.importKeyStatus)
	router.POST("/account-imports/key", h.createImportKey)
	router.DELETE("/account-imports/key", h.revokeImportKey)
}

func (h *Handler) RegisterImport(router *gin.RouterGroup) {
	router.POST("/accounts/build", h.createBuild)
}

func (h *Handler) createBuild(c *gin.Context) {
	var request createBuildRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		response.Error(c, http.StatusBadRequest, "invalidBuildImport", "Build 账号导入请求格式无效")
		return
	}
	result, err := h.service.ImportBuild(c.Request.Context(), accountimportapp.Input{
		Email: request.Email, Name: request.Name, ClientID: request.ClientID,
		AccessToken: request.AccessToken, RefreshToken: request.RefreshToken, IDToken: request.IDToken,
		ExpiresAt: request.ExpiresAt, ProxyName: request.ProxyName, ProxyURL: request.ProxyURL,
	})
	if err != nil {
		if errors.Is(err, accountimportapp.ErrInvalidInput) {
			response.Error(c, http.StatusBadRequest, "invalidBuildImport", err.Error())
			return
		}
		response.Error(c, http.StatusBadGateway, "buildImportFailed", err.Error())
		return
	}
	response.Success(c, http.StatusOK, newCreateBuildResponse(result))
}

type importKeyStatusResponse struct {
	Configured bool   `json:"configured"`
	Endpoint   string `json:"endpoint"`
}

func (h *Handler) importKeyStatus(c *gin.Context) {
	if h.keys == nil {
		response.Error(c, http.StatusServiceUnavailable, "accountImportKeyUnavailable", "账号导入密钥服务不可用")
		return
	}
	response.Success(c, http.StatusOK, importKeyStatusResponse{
		Configured: h.keys.AccountImportKeyConfigured(),
		Endpoint:   "/api/import/v1/accounts/build",
	})
}

func (h *Handler) createImportKey(c *gin.Context) {
	if h.keys == nil {
		response.Error(c, http.StatusServiceUnavailable, "accountImportKeyUnavailable", "账号导入密钥服务不可用")
		return
	}
	token, err := h.keys.CreateAccountImportKey(c.Request.Context())
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "accountImportKeyCreateFailed", "创建账号导入密钥失败")
		return
	}
	response.Success(c, http.StatusCreated, gin.H{
		"configured": true,
		"token":      token,
		"endpoint":   "/api/import/v1/accounts/build",
	})
}

func (h *Handler) revokeImportKey(c *gin.Context) {
	if h.keys == nil {
		response.Error(c, http.StatusServiceUnavailable, "accountImportKeyUnavailable", "账号导入密钥服务不可用")
		return
	}
	if err := h.keys.RevokeAccountImportKey(c.Request.Context()); err != nil {
		response.Error(c, http.StatusInternalServerError, "accountImportKeyRevokeFailed", "撤销账号导入密钥失败")
		return
	}
	response.Success(c, http.StatusOK, importKeyStatusResponse{
		Configured: false,
		Endpoint:   "/api/import/v1/accounts/build",
	})
}

func newCreateBuildResponse(result accountimportapp.Result) createBuildResponse {
	accountIDs := make([]string, 0, len(result.AccountIDs))
	for _, accountID := range result.AccountIDs {
		accountIDs = append(accountIDs, strconv.FormatUint(accountID, 10))
	}
	response := createBuildResponse{
		Created: result.Created, Updated: result.Updated, Skipped: result.Skipped, Failed: result.Failed,
		AccountIDs: accountIDs, EgressNodeID: strconv.FormatUint(result.EgressNodeID, 10),
		EgressNodeName: result.EgressNodeName, ProxyDisplay: result.ProxyDisplay, ReusedEgressNode: result.ReusedEgressNode,
	}
	if result.AccountID != 0 {
		response.AccountID = strconv.FormatUint(result.AccountID, 10)
	}
	return response
}
