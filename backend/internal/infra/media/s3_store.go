package media

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"sort"
	"strings"
	"sync"
	"time"
)

// 媒体对象存储驱动标识。
const (
	StorageDriverLocal = "local"
	StorageDriverS3    = "s3"
)

// S3Options 描述把生成图片转存到对象存储的运行参数。
// 管理员不启用时，图片仍然保存在本地目录，接口返回本地网关地址。
type S3Options struct {
	Enabled       bool
	Bucket        string
	Region        string
	Endpoint      string
	AccessKey     string
	SecretKey     string
	SessionToken  string
	Prefix        string
	PathStyle     bool
	PublicBaseURL string
	PublicRead    bool
}

// Normalized 补齐默认值；未启用时返回零值配置。
func (o S3Options) Normalized() S3Options {
	o.Bucket = strings.TrimSpace(o.Bucket)
	o.Region = strings.TrimSpace(o.Region)
	o.Endpoint = strings.TrimRight(strings.TrimSpace(o.Endpoint), "/")
	o.AccessKey = strings.TrimSpace(o.AccessKey)
	o.SecretKey = strings.TrimSpace(o.SecretKey)
	o.SessionToken = strings.TrimSpace(o.SessionToken)
	o.Prefix = strings.Trim(strings.TrimSpace(o.Prefix), "/")
	o.PublicBaseURL = strings.TrimRight(strings.TrimSpace(o.PublicBaseURL), "/")
	if !o.Enabled {
		return S3Options{}
	}
	if o.Region == "" {
		o.Region = "us-east-1"
	}
	return o
}

// Validate 校验 S3 配置；关闭时不要求任何参数。
func (o S3Options) Validate() error {
	if !o.Enabled {
		return nil
	}
	if o.Bucket == "" {
		return errors.New("S3 存储桶不能为空")
	}
	if o.AccessKey == "" || o.SecretKey == "" {
		return errors.New("S3 访问密钥不能为空")
	}
	if o.Endpoint != "" {
		parsed, err := url.Parse(o.Endpoint)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" {
			return errors.New("S3 Endpoint 无效")
		}
	}
	return nil
}

// S3Client 是只实现对象上传、读取与删除的最小 S3 客户端。
// 签名使用 AWS Signature Version 4，兼容 S3、MinIO 与 R2 等 S3 兼容服务。
type S3Client struct {
	options S3Options
	client  *http.Client
}

// NewS3Client 构造 S3 客户端；配置非法时返回错误。
func NewS3Client(options S3Options) (*S3Client, error) {
	normalized := options.Normalized()
	if err := normalized.Validate(); err != nil {
		return nil, err
	}
	return &S3Client{options: normalized, client: &http.Client{Timeout: 2 * time.Minute}}, nil
}

// PublicURL 返回对象的公开直链地址。
func (c *S3Client) PublicURL(storageKey string) string {
	if c == nil {
		return ""
	}
	key := c.fullKey(storageKey)
	if c.options.PublicBaseURL != "" {
		return c.options.PublicBaseURL + "/" + key
	}
	target, _ := c.objectURL(key)
	return target
}

// Put 上传对象。
func (c *S3Client) Put(ctx context.Context, storageKey, contentType string, data []byte) error {
	key := c.fullKey(storageKey)
	target, _ := c.objectURL(key)
	request, err := http.NewRequestWithContext(ctx, http.MethodPut, target, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("创建 S3 上传请求: %w", err)
	}
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	request.ContentLength = int64(len(data))
	if c.options.PublicRead {
		request.Header.Set("X-Amz-Acl", "public-read")
	}
	c.sign(request, data, time.Now())
	response, err := c.client.Do(request)
	if err != nil {
		return fmt.Errorf("上传 S3 对象: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("上传 S3 对象失败: %s", response.Status)
	}
	return nil
}

// Get 读取对象。
func (c *S3Client) Get(ctx context.Context, storageKey string) (io.ReadCloser, error) {
	key := c.fullKey(storageKey)
	target, _ := c.objectURL(key)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, fmt.Errorf("创建 S3 下载请求: %w", err)
	}
	c.sign(request, nil, time.Now())
	response, err := c.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("读取 S3 对象: %w", err)
	}
	if response.StatusCode == http.StatusNotFound {
		_ = response.Body.Close()
		return nil, os.ErrNotExist
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_ = response.Body.Close()
		return nil, fmt.Errorf("读取 S3 对象失败: %s", response.Status)
	}
	return response.Body, nil
}

