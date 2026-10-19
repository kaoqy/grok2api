package accountimport

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"

	accountapp "github.com/chenyme/grok2api/backend/internal/application/account"
	egressapp "github.com/chenyme/grok2api/backend/internal/application/egress"
	accountdomain "github.com/chenyme/grok2api/backend/internal/domain/account"
	egressdomain "github.com/chenyme/grok2api/backend/internal/domain/egress"
	"github.com/chenyme/grok2api/backend/internal/infra/security"
	"github.com/chenyme/grok2api/backend/internal/repository"
)

var ErrInvalidInput = errors.New("Build 账号导入参数无效")

// ErrInvalidWebInput 表示 Grok Web 账号导入参数不合法。
var ErrInvalidWebInput = errors.New("Web 账号导入参数无效")

const defaultBuildImportProxyName = "Build 导入代理"
const defaultWebImportProxyName = "Web 导入代理"

type AccountImporter interface {
	ImportCredentialsWithObserver(context.Context, []byte, accountapp.ImportedAccountObserver) (accountapp.ImportResult, error)
}

// WebAccountImporter 导入 Grok Web 凭据（SSO），用于生图等 Web 侧能力。
type WebAccountImporter interface {
	ImportWebCredentialsWithObserver(context.Context, []byte, accountapp.ImportedAccountObserver) (accountapp.ImportResult, error)
}

type EgressManager interface {
	ListAll(context.Context, egressdomain.Scope, repository.SortQuery) ([]egressdomain.PublicNode, error)
	Create(context.Context, egressapp.Input) (egressdomain.PublicNode, error)
	AssignAccounts(context.Context, uint64, accountdomain.Provider, []uint64, accountdomain.EgressAssignmentMode) (egressapp.AssignmentResult, error)
}

type Input struct {
	Email        string
	Name         string
	ClientID     string
	AccessToken  string
	RefreshToken string
	IDToken      string
	ExpiresAt    string
	SSOToken     string
	Tier         string
	ProxyName    string
	ProxyURL     string
}

type Result struct {
	Created          int
	Updated          int
	Skipped          int
	Failed           int
	AccountID        uint64
	AccountIDs       []uint64
	EgressNodeID     uint64
	EgressNodeName   string
	ProxyDisplay     string
	ReusedEgressNode bool
}

type Service struct {
	accounts AccountImporter
	egress   EgressManager
	web      WebAccountImporter
	nodeMu   sync.Mutex
}

func NewService(accounts AccountImporter, egress EgressManager) *Service {
	service := &Service{accounts: accounts, egress: egress}
	if web, ok := accounts.(WebAccountImporter); ok {
		service.web = web
	}
	return service
}

func (s *Service) ImportBuild(ctx context.Context, input Input) (Result, error) {
	input = normalizeInput(input)
	if err := validateInput(input); err != nil {
		return Result{}, err
	}
	if s == nil || s.accounts == nil || s.egress == nil {
		return Result{}, errors.New("Build 账号导入服务未配置")
	}
	proxyURL, err := egressapp.NormalizeProxyURL(input.ProxyURL)
	if err != nil || proxyURL == "" {
		return Result{}, fmt.Errorf("%w: SOCKS 代理地址无效", ErrInvalidInput)
	}
	node, reused, err := s.findOrCreateBuildNode(ctx, input, proxyURL)
	if err != nil {
		return Result{}, err
	}
	document, err := buildCredentialDocument(input)
	if err != nil {
		return Result{}, err
	}
	imported, err := s.accounts.ImportCredentialsWithObserver(ctx, document, func(accountID uint64) error {
		_, bindErr := s.egress.AssignAccounts(ctx, node.ID, accountdomain.ProviderBuild, []uint64{accountID}, accountdomain.EgressAssignmentManual)
		return bindErr
	})
	if err != nil {
		return Result{}, err
	}
	result := Result{
		Created: imported.Created, Updated: imported.Updated, Skipped: imported.Skipped, Failed: imported.Failed,
		AccountIDs: imported.AccountIDs, EgressNodeID: node.ID, EgressNodeName: node.Name,
		ProxyDisplay: node.ProxyDisplay, ReusedEgressNode: reused,
	}
	if len(imported.AccountIDs) > 0 {
		result.AccountID = imported.AccountIDs[0]
	}
	return result, nil
}

