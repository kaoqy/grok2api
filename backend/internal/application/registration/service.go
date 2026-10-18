// Package registration coordinates account registration jobs and delegates
// browser automation to a Playwright runner process.
package registration

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"os"
	"os/exec"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	accountapp "github.com/chenyme/grok2api/backend/internal/application/account"
	egressapp "github.com/chenyme/grok2api/backend/internal/application/egress"
	accountdomain "github.com/chenyme/grok2api/backend/internal/domain/account"
	egressdomain "github.com/chenyme/grok2api/backend/internal/domain/egress"
	"github.com/chenyme/grok2api/backend/internal/infra/security"
	"github.com/chenyme/grok2api/backend/internal/repository"
)

var (
	ErrDisabled    = errors.New("注册功能未启用")
	ErrBusy        = errors.New("已有注册任务正在运行")
	ErrInvalid     = errors.New("注册参数无效")
	ErrRunner      = errors.New("注册执行器不可用")
	ErrEgressScope = errors.New("所选代理节点作用域必须为 grok_build")
)

// Config controls the embedded registration runner.
type Config struct {
	Enabled        bool
	AutoEnabled    bool
	DailyTarget    int
	PythonPath     string
	RunnerPath     string
	WorkDir        string
	CloudmailBase  string
	CloudmailToken string
	CloudmailPath  string
	DefaultDomains string
	Headless       bool
	ChromiumPath   string
	Timeout        time.Duration
	StorePath      string
}

// AccountImporter is the subset of the account service needed after browser
// registration completes.
type AccountImporter interface {
	ImportWebCredentialsWithObserver(context.Context, []byte, accountapp.ImportedAccountObserver) (accountapp.ImportResult, error)
	ImportCredentialsWithObserver(context.Context, []byte, accountapp.ImportedAccountObserver) (accountapp.ImportResult, error)
	ConvertWebAccountsToBuild(context.Context, []uint64) (accountapp.BuildConversionResult, error)
}

// EgressBinder is the subset of the egress service needed to pin credentials.
type EgressBinder interface {
	ListAll(context.Context, egressdomain.Scope, repository.SortQuery) ([]egressdomain.PublicNode, error)
	ProxyURL(context.Context, uint64) (string, error)
	Create(context.Context, egressapp.Input) (egressdomain.PublicNode, error)
	AssignAccounts(context.Context, uint64, accountdomain.Provider, []uint64, accountdomain.EgressAssignmentMode) (egressapp.AssignmentResult, error)
}

type RunnerEvent struct {
	Type         string `json:"type"`
	Message      string `json:"message"`
	Email        string `json:"email,omitempty"`
	SSO          string `json:"sso,omitempty"`
	AccessToken  string `json:"access_token,omitempty"`
	RefreshToken string `json:"refresh_token,omitempty"`
	IDToken      string `json:"id_token,omitempty"`
	ExpiresAt    string `json:"expires_at,omitempty"`
	AccountID    uint64 `json:"accountId,omitempty"`
	BuildID      uint64 `json:"buildId,omitempty"`
	ProxyNode    uint64 `json:"proxyNodeId,omitempty"`
	HTTPStatus   int    `json:"httpStatus,omitempty"`
}

type Status struct {
	Running        bool     `json:"running"`
	Target         int      `json:"target"`
	Completed      int      `json:"completed"`
	Success        int      `json:"success"`
	Failed         int      `json:"failed"`
	Imported       int      `json:"imported"`
	Converted      int      `json:"converted"`
	RunID          string   `json:"runId"`
	ProxyNodeID    uint64   `json:"proxyNodeId"`
	ProxyNodeName  string   `json:"proxyNodeName"`
	StartedAt      string   `json:"startedAt,omitempty"`
	FinishedAt     string   `json:"finishedAt,omitempty"`
	LastMessage    string   `json:"lastMessage,omitempty"`
	Error          string   `json:"error,omitempty"`
	Results        []Result `json:"results"`
	TodayStarted   int      `json:"todayStarted"`
	TodaySuccess   int      `json:"todaySuccess"`
	TodayFailed    int      `json:"todayFailed"`
	TodayConverted int      `json:"todayConverted"`
	AutoEnabled    bool     `json:"autoEnabled"`
	DailyTarget    int      `json:"dailyTarget"`
	ScheduledAt    string   `json:"scheduledAt,omitempty"`
}

