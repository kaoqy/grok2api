package gateway

import (
	"strconv"
	"strings"
)

// freeQuotaExhaustionSignal recognises the Grok Build free token window being
// exhausted from a body that arrived inside an already-started stream.
//
// Before the response starts the upstream answers with HTTP 429 and
// parseFreeQuotaExhaustion handles that case. Once the stream has been handed
// to the client the same condition can only surface as a terminal failure
// event, so the account has to be recognised from that body as well. Without
// it the account stays in the pool and every following request keeps picking
// the exhausted account and stalls on the same upstream error.
func freeQuotaExhaustionSignal(body []byte) (used int64, limit int64, ok bool) {
	if len(body) == 0 {
		return 0, 0, false
	}
	text := strings.ToLower(string(body))
	if !strings.Contains(text, "subscription:free-usage-exhausted") &&
		!strings.Contains(text, "used all the included free usage for model") {
		return 0, 0, false
	}
	if matches := freeQuotaUsagePattern.FindSubmatch(body); len(matches) == 3 {
		parsedUsed, usedErr := strconv.ParseInt(string(matches[1]), 10, 64)
		parsedLimit, limitErr := strconv.ParseInt(string(matches[2]), 10, 64)
		if usedErr == nil && limitErr == nil {
			return parsedUsed, parsedLimit, true
		}
	}
	return 0, 0, true
}
