package media

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestS3OptionsNormalizedDefaults(t *testing.T) {
	options := S3Options{Enabled: true, Bucket: "  bucket  ", Region: "  "}.Normalized()
	if options.Bucket != "bucket" {
		t.Fatalf("bucket = %q", options.Bucket)
	}
	if options.Region != "us-east-1" {
		t.Fatalf("region = %q", options.Region)
	}
	disabled := S3Options{Enabled: false, Bucket: "bucket"}.Normalized()
	if disabled.Bucket != "" || disabled.Region != "" {
		t.Fatalf("disabled options must stay empty: %#v", disabled)
	}
}

func TestS3ClientRejectsIncompleteConfig(t *testing.T) {
	if err := (S3Options{Enabled: true}).Validate(); err == nil {
		t.Fatal("enabled S3 without bucket must fail")
	}
	if err := (S3Options{Enabled: true, Bucket: "b"}).Validate(); err == nil {
		t.Fatal("enabled S3 without keys must fail")
	}
	if err := (S3Options{Enabled: false}).Validate(); err != nil {
		t.Fatalf("disabled S3 must not require parameters: %v", err)
	}
}

func TestS3ClientPublicURL(t *testing.T) {
	client, err := NewS3Client(S3Options{
		Enabled: true, Bucket: "bucket", Region: "us-east-1", AccessKey: "ak", SecretKey: "sk",
		Prefix: "media", PublicBaseURL: "https://cdn.example",
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := client.PublicURL("images/ab/abc.png"); got != "https://cdn.example/media/images/ab/abc.png" {
		t.Fatalf("public URL = %q", got)
	}
	endpoint, err := NewS3Client(S3Options{
		Enabled: true, Bucket: "bucket", Region: "us-east-1", AccessKey: "ak", SecretKey: "sk",
		Endpoint: "https://minio.example", PathStyle: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := endpoint.PublicURL("images/ab/abc.png"); got != "https://minio.example/bucket/images/ab/abc.png" {
		t.Fatalf("path style URL = %q", got)
	}
}

func TestObjectStoreRoutesImagesToS3(t *testing.T) {
	var seen []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.Method+" "+r.URL.Path)
		if r.Header.Get("Authorization") == "" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		switch r.Method {
		case http.MethodPut:
			w.WriteHeader(http.StatusOK)
		case http.MethodGet:
			_, _ = w.Write([]byte("payload"))
		case http.MethodDelete:
			w.WriteHeader(http.StatusNoContent)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
	defer server.Close()
	local, err := NewLocalStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	store := NewObjectStore(local)
	if store.ActiveDriver() != StorageDriverLocal {
		t.Fatalf("driver before configure = %q", store.ActiveDriver())
	}
	if err := store.Configure(S3Options{
		Enabled: true, Bucket: "bucket", Region: "us-east-1", AccessKey: "ak", SecretKey: "sk",
		Endpoint: server.URL, PathStyle: true,
	}); err != nil {
		t.Fatal(err)
	}
	if store.ActiveDriver() != StorageDriverS3 {
		t.Fatalf("driver after configure = %q", store.ActiveDriver())
	}
	key, err := store.SaveImage(context.Background(), "img_0123456789", "image/png", []byte("payload"))
	if err != nil {
		t.Fatal(err)
	}
	if key != "images/im/img_0123456789.png" {
		t.Fatalf("storage key = %q", key)
	}
	body, err := store.Open(context.Background(), key)
	if err != nil {
		t.Fatal(err)
	}
	content, err := io.ReadAll(body)
	if err != nil {
		t.Fatal(err)
	}
	_ = body.Close()
	if string(content) != "payload" {
		t.Fatalf("content = %q", content)
	}
	if err := store.Delete(context.Background(), key); err != nil {
		t.Fatal(err)
	}
	if len(seen) != 3 || !strings.HasPrefix(seen[0], http.MethodPut) {
		t.Fatalf("requests = %#v", seen)
	}
	if err := store.Configure(S3Options{}); err != nil {
		t.Fatal(err)
	}
	if store.ActiveDriver() != StorageDriverLocal {
		t.Fatalf("driver after disable = %q", store.ActiveDriver())
	}
}
