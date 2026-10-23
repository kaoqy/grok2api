package account

import (
	"context"
	"encoding/base64"
	"path/filepath"
	"testing"
	"time"

	accountdomain "github.com/chenyme/grok2api/backend/internal/domain/account"
	"github.com/chenyme/grok2api/backend/internal/infra/persistence/relational"
	"github.com/chenyme/grok2api/backend/internal/infra/provider"
	"github.com/chenyme/grok2api/backend/internal/infra/runtime/memory"
	"github.com/chenyme/grok2api/backend/internal/infra/security"
	"github.com/chenyme/grok2api/backend/internal/repository"
)

// disableTestAudits 是审计仓库的最小实现：账号视图只需要令牌汇总。
type disableTestAudits struct {
	repository.AuditRepository
}

func (a *disableTestAudits) SumTokensByAccountsSince(_ context.Context, _ []uint64, _ time.Time) (map[uint64]int64, error) {
	return map[uint64]int64{}, nil
}

// newDisableTestService 构造一个带 Provider 与密钥服务的账号服务，
// 便于走完整的 Update / Get 路径。
func newDisableTestService(t *testing.T, now time.Time) (*Service, *relational.AccountRepository) {
	t.Helper()
	ctx := context.Background()
	database, err := relational.OpenSQLite(ctx, filepath.Join(t.TempDir(), "disable.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatal(err)
	}
	cipher, err := security.NewCipher(base64.StdEncoding.EncodeToString(make([]byte, 32)))
	if err != nil {
		t.Fatal(err)
	}
	repo := relational.NewAccountRepository(database)
	service := NewService(repo, &disableTestAudits{}, nil, memory.NewStickyStore(), provider.NewRegistry(&selectedQuotaAdapter{providerValue: accountdomain.ProviderBuild}), cipher, memory.NewLockStore())
	service.now = func() time.Time { return now }
	return service, repo
}

// TestAutoDisableFlagSurvivesOtherHealthUpdates 验证自动停用标记独立于
// last_error：健康检查写入其它错误后，账号仍能被识别为「系统自动停用」。
func TestAutoDisableFlagSurvivesOtherHealthUpdates(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 22, 10, 0, 0, 0, time.UTC)
	service, repo := newDisableTestService(t, now)

	value := mustUpsert(t, repo, accountdomain.Credential{
		Provider: accountdomain.ProviderBuild, AuthType: accountdomain.AuthTypeOAuth, Name: "auto-disabled", SourceKey: "auto-disabled",
		EncryptedAccessToken: "x", Enabled: true, AuthStatus: accountdomain.AuthStatusActive,
	})

	// 网关因连续缺少 thinking 自动停用账号。
	disabled := false
	autoDisabled := true
	reason := accountdomain.DisabledReasonMissingThinking
	if _, err := repo.UpdateMany(ctx, accountdomain.ProviderBuild, []uint64{value.ID}, repository.AccountUpdates{
		Enabled: &disabled, AutoDisabled: &autoDisabled, DisabledReason: &reason,
	}); err != nil {
		t.Fatal(err)
	}

	// 随后的健康检查写入普通上游错误，不能抹掉自动停用标记。
	if err := repo.UpdateHealth(ctx, value.ID, accountdomain.ProviderBuild, 1, nil, "upstream 502", false); err != nil {
		t.Fatal(err)
	}
	stored, err := repo.Get(ctx, value.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Enabled {
		t.Fatal("account should stay disabled")
	}
	if !stored.AutoDisabled {
		t.Fatal("auto-disabled flag was lost by a health update")
	}
	if stored.DisabledReason != accountdomain.DisabledReasonMissingThinking {
		t.Fatalf("disabled reason = %q", stored.DisabledReason)
	}

	// 额度刷新成功后账号必须自动恢复。
	service.restoreAutoDisabledAccount(ctx, stored)
	restored, err := repo.Get(ctx, value.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !restored.Enabled {
		t.Fatal("auto-disabled account should be re-enabled after a quota refresh")
	}
	if restored.AutoDisabled {
		t.Fatal("auto-disabled flag should be cleared after restore")
	}
}

// TestManualDisableIsNotAutoRestored 验证管理员手动停用的账号不会被
// 额度刷新偷偷重新启用。
func TestManualDisableIsNotAutoRestored(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 22, 11, 0, 0, 0, time.UTC)
	service, repo := newDisableTestService(t, now)

	value := mustUpsert(t, repo, accountdomain.Credential{
		Provider: accountdomain.ProviderBuild, AuthType: accountdomain.AuthTypeOAuth, Name: "manual-disabled", SourceKey: "manual-disabled",
		EncryptedAccessToken: "x", Enabled: true, AuthStatus: accountdomain.AuthStatusActive,
	})

	// 先把账号标记成被系统自动停用，再由管理员手动停用：
	// 管理员的意图必须覆盖系统的自动标记。
	autoDisabled := true
	autoReason := accountdomain.DisabledReasonMissingThinking
	if _, err := repo.UpdateMany(ctx, accountdomain.ProviderBuild, []uint64{value.ID}, repository.AccountUpdates{
		AutoDisabled: &autoDisabled, DisabledReason: &autoReason,
	}); err != nil {
		t.Fatal(err)
	}
	manual := false
	if _, err := service.Update(ctx, value.ID, UpdateInput{Enabled: &manual}); err != nil {
		t.Fatal(err)
	}
	stored, err := repo.Get(ctx, value.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Enabled {
		t.Fatal("account should be disabled")
	}
	if stored.AutoDisabled {
		t.Fatal("a manual disable must not be marked as automatic")
	}

	service.restoreAutoDisabledAccount(ctx, stored)
	after, err := repo.Get(ctx, value.ID)
	if err != nil {
		t.Fatal(err)
	}
	if after.Enabled {
		t.Fatal("a manually disabled account must stay disabled")
	}
}
