package account

import (
	"context"
	"testing"
	"time"

	accountdomain "github.com/chenyme/grok2api/backend/internal/domain/account"
	"github.com/chenyme/grok2api/backend/internal/repository"
)

// TestRestoreAutoDisabledAccountAfterQuotaRefresh 覆盖「停用即 enabled=false，
// 额度刷新后自动重新启用」这条规则：账号只是被标记，永远不会被移除。
func TestRestoreAutoDisabledAccountAfterQuotaRefresh(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 7, 21, 10, 0, 0, 0, time.UTC)
	service, repo := newAutoCleanTestService(t, now)

	auto := mustUpsert(t, repo, accountdomain.Credential{
		Provider: accountdomain.ProviderBuild, Name: "auto-disabled", SourceKey: "auto-disabled",
		EncryptedAccessToken: "x", Enabled: true, AuthStatus: accountdomain.AuthStatusActive,
	})
	manual := mustUpsert(t, repo, accountdomain.Credential{
		Provider: accountdomain.ProviderBuild, Name: "manual-disabled", SourceKey: "manual-disabled",
		EncryptedAccessToken: "x", Enabled: true, AuthStatus: accountdomain.AuthStatusActive,
	})

	// 网关因为连续缺少 thinking 自动停用账号：enabled=false + 自动停用标记。
	disabled := false
	autoDisabled := true
	autoReason := accountdomain.DisabledReasonMissingThinking
	if _, err := repo.UpdateMany(ctx, accountdomain.ProviderBuild, []uint64{auto.ID}, repository.AccountUpdates{
		Enabled: &disabled, AutoDisabled: &autoDisabled, DisabledReason: &autoReason,
	}); err != nil {
		t.Fatal(err)
	}
	// 运维手动停用的账号没有任何自动标记。
	if _, err := repo.UpdateMany(ctx, accountdomain.ProviderBuild, []uint64{manual.ID}, repository.AccountUpdates{Enabled: &disabled}); err != nil {
		t.Fatal(err)
	}

	current, err := repo.Get(ctx, auto.ID)
	if err != nil {
		t.Fatal(err)
	}
	service.restoreAutoDisabledAccount(ctx, current)

	restored, err := repo.Get(ctx, auto.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !restored.Enabled {
		t.Fatal("auto disabled account should be re-enabled after a quota refresh")
	}
	if restored.LastError != "" {
		t.Fatalf("auto disabled account should clear the marker, got %q", restored.LastError)
	}

	current, err = repo.Get(ctx, manual.ID)
	if err != nil {
		t.Fatal(err)
	}
	service.restoreAutoDisabledAccount(ctx, current)

	stillDisabled, err := repo.Get(ctx, manual.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stillDisabled.Enabled {
		t.Fatal("manually disabled account must stay disabled")
	}
}
