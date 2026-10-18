package registration

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFormatRunnerFailureIncludesNonJSONDiagnostics(t *testing.T) {
	err := formatRunnerFailure(
		errors.New("exit status 3"),
		[]string{"xvfb-run: xauth command not found; exiting."},
	)
	if err == nil {
		t.Fatal("expected an error")
	}
	message := err.Error()
	if !strings.Contains(message, "exit status 3") {
		t.Fatalf("error lost process status: %q", message)
	}
	if !strings.Contains(message, "xauth command not found") {
		t.Fatalf("error lost runner diagnostics: %q", message)
	}
}

func TestFormatRunnerFailureKeepsOriginalErrorWithoutDiagnostics(t *testing.T) {
	err := formatRunnerFailure(errors.New("exit status 1"), nil)
	if err == nil || err.Error() != "exit status 1" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDockerfileInstallsXAUTHForXVFBRun(t *testing.T) {
	path := filepath.Join("..", "..", "..", "..", "Dockerfile")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read Dockerfile: %v", err)
	}
	if !strings.Contains(string(data), "xauth") {
		t.Fatal("Dockerfile must install xauth because xvfb-run exits with status 3 without it")
	}
}
