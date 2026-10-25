package inference

import "testing"

func TestParseVideoRange(t *testing.T) {
	cases := []struct {
		header  string
		size    int64
		start   int64
		length  int64
		partial bool
		ok      bool
	}{
		{"", 1000, 0, 1000, false, true},
		{"bytes=0-99", 1000, 0, 100, true, true},
		{"bytes=900-", 1000, 900, 100, true, true},
		{"bytes=-100", 1000, 900, 100, true, true},
		{"bytes=-5000", 1000, 0, 1000, true, true},
		{"bytes=500-4999", 1000, 500, 500, true, true},
		{"bytes=1000-", 1000, 0, 0, false, false},
		{"bytes=10-5", 1000, 0, 0, false, false},
		{"items=0-1", 1000, 0, 0, false, false},
		{"bytes=0-1,5-6", 1000, 0, 1000, false, true},
	}
	for _, testCase := range cases {
		start, length, partial, ok := parseVideoRange(testCase.header, testCase.size)
		if start != testCase.start || length != testCase.length || partial != testCase.partial || ok != testCase.ok {
			t.Fatalf(
				"parseVideoRange(%q, %d) = (%d, %d, %v, %v), want (%d, %d, %v, %v)",
				testCase.header, testCase.size, start, length, partial, ok,
				testCase.start, testCase.length, testCase.partial, testCase.ok,
			)
		}
	}
}
