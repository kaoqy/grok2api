package egress

import "time"

type Mode string

const (
	ModeDirect Mode = "direct"
	ModeSingle Mode = "single"
	ModePool   Mode = "pool"
)

const LastErrorTransport = "transport error"

type Scope string

const (
	ScopeBuild        Scope = "grok_build"
	ScopeWeb          Scope = "grok_web"
	ScopeConsole      Scope = "grok_console"
	ScopeWebAsset     Scope = "grok_web_asset"
	ScopeConsoleAsset Scope = "grok_console_asset"
	// ScopeShared 是同时供 Build 与 Web 复用的出口作用域。
	// 绑定额度按 Provider 分别核算，因此同一个代理可以各挂一批 Build 与 Web 账号。
	ScopeShared Scope = "grok_shared"
)

// AllScopes 返回全部出口作用域，含 Build/Web 共用节点。
func AllScopes() []Scope {
	return []Scope{ScopeBuild, ScopeWeb, ScopeConsole, ScopeWebAsset, ScopeConsoleAsset, ScopeShared}
}

type Node struct {
	ID                          uint64
	Name                        string
	Scope                       Scope
	Enabled                     bool
	ProxyPool                   bool
	SourceID                    uint64
	SourceKey                   string
	AccountCapacity             int
	ProxyProfileID              uint64
	ProxyProfileName            string
	EncryptedProxyURL           string
	UserAgent                   string
	EncryptedCloudflareCookie   string
	ClearanceRefreshedAt        *time.Time
	ClearanceFingerprint        string
	ClearanceBindingFingerprint string
	Health                      float64
	FailureCount                int
	CooldownUntil               *time.Time
	LastError                   string
	ProbeStatus                 ProbeStatus
	LastProbedAt                *time.Time
	ProbeLatencyMS              int
	ExitIP                      string
	ProbeError                  string
	ProbeProvider               ProbeProvider
	IPv4Probe                   ProbeFamilyResult
	IPv6Probe                   ProbeFamilyResult
	AssignedAccountCount        int
	// AssignedAccountCounts 按 Provider 分别统计绑定量；共用节点据此分别核算额度。
	AssignedAccountCounts map[string]int
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

type PublicNode struct {
	ID                   uint64
	Name                 string
	Scope                Scope
	Enabled              bool
	ProxyConfigured      bool
	ProxyDisplay         string
	ProxyFingerprint     string
	ProxyPool            bool
	SourceID             uint64
	AccountCapacity      int
	ProxyProfileID       uint64
	ProxyProfileName     string
	UserAgent            string
	CookieConfigured     bool
	AccountBoundProxy    bool
	Health               float64
	FailureCount         int
	CooldownUntil        *time.Time
	LastError            string
	ProbeStatus          ProbeStatus
	LastProbedAt         *time.Time
	ProbeLatencyMS       int
	ExitIP               string
	ProbeError           string
	ProbeProvider        ProbeProvider
	IPv4Probe            ProbeFamilyResult
	IPv6Probe            ProbeFamilyResult
	AssignedAccountCount int
	// AssignedAccountCounts 按 Provider 分别统计绑定量；共用节点据此分别核算额度。
	AssignedAccountCounts map[string]int
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

// ProxyProfile is a reusable physical proxy configuration. Provider-specific
// health, capacity, browser identity, and Clearance remain on Node.
type ProxyProfile struct {
	ID                uint64
	Name              string
	EncryptedProxyURL string
	BoundNodeCount    int
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type PublicProxyProfile struct {
	ID               uint64
	Name             string
	ProxyDisplay     string
	ProxyFingerprint string
	BoundNodeCount   int
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// BackupNode 是配置备份中的代理节点快照。
// ProxyURL 是明文地址，只在管理员显式导出时生成。
type BackupNode struct {
	Name             string `json:"name"`
	Scope            Scope  `json:"scope"`
	Enabled          bool   `json:"enabled"`
	ProxyPool        bool   `json:"proxyPool"`
	ProxyURL         string `json:"proxyUrl,omitempty"`
	ProxyProfileName string `json:"proxyProfileName,omitempty"`
	UserAgent        string `json:"userAgent,omitempty"`
	AccountCapacity  int    `json:"accountCapacity"`
	SourceKey        string `json:"sourceKey,omitempty"`
}

// BackupProxyProfile 是配置备份中的物理代理档案快照。
type BackupProxyProfile struct {
	Name     string `json:"name"`
	ProxyURL string `json:"proxyUrl,omitempty"`
}

type ProbeStatus string

const (
	ProbeStatusUnknown   ProbeStatus = "unknown"
	ProbeStatusHealthy   ProbeStatus = "healthy"
	ProbeStatusUnhealthy ProbeStatus = "unhealthy"
)

func (value ProbeStatus) IsValid() bool {
	switch value {
	case ProbeStatusUnknown, ProbeStatusHealthy, ProbeStatusUnhealthy:
		return true
	default:
		return false
	}
}

// ProbeResult contains only operational metadata. It never stores or exposes
// proxy credentials.
type ProbeResult struct {
	Status    ProbeStatus
	TestedAt  time.Time
	LatencyMS int
	ExitIP    string
	Error     string
	Provider  ProbeProvider
	IPv4      ProbeFamilyResult
	IPv6      ProbeFamilyResult
}

// ProbeFamilyResult stores one address family's independent connectivity
// result. A zero TestedAt represents a family that has not been tested yet.
type ProbeFamilyResult struct {
	Status    ProbeStatus
	TestedAt  time.Time
	LatencyMS int
	ExitIP    string
	Error     string
}

// SubscriptionSource stores a write-only remote proxy subscription. The URL
// remains encrypted at rest and must never be returned by management APIs.
type SubscriptionSource struct {
	ID                     uint64
	Name                   string
	Scope                  Scope
	Enabled                bool
	EncryptedURL           string
	EncryptedProxyURL      string
	RefreshIntervalSeconds int
	DefaultAccountCapacity int
	LastSyncedAt           *time.Time
	NextSyncAt             *time.Time
	LastSyncImported       int
	LastSyncError          string
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

type PublicSubscriptionSource struct {
	ID                     uint64
	Name                   string
	Scope                  Scope
	Enabled                bool
	URLConfigured          bool
	ProxyConfigured        bool
	RefreshIntervalSeconds int
	DefaultAccountCapacity int
	LastSyncedAt           *time.Time
	NextSyncAt             *time.Time
	LastSyncImported       int
	LastSyncError          string
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

// FallbackMode controls what happens when no primary egress node can be
// acquired for a request scope. The default is deliberately none so upgrades
// preserve the existing fail-closed behavior.
type FallbackMode string

const (
	FallbackModeNone   FallbackMode = "none"
	FallbackModeDirect FallbackMode = "direct"
	FallbackModeFixed  FallbackMode = "fixed"
)

func (value FallbackMode) IsValid() bool {
	switch value {
	case FallbackModeNone, FallbackModeDirect, FallbackModeFixed:
		return true
	default:
		return false
	}
}

// Normalized maps the zero value left by pre-fallback database rows to the
// conservative disabled mode.
func (value FallbackMode) Normalized() FallbackMode {
	if value == "" {
		return FallbackModeNone
	}
	return value
}

type FallbackConfig struct {
	Mode   FallbackMode
	NodeID uint64
}

type ProbeProvider string

const (
	ProbeProviderIPInfo     ProbeProvider = "ipinfo"
	ProbeProviderCloudflare ProbeProvider = "cloudflare"
)

func (value ProbeProvider) IsValid() bool {
	return value == ProbeProviderIPInfo || value == ProbeProviderCloudflare
}

func (value ProbeProvider) Normalized() ProbeProvider {
	if !value.IsValid() {
		return ProbeProviderCloudflare
	}
	return value
}

// OperationsConfig controls background probe, account assignment, and egress
// fallback work. It defaults to a conservative disabled state for mutations
// and fallback routing.
type OperationsConfig struct {
	ProbeProvider             ProbeProvider
	ProbeIntervalSeconds      int
	AutoAssignEnabled         bool
	AutoBalanceEnabled        bool
	AssignmentIntervalSeconds int
	Fallbacks                 map[Scope]FallbackConfig
	UpdatedAt                 time.Time
}

func DefaultOperationsConfig() OperationsConfig {
	return OperationsConfig{
		ProbeProvider:             ProbeProviderCloudflare,
		ProbeIntervalSeconds:      900,
		AssignmentIntervalSeconds: 300,
		Fallbacks: map[Scope]FallbackConfig{
			ScopeBuild:        {Mode: FallbackModeNone},
			ScopeWeb:          {Mode: FallbackModeNone},
			ScopeConsole:      {Mode: FallbackModeNone},
			ScopeWebAsset:     {Mode: FallbackModeNone},
			ScopeConsoleAsset: {Mode: FallbackModeNone},
			ScopeShared:       {Mode: FallbackModeNone},
		},
	}
}

// FallbackFor always returns a canonical, safe fallback value. It accepts
// sparse maps so older callers and historical records remain compatible.
func (value OperationsConfig) FallbackFor(scope Scope) FallbackConfig {
	fallback := value.Fallbacks[scope]
	fallback.Mode = fallback.Mode.Normalized()
	if fallback.Mode != FallbackModeFixed {
		fallback.NodeID = 0
	}
	return fallback
}

// ServesBuild reports whether the scope can carry Build traffic.
// The shared scope serves both Build and Web.
func ServesBuild(scope Scope) bool {
	return scope == ScopeBuild || scope == ScopeShared
}

// SupportsScope reports whether a node can serve requests for the supplied
// scope. Console may intentionally reuse a Web browser proxy. Resource scopes
// may reuse their provider's primary node so explicit account bindings remain
// authoritative when no independently bound resource identity exists.
func SupportsScope(nodeScope, requestScope Scope) bool {
	if nodeScope == requestScope {
		return true
	}
	// 共用节点同时服务 Build 与 Web；Console 与资源请求沿用浏览器身份，也能复用。
	if nodeScope == ScopeShared {
		switch requestScope {
		case ScopeBuild, ScopeWeb, ScopeWebAsset, ScopeConsole, ScopeConsoleAsset:
			return true
		default:
			return false
		}
	}
	switch requestScope {
	case ScopeWebAsset, ScopeConsole:
		return nodeScope == ScopeWeb
	case ScopeConsoleAsset:
		return nodeScope == ScopeConsole || nodeScope == ScopeWeb
	default:
		return false
	}
}