type Result struct {
	Email     string `json:"email,omitempty"`
	AccountID uint64 `json:"accountId,omitempty"`
	BuildID   uint64 `json:"buildId,omitempty"`
	SSO       string `json:"sso,omitempty"`
	Message   string `json:"message,omitempty"`
	Error     string `json:"error,omitempty"`
	Converted bool   `json:"converted"`
}

type Service struct {
	cfg      Config
	accounts AccountImporter
	egress   EgressBinder
	store    *settingsStore
	logger   interface {
		Info(string, ...any)
		Warn(string, ...any)
	}
	mu          sync.RWMutex
	status      Status
	cancel      context.CancelFunc
	logs        []string
	proxy       string
	today       DayStats
	nextRun     time.Time
	autoRunning atomic.Bool
	stopAuto    chan struct{}
}

type DayStats struct {
	Day       string `json:"day"`
	Started   int    `json:"started"`
	Success   int    `json:"success"`
	Failed    int    `json:"failed"`
	Converted int    `json:"converted"`
}

// Settings is the hot-reloadable registration policy.
type Settings struct {
	// Enabled 控制注册模块总开关。全新部署的 config.yaml 里它是 false，
	// 因此必须能在管理后台打开，否则注册功能永远无法启用。
	Enabled     bool `json:"enabled"`
	AutoEnabled bool `json:"autoEnabled"`
	DailyTarget int  `json:"dailyTarget"`
	// Headless=false 会在容器内用 Xvfb 跑有头浏览器，Turnstile 通过率更高。
	Headless bool `json:"headless"`
	// 临时邮箱服务配置，可在管理后台填写，保存后立即生效并持久化。
	MailBase    string `json:"mailBase"`
	MailToken   string `json:"mailToken"`
	MailPath    string `json:"mailPath"`
	MailDomains string `json:"mailDomains"`
	// MailReady 表示注册所需的邮箱配置是否齐全，供前端提示使用。
	MailReady bool `json:"mailReady"`
}

func (s *Service) Settings() Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.settingsLocked()
}

func (s *Service) settingsLocked() Settings {
	return Settings{
		Enabled:     s.cfg.Enabled,
		AutoEnabled: s.cfg.AutoEnabled,
		DailyTarget: s.cfg.DailyTarget,
		Headless:    s.cfg.Headless,
		MailBase:    s.cfg.CloudmailBase,
		MailToken:   s.cfg.CloudmailToken,
		MailPath:    s.cfg.CloudmailPath,
		MailDomains: s.cfg.DefaultDomains,
		MailReady:   mailConfigured(s.cfg),
	}
}

// mailConfigured 判断注册流程所需的临时邮箱字段是否已填齐。
func mailConfigured(cfg Config) bool {
	return strings.TrimSpace(cfg.CloudmailBase) != "" &&
		strings.TrimSpace(cfg.CloudmailToken) != "" &&
		strings.TrimSpace(cfg.DefaultDomains) != ""
}

func (s *Service) UpdateSettings(settings Settings) error {
	if settings.DailyTarget < 0 || settings.DailyTarget > 2500 {
		return fmt.Errorf("%w: 单日注册量必须在 0 到 2500 之间", ErrInvalid)
	}
	mailBase := strings.TrimSpace(settings.MailBase)
	mailToken := strings.TrimSpace(settings.MailToken)
	mailPath := strings.TrimSpace(settings.MailPath)
	mailDomains := strings.TrimSpace(settings.MailDomains)
	if mailPath == "" {
		mailPath = "/api/mails"
	}
	// 邮箱三件套要么都填，要么都留空（留空表示沿用 config.yaml）。
	partial := (mailBase == "") != (mailToken == "") || (mailDomains == "") != (mailBase == "")
	if partial {
		return fmt.Errorf("%w: 邮箱服务地址、管理员密码和收信域名需要一起填写", ErrInvalid)
	}
	s.mu.Lock()
	s.cfg.Enabled = settings.Enabled
	s.cfg.AutoEnabled = settings.AutoEnabled
	s.cfg.DailyTarget = settings.DailyTarget
	s.cfg.Headless = settings.Headless
	s.cfg.CloudmailBase = mailBase
	s.cfg.CloudmailToken = mailToken
	s.cfg.CloudmailPath = mailPath
	s.cfg.DefaultDomains = mailDomains
	s.nextRun = time.Time{}
	s.status.AutoEnabled = settings.AutoEnabled
	s.status.DailyTarget = settings.DailyTarget
	snapshot := s.settingsLocked()
	s.mu.Unlock()
	if err := s.store.save(storedSettings{
		Enabled:     &snapshot.Enabled,
		AutoEnabled: snapshot.AutoEnabled,
		DailyTarget: snapshot.DailyTarget,
		Headless:    &snapshot.Headless,
		MailBase:    snapshot.MailBase,
		MailToken:   snapshot.MailToken,
		MailPath:    snapshot.MailPath,
		MailDomains: snapshot.MailDomains,
	}); err != nil {
		return fmt.Errorf("%w: 保存注册设置失败: %v", ErrInvalid, err)
	}
	s.ensureAutoLoop()
	return nil
}

