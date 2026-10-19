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
	input    accountimportapp.Input
	webInput accountimportapp.Input
	result   accountimportapp.Result
	err      error
}

type fakeKeyService struct {
	configured bool
	token      string
	created    int
	revoked    int
}

func (f *fakeKeyService) AccountImportKeyConfigured() bool { return f.configured }

func (f *fakeKeyService) CreateAccountImportKey(context.Context) (string, error) {
	f.created++
	f.configured = true
	f.token = "g2a_import_generated"
	return f.token, nil
}

func (f *fakeKeyService) RevokeAccountImportKey(context.Context) error {
	f.revoked++
	f.configured = false
	f.token = ""
	return nil
}

func (f *fakeImportService) ImportBuild(_ context.Context, input accountimportapp.Input) (accountimportapp.Result, error) {
	f.input = input
	return f.result, f.err
}

func (f *fakeImportService) ImportWeb(_ context.Context, input accountimportapp.Input) (accountimportapp.Result, error) {
	f.webInput = input
	return f.result, f.err
}

func TestCreateBuildImportSendsCredentialsAndProxyToService(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &fakeImportService{result: accountimportapp.Result{
		Created: 1, AccountID: 77, AccountIDs: []uint64{77}, EgressNodeID: 41,
		EgressNodeName: "Singapore Oracle", ProxyDisplay: "129.150.51.127:4499", ReusedEgressNode: true,
	}}
	handler := NewHandler(service, &fakeKeyService{})
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

// Web 账号导入端点用于生图等 Web 侧能力，同样携带代理绑定信息。
func TestCreateWebImportSendsTokenAndProxyToService(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &fakeImportService{result: accountimportapp.Result{
		Created: 1, AccountID: 88, AccountIDs: []uint64{88}, EgressNodeID: 42,
		EgressNodeName: "Singapore Web", ProxyDisplay: "129.150.51.127:4499", ReusedEgressNode: true,
	}}
	handler := NewHandler(service, &fakeKeyService{})
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/import/v1/accounts/web", strings.NewReader(`{
		"email":"user@example.com",
		"name":"Primary Web",
		"ssoToken":"sso-token-value",
		"tier":"auto",
		"proxyName":"Singapore Web",
		"proxyUrl":"socks5://user:pass@129.150.51.127:4499"
	}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.createWeb(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if service.webInput.Email != "user@example.com" || service.webInput.Name != "Primary Web" ||
		service.webInput.SSOToken != "sso-token-value" || service.webInput.Tier != "auto" ||
		service.webInput.ProxyURL != "socks5://user:pass@129.150.51.127:4499" {
		t.Fatalf("web input = %#v", service.webInput)
	}
	for _, expected := range []string{`"created":1`, `"accountId":"88"`, `"egressNodeId":"42"`} {
		if !strings.Contains(recorder.Body.String(), expected) {
			t.Fatalf("body %s does not contain %s", recorder.Body.String(), expected)
		}
	}
}

func TestCreateBuildImportRejectsMalformedJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewHandler(&fakeImportService{}, &fakeKeyService{})
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/admin/v1/account-imports/build", strings.NewReader(`{"email":`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	handler.createBuild(ctx)

	if recorder.Code != http.StatusBadRequest || !strings.Contains(recorder.Body.String(), `"code":"invalidBuildImport"`) {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestAccountImportKeyEndpointsCreateAndRevokeToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	keys := &fakeKeyService{}
	handler := NewHandler(&fakeImportService{}, keys)
	router := gin.New()
	handler.Register(router.Group("/api/admin/v1"))

	statusRecorder := httptest.NewRecorder()
	router.ServeHTTP(statusRecorder, httptest.NewRequest(http.MethodGet, "/api/admin/v1/account-imports/key", nil))
	if statusRecorder.Code != http.StatusOK || !strings.Contains(statusRecorder.Body.String(), `"configured":false`) {
		t.Fatalf("status = %d, body = %s", statusRecorder.Code, statusRecorder.Body.String())
	}

	createRecorder := httptest.NewRecorder()
	router.ServeHTTP(createRecorder, httptest.NewRequest(http.MethodPost, "/api/admin/v1/account-imports/key", nil))
	if createRecorder.Code != http.StatusCreated || !strings.Contains(createRecorder.Body.String(), `"token":"g2a_import_generated"`) || keys.created != 1 {
		t.Fatalf("status = %d, body = %s", createRecorder.Code, createRecorder.Body.String())
	}

	deleteRecorder := httptest.NewRecorder()
	router.ServeHTTP(deleteRecorder, httptest.NewRequest(http.MethodDelete, "/api/admin/v1/account-imports/key", nil))
	if deleteRecorder.Code != http.StatusOK || !strings.Contains(deleteRecorder.Body.String(), `"configured":false`) || keys.revoked != 1 {
		t.Fatalf("status = %d, body = %s", deleteRecorder.Code, deleteRecorder.Body.String())
	}
}
