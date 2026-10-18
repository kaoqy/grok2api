package accountimport

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	accountimportapp "github.com/chenyme/grok2api/backend/internal/application/accountimport"
	"github.com/gin-gonic/gin"
)

type fakeImportService struct {
	input  accountimportapp.Input
	result accountimportapp.Result
	err    error
}

func (f *fakeImportService) ImportBuild(_ context.Context, input accountimportapp.Input) (accountimportapp.Result, error) {
	f.input = input
	return f.result, f.err
}

func TestCreateBuildImportSendsCredentialsAndProxyToService(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &fakeImportService{result: accountimportapp.Result{
		Created: 1, AccountID: 77, AccountIDs: []uint64{77}, EgressNodeID: 41,
		EgressNodeName: "Singapore Oracle", ProxyDisplay: "129.150.51.127:4499", ReusedEgressNode: true,
	}}
	handler := NewHandler(service)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/admin/v1/account-imports/build", strings.NewReader(`{
		"email":"user@example.com",
		"name":"Primary Build",
		"clientId":"client-1",
		"accessToken":"access-token",
		"refreshToken":"refresh-token",
		"idToken":"id-token",
		"expiresAt":"2026-10-18T15:06:40Z",
		"proxyName":"Singapore Oracle",
		"proxyUrl":"socks5://user:pass@129.150.51.127:4499"
	}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.createBuild(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if service.input.Email != "user@example.com" || service.input.Name != "Primary Build" ||
		service.input.AccessToken != "access-token" || service.input.RefreshToken != "refresh-token" ||
		service.input.IDToken != "id-token" || service.input.ProxyURL != "socks5://user:pass@129.150.51.127:4499" {
		t.Fatalf("input = %#v", service.input)
	}
	for _, expected := range []string{
		`"created":1`,
		`"accountId":"77"`,
		`"egressNodeId":"41"`,
		`"egressNodeName":"Singapore Oracle"`,
		`"proxyDisplay":"129.150.51.127:4499"`,
		`"reusedEgressNode":true`,
	} {
		if !strings.Contains(recorder.Body.String(), expected) {
			t.Fatalf("body %s does not contain %s", recorder.Body.String(), expected)
		}
	}
}

func TestCreateBuildImportRejectsMalformedJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewHandler(&fakeImportService{})
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/admin/v1/account-imports/build", strings.NewReader(`{"email":`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.createBuild(ctx)

	if recorder.Code != http.StatusBadRequest || !strings.Contains(recorder.Body.String(), `"code":"invalidBuildImport"`) {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}