func NewService(cfg Config, accounts AccountImporter, egress EgressBinder, logger interface {
	Info(string, ...any)
	Warn(string, ...any)
}) *Service {
	service := &Service{
		cfg: cfg, accounts: accounts, egress: egress, logger: logger,
		stopAuto: make(chan struct{}), store: newSettingsStore(cfg.StorePath),
	}
	// 后台保存过的设置优先于 config.yaml。
	if persisted, found, err := service.store.load(); err != nil {
		logger.Warn("registration_settings_load_failed", "error", err)
	} else if found {
		if persisted.Enabled != nil {
			service.cfg.Enabled = *persisted.Enabled
		}
		if persisted.Headless != nil {
			service.cfg.Headless = *persisted.Headless
		}
		service.cfg.AutoEnabled = persisted.AutoEnabled
		service.cfg.DailyTarget = persisted.DailyTarget
		service.cfg.CloudmailBase = persisted.MailBase
		service.cfg.CloudmailToken = persisted.MailToken
		if strings.TrimSpace(persisted.MailPath) != "" {
			service.cfg.CloudmailPath = persisted.MailPath
		}
		service.cfg.DefaultDomains = persisted.MailDomains
	}
	if service.cfg.AutoEnabled && service.cfg.DailyTarget > 0 {
		service.ensureAutoLoop()
	}
	return service
}

// ensureAutoLoop starts the scheduler once; callers may enable auto mode later
// without spawning duplicate loops.
func (s *Service) ensureAutoLoop() {
	s.mu.RLock()
	enabled := s.cfg.AutoEnabled && s.cfg.DailyTarget > 0
	s.mu.RUnlock()
	if !enabled {
		return
	}
	if s.autoRunning.CompareAndSwap(false, true) {
		go s.autoLoop()
	}
}

func (s *Service) Status() Status {
	s.mu.RLock()
	defer s.mu.RUnlock()
	status := s.status
	status.Results = append([]Result(nil), s.status.Results...)
	status.TodayStarted = s.today.Started
	status.TodaySuccess = s.today.Success
	status.TodayFailed = s.today.Failed
	status.TodayConverted = s.today.Converted
	status.AutoEnabled = s.cfg.AutoEnabled
	status.DailyTarget = s.cfg.DailyTarget
	return status
}

func (s *Service) Logs() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]string(nil), s.logs...)
}

// DayStats returns today's registration counters in the server's local day.
func (s *Service) DayStats() DayStats {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.rollDayLocked(time.Now())
	return s.today
}

func (s *Service) rollDayLocked(now time.Time) {
	day := now.Format("2006-01-02")
	if s.today.Day == day {
		return
	}
	s.today = DayStats{Day: day}
}

// autoLoop schedules the configured daily target across randomized times
// rather than one burst. Each day it computes a random schedule per account.
func (s *Service) autoLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-s.stopAuto:
			return
		case <-ticker.C:
			s.tickAuto()
		}
	}
}

