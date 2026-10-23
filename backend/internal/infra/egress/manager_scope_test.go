package egress

import (
	"testing"

	domain "github.com/chenyme/grok2api/backend/internal/domain/egress"
)

func TestFallbackScopeTiersMergeSharedScope(t *testing.T) {
	build := fallbackScopeTiers(domain.ScopeBuild)
	if len(build) != 1 || len(build[0]) != 2 || build[0][0] != domain.ScopeBuild || build[0][1] != domain.ScopeShared {
		t.Fatalf("build tiers = %#v", build)
	}
	web := fallbackScopeTiers(domain.ScopeWeb)
	if len(web) != 1 || len(web[0]) != 2 || web[0][0] != domain.ScopeWeb || web[0][1] != domain.ScopeShared {
		t.Fatalf("web tiers = %#v", web)
	}
	console := fallbackScopeTiers(domain.ScopeConsole)
	if len(console) != 2 {
		t.Fatalf("console tiers = %#v", console)
	}
	if console[1][0] != domain.ScopeWeb {
		t.Fatalf("console fallback tier must keep the web scope: %#v", console)
	}
	asset := fallbackScopeTiers(domain.ScopeWebAsset)
	if len(asset) != 2 || asset[0][0] != domain.ScopeWebAsset {
		t.Fatalf("web asset tiers = %#v", asset)
	}
}

func TestAllEgressScopesIncludesShared(t *testing.T) {
	found := false
	for _, scope := range allEgressScopes() {
		if scope == domain.ScopeShared {
			found = true
		}
	}
	if !found {
		t.Fatal("shared scope must be part of the managed scope list")
	}
}
