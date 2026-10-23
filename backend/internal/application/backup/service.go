package backup

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	accountapp "github.com/chenyme/grok2api/backend/internal/application/account"
	egressapp "github.com/chenyme/grok2api/backend/internal/application/egress"
	settingsapp "github.com/chenyme/grok2api/backend/internal/application/settings"
	accountdomain "github.com/chenyme/grok2api/backend/internal/domain/account"
	egressdomain "github.com/chenyme/grok2api/backend/internal/domain/egress"
)

// Format identifies the backup document. The version is bumped whenever the
// shape changes in a way an older gateway cannot read.
const (
	Format  = "grok2api-config-backup"
	Version = 1
)

// maxBackupBytes bounds an uploaded backup so a huge file cannot exhaust the
// server while it is being parsed.
const maxBackupBytes = 64 << 20

// Document is the complete backup: runtime settings, egress configuration and
// every upstream account credential.
type Document struct {
	Format    string          `json:"format"`
	Version   int             `json:"version"`
	ExportedAt time.Time      `json:"exportedAt"`
	Settings  json.RawMessage `json:"settings,omitempty"`
	Egress    EgressSection   `json:"egress"`
	Accounts  AccountSection  `json:"accounts"`
}

// EgressSection carries the proxy topology.
type EgressSection struct {
	ProxyProfiles []egressdomain.BackupProxyProfile `json:"proxyProfiles"`
	Nodes         []egressdomain.BackupNode         `json:"nodes"`
}

// AccountSection carries the account credentials per provider. Each value is
// the provider's own export document, so a restore can feed it straight back
// through the normal import path.
type AccountSection struct {
	Build   json.RawMessage `json:"grokBuild,omitempty"`
	Web     json.RawMessage `json:"grokWeb,omitempty"`
	Console json.RawMessage `json:"grokConsole,omitempty"`
}

// AccountCounts summarises how many accounts each provider contributed.
type AccountCounts struct {
	Build   int `json:"grokBuild"`
	Web     int `json:"grokWeb"`
	Console int `json:"grokConsole"`
}

// Service assembles and applies configuration backups.
type Service struct {
	settings *settingsapp.Service
	egress   *egressapp.Service
	accounts *accountapp.Service
}

func NewService(settings *settingsapp.Service, egress *egressapp.Service, accounts *accountapp.Service) *Service {
	return &Service{settings: settings, egress: egress, accounts: accounts}
}

// Export builds the full backup document.
func (s *Service) Export(ctx context.Context) (Document, AccountCounts, error) {
	counts := AccountCounts{}
	document := Document{Format: Format, Version: Version, ExportedAt: time.Now().UTC()}

	if s.settings != nil {
		snapshot := s.settings.Get()
		encoded, err := json.Marshal(snapshot.Config)
		if err != nil {
			return Document{}, counts, fmt.Errorf("序列化运行设置: %w", err)
		}
		document.Settings = encoded
	}

	if s.egress != nil {
		profiles, err := s.egress.BackupProxyProfiles(ctx)
		if err != nil {
			return Document{}, counts, fmt.Errorf("读取代理档案: %w", err)
		}
		nodes, err := s.egress.BackupNodes(ctx)
		if err != nil {
			return Document{}, counts, fmt.Errorf("读取代理节点: %w", err)
		}
		document.Egress = EgressSection{ProxyProfiles: profiles, Nodes: nodes}
	}

	if s.accounts != nil {
		build, buildCount, err := s.exportProvider(ctx, accountdomain.ProviderBuild)
		if err != nil {
			return Document{}, counts, err
		}
		document.Accounts.Build = build
		counts.Build = buildCount

		web, webCount, err := s.exportProvider(ctx, accountdomain.ProviderWeb)
		if err != nil {
			return Document{}, counts, err
		}
		document.Accounts.Web = web
		counts.Web = webCount

		console, consoleCount, err := s.exportProvider(ctx, accountdomain.ProviderConsole)
		if err != nil {
			return Document{}, counts, err
		}
		document.Accounts.Console = console
		counts.Console = consoleCount
	}

	return document, counts, nil
}

func (s *Service) exportProvider(ctx context.Context, provider accountdomain.Provider) (json.RawMessage, int, error) {
	result, err := s.accounts.ExportProviderCredentials(ctx, provider)
	if err != nil {
		return nil, 0, fmt.Errorf("导出 %s 账号: %w", provider, err)
	}
	if result.Count == 0 {
		return nil, 0, nil
	}
	return json.RawMessage(result.Data), result.Count, nil
}

// Parse validates an uploaded backup document.
func Parse(data []byte) (Document, error) {
	if len(data) > maxBackupBytes {
		return Document{}, fmt.Errorf("备份文件超过 %d MiB 上限", maxBackupBytes>>20)
	}
	var document Document
	if err := json.Unmarshal(data, &document); err != nil {
		return Document{}, fmt.Errorf("解析备份文件: %w", err)
	}
	if strings.TrimSpace(document.Format) != Format {
		return Document{}, fmt.Errorf("不是 %s 备份文件", Format)
	}
	if document.Version <= 0 || document.Version > Version {
		return Document{}, fmt.Errorf("备份版本 %d 不受支持", document.Version)
	}
	return document, nil
}