func (s *Service) tickAuto() {
	now := time.Now()
	s.mu.Lock()
	if !s.cfg.AutoEnabled || s.cfg.DailyTarget <= 0 {
		s.mu.Unlock()
		return
	}
	dailyTarget := s.cfg.DailyTarget
	s.rollDayLocked(now)
	stats := s.today
	running := s.status.Running
	next := s.nextRun
	// Pick the day's schedule once, spreading attempts through waking hours.
	if next.IsZero() || next.Before(now.Add(-24*time.Hour)) {
		remaining := dailyTarget - stats.Started
		if remaining <= 0 {
			s.mu.Unlock()
			return
		}
		windowStart := time.Date(now.Year(), now.Month(), now.Day(), 8, 0, 0, 0, now.Location())
		windowEnd := time.Date(now.Year(), now.Month(), now.Day(), 23, 0, 0, 0, now.Location())
		if now.After(windowEnd) {
			s.mu.Unlock()
			return
		}
		if now.After(windowStart) {
			windowStart = now
		}
		span := windowEnd.Sub(windowStart)
		if span <= 0 {
			s.mu.Unlock()
			return
		}
		offset := time.Duration(rand.Int63n(int64(span)))
		s.nextRun = windowStart.Add(offset)
		next = s.nextRun
		s.status.ScheduledAt = next.Format(time.RFC3339)
	}
	due := !next.IsZero() && !now.Before(next)
	s.mu.Unlock()
	if running || !due || stats.Started >= dailyTarget {
		return
	}
	nodeID, err := s.firstWebNode(context.Background())
	if err != nil {
		s.logger.Warn("registration_auto_no_node", "error", err)
		s.mu.Lock()
		s.nextRun = time.Time{}
		s.mu.Unlock()
		return
	}
	count := 1
	if _, err := s.Start(context.Background(), count, nodeID); err != nil {
		s.logger.Warn("registration_auto_start_failed", "error", err)
		return
	}
	s.mu.Lock()
	s.nextRun = time.Time{}
	s.mu.Unlock()
}

func (s *Service) firstWebNode(ctx context.Context) (uint64, error) {
	// Build-only deployment: the selected node is a grok_build egress node and
	// the same physical proxy carries both the browser session and the
	// resulting Build account.
	nodes, err := s.egress.ListAll(ctx, egressdomain.ScopeBuild, repository.SortQuery{})
	if err != nil {
		return 0, err
	}
	for _, node := range nodes {
		if node.Enabled && node.ProxyConfigured {
			return node.ID, nil
		}
	}
	return 0, fmt.Errorf("%w: 没有可用的 grok_build 节点", ErrInvalid)
}

func (s *Service) Stop() {
	s.mu.Lock()
	cancel := s.cancel
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

// Start validates the selected egress node and launches one registration job.
func (s *Service) Start(ctx context.Context, count int, proxyNodeID uint64) (Status, error) {
	if !s.cfg.Enabled {
		return Status{}, ErrDisabled
	}
	if count < 1 || count > 20 || proxyNodeID == 0 {
		return Status{}, ErrInvalid
	}
	s.mu.RLock()
	mailReady := mailConfigured(s.cfg)
	s.mu.RUnlock()
	if !mailReady {
		return Status{}, fmt.Errorf("%w: 请先在注册页填写临时邮箱服务配置", ErrInvalid)
	}
	s.mu.Lock()
	if s.status.Running {
		s.mu.Unlock()
		return Status{}, ErrBusy
	}
	s.mu.Unlock()

	nodes, err := s.egress.ListAll(ctx, egressdomain.ScopeBuild, repository.SortQuery{})
	if err != nil {
		return Status{}, err
	}
	var selected *egressdomain.PublicNode
	for index := range nodes {
		if nodes[index].ID == proxyNodeID {
			selected = &nodes[index]
			break
		}
	}
	if selected == nil {
		return Status{}, fmt.Errorf("%w: 找不到 grok_build 代理节点 %d", ErrEgressScope, proxyNodeID)
	}
	if !selected.Enabled || !selected.ProxyConfigured {
		return Status{}, fmt.Errorf("%w: 所选代理节点未启用或未配置代理", ErrInvalid)
	}
	proxyURL, err := s.egress.ProxyURL(ctx, proxyNodeID)
	if err != nil {
		return Status{}, err
	}

	runCtx, cancel := context.WithCancel(context.Background())
	s.mu.Lock()
	s.status = Status{
		Running:       true,
		Target:        count,
		RunID:         fmt.Sprintf("%d", time.Now().UnixNano()),
		ProxyNodeID:   proxyNodeID,
		ProxyNodeName: selected.Name,
		StartedAt:     time.Now().UTC().Format(time.RFC3339),
		Results:       []Result{},
	}
	s.cancel = cancel
	s.logs = []string{}
	s.proxy = proxyURL
	s.rollDayLocked(time.Now())
	s.today.Started += count
	status := s.status
	s.mu.Unlock()

	go s.run(runCtx, count, proxyNodeID, proxyURL)
	return status, nil
}

func (s *Service) run(ctx context.Context, count int, proxyNodeID uint64, proxyURL string) {
	defer func() {
		s.mu.Lock()
		s.status.Running = false
		s.status.FinishedAt = time.Now().UTC().Format(time.RFC3339)
		s.cancel = nil
		s.mu.Unlock()
	}()
	if err := s.runner(ctx, count, proxyNodeID, proxyURL); err != nil {
		if errors.Is(err, context.Canceled) {
			s.append(Result{Message: "任务已停止"})
			return
		}
		s.mu.Lock()
		s.status.Error = err.Error()
		s.mu.Unlock()
		s.append(Result{Error: err.Error()})
	}
}

// ensureBuildEgressNode returns the Build-scope node bound to the same physical
// proxy as the selected Web node, creating it when necessary. This keeps
// converted Build credentials on the exact exit that registered them.
func (s *Service) ensureBuildEgressNode(ctx context.Context, webNodeID uint64, proxyURL, sourceName string) (uint64, error) {
	nodes, err := s.egress.ListAll(ctx, egressdomain.ScopeBuild, repository.SortQuery{})
	if err != nil {
		return 0, err
	}
	fingerprint := security.HashToken(proxyURL)[:12]
	for _, node := range nodes {
		if node.ProxyFingerprint == fingerprint && node.Enabled && node.ProxyConfigured {
			return node.ID, nil
		}
	}
	name := strings.TrimSpace(sourceName)
	if name == "" {
		name = fmt.Sprintf("registration-web-%d", webNodeID)
	}
	name = name + " (Build)"
	created, err := s.egress.Create(ctx, egressapp.Input{
		Name:     name,
		Scope:    egressdomain.ScopeBuild,
		Enabled:  true,
		ProxyURL: &proxyURL,
	})
	if err != nil {
		return 0, err
	}
	return created.ID, nil
}

func (s *Service) append(result Result) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if result.Message != "" {
		s.status.LastMessage = result.Message
		s.logs = append(s.logs, result.Message)
		if len(s.logs) > 500 {
			s.logs = s.logs[len(s.logs)-500:]
		}
	}
	if result.Error != "" {
		s.status.LastMessage = result.Error
		s.logs = append(s.logs, "ERROR: "+result.Error)
	}
	s.status.Results = append(s.status.Results, result)
}

