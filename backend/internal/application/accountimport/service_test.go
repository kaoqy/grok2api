package accountimport

import (
	"context"
	"encoding/json"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	accountapp "github.com/chenyme/grok2api/backend/internal/application/account"
	egressapp "github.com/chenyme/grok2api/backend/internal/application/egress"
	accountdomain "github.com/chenyme/grok2api/backend/internal/domain/account"
	egressdomain "github.com/chenyme/grok2api/backend/internal/domain/egress"
	"github.com/chenyme/grok2api/backend/internal/repository"
)

type fakeAccountImporter struct {
	document  []byte
	accountID uint64
}

func (f *fakeAccountImporter) ImportCredentialsWithObserver(_ context.Context, data []byte, observer accountapp.ImportedAccountObserver) (accountapp.ImportResult, error) {
	f.document = append([]byte(nil), data...)
	if observer != nil {
		if err := observer(f.accountID); err != nil {
			return accountapp.ImportResult{}, err
		}
	}
	return accountapp.ImportResult{Created: 1, AccountIDs: []uint64{f.accountID}}, nil
}

type fakeEgressManager struct {
	nodes          []egressdomain.PublicNode
	created        egressapp.Input
	createdNode    egressdomain.PublicNode
	assignedNodeID uint64
	assignedIDs    []uint64
	assignedMode   accountdomain.EgressAssignmentMode
}

type concurrentAccountImporter struct {
	next atomic.Uint64
}

func (f *concurrentAccountImporter) ImportCredentialsWithObserver(_ context.Context, _ []byte, observer accountapp.ImportedAccountObserver) (accountapp.ImportResult, error) {
	accountID := f.next.Add(1)
	if observer != nil {
		if err := observer(accountID); err != nil {
			return accountapp.ImportResult{}, err
		}
	}
	return accountapp.ImportResult{Created: 1, AccountIDs: []uint64{accountID}}, nil
}

type blockingEgressManager struct {
	mu          sync.Mutex
	nodes       []egressdomain.PublicNode
	listCalls   atomic.Int32
	firstList   chan struct{}
	releaseList chan struct{}
	createCalls atomic.Int32
}

func (f *blockingEgressManager) ListAll(context.Context, egressdomain.Scope, repository.SortQuery) ([]egressdomain.PublicNode, error) {
	if f.listCalls.Add(1) == 1 {
		close(f.firstList)
		<-f.releaseList
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]egressdomain.PublicNode(nil), f.nodes...), nil
}

func (f *blockingEgressManager) Create(_ context.Context, input egressapp.Input) (egressdomain.PublicNode, error) {
	f.createCalls.Add(1)
	f.mu.Lock()
	defer f.mu.Unlock()
	node := egressdomain.PublicNode{
		ID: uint64(len(f.nodes) + 1), Name: input.Name, Scope: egressdomain.ScopeBuild,
		Enabled: true, ProxyConfigured: true, ProxyDisplay: "129.150.51.127:4499",
		ProxyFingerprint: "7c01cdb4900c",
	}
	f.nodes = append(f.nodes, node)
	return node, nil
}

func (f *blockingEgressManager) AssignAccounts(context.Context, uint64, accountdomain.Provider, []uint64, accountdomain.EgressAssignmentMode) (egressapp.AssignmentResult, error) {
	return egressapp.AssignmentResult{Assigned: 1}, nil
}

func (f *fakeEgressManager) ListAll(context.Context, egressdomain.Scope, repository.SortQuery) ([]egressdomain.PublicNode, error) {
	return f.nodes, nil
}

func (f *fakeEgressManager) ProxyURL(context.Context, uint64) (string, error) {
	return "", nil
}

func (f *fakeEgressManager) Create(_ context.Context, input egressapp.Input) (egressdomain.PublicNode, error) {
	f.created = input
	return f.createdNode, nil
}

