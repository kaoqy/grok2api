package media

import (
	"context"
	"encoding/base64"
	"path/filepath"
	"testing"
	"time"

	mediadomain "github.com/chenyme/grok2api/backend/internal/domain/media"
	localmedia "github.com/chenyme/grok2api/backend/internal/infra/media"
	"github.com/chenyme/grok2api/backend/internal/infra/persistence/relational"
)

// s3MediaStore 是一个只暴露公开直链的存储替身，用来验证公开地址会指向 S3。
type s3MediaStore struct {
	*localmedia.LocalStore
}

func (s *s3MediaStore) ActiveDriver() string { return "s3" }

func (s *s3MediaStore) PublicObjectURL(storageKey string) string {
	return "https://cdn.example/media/" + storageKey
}

func TestPublicImageURLUsesS3LinkForTransferredAssets(t *testing.T) {
	ctx := context.Background()
	database, err := relational.OpenSQLite(ctx, filepath.Join(t.TempDir(), "media.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatal(err)
	}
	local, err := localmedia.NewLocalStore(filepath.Join(t.TempDir(), "objects"))
	if err != nil {
		t.Fatal(err)
	}
	store := &s3MediaStore{LocalStore: local}
	service := NewService(relational.NewMediaAssetRepository(database), relational.NewMediaJobRepository(database), store, nil, Config{
		PublicBaseURL: "https://api.example", MaxImageBytes: 32 << 20, MaxTotalBytes: 1 << 30,
		CleanupThresholdPercent: 80, CleanupInterval: 10 * time.Minute,
	})
	raw, err := base64.StdEncoding.DecodeString(onePixelPNG)
	if err != nil {
		t.Fatal(err)
	}
	asset, err := service.SaveImage(ctx, raw)
	if err != nil {
		t.Fatal(err)
	}
	if asset.StorageDriver != "s3" {
		t.Fatalf("storage driver = %q", asset.StorageDriver)
	}
	if got := service.PublicImageURL(asset); got != "https://cdn.example/media/"+asset.StorageKey {
		t.Fatalf("public URL = %q", got)
	}
	localAsset := mediadomain.Asset{ID: "img_local", StorageDriver: "local", StorageKey: "images/im/img_local.png"}
	if got := service.PublicImageURL(localAsset); got != "https://api.example/v1/media/images/img_local" {
		t.Fatalf("local URL = %q", got)
	}
}
