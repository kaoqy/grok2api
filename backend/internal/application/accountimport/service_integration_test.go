package accountimport

import (
	"context"
	"encoding/base64"
	"path/filepath"
	"testing"

	accountapp "github.com/chenyme/grok2api/backend/internal/application/account"
	egressapp "github.com/chenyme/grok2api/backend/internal/application/egress"
	accountdomain "github.com/chenyme/grok2api/backend/internal/domain/account"
	"github.com/chenyme/grok2api/backend/internal/infra/persistence/relational"
	"github.com/chenyme/grok2api/backend/internal/infra/provider"
	cliprovider "github.com/chenyme/grok2api/backend/internal/infra/provider/cli"
	"github.com/chenyme/grok2api/backend/internal/infra/security"
)

func TestImportBuildPersistsCredentialAndEgressAssignment(t *testing.T) {
	ctx := context.Background()
	database, err := relational.OpenSQLite(ctx, filepath.Join(t.TempDir(), "account-import.db"))
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
	accountRepo := relational.NewAccountRepository(database)
	providerRegistry := provider.NewRegistry(cliprovider.NewAdapter(cliprovider.Config{}, cipher))
	accountService := accountapp.NewService(accountRepo, nil, nil, nil, providerRegistry, cipher, nil)
	egressService := egressapp.NewService(relational.NewEgressRepository(database), cipher, "test-browser", accountRepo)

	result, err := NewService(accountService, egressService).ImportBuild(ctx, Input{
		Email:       "import@example.com",
		AccessToken: "access-token",
		IDToken:     "id-token",
		ProxyName:   "Singapore Oracle",
		ProxyURL:    "socks5://user:pass@129.150.51.127:4499",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Created != 1 || result.AccountID == 0 || result.EgressNodeID == 0 {
		t.Fatalf("result = %#v", result)
	}
	stored, err := accountRepo.Get(ctx, result.AccountID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Provider != accountdomain.ProviderBuild || stored.Email != "import@example.com" ||
		stored.EgressNodeID != result.EgressNodeID || stored.EgressAssignmentMode != accountdomain.EgressAssignmentManual {
		t.Fatalf("stored credential = %#v", stored)
	}
}
