package registration

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// storedSettings 是注册设置的持久化结构。它与对外暴露的 Settings 分开，
// 这样 API 形状变化时磁盘上的格式保持稳定。
type storedSettings struct {
	// Enabled 用指针区分「旧版本没有这个字段」和「管理员显式关闭」，
	// 避免升级后把 config.yaml 里的 enabled: true 误判为关闭。
	Enabled     *bool  `json:"enabled,omitempty"`
	AutoEnabled bool   `json:"autoEnabled"`
	DailyTarget int    `json:"dailyTarget"`
	Headless    *bool  `json:"headless,omitempty"`
	MailBase    string `json:"mailBase"`
	MailToken   string `json:"mailToken"`
	MailPath    string `json:"mailPath"`
	MailDomains string `json:"mailDomains"`
}

// settingsStore 把注册设置写到数据库旁边的小 JSON 文件，管理员可以在后台
// 直接修改临时邮箱服务，而不必编辑 config.yaml 并重启。
type settingsStore struct {
	path string
	mu   sync.Mutex
}

func newSettingsStore(path string) *settingsStore {
	return &settingsStore{path: strings.TrimSpace(path)}
}

func (s *settingsStore) load() (storedSettings, bool, error) {
	if s.path == "" {
		return storedSettings{}, false, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	data, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return storedSettings{}, false, nil
		}
		return storedSettings{}, false, err
	}
	var value storedSettings
	if err := json.Unmarshal(data, &value); err != nil {
		return storedSettings{}, false, fmt.Errorf("解析注册设置: %w", err)
	}
	return value, true, nil
}

// save 先写临时文件再原子替换，避免进程中断留下半截配置。
func (s *settingsStore) save(value storedSettings) error {
	if s.path == "" {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if dir := filepath.Dir(s.path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return err
		}
	}
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}
