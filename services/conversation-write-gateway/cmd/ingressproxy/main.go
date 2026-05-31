package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
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
		"conversation ingress proxy listening on %s upstreams=%d maxConnsPerHost=%d warmConnectionsTotal=%d",
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
	flag.StringVar(&config.ListenAddr, "listen", getenv("CONVERSATION_INGRESS_LISTEN_ADDR", ":19080"), "listen address")
	flag.StringVar(&config.UpstreamBaseURLs, "upstreams", os.Getenv("CONVERSATION_INGRESS_UPSTREAMS"), "comma-separated upstream base URLs")
	flag.IntVar(&config.MaxConnsPerHost, "max-conns-per-host", getenvInt("CONVERSATION_INGRESS_MAX_CONNS_PER_HOST", 0), "upstream max connections per host")
	flag.IntVar(&config.WarmConnectionsPerHost, "warm-connections-per-host", getenvInt("CONVERSATION_INGRESS_WARM_CONNECTIONS_PER_HOST", 0), "upstream keep-alive connections to prewarm per host")
	flag.DurationVar(&config.WarmTimeout, "warm-timeout", getenvDuration("CONVERSATION_INGRESS_WARM_TIMEOUT", 60*time.Second), "upstream health and warmup timeout")
	flag.Parse()
	return config
}

func newIngressHandler(upstreams []*url.URL, transport http.RoundTripper) http.Handler {
	picker := newRoundRobinPicker(upstreams)
	if transport == nil {
		transport = http.DefaultTransport
	}
	proxy := &httputil.ReverseProxy{
		Director: func(request *http.Request) {
			original := proxyOriginalRequest{
				Host:     request.Host,
				Path:     request.URL.Path,
				RawQuery: request.URL.RawQuery,
			}
			rewriteProxyRequest(request, picker.Next(), original)
		},
		Transport: transport,
		ErrorHandler: func(response http.ResponseWriter, _ *http.Request, err error) {
			log.Printf("conversation ingress upstream error: %v", err)
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

func (picker *roundRobinPicker) Next() *url.URL {
	if len(picker.upstreams) == 0 {
		return &url.URL{}
	}
	index := int((picker.next.Add(1) - 1) % uint64(len(picker.upstreams)))
	target := *picker.upstreams[index]
	return &target
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
