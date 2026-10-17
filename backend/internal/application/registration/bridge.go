package registration

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	xproxy "golang.org/x/net/proxy"
)

// localProxyBridge exposes an unauthenticated HTTP proxy on loopback that
// forwards CONNECT tunnels through the configured upstream proxy.
//
// Playwright's Chromium build cannot authenticate to SOCKS5 proxies, so the
// registration service normalises every supported upstream (HTTP, HTTPS,
// SOCKS4/5, or a tunnel proxy) through this bridge before launching a browser.
type localProxyBridge struct {
	server   *http.Server
	listener net.Listener
	address  string
	cancel   context.CancelFunc
	dial     func(context.Context, string, string) (net.Conn, error)
	wg       sync.WaitGroup
	mu       sync.Mutex
	conns    map[net.Conn]struct{}
}

func newLocalProxyBridge(upstreamURL string) (*localProxyBridge, error) {
	upstreamURL = strings.TrimSpace(upstreamURL)
	if upstreamURL == "" {
		return nil, fmt.Errorf("上游代理为空")
	}
	dial, err := upstreamDialer(upstreamURL)
	if err != nil {
		return nil, err
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	bridge := &localProxyBridge{listener: listener, address: listener.Addr().String(), dial: dial}
	bridge.conns = make(map[net.Conn]struct{})
	handler := http.HandlerFunc(bridge.handle)
	bridge.server = &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 15 * time.Second,
	}
	ctx, cancel := context.WithCancel(context.Background())
	bridge.cancel = cancel
	go func() {
		<-ctx.Done()
		_ = listener.Close()
	}()
	go func() {
		_ = bridge.server.Serve(listener)
	}()
	return bridge, nil
}

// URL returns the loopback HTTP proxy URL handed to Playwright.
func (b *localProxyBridge) URL() string {
	if b == nil {
		return ""
	}
	return "http://" + b.address
}

func (b *localProxyBridge) Close() {
	if b == nil {
		return
	}
	if b.cancel != nil {
		b.cancel()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = b.server.Shutdown(ctx)
	_ = b.listener.Close()
	b.mu.Lock()
	for connection := range b.conns {
		_ = connection.Close()
	}
	b.conns = nil
	b.mu.Unlock()
	b.wg.Wait()
}

func (b *localProxyBridge) track(connection net.Conn) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.conns == nil {
		return false
	}
	b.conns[connection] = struct{}{}
	return true
}

func (b *localProxyBridge) untrack(connection net.Conn) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.conns != nil {
		delete(b.conns, connection)
	}
}

func (b *localProxyBridge) handle(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodConnect {
		http.Error(writer, "proxy supports CONNECT only", http.StatusMethodNotAllowed)
		return
	}
	target := request.Host
	if !strings.Contains(target, ":") {
		target += ":443"
	}
	if b.dial == nil {
		http.Error(writer, "proxy dialer unavailable", http.StatusServiceUnavailable)
		return
	}
	upstream, err := b.dial(request.Context(), "tcp", target)
	if err != nil {
		http.Error(writer, "upstream dial failed", http.StatusBadGateway)
		return
	}
	hijacker, ok := writer.(http.Hijacker)
	if !ok {
		_ = upstream.Close()
		http.Error(writer, "connection takeover unsupported", http.StatusInternalServerError)
		return
	}
	client, buffered, err := hijacker.Hijack()
	if err != nil {
		_ = upstream.Close()
		return
	}
	_, _ = client.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n"))
	if !b.track(upstream) || !b.track(client) {
		_ = upstream.Close()
		_ = client.Close()
		return
	}
	if buffered != nil && buffered.Reader.Buffered() > 0 {
		if extra, readErr := buffered.Reader.Peek(buffered.Reader.Buffered()); readErr == nil && len(extra) > 0 {
			_, _ = upstream.Write(extra)
			_, _ = buffered.Reader.Discard(len(extra))
		}
	}
	b.wg.Add(2)
	go func() {
		defer b.wg.Done()
		defer b.untrack(upstream)
		_, _ = io.Copy(upstream, client)
		_ = upstream.Close()
	}()
	go func() {
		defer b.wg.Done()
		defer b.untrack(client)
		_, _ = io.Copy(client, upstream)
		_ = client.Close()
	}()
}

// upstreamDialer resolves any supported proxy scheme to a dial function.
func upstreamDialer(raw string) (func(context.Context, string, string) (net.Conn, error), error) {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Hostname() == "" {
		return nil, fmt.Errorf("代理地址格式无效")
	}
	scheme := strings.ToLower(parsed.Scheme)
	switch scheme {
	case "http", "https":
		return httpProxyDialer(parsed), nil
	case "socks5", "socks5h", "socks4", "socks4a":
		dialer, err := xproxy.FromURL(parsed, xproxy.Direct)
		if err != nil {
			return nil, err
		}
		if contextDialer, ok := dialer.(xproxy.ContextDialer); ok {
			return contextDialer.DialContext, nil
		}
		return func(_ context.Context, network, address string) (net.Conn, error) {
			return dialer.Dial(network, address)
		}, nil
	default:
		return nil, fmt.Errorf("注册桥不支持的代理协议: %s", scheme)
	}
}

func httpProxyDialer(parsed *url.URL) func(context.Context, string, string) (net.Conn, error) {
	address := parsed.Host
	auth := ""
	if parsed.User != nil {
		password, _ := parsed.User.Password()
		auth = "Basic " + base64.StdEncoding.EncodeToString([]byte(parsed.User.Username()+":"+password))
	}
	return func(ctx context.Context, network, target string) (net.Conn, error) {
		dialer := &net.Dialer{Timeout: 15 * time.Second}
		connection, err := dialer.DialContext(ctx, "tcp", address)
		if err != nil {
			return nil, err
		}
		headers := "CONNECT " + target + " HTTP/1.1\r\nHost: " + target + "\r\n"
		if auth != "" {
			headers += "Proxy-Authorization: " + auth + "\r\n"
		}
		headers += "\r\n"
		if _, err := connection.Write([]byte(headers)); err != nil {
			_ = connection.Close()
			return nil, err
		}
		reader := make([]byte, 0, 1024)
		buffer := make([]byte, 1)
		for len(reader) < 8192 {
			if _, err := connection.Read(buffer); err != nil {
				_ = connection.Close()
				return nil, err
			}
			reader = append(reader, buffer[0])
			if len(reader) >= 4 && string(reader[len(reader)-4:]) == "\r\n\r\n" {
				break
			}
		}
		status := strings.SplitN(string(reader), "\r\n", 2)[0]
		if !strings.Contains(status, " 200") {
			_ = connection.Close()
			return nil, fmt.Errorf("上游 HTTP 代理 CONNECT 失败: %s", status)
		}
		return connection, nil
	}
}
