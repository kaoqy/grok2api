package account

import (
	"context"
	"testing"
	"time"

	accountdomain "github.com/chenyme/grok2api/backend/internal/domain/account"
	"github.com/chenyme/grok2api/backend/internal/repository"
)

type buildQuotaResetRepository struct {
	repository.AccountRepository
	recoveries    map[uint64]accountdomain.QuotaRecovery
	cleared       []uint64
	savedRecovery []accountdomain.QuotaRecovery
}

func (r *buildQuotaResetRepository) ListDueQuotaRecoveries(_ context.Context, provider accountdomain.Provider, now time.Time, limit int) ([]accountdomain.QuotaRecovery, error) {
	if provider != accountdomain.ProviderBuild {
		return nil, nil
	}
	values := make([]accountdomain.QuotaRecovery, 0, len(r.recoveries))
	for _, value := range r.recoveries {
		if value.NextProbeAt == nil || value.NextProbeAt.After(now) {
			continue
		}
		values = append(values, value)
		if len(values) >= limit {
			break
		}
	}
	return values, nil
}

func (r *buildQuotaResetRepository) ClearQuotaRecovery(_ context.Context, accountID uint64) error {
	r.cleared = append(r.cleared, accountID)
	delete(r.recoveries, accountID)
	return nil
}

func (r *buildQuotaResetRepository) SaveQuotaRecovery(_ context.Context, value accountdomain.QuotaRecovery) error {
	r.savedRecovery = append(r.savedRecovery, value)
	return nil
}

type buildQuotaResetAudits struct {
	repository.AuditRepository
	tokens map[uint64]int64
}

func (a *buildQuotaResetAudits) SumTokensByAccountsSince(_ context.Context, accountIDs []uint64, _ time.Time) (map[uint64]int64, error) {
	result := make(map[uint64]int64, len(accountIDs))
	for _, id := range accountIDs {
		result[id] = a.tokens[id]
	}
	return result, nil
}

// The upstream reports the free allowance as a rolling 24-hour token window
// ("Usage resets over a rolling 24-hour window — tokens (actual/limit):
// 537365/500000"), so once the observed rolling usage drops back below the
// limit the account can serve requests again and must be re-admitted.
func TestResetExpiredBuildQuotaRestoresRecoveredAccount(t *testing.T) {
	now := time.Now().UTC()
	due := now.Add(-time.Minute)
	repo := &buildQuotaResetRepository{recoveries: map[uint64]accountdomain.QuotaRecovery{
		11: {AccountID: 11, Kind: accountdomain.QuotaRecoveryKindFree, Status: accountdomain.QuotaRecoveryStatusExhausted, NextProbeAt: &due},
	}}
	audits := &buildQuotaResetAudits{tokens: map[uint64]int64{11: 120_000}}
	service := NewService(repo, audits, nil, nil, nil, nil, nil)

	restored, err := service.ResetExpiredBuildQuota(context.Background(), now)
	if err != nil {
		t.Fatalf("ResetExpiredBuildQuota error: %v", err)
	}
	if restored != 1 || len(repo.cleared) != 1 || repo.cleared[0] != 11 {
		t.Fatalf("restored = %d, cleared = %v", restored, repo.cleared)
	}
}

func TestResetExpiredBuildQuotaKeepsAccountStillExhausted(t *testing.T) {
	now := time.Now().UTC()
	due := now.Add(-time.Minute)
	repo := &buildQuotaResetRepository{recoveries: map[uint64]accountdomain.QuotaRecovery{
		12: {
			AccountID: 12, Kind: accountdomain.QuotaRecoveryKindFree, Status: accountdomain.QuotaRecoveryStatusExhausted,
			ConfirmedUsed: 537_365, ConfirmedLimit: 500_000, NextProbeAt: &due,
		},
	}}
	audits := &buildQuotaResetAudits{tokens: map[uint64]int64{12: 537_365}}
	service := NewService(repo, audits, nil, nil, nil, nil, nil)

	restored, err := service.ResetExpiredBuildQuota(context.Background(), now)
	if err != nil {
		t.Fatalf("ResetExpiredBuildQuota error: %v", err)
	}
	if restored != 0 || len(repo.cleared) != 0 {
		t.Fatalf("restored = %d, cleared = %v", restored, repo.cleared)
	}
	if len(repo.savedRecovery) != 1 {
		t.Fatalf("saved recovery count = %d, want 1", len(repo.savedRecovery))
	}
	next := repo.savedRecovery[0].NextProbeAt
	if next == nil || !next.After(now) {
		t.Fatalf("next probe = %v, want a future time", next)
	}
}

func TestResetExpiredBuildQuotaIgnoresPaidRecovery(t *testing.T) {
	now := time.Now().UTC()
	due := now.Add(-time.Minute)
	repo := &buildQuotaResetRepository{recoveries: map[uint64]accountdomain.QuotaRecovery{
		13: {AccountID: 13, Kind: accountdomain.QuotaRecoveryKindPaid, Status: accountdomain.QuotaRecoveryStatusExhausted, NextProbeAt: &due},
	}}
	audits := &buildQuotaResetAudits{tokens: map[uint64]int64{}}
	service := NewService(repo, audits, nil, nil, nil, nil, nil)

	restored, err := service.ResetExpiredBuildQuota(context.Background(), now)
	if err != nil {
		t.Fatalf("ResetExpiredBuildQuota error: %v", err)
	}
	if restored != 0 || len(repo.cleared) != 0 {
		t.Fatalf("restored = %d, cleared = %v", restored, repo.cleared)
	}
}