// ImportWeb 导入 Grok Web 账号并绑定到指定 SOCKS 出口。
//
// Build 账号承担 grok-4.7 文本推理，Grok Web 账号承担生图等 Web 侧能力；
// 两者共用同一套「导入即绑定出口」语义，保证账号走注册时指定的代理。
func (s *Service) ImportWeb(ctx context.Context, input Input) (Result, error) {
	input = normalizeInput(input)
	if err := validateWebInput(input); err != nil {
		return Result{}, err
	}
	if s == nil || s.web == nil || s.egress == nil {
		return Result{}, errors.New("Grok Web 账号导入服务未配置")
	}
	proxyURL, err := egressapp.NormalizeProxyURL(input.ProxyURL)
	if err != nil || proxyURL == "" {
		return Result{}, fmt.Errorf("%w: SOCKS 代理地址无效", ErrInvalidWebInput)
	}
	node, reused, err := s.findOrCreateWebNode(ctx, input, proxyURL)
	if err != nil {
		return Result{}, err
	}
	document, err := webCredentialDocument(input)
	if err != nil {
		return Result{}, err
	}
	imported, err := s.web.ImportWebCredentialsWithObserver(ctx, document, func(accountID uint64) error {
		_, bindErr := s.egress.AssignAccounts(ctx, node.ID, accountdomain.ProviderWeb, []uint64{accountID}, accountdomain.EgressAssignmentManual)
		return bindErr
	})
	if err != nil {
		return Result{}, err
	}
	result := Result{
		Created: imported.Created, Updated: imported.Updated, Skipped: imported.Skipped, Failed: imported.Failed,
		AccountIDs: imported.AccountIDs, EgressNodeID: node.ID, EgressNodeName: node.Name,
		ProxyDisplay: node.ProxyDisplay, ReusedEgressNode: reused,
	}
	if len(imported.AccountIDs) > 0 {
		result.AccountID = imported.AccountIDs[0]
	}
	return result, nil
}

func (s *Service) findOrCreateBuildNode(ctx context.Context, input Input, proxyURL string) (egressdomain.PublicNode, bool, error) {
	s.nodeMu.Lock()
	defer s.nodeMu.Unlock()
	return s.findOrCreateNode(ctx, egressdomain.ScopeBuild, input, proxyURL)
}

// findOrCreateWebNode 按代理指纹复用 Grok Web 出口节点，没有匹配时新建一个。
func (s *Service) findOrCreateWebNode(ctx context.Context, input Input, proxyURL string) (egressdomain.PublicNode, bool, error) {
	s.nodeMu.Lock()
	defer s.nodeMu.Unlock()
	return s.findOrCreateNode(ctx, egressdomain.ScopeWeb, input, proxyURL)
}

func (s *Service) findOrCreateNode(ctx context.Context, scope egressdomain.Scope, input Input, proxyURL string) (egressdomain.PublicNode, bool, error) {
	nodes, err := s.egress.ListAll(ctx, scope, repository.SortQuery{})
	if err != nil {
		return egressdomain.PublicNode{}, false, err
	}
	fingerprint := security.HashToken(proxyURL)[:12]
	for _, node := range nodes {
		if node.Scope == scope && node.Enabled && node.ProxyConfigured && node.ProxyFingerprint == fingerprint {
			return node, true, nil
		}
	}
	name := input.ProxyName
	if name == "" {
		name = defaultBuildImportProxyName
		if scope == egressdomain.ScopeWeb {
			name = defaultWebImportProxyName
		}
	}
	enabled := true
	proxyPool := false
	created, err := s.egress.Create(ctx, egressapp.Input{
		Name: name, Scope: scope, Enabled: enabled,
		ProxyPool: &proxyPool, ProxyURL: &proxyURL,
	})
	if err != nil {
		return egressdomain.PublicNode{}, false, err
	}
	return created, false, nil
}