func (f *fakeEgressManager) AssignAccounts(_ context.Context, nodeID uint64, _ accountdomain.Provider, accountIDs []uint64, mode accountdomain.EgressAssignmentMode) (egressapp.AssignmentResult, error) {
	f.assignedNodeID = nodeID
	f.assignedIDs = append([]uint64(nil), accountIDs...)
	f.assignedMode = mode
	return egressapp.AssignmentResult{Assigned: len(accountIDs)}, nil
}

func TestImportBuildReusesMatchingSOCKSNodeAndBindsAccount(t *testing.T) {
	const proxyURL = "socks5://user:pass@129.150.51.127:4499"
	accounts := &fakeAccountImporter{accountID: 77}
	egress := &fakeEgressManager{nodes: []egressdomain.PublicNode{{
		ID: 41, Name: "Singapore Oracle", Scope: egressdomain.ScopeBuild, Enabled: true,
		ProxyConfigured: true, ProxyFingerprint: "7c01cdb4900c", ProxyDisplay: "129.150.51.127:4499",
	}}}
	service := NewService(accounts, egress)

	result, err := service.ImportBuild(context.Background(), Input{
		Email: "user@example.com", AccessToken: "access-token", RefreshToken: "refresh-token",
		IDToken: "id-token", ExpiresAt: "2026-10-18T15:06:40Z", ProxyURL: proxyURL,
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Created != 1 || result.AccountID != 77 || result.EgressNodeID != 41 || !result.ReusedEgressNode {
		t.Fatalf("result = %#v", result)
	}
	if egress.assignedNodeID != 41 || len(egress.assignedIDs) != 1 || egress.assignedIDs[0] != 77 || egress.assignedMode != accountdomain.EgressAssignmentManual {
		t.Fatalf("assignment = node:%d ids:%v mode:%s", egress.assignedNodeID, egress.assignedIDs, egress.assignedMode)
	}
	var document struct {
		Accounts []struct {
			Provider     string `json:"provider"`
			Name         string `json:"name"`
			Email        string `json:"email"`
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
			IDToken      string `json:"id_token"`
			ExpiresAt    string `json:"expires_at"`
		} `json:"accounts"`
	}
	if err := json.Unmarshal(accounts.document, &document); err != nil {
		t.Fatal(err)
	}
	if len(document.Accounts) != 1 {
		t.Fatalf("accounts = %#v", document.Accounts)
	}
	account := document.Accounts[0]
	if account.Provider != "grok_build" || account.Name != "user@example.com" || account.Email != "user@example.com" ||
		account.AccessToken != "access-token" || account.RefreshToken != "refresh-token" || account.IDToken != "id-token" ||
		account.ExpiresAt != "2026-10-18T15:06:40Z" {
		t.Fatalf("account document = %#v", account)
	}
}

func TestImportBuildSerializesProxyNodeCreation(t *testing.T) {
	egress := &blockingEgressManager{
		firstList:   make(chan struct{}),
		releaseList: make(chan struct{}),
	}
	service := NewService(&concurrentAccountImporter{}, egress)
	input := Input{
		Email: "concurrent@example.com", AccessToken: "access-token",
		ProxyURL: "socks5://user:pass@129.150.51.127:4499",
	}
	var wait sync.WaitGroup
	wait.Add(2)
	for range 2 {
		go func() {
			defer wait.Done()
			if _, err := service.ImportBuild(context.Background(), input); err != nil {
				t.Errorf("ImportBuild: %v", err)
			}
		}()
	}
	select {
	case <-egress.firstList:
	case <-time.After(2 * time.Second):
		t.Fatal("first import did not reach proxy lookup")
	}
	time.Sleep(40 * time.Millisecond)
	close(egress.releaseList)
	wait.Wait()
	if calls := egress.createCalls.Load(); calls != 1 {
		t.Fatalf("created %d duplicate proxy nodes, want 1", calls)
	}
}
