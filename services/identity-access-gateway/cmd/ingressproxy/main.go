package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"hash/fnv"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type proxyConfig struct {
	ListenAddr             string
	UpstreamBaseURLs       string
	MaxConnsPerHost        int
	WarmConnectionsPerHost int
	WarmTimeout            time.Duration
}

type upstreamTransportProfile struct {
	MaxIdleConns           int `json:"maxIdleConns"`
	MaxIdleConnsPerHost    int `json:"maxIdleConnsPerHost"`
	MaxConnsPerHost        int `json:"maxConnsPerHost"`
	WarmConnectionsPerHost int `json:"warmConnectionsPerHost"`
	WarmConnectionsTotal   int `json:"warmConnectionsTotal"`
}

type roundRobinPicker struct {
	upstreams []*url.URL
	next      atomic.Uint64
}

type proxyOriginalRequest struct {
	Host     string
	Path     string
	RawQuery string
}

type proxyOriginalRequestKey struct{}

type safeReadRetryTransport struct {
	base          http.RoundTripper
	picker        *roundRobinPicker
	upstreamCount int
}

func main() {
	config := parseConfig()
	upstreams, err := parseUpstreamBaseURLs(config.UpstreamBaseURLs)
	if err != nil {
		log.Fatal(err)
	}
	transport, profile := buildUpstreamTransport(config, len(upstreams))
	client := &http.Client{Timeout: 5 * time.Second, Transport: transport}

	warmCtx, cancel := context.WithTimeout(context.Background(), config.WarmTimeout)
	defer cancel()
	if err := waitForUpstreamHealth(warmCtx, client, upstreams); err != nil {
		log.Fatal(err)
	}
	if err := warmUpstreamConnections(warmCtx, client, upstreams, config.WarmConnectionsPerHost); err != nil {
		log.Fatal(err)
	}

	server := &http.Server{
		Addr:              config.ListenAddr,
		Handler:           newIngressHandler(upstreams, transport),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf(
		"identity ingress proxy listening on %s upstreams=%d maxConnsPerHost=%d warmConnectionsTotal=%d",
		config.ListenAddr,
		len(upstreams),
		profile.MaxConnsPerHost,
		profile.WarmConnectionsTotal,
	)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func parseConfig() proxyConfig {
	config := proxyConfig{}
	flag.StringVar(&config.ListenAddr, "listen", getenv("IDENTITY_INGRESS_LISTEN_ADDR", ":18080"), "listen address")
	flag.StringVar(&config.UpstreamBaseURLs, "upstreams", os.Getenv("IDENTITY_INGRESS_UPSTREAMS"), "comma-separated upstream base URLs")
	flag.IntVar(&config.MaxConnsPerHost, "max-conns-per-host", getenvInt("IDENTITY_INGRESS_MAX_CONNS_PER_HOST", 0), "upstream max connections per host")
	flag.IntVar(&config.WarmConnectionsPerHost, "warm-connections-per-host", getenvInt("IDENTITY_INGRESS_WARM_CONNECTIONS_PER_HOST", 0), "upstream keep-alive connections to prewarm per host")
	flag.DurationVar(&config.WarmTimeout, "warm-timeout", getenvDuration("IDENTITY_INGRESS_WARM_TIMEOUT", 60*time.Second), "upstream health and warmup timeout")
	flag.Parse()
	return config
}

func newIngressHandler(upstreams []*url.URL, transport http.RoundTripper) http.Handler {
	picker := newRoundRobinPicker(upstreams)
	proxy := &httputil.ReverseProxy{
		Director: func(request *http.Request) {
			original := proxyOriginalRequest{
				Host:     request.Host,
				Path:     request.URL.Path,
				RawQuery: request.URL.RawQuery,
			}
			target := picker.NextForRequest(request)
			*request = *request.WithContext(context.WithValue(request.Context(), proxyOriginalRequestKey{}, original))
			rewriteProxyRequest(request, target, original)
		},
		Transport: newSafeReadRetryTransport(transport, picker, len(upstreams)),
		ErrorHandler: func(response http.ResponseWriter, _ *http.Request, err error) {
			log.Printf("identity ingress upstream error: %v", err)
			http.Error(response, "upstream unavailable", http.StatusBadGateway)
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(response http.ResponseWriter, _ *http.Request) {
		response.WriteHeader(http.StatusOK)
		_, _ = response.Write([]byte("ok\n"))
	})
	mux.Handle("/", proxy)
	return mux
}

func newSafeReadRetryTransport(base http.RoundTripper, picker *roundRobinPicker, upstreamCount int) http.RoundTripper {
	if base == nil {
		base = http.DefaultTransport
	}
	return &safeReadRetryTransport{
		base:          base,
		picker:        picker,
		upstreamCount: upstreamCount,
	}
}

func (transport *safeReadRetryTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	response, err := transport.base.RoundTrip(request)
	if err == nil || !transport.canRetry(request, err) {
		return response, err
	}
	closeResponseBody(response)

	original := originalProxyRequestFrom(request)
	attempted := map[string]bool{requestUpstreamKey(request): true}
	var lastErr error = err
	for len(attempted) < transport.upstreamCount {
		target := transport.nextUnattemptedTarget(attempted)
		if target == nil {
			break
		}
		attempted[urlUpstreamKey(target)] = true
		retryRequest := request.Clone(request.Context())
		rewriteProxyRequest(retryRequest, target, original)
		response, err = transport.base.RoundTrip(retryRequest)
		if err == nil {
			return response, nil
		}
		closeResponseBody(response)
		lastErr = err
	}
	return nil, lastErr
}

func (transport *safeReadRetryTransport) canRetry(request *http.Request, err error) bool {
	if transport.upstreamCount <= 1 {
		return false
	}
	if isSafeRetryMethod(request.Method) && canReplayRequestBody(request) {
		return true
	}
	return isDialTransportError(err)
}

func isDialTransportError(err error) bool {
	var netErr *net.OpError
	return errors.As(err, &netErr) && netErr.Op == "dial"
}

func (transport *safeReadRetryTransport) nextUnattemptedTarget(attempted map[string]bool) *url.URL {
	for index := 0; index < transport.upstreamCount; index++ {
		target := transport.picker.Next()
		if !attempted[urlUpstreamKey(target)] {
			return target
		}
	}
	return nil
}

func rewriteProxyRequest(request *http.Request, target *url.URL, original proxyOriginalRequest) {
	request.URL.Scheme = target.Scheme
	request.URL.Host = target.Host
	request.URL.Path = singleJoiningSlash(target.Path, original.Path)
	if target.RawQuery == "" || original.RawQuery == "" {
		request.URL.RawQuery = target.RawQuery + original.RawQuery
	} else {
		request.URL.RawQuery = target.RawQuery + "&" + original.RawQuery
	}
	request.Host = target.Host
	request.Header.Set("X-Forwarded-Host", original.Host)
	request.Header.Set("X-Forwarded-Proto", "http")
}

func originalProxyRequestFrom(request *http.Request) proxyOriginalRequest {
	original, ok := request.Context().Value(proxyOriginalRequestKey{}).(proxyOriginalRequest)
	if ok {
		return original
	}
	return proxyOriginalRequest{
		Host:     request.Header.Get("X-Forwarded-Host"),
		Path:     request.URL.Path,
		RawQuery: request.URL.RawQuery,
	}
}

func isSafeRetryMethod(method string) bool {
	return method == http.MethodGet || method == http.MethodHead
}

func canReplayRequestBody(request *http.Request) bool {
	return request.Body == nil || request.Body == http.NoBody
}

func closeResponseBody(response *http.Response) {
	if response != nil && response.Body != nil {
		_ = response.Body.Close()
	}
}

func requestUpstreamKey(request *http.Request) string {
	return request.URL.Scheme + "://" + request.URL.Host
}

func urlUpstreamKey(target *url.URL) string {
	return target.Scheme + "://" + target.Host
}

func parseUpstreamBaseURLs(value string) ([]*url.URL, error) {
	var upstreams []*url.URL
	for _, part := range strings.Split(value, ",") {
		raw := strings.TrimRight(strings.TrimSpace(part), "/")
		if raw == "" {
			continue
		}
		parsed, err := url.Parse(raw)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" {
			return nil, fmt.Errorf("invalid upstream base URL: %q", raw)
		}
		upstreams = append(upstreams, parsed)
	}
	if len(upstreams) == 0 {
		return nil, errors.New("at least one upstream base URL is required")
	}
	return upstreams, nil
}

func newRoundRobinPicker(upstreams []*url.URL) *roundRobinPicker {
	return &roundRobinPicker{upstreams: upstreams}
}

func (picker *roundRobinPicker) NextForRequest(request *http.Request) *url.URL {
	if index, ok := ownerIndexFromRequest(request, len(picker.upstreams)); ok {
		return picker.At(index)
	}
	if key := bearerAffinityKey(request); key != "" {
		return picker.NextForAffinityKey(key)
	}
	return picker.Next()
}

func (picker *roundRobinPicker) Next() *url.URL {
	if len(picker.upstreams) == 0 {
		return &url.URL{}
	}
	index := int((picker.next.Add(1) - 1) % uint64(len(picker.upstreams)))
	target := *picker.upstreams[index]
	return &target
}

func (picker *roundRobinPicker) NextForAffinityKey(key string) *url.URL {
	if len(picker.upstreams) == 0 {
		return &url.URL{}
	}
	hash := fnv.New64a()
	_, _ = hash.Write([]byte(key))
	index := int(hash.Sum64() % uint64(len(picker.upstreams)))
	target := *picker.upstreams[index]
	return &target
}

func (picker *roundRobinPicker) At(index int) *url.URL {
	if len(picker.upstreams) == 0 {
		return &url.URL{}
	}
	if index < 0 || index >= len(picker.upstreams) {
		return picker.Next()
	}
	target := *picker.upstreams[index]
	return &target
}

func ownerIndexFromRequest(request *http.Request, upstreamCount int) (int, bool) {
	if upstreamCount <= 0 {
		return 0, false
	}
	if token := bearerAffinityKey(request); token != "" {
		return ownerIndexFromToken(token, upstreamCount)
	}
	if token := refreshTokenFromRequest(request); token != "" {
		return ownerIndexFromToken(token, upstreamCount)
	}
	return 0, false
}

func ownerIndexFromToken(token string, upstreamCount int) (int, bool) {
	parts := strings.SplitN(strings.TrimSpace(token), "_", 3)
	if len(parts) != 3 {
		return 0, false
	}
	owner := strings.TrimSpace(parts[1])
	if len(owner) < 2 || owner[0] != 'g' {
		return 0, false
	}
	index, err := strconv.Atoi(owner[1:])
	if err != nil || index < 0 || index >= upstreamCount {
		return 0, false
	}
	return index, true
}

func bearerAffinityKey(request *http.Request) string {
	fields := strings.Fields(strings.TrimSpace(request.Header.Get("Authorization")))
	if len(fields) != 2 || !strings.EqualFold(fields[0], "Bearer") {
		return ""
	}
	return fields[1]
}

func refreshTokenFromRequest(request *http.Request) string {
	if request.Method != http.MethodPost || request.URL.Path != "/v1/identity/sessions/refresh" || request.Body == nil {
		return ""
	}
	const maxRefreshBodyBytes = 64 * 1024
	data, err := io.ReadAll(io.LimitReader(request.Body, maxRefreshBodyBytes+1))
	_ = request.Body.Close()
	request.Body = io.NopCloser(bytes.NewReader(data))
	request.ContentLength = int64(len(data))
	request.GetBody = func() (io.ReadCloser, error) {
		return io.NopCloser(bytes.NewReader(data)), nil
	}
	if err != nil || len(data) > maxRefreshBodyBytes {
		return ""
	}
	var body struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := json.Unmarshal(data, &body); err != nil {
		return ""
	}
	return strings.TrimSpace(body.RefreshToken)
}

func buildUpstreamTransport(config proxyConfig, upstreamCount int) (*http.Transport, upstreamTransportProfile) {
	perHostIdle := maxInt(100, config.MaxConnsPerHost)
	perHostIdle = maxInt(perHostIdle, config.WarmConnectionsPerHost)
	totalIdle := maxInt(100, perHostIdle*maxInt(1, upstreamCount))
	profile := upstreamTransportProfile{
		MaxIdleConns:           totalIdle,
		MaxIdleConnsPerHost:    perHostIdle,
		MaxConnsPerHost:        config.MaxConnsPerHost,
		WarmConnectionsPerHost: maxInt(0, config.WarmConnectionsPerHost),
		WarmConnectionsTotal:   maxInt(0, config.WarmConnectionsPerHost) * maxInt(1, upstreamCount),
	}
	return &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		MaxIdleConns:          profile.MaxIdleConns,
		MaxIdleConnsPerHost:   profile.MaxIdleConnsPerHost,
		MaxConnsPerHost:       profile.MaxConnsPerHost,
		IdleConnTimeout:       60 * time.Second,
		TLSHandshakeTimeout:   5 * time.Second,
		ResponseHeaderTimeout: 10 * time.Second,
	}, profile
}

func waitForUpstreamHealth(ctx context.Context, client *http.Client, upstreams []*url.URL) error {
	for _, upstream := range upstreams {
		if err := waitOneUpstreamHealth(ctx, client, upstream); err != nil {
			return err
		}
	}
	return nil
}

func waitOneUpstreamHealth(ctx context.Context, client *http.Client, upstream *url.URL) error {
	var lastErr error
	for ctx.Err() == nil {
		if err := requestHealth(ctx, client, upstream); err != nil {
			lastErr = err
		} else {
			return nil
		}
		time.Sleep(200 * time.Millisecond)
	}
	return fmt.Errorf("upstream health check failed for %s: %w", upstream.Redacted(), lastErr)
}

func warmUpstreamConnections(ctx context.Context, client *http.Client, upstreams []*url.URL, connectionsPerHost int) error {
	if connectionsPerHost <= 0 {
		return nil
	}
	var wg sync.WaitGroup
	errs := make(chan error, len(upstreams)*connectionsPerHost)
	start := make(chan struct{})
	for _, upstream := range upstreams {
		upstream := upstream
		for index := 0; index < connectionsPerHost; index++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				<-start
				if err := requestHealth(ctx, client, upstream); err != nil {
					errs <- err
				}
			}()
		}
	}
	close(start)
	wg.Wait()
	close(errs)
	for err := range errs {
		return fmt.Errorf("warm upstream connections: %w", err)
	}
	return nil
}

func requestHealth(ctx context.Context, client *http.Client, upstream *url.URL) error {
	healthURL := *upstream
	healthURL.Path = singleJoiningSlash(upstream.Path, "/health")
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, healthURL.String(), nil)
	if err != nil {
		return err
	}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	_, _ = io.Copy(io.Discard, response.Body)
	_ = response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("health status = %d", response.StatusCode)
	}
	return nil
}

func singleJoiningSlash(left string, right string) string {
	leftSlash := strings.HasSuffix(left, "/")
	rightSlash := strings.HasPrefix(right, "/")
	switch {
	case leftSlash && rightSlash:
		return left + right[1:]
	case !leftSlash && !rightSlash:
		return left + "/" + right
	default:
		return left + right
	}
}

func getenv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func getenvInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		panic(fmt.Sprintf("%s must be an integer: %q", key, value))
	}
	if parsed < 0 {
		panic(fmt.Sprintf("%s must be zero or positive: %d", key, parsed))
	}
	return parsed
}

func getenvDuration(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		panic(fmt.Sprintf("%s must be a duration: %q", key, value))
	}
	if parsed <= 0 {
		panic(fmt.Sprintf("%s must be positive: %s", key, value))
	}
	return parsed
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}
