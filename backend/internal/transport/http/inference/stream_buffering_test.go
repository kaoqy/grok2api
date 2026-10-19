package inference

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/chenyme/grok2api/backend/internal/application/gateway"
	"github.com/gin-gonic/gin"
)

// A reverse proxy in front of the API (nginx/openresty) buffers upstream
// responses by default. For an SSE response that means the client sees
// nothing at all until the upstream call finishes, which users experience as
// "requesting the 2API produces no output". X-Accel-Buffering: no disables
// that buffering, and no-transform stops intermediaries from recompressing
// the event stream.
func TestStreamingResponseDisablesProxyBuffering(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewHandler(nil, nil, 1<<20)
	stream := "data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\n" + "data: [DONE]\n\n"
	result := &gateway.Result{
		StatusCode: http.StatusOK,
		Status:     "200 OK",
		Header: http.Header{
			"Content-Type":  {"text/event-stream"},
			"Cache-Control": {"no-cache"},
		},
		Body: io.NopCloser(strings.NewReader(stream)),
		Finalize: func(_ gateway.Usage, _, _ string) {},
	}
	router := gin.New()
	router.POST("/", func(c *gin.Context) {
		handler.writeResult(c, result, true, streamProtocolChat)
	})
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/", nil))

	if got := recorder.Header().Get("X-Accel-Buffering"); got != "no" {
		t.Fatalf("X-Accel-Buffering = %q, want %q", got, "no")
	}
	cacheControl := recorder.Header().Get("Cache-Control")
	if !strings.Contains(cacheControl, "no-cache") || !strings.Contains(cacheControl, "no-transform") {
		t.Fatalf("Cache-Control = %q, want no-cache and no-transform", cacheControl)
	}
	if !strings.Contains(recorder.Body.String(), "\"content\":\"hi\"") {
		t.Fatalf("stream body = %q", recorder.Body.String())
	}
}

// Non-streaming responses are plain JSON documents; proxy buffering is
// harmless there and must not be disabled.
func TestNonStreamingResponseKeepsProxyBufferingDefaults(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewHandler(nil, nil, 1<<20)
	result := &gateway.Result{
		StatusCode: http.StatusOK,
		Status:     "200 OK",
		Header:     http.Header{"Content-Type": {"application/json"}},
		Body:       io.NopCloser(strings.NewReader(`{"ok":true}`)),
		Finalize:   func(_ gateway.Usage, _, _ string) {},
	}
	router := gin.New()
	router.POST("/", func(c *gin.Context) {
		handler.writeResult(c, result, false, streamProtocolChat)
	})
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/", nil))

	if got := recorder.Header().Get("X-Accel-Buffering"); got != "" {
		t.Fatalf("X-Accel-Buffering = %q, want empty for non-streaming", got)
	}
}
