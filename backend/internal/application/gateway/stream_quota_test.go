package gateway

import "testing"

// The Build free allowance is a rolling 24-hour token window. When the window
// runs out mid-generation the upstream ends the already-started stream with a
// quota error instead of answering with HTTP 429, so the account has to be
// recognised as exhausted from the stream failure body.
func TestFreeQuotaExhaustionSignalReadsStreamFailureBody(t *testing.T) {
	for _, test := range []struct {
		name      string
		body      string
		wantOK    bool
		wantUsed  int64
		wantLimit int64
	}{
		{
			name:      "responses style failure",
			body:      `{"type":"response.failed","error":{"code":"subscription:free-usage-exhausted","message":"You've used all the included free usage for model grok-4.5-build-free for now. Usage resets over a rolling 24-hour window — tokens (actual/limit): 537365/500000."}}`,
			wantOK:    true,
			wantUsed:  537_365,
			wantLimit: 500_000,
		},
		{
			name:      "flat code and message",
			body:      `{"code":"subscription:free-usage-exhausted","message":"tokens (actual/limit): 1065387/1000000"}`,
			wantOK:    true,
			wantUsed:  1_065_387,
			wantLimit: 1_000_000,
		},
		{
			name:      "model scoped wording",
			body:      `{"type":"error","message":"used all the included free usage for model grok-4.6 for now"}`,
			wantOK:    true,
		},
		{
			name:   "unrelated stream failure",
			body:   `{"type":"response.failed","error":{"code":"server_error","message":"upstream exploded"}}`,
			wantOK: false,
		},
		{
			name:   "empty body",
			body:   "",
			wantOK: false,
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			used, limit, ok := freeQuotaExhaustionSignal([]byte(test.body))
			if ok != test.wantOK {
				t.Fatalf("ok = %v, want %v (used=%d limit=%d)", ok, test.wantOK, used, limit)
			}
			if !test.wantOK {
				return
			}
			if test.wantUsed != 0 && used != test.wantUsed {
				t.Fatalf("used = %d, want %d", used, test.wantUsed)
			}
			if test.wantLimit != 0 && limit != test.wantLimit {
				t.Fatalf("limit = %d, want %d", limit, test.wantLimit)
			}
		})
	}
}