func (s *Service) runner(ctx context.Context, count int, proxyNodeID uint64, proxyURL string) error {
	// runner 在独立 goroutine 中运行，先取一份配置快照，避免与后台改设置竞态。
	s.mu.RLock()
	cfg := s.cfg
	s.mu.RUnlock()
	runnerPath := strings.TrimSpace(cfg.RunnerPath)
	if runnerPath == "" {
		return fmt.Errorf("%w: runner path is empty", ErrRunner)
	}
	if _, err := os.Stat(runnerPath); err != nil {
		return fmt.Errorf("%w: %v", ErrRunner, err)
	}
	python := strings.TrimSpace(cfg.PythonPath)
	if python == "" {
		python = "python3"
	}
	// Playwright's Chromium cannot authenticate to SOCKS proxies, so route the
	// browser through a loopback HTTP bridge that carries the upstream auth.
	bridge, bridgeErr := newLocalProxyBridge(proxyURL)
	if bridgeErr != nil {
		return fmt.Errorf("%w: %v", ErrRunner, bridgeErr)
	}
	defer bridge.Close()
	payload := map[string]any{
		"count":          count,
		"proxy":          bridge.URL(),
		"proxyNodeId":    proxyNodeID,
		"headless":       cfg.Headless,
		"chromiumPath":   cfg.ChromiumPath,
		"provider":       "cloudflare",
		"apiBase":        cfg.CloudmailBase,
		"apiKey":         cfg.CloudmailToken,
		"pathAccounts":   "/admin/new_address",
		"pathMessages":   cfg.CloudmailPath,
		"defaultDomains": cfg.DefaultDomains,
	}
	payloadBytes, _ := json.Marshal(payload)
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 30 * time.Minute
	}
	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	// 有头模式需要 X 显示；容器里用 Xvfb 提供虚拟显示，
	// 这比 headless 更不容易被 Turnstile 判定为机器人。
	command := python
	args := []string{runnerPath}
	if !cfg.Headless {
		if xvfb, err := exec.LookPath("xvfb-run"); err == nil {
			command = xvfb
			args = []string{"-a", python, runnerPath}
		}
	}
	cmd := exec.CommandContext(runCtx, command, args...)
	cmd.Dir = cfg.WorkDir
	cmd.Env = append(os.Environ(), "GROK_REGISTER_PAYLOAD="+string(payloadBytes))
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	cmd.Stderr = cmd.Stdout
	if err := cmd.Start(); err != nil {
		return err
	}
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 8<<20)
	var runErr error
	diagnostics := make([]string, 0, 8)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var event RunnerEvent
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			if len(diagnostics) < 20 {
				diagnostics = append(diagnostics, line)
			}
			continue
		}
		if err := s.handleEvent(ctx, event); err != nil {
			runErr = err
		}
	}
	if scanErr := scanner.Err(); scanErr != nil && runErr == nil {
		runErr = scanErr
	}
	if err := cmd.Wait(); err != nil && runErr == nil {
		runErr = formatRunnerFailure(err, diagnostics)
	}
	return runErr
}