// RestoreResult reports what a restore actually changed.
type RestoreResult struct {
	ProxyProfiles int `json:"proxyProfiles"`
	Nodes         int `json:"nodes"`
	Build         int `json:"grokBuild"`
	Web           int `json:"grokWeb"`
	Console       int `json:"grokConsole"`
}

// Restore applies a backup document. Existing nodes with the same name and
// scope are updated in place, so restoring twice does not duplicate entries.
func (s *Service) Restore(ctx context.Context, document Document) (RestoreResult, error) {
	result := RestoreResult{}
	if s.egress != nil {
		profiles, err := s.restoreProxyProfiles(ctx, document.Egress.ProxyProfiles)
		if err != nil {
			return result, err
		}
		result.ProxyProfiles = profiles
		nodes, err := s.restoreNodes(ctx, document.Egress.Nodes)
		if err != nil {
			return result, err
		}
		result.Nodes = nodes
	}
	if s.accounts != nil {
		build, err := s.restoreProvider(ctx, accountdomain.ProviderBuild, document.Accounts.Build)
		if err != nil {
			return result, err
		}
		result.Build = build
		web, err := s.restoreProvider(ctx, accountdomain.ProviderWeb, document.Accounts.Web)
		if err != nil {
			return result, err
		}
		result.Web = web
		console, err := s.restoreProvider(ctx, accountdomain.ProviderConsole, document.Accounts.Console)
		if err != nil {
			return result, err
		}
		result.Console = console
	}
	return result, nil
}

func (s *Service) restoreProxyProfiles(ctx context.Context, profiles []egressdomain.BackupProxyProfile) (int, error) {
	restored := 0
	for _, profile := range profiles {
		if strings.TrimSpace(profile.Name) == "" {
			continue
		}
		existing, total, err := s.egress.ListProxyProfiles(ctx, 1, 1000, profile.Name)
		if err != nil {
			return restored, fmt.Errorf("查找代理档案 %q: %w", profile.Name, err)
		}
		url := strings.TrimSpace(profile.ProxyURL)
		if total > 0 {
			if url == "" {
				continue
			}
			if _, err := s.egress.UpdateProxyProfile(ctx, existing[0].ID, egressapp.ProxyProfileInput{Name: profile.Name, ProxyURL: &url}); err != nil {
				return restored, fmt.Errorf("更新代理档案 %q: %w", profile.Name, err)
			}
			restored++
			continue
		}
		if url == "" {
			continue
		}
		if _, err := s.egress.CreateProxyProfile(ctx, egressapp.ProxyProfileInput{Name: profile.Name, ProxyURL: &url}); err != nil {
			return restored, fmt.Errorf("创建代理档案 %q: %w", profile.Name, err)
		}
		restored++
	}
	return restored, nil
}

func (s *Service) restoreNodes(ctx context.Context, nodes []egressdomain.BackupNode) (int, error) {
	restored := 0
	for _, node := range nodes {
		if strings.TrimSpace(node.Name) == "" {
			continue
		}
		url := strings.TrimSpace(node.ProxyURL)
		proxyPool := node.ProxyPool
		capacity := node.AccountCapacity
		input := egressapp.Input{
			Name: node.Name, Scope: node.Scope, Enabled: node.Enabled, ProxyPool: &proxyPool,
			UserAgent: node.UserAgent, AccountCapacity: &capacity,
		}
		if url != "" {
			input.ProxyURL = &url
		}
		existing, total, err := s.egress.List(ctx, 1, 1000, node.Name, egressapp.ListFilter{Scope: node.Scope})
		if err == nil && total > 0 {
			if _, err := s.egress.Update(ctx, existing[0].ID, input); err != nil {
				return restored, fmt.Errorf("更新代理节点 %q: %w", node.Name, err)
			}
			restored++
			continue
		}
		if _, err := s.egress.Create(ctx, input); err != nil {
			return restored, fmt.Errorf("创建代理节点 %q: %w", node.Name, err)
		}
		restored++
	}
	return restored, nil
}

func (s *Service) restoreProvider(ctx context.Context, provider accountdomain.Provider, payload json.RawMessage) (int, error) {
	if len(payload) == 0 {
		return 0, nil
	}
	var result accountapp.ImportResult
	var err error
	switch provider {
	case accountdomain.ProviderBuild:
		result, err = s.accounts.ImportCredentials(ctx, payload)
	case accountdomain.ProviderWeb:
		result, err = s.accounts.ImportWebCredentials(ctx, payload)
	case accountdomain.ProviderConsole:
		result, err = s.accounts.ImportConsoleCredentials(ctx, payload)
	default:
		return 0, fmt.Errorf("未知账号来源: %s", provider)
	}
	if err != nil {
		return 0, fmt.Errorf("恢复 %s 账号: %w", provider, err)
	}
	return result.Created + result.Updated, nil
}