// Delete 删除对象。
func (c *S3Client) Delete(ctx context.Context, storageKey string) error {
	key := c.fullKey(storageKey)
	target, _ := c.objectURL(key)
	request, err := http.NewRequestWithContext(ctx, http.MethodDelete, target, nil)
	if err != nil {
		return fmt.Errorf("创建 S3 删除请求: %w", err)
	}
	c.sign(request, nil, time.Now())
	response, err := c.client.Do(request)
	if err != nil {
		return fmt.Errorf("删除 S3 对象: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound {
		return os.ErrNotExist
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("删除 S3 对象失败: %s", response.Status)
	}
	return nil
}

// fullKey 拼接对象前缀。
func (c *S3Client) fullKey(storageKey string) string {
	trimmed := strings.TrimPrefix(path.Clean("/"+strings.TrimSpace(storageKey)), "/")
	if c.options.Prefix == "" {
		return trimmed
	}
	return c.options.Prefix + "/" + trimmed
}

// objectURL 返回对象地址与用于签名的主机名。
func (c *S3Client) objectURL(key string) (string, string) {
	trimmed := strings.TrimPrefix(path.Clean("/"+key), "/")
	scheme, host := "https", ""
	if c.options.Endpoint != "" {
		if parsed, err := url.Parse(c.options.Endpoint); err == nil && parsed.Host != "" {
			scheme, host = parsed.Scheme, parsed.Host
		}
	} else {
		host = fmt.Sprintf("s3.%s.amazonaws.com", c.options.Region)
	}
	if c.options.PathStyle {
		return fmt.Sprintf("%s://%s/%s/%s", scheme, host, c.options.Bucket, trimmed), host
	}
	return fmt.Sprintf("%s://%s.%s/%s", scheme, c.options.Bucket, host, trimmed), host
}

// sign 使用 AWS Signature Version 4 签名请求。
func (c *S3Client) sign(request *http.Request, payload []byte, now time.Time) {
	stamp := now.UTC()
	amzDate := stamp.Format("20060102T150405Z")
	dateStamp := stamp.Format("20060102")
	payloadHash := sha256Hex(payload)
	request.Header.Set("X-Amz-Date", amzDate)
	request.Header.Set("X-Amz-Content-Sha256", payloadHash)
	if c.options.SessionToken != "" {
		request.Header.Set("X-Amz-Security-Token", c.options.SessionToken)
	}
	headers := map[string]string{"host": request.URL.Host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate}
	for _, name := range []string{"Content-Type", "X-Amz-Acl", "X-Amz-Security-Token"} {
		value := strings.TrimSpace(request.Header.Get(name))
		if value == "" {
			continue
		}
		headers[strings.ToLower(name)] = value
	}
	names := make([]string, 0, len(headers))
	for name := range headers {
		names = append(names, name)
	}
	sort.Strings(names)
	var canonicalHeaders strings.Builder
	for _, name := range names {
		canonicalHeaders.WriteString(name)
		canonicalHeaders.WriteString(":")
		canonicalHeaders.WriteString(headers[name])
		canonicalHeaders.WriteString("\n")
	}
	canonicalRequest := strings.Join([]string{
		request.Method,
		request.URL.EscapedPath(),
		canonicalQuery(request.URL.Query()),
		canonicalHeaders.String(),
		strings.Join(names, ";"),
		payloadHash,
	}, "\n")
	scope := dateStamp + "/" + c.options.Region + "/s3/aws4_request"
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		scope,
		sha256Hex([]byte(canonicalRequest)),
	}, "\n")
	signature := hex.EncodeToString(hmacSHA256(c.signingKey(dateStamp), []byte(stringToSign)))
	request.Header.Set("Authorization", fmt.Sprintf(
		"AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		c.options.AccessKey, scope, strings.Join(names, ";"), signature))
}

// signingKey 派生签名密钥。
func (c *S3Client) signingKey(dateStamp string) []byte {
	key := hmacSHA256([]byte("AWS4"+c.options.SecretKey), []byte(dateStamp))
	key = hmacSHA256(key, []byte(c.options.Region))
	key = hmacSHA256(key, []byte("s3"))
	return hmacSHA256(key, []byte("aws4_request"))
}

// canonicalQuery 生成规范化查询串。
func canonicalQuery(values url.Values) string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		items := append([]string(nil), values[key]...)
		sort.Strings(items)
		for _, item := range items {
			parts = append(parts, url.QueryEscape(key)+"="+url.QueryEscape(item))
		}
	}
	return strings.Join(parts, "&")
}

// sha256Hex 返回内容的十六进制 SHA-256。
func sha256Hex(value []byte) string {
	digest := sha256.Sum256(value)
	return hex.EncodeToString(digest[:])
}

