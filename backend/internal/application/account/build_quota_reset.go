package account

import (
	"context"
	"time"

	accountdomain "github.com/chenyme/grok2api/backend/internal/domain/account"
)

const (
	// buildQuotaResetInterval 是复核 Build 免费额度恢复状态的间隔。
	buildQuotaResetInterval = 15 * time.Minute
	// buildQuotaResetBatchSize 限制单次复核的账号数量，避免一次任务占用过多资源。
	buildQuotaResetBatchSize = 200
	// buildQuotaResetRetryPause 是账号仍未恢复时的下次复核时间。
	buildQuotaResetRetryPause = 30 * time.Minute
)

// ResetExpiredBuildQuota 复核已到期的 Build 免费额度恢复状态。
//
// 上游对免费额度使用滚动 24 小时窗口（"Usage resets over a rolling 24-hour
// window — tokens (actual/limit): 537365/500000"），因此额度会随窗口推移
// 自行恢复，而不是用完即废。这里按同一窗口口径重新统计账号的已用 Token：
// 已回落到额度上限以下就恢复该账号，否则保留耗尽状态并安排下次复核。
//
// 付费额度（QuotaRecoveryKindPaid）由账期结束时间决定，不在此处复核。
func (s *Service) ResetExpiredBuildQuota(ctx context.Context, now time.Time) (int, error) {
	if s.accounts == nil || s.audits == nil {
		return 0, nil
	}
	recoveries, err := s.accounts.ListDueQuotaRecoveries(ctx, accountdomain.ProviderBuild, now, buildQuotaResetBatchSize)
	if err != nil {
		return 0, err
	}
	if len(recoveries) == 0 {
		return 0, nil
	}
	accountIDs := make([]uint64, 0, len(recoveries))
	for _, recovery := range recoveries {
		if recovery.Kind == accountdomain.QuotaRecoveryKindFree {
			accountIDs = append(accountIDs, recovery.AccountID)
		}
	}
	if len(accountIDs) == 0 {
		return 0, nil
	}
	observed, err := s.audits.SumTokensByAccountsSince(ctx, accountIDs, now.Add(-freeUsageWindow))
	if err != nil {
		return 0, err
	}
	restored := 0
	restoredIDs := make([]uint64, 0, len(recoveries))
	for _, recovery := range recoveries {
		if recovery.Kind != accountdomain.QuotaRecoveryKindFree {
			continue
		}
		limit := recovery.ConfirmedLimit
		if limit <= 0 {
			limit = estimatedFreeTokenLimit
		}
		if observed[recovery.AccountID] < limit {
			restoredIDs = append(restoredIDs, recovery.AccountID)
			restored++
			continue
		}
		// 窗口内用量仍超限：保留耗尽状态，稍后再次复核。
		next := now.Add(buildQuotaResetRetryPause)
		recovery.NextProbeAt = &next
		recovery.UpdatedAt = now
		if err := s.accounts.SaveQuotaRecovery(ctx, recovery); err != nil {
			s.logger.Error("build_quota_recovery_reschedule_failed", "account_id", recovery.AccountID, "error", err)
		}
	}
	if len(restoredIDs) > 0 {
		// ResetQuotaState clears the exhausted marker together with the model
		// quota blocks, so a recovered account is fully routable again.
		if err := s.accounts.ResetQuotaState(ctx, accountdomain.ProviderBuild, restoredIDs); err != nil {
			s.logger.Error("build_quota_reset_failed", "account_ids", restoredIDs, "error", err)
			return 0, err
		}
	}
	return restored, nil
}

// RunBuildQuotaReset 周期性复核 Build 免费额度账号，使额度恢复后的账号自动回到号池。
func (s *Service) RunBuildQuotaReset(ctx context.Context) {
	ticker := time.NewTicker(buildQuotaResetInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			restored, err := s.ResetExpiredBuildQuota(ctx, now.UTC())
			if err != nil {
				s.logger.Warn("build_quota_reset_failed", "error", err)
				continue
			}
			if restored > 0 {
				s.logger.Info("build_quota_reset_completed", "restored", restored)
			}
		}
	}
}