func normalizeInput(input Input) Input {
	input.Email = strings.TrimSpace(input.Email)
	input.Name = strings.TrimSpace(input.Name)
	input.ClientID = strings.TrimSpace(input.ClientID)
	input.AccessToken = strings.TrimSpace(input.AccessToken)
	input.RefreshToken = strings.TrimSpace(input.RefreshToken)
	input.IDToken = strings.TrimSpace(input.IDToken)
	input.ExpiresAt = strings.TrimSpace(input.ExpiresAt)
	input.SSOToken = strings.TrimSpace(input.SSOToken)
	input.Tier = strings.ToLower(strings.TrimSpace(input.Tier))
	input.ProxyName = strings.TrimSpace(input.ProxyName)
	input.ProxyURL = strings.TrimSpace(input.ProxyURL)
	if input.Name == "" {
		input.Name = input.Email
	}
	return input
}

func validateInput(input Input) error {
	if input.Email == "" {
		return fmt.Errorf("%w: email 不能为空", ErrInvalidInput)
	}
	if input.AccessToken == "" && input.RefreshToken == "" {
		return fmt.Errorf("%w: access_token 和 refresh_token 至少提供一个", ErrInvalidInput)
	}
	if input.ProxyURL == "" {
		return fmt.Errorf("%w: proxyUrl 不能为空", ErrInvalidInput)
	}
	return nil
}

func validateWebInput(input Input) error {
	if input.SSOToken == "" {
		return fmt.Errorf("%w: ssoToken 不能为空", ErrInvalidWebInput)
	}
	if input.ProxyURL == "" {
		return fmt.Errorf("%w: proxyUrl 不能为空", ErrInvalidWebInput)
	}
	return nil
}

// webCredentialDocument 生成 Grok Web 凭据文档，格式与 Web Provider 的导入解析器一致。
func webCredentialDocument(input Input) ([]byte, error) {
	document := struct {
		Provider string `json:"provider"`
		Accounts []struct {
			Name     string `json:"name"`
			Email    string `json:"email,omitempty"`
			SSOToken string `json:"sso_token"`
			Tier     string `json:"tier,omitempty"`
		} `json:"accounts"`
	}{Provider: string(accountdomain.ProviderWeb)}
	document.Accounts = append(document.Accounts, struct {
		Name     string `json:"name"`
		Email    string `json:"email,omitempty"`
		SSOToken string `json:"sso_token"`
		Tier     string `json:"tier,omitempty"`
	}{
		Name: input.Name, Email: input.Email, SSOToken: input.SSOToken, Tier: input.Tier,
	})
	data, err := json.Marshal(document)
	if err != nil {
		return nil, fmt.Errorf("序列化 Web 凭据: %w", err)
	}
	return data, nil
}

func buildCredentialDocument(input Input) ([]byte, error) {
	document := struct {
		Accounts []struct {
			Provider     string `json:"provider"`
			Name         string `json:"name"`
			ClientID     string `json:"client_id,omitempty"`
			AccessToken  string `json:"access_token,omitempty"`
			RefreshToken string `json:"refresh_token,omitempty"`
			IDToken      string `json:"id_token,omitempty"`
			TokenType    string `json:"token_type,omitempty"`
			Email        string `json:"email"`
			ExpiresAt    string `json:"expires_at,omitempty"`
		} `json:"accounts"`
	}{}
	document.Accounts = append(document.Accounts, struct {
		Provider     string `json:"provider"`
		Name         string `json:"name"`
		ClientID     string `json:"client_id,omitempty"`
		AccessToken  string `json:"access_token,omitempty"`
		RefreshToken string `json:"refresh_token,omitempty"`
		IDToken      string `json:"id_token,omitempty"`
		TokenType    string `json:"token_type,omitempty"`
		Email        string `json:"email"`
		ExpiresAt    string `json:"expires_at,omitempty"`
	}{
		Provider: string(accountdomain.ProviderBuild), Name: input.Name, ClientID: input.ClientID,
		AccessToken: input.AccessToken, RefreshToken: input.RefreshToken, IDToken: input.IDToken,
		TokenType: "Bearer", Email: input.Email, ExpiresAt: input.ExpiresAt,
	})
	data, err := json.Marshal(document)
	if err != nil {
		return nil, fmt.Errorf("序列化 Build 凭据: %w", err)
	}
	return data, nil
}