// hmacSHA256 计算 HMAC-SHA256。
func hmacSHA256(key, value []byte) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write(value)
	return mac.Sum(nil)
}

// ObjectStore 按当前配置把图片写入 S3 或本地目录；视频始终保存在本地。
type ObjectStore struct {
	local *LocalStore
	mu    sync.RWMutex
	s3    *S3Client
}

// NewObjectStore 构造对象存储；S3 未启用时行为与本地存储一致。
func NewObjectStore(local *LocalStore) *ObjectStore {
	return &ObjectStore{local: local}
}

// Configure 热更新 S3 转存配置；关闭时图片回落到本地存储。
func (s *ObjectStore) Configure(options S3Options) error {
	normalized := options.Normalized()
	if !normalized.Enabled {
		s.mu.Lock()
		s.s3 = nil
		s.mu.Unlock()
		return nil
	}
	client, err := NewS3Client(normalized)
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.s3 = client
	s.mu.Unlock()
	return nil
}

// ActiveDriver 返回当前写入使用的存储驱动。
func (s *ObjectStore) ActiveDriver() string {
	if s.client() != nil {
		return StorageDriverS3
	}
	return StorageDriverLocal
}

// PublicObjectURL 返回 S3 对象的公开直链；未启用 S3 时返回空串。
func (s *ObjectStore) PublicObjectURL(storageKey string) string {
	client := s.client()
	if client == nil {
		return ""
	}
	return client.PublicURL(storageKey)
}

// SaveImage 保存图片。启用 S3 时直接转存到对象存储并返回对象键。
func (s *ObjectStore) SaveImage(ctx context.Context, id, mimeType string, data []byte) (string, error) {
	client := s.client()
	if client == nil {
		return s.local.SaveImage(ctx, id, mimeType, data)
	}
	extension, ok := imageExtension(mimeType)
	if !ok || len(id) < 2 {
		return "", fmt.Errorf("媒体存储参数无效")
	}
	storageKey := path.Join("images", id[:2], id+extension)
	if err := client.Put(ctx, storageKey, mimeType, data); err != nil {
		return "", err
	}
	return storageKey, nil
}

// SaveInputImage 保存临时输入图片；输入资源不参与 S3 转存，始终保留在本地目录。
func (s *ObjectStore) SaveInputImage(ctx context.Context, id, mimeType string, data []byte) (string, error) {
	return s.local.SaveImage(ctx, id, mimeType, data)
}

// Open 读取对象。S3 未命中时回落到本地目录，兼容转存前保存的历史图片。
func (s *ObjectStore) Open(ctx context.Context, storageKey string) (io.ReadCloser, error) {
	if client := s.client(); client != nil && isImageStorageKey(storageKey) {
		body, err := client.Get(ctx, storageKey)
		if !errors.Is(err, os.ErrNotExist) {
			return body, err
		}
	}
	return s.local.Open(ctx, storageKey)
}

// Delete 删除对象。S3 未命中时继续删除本地副本。
func (s *ObjectStore) Delete(ctx context.Context, storageKey string) error {
	if client := s.client(); client != nil && isImageStorageKey(storageKey) {
		err := client.Delete(ctx, storageKey)
		if err == nil || !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	return s.local.Delete(ctx, storageKey)
}

// SaveVideo 保存视频对象；视频不参与 S3 转存。
func (s *ObjectStore) SaveVideo(ctx context.Context, id, mimeType string, data []byte) (string, error) {
	return s.local.SaveVideo(ctx, id, mimeType, data)
}

// BeginVideoUpload 创建视频临时文件。
func (s *ObjectStore) BeginVideoUpload(ctx context.Context, id, mimeType string) (string, string, error) {
	return s.local.BeginVideoUpload(ctx, id, mimeType)
}

// CommitVideoUpload 提交视频临时文件。
func (s *ObjectStore) CommitVideoUpload(ctx context.Context, tempPath, storageKey string) error {
	return s.local.CommitVideoUpload(ctx, tempPath, storageKey)
}

// AbortVideoUpload 清理未提交的视频临时文件。
func (s *ObjectStore) AbortVideoUpload(ctx context.Context, tempPath string) error {
	return s.local.AbortVideoUpload(ctx, tempPath)
}

// client 返回当前 S3 客户端。
func (s *ObjectStore) client() *S3Client {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.s3
}

// isImageStorageKey 判断对象键是否属于图片目录。
func isImageStorageKey(storageKey string) bool {
	return strings.HasPrefix(strings.TrimSpace(storageKey), "images/")
}