func formatRunnerFailure(err error, diagnostics []string) error {
	if err == nil {
		return nil
	}
	message := strings.TrimSpace(strings.Join(diagnostics, "\n"))
	if message == "" {
		return err
	}
	return fmt.Errorf("%w: %s", err, message)
}

func (s *Service) handleEvent(ctx context.Context, event RunnerEvent) error {
	switch event.Type {
	case "log", "progress":
		s.append(Result{Message: event.Message})
	case "account":
		if strings.TrimSpace(event.SSO) == "" {
			return fmt.Errorf("runner returned empty SSO")
		}
		result, err := s.accounts.ImportWebCredentialsWithObserver(ctx, []byte(event.SSO+"\n"), func(accountID uint64) error {
			if _, err := s.egress.AssignAccounts(ctx, event.ProxyNode, accountdomain.ProviderWeb, []uint64{accountID}, accountdomain.EgressAssignmentManual); err != nil {
				return err
			}
			s.mu.Lock()
			s.status.Imported++
			s.rollDayLocked(time.Now())
			s.mu.Unlock()
			s.append(Result{Email: event.Email, SSO: event.SSO, AccountID: accountID, Message: "Web 账号已导入"})
			return nil
		})
		if err != nil {
			s.append(Result{Email: event.Email, Error: err.Error()})
			return err
		}
		if result.Created+result.Updated == 0 {
			return fmt.Errorf("导入 Web 凭据未创建账号")
		}
		s.mu.Lock()
		s.status.Success++
		s.status.Completed++
		s.rollDayLocked(time.Now())
		s.today.Success++
		s.mu.Unlock()
	case "error":
		s.mu.Lock()
		s.status.Failed++
		s.status.Completed++
		s.rollDayLocked(time.Now())
		s.today.Failed++
		s.mu.Unlock()
		s.append(Result{Email: event.Email, Error: event.Message})
	case "build":
		if strings.TrimSpace(event.AccessToken) == "" {
			return fmt.Errorf("runner returned empty build access token")
		}
		document := map[string]any{
			"accounts": []map[string]any{{
				"provider":      "grok_build",
				"name":          event.Email,
				"client_id":     "b1a00492-073a-47ea-816f-4c329264a828",
				"access_token":  event.AccessToken,
				"refresh_token": event.RefreshToken,
				"id_token":      event.IDToken,
				"token_type":    "Bearer",
				"email":         event.Email,
				"expires_at":    event.ExpiresAt,
			}},
		}
		data, _ := json.Marshal(document)
		result, err := s.accounts.ImportCredentialsWithObserver(ctx, data, func(accountID uint64) error {
			buildNodeID, nodeErr := s.ensureBuildEgressNode(ctx, event.ProxyNode, s.proxy, event.Email)
			if nodeErr != nil {
				return nodeErr
			}
			if _, bindErr := s.egress.AssignAccounts(ctx, buildNodeID, accountdomain.ProviderBuild, []uint64{accountID}, accountdomain.EgressAssignmentManual); bindErr != nil {
				return bindErr
			}
			s.mu.Lock()
			s.status.Converted++
			s.rollDayLocked(time.Now())
			s.today.Converted++
			s.mu.Unlock()
			s.append(Result{Email: event.Email, AccountID: accountID, BuildID: accountID, Converted: true, Message: "Build 账号已导入"})
			return nil
		})
		if err != nil {
			s.append(Result{Email: event.Email, Error: err.Error()})
			return err
		}
		if result.Created+result.Updated == 0 {
			return fmt.Errorf("导入 Build 凭据未创建账号")
		}
	}
	return nil
}
