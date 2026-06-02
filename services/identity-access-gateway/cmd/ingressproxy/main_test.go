package main

import (
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
)

func TestParseUpstreamBaseURLs(t *testing.T) {
	got, err := parseUpstreamBaseURLs("http://127.0.0.1:18100, http://127.0.0.1:18101/")
	if err != nil {
		t.Fatalf("parseUpstreamBaseURLs() error = %v", err)
	}
	want := []string{"http://127.0.0.1:18100", "http://127.0.0.1:18101"}

	if len(got) != len(want) {
		t.Fatalf("upstreams = %#v want %#v", got, want)
	}
	for index := range want {
		if got[index].String() != want[index] {
			t.Fatalf("upstream %d = %q want %q", index, got[index].String(), want[index])
		}
	}
}

func TestRoundRobinPicker(t *testing.T) {
	upstreams, err := parseUpstreamBaseURLs("http://127.0.0.1:18100,http://127.0.0.1:18101")
	if err != nil {
		t.Fatalf("parseUpstreamBaseURLs() error = %v", err)
	}
	picker := newRoundRobinPicker(upstreams)

	got := []string{
		picker.Next().String(),
		picker.Next().String(),
		picker.Next().String(),
	}
	want := []string{
		"http://127.0.0.1:18100",
		"http://127.0.0.1:18101",
		"http://127.0.0.1:18100",
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("pick %d = %q want %q", index, got[index], want[index])
		}
	}
}

func TestIngressHandlerUsesStableBearerTokenUpstream(t *testing.T) {
	upstreams, err := parseUpstreamBaseURLs("http://gateway-a.test,http://gateway-b.test,http://gateway-c.test")
	if err != nil {
		t.Fatalf("parseUpstreamBaseURLs() error = %v", err)
	}
	transport := &scriptedRoundTripper{
		results: []roundTripResult{
			{statusCode: http.StatusOK, body: "first\n"},
			{statusCode: http.StatusOK, body: "second\n"},
		},
	}
	handler := newIngressHandler(upstreams, transport)

	for range 2 {
		request := httptest.NewRequest(http.MethodGet, "/v1/identity/principal", nil)
		request.Header.Set("Authorization", "Bearer access_same")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("status = %d body = %q, want 200", response.Code, response.Body.String())
		}
	}

	if len(transport.hosts) != 2 {
		t.Fatalf("hosts = %#v", transport.hosts)
	}
	if transport.hosts[0] != transport.hosts[1] {
		t.Fatalf("same bearer token used different upstreams: %#v", transport.hosts)
	}
}

func TestIngressHandlerKeepsRoundRobinForTokenlessRequests(t *testing.T) {
	upstreams, err := parseUpstreamBaseURLs("http://gateway-a.test,http://gateway-b.test")
	if err != nil {
		t.Fatalf("parseUpstreamBaseURLs() error = %v", err)
	}
	transport := &scriptedRoundTripper{
		results: []roundTripResult{
			{statusCode: http.StatusOK, body: "first\n"},
			{statusCode: http.StatusOK, body: "second\n"},
		},
	}
	handler := newIngressHandler(upstreams, transport)

	for range 2 {
		request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("status = %d body = %q, want 200", response.Code, response.Body.String())
		}
	}

	if got, want := transport.hosts, []string{"gateway-a.test", "gateway-b.test"}; !slices.Equal(got, want) {
		t.Fatalf("tokenless upstreams = %#v want %#v", got, want)
	}
}

func TestBuildUpstreamTransportProfile(t *testing.T) {
	config := proxyConfig{
		MaxConnsPerHost:        300,
		WarmConnectionsPerHost: 300,
	}

	_, profile := buildUpstreamTransport(config, 4)

	if profile.MaxConnsPerHost != 300 {
		t.Fatalf("MaxConnsPerHost = %d want 300", profile.MaxConnsPerHost)
	}
	if profile.WarmConnectionsPerHost != 300 {
		t.Fatalf("WarmConnectionsPerHost = %d want 300", profile.WarmConnectionsPerHost)
	}
	if profile.WarmConnectionsTotal != 1200 {
		t.Fatalf("WarmConnectionsTotal = %d want 1200", profile.WarmConnectionsTotal)
	}
	if profile.MaxIdleConns < 1200 || profile.MaxIdleConnsPerHost < 300 {
		t.Fatalf("idle connection profile is too small: %#v", profile)
	}
}

func TestIngressHandlerRetriesSafeGetOnUpstreamTransportError(t *testing.T) {
	upstreams, err := parseUpstreamBaseURLs("http://gateway-a.test,http://gateway-b.test")
	if err != nil {
		t.Fatalf("parseUpstreamBaseURLs() error = %v", err)
	}
	transport := &scriptedRoundTripper{
		results: []roundTripResult{
			{err: errors.New("dial gateway-a failed")},
			{statusCode: http.StatusOK, body: "principal\n"},
		},
	}
	handler := newIngressHandler(upstreams, transport)
	request := httptest.NewRequest(http.MethodGet, "/v1/identity/principal?include=roles", nil)
	request.Host = "identity.local"
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body = %q, want 200", response.Code, response.Body.String())
	}
	if got, want := transport.hosts, []string{"gateway-a.test", "gateway-b.test"}; !slices.Equal(got, want) {
		t.Fatalf("upstream attempts = %#v want %#v", got, want)
	}
	if got, want := transport.paths, []string{"/v1/identity/principal", "/v1/identity/principal"}; !slices.Equal(got, want) {
		t.Fatalf("upstream paths = %#v want %#v", got, want)
	}
	if got, want := transport.queries, []string{"include=roles", "include=roles"}; !slices.Equal(got, want) {
		t.Fatalf("upstream queries = %#v want %#v", got, want)
	}
	if got, want := transport.forwardedHosts, []string{"identity.local", "identity.local"}; !slices.Equal(got, want) {
		t.Fatalf("forwarded hosts = %#v want %#v", got, want)
	}
}

func TestIngressHandlerDoesNotRetryPostOnUpstreamTransportError(t *testing.T) {
	upstreams, err := parseUpstreamBaseURLs("http://gateway-a.test,http://gateway-b.test")
	if err != nil {
		t.Fatalf("parseUpstreamBaseURLs() error = %v", err)
	}
	transport := &scriptedRoundTripper{
		results: []roundTripResult{
			{err: errors.New("dial gateway-a failed")},
			{statusCode: http.StatusOK, body: "should not be used\n"},
		},
	}
	handler := newIngressHandler(upstreams, transport)
	request := httptest.NewRequest(http.MethodPost, "/v1/identity/sessions/password", strings.NewReader(`{"username":"teacher"}`))
	request.Host = "identity.local"
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadGateway {
		t.Fatalf("status = %d body = %q, want 502", response.Code, response.Body.String())
	}
	if got, want := transport.hosts, []string{"gateway-a.test"}; !slices.Equal(got, want) {
		t.Fatalf("upstream attempts = %#v want %#v", got, want)
	}
}

func TestIngressHandlerRetriesPostOnDialErrorBeforeUpstreamWrite(t *testing.T) {
	upstreams, err := parseUpstreamBaseURLs("http://gateway-a.test,http://gateway-b.test")
	if err != nil {
		t.Fatalf("parseUpstreamBaseURLs() error = %v", err)
	}
	transport := &scriptedRoundTripper{
		results: []roundTripResult{
			{err: &net.OpError{Op: "dial", Err: errors.New("bind queue full")}},
			{statusCode: http.StatusCreated, body: "session\n"},
		},
	}
	handler := newIngressHandler(upstreams, transport)
	request := httptest.NewRequest(http.MethodPost, "/v1/identity/sessions/refresh", strings.NewReader(`{"refreshToken":"refresh_1"}`))
	request.Host = "identity.local"
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d body = %q, want 201", response.Code, response.Body.String())
	}
	if got, want := transport.hosts, []string{"gateway-a.test", "gateway-b.test"}; !slices.Equal(got, want) {
		t.Fatalf("upstream attempts = %#v want %#v", got, want)
	}
}

type scriptedRoundTripper struct {
	results        []roundTripResult
	hosts          []string
	paths          []string
	queries        []string
	forwardedHosts []string
}

type roundTripResult struct {
	statusCode int
	body       string
	err        error
}

func (transport *scriptedRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	transport.hosts = append(transport.hosts, request.URL.Host)
	transport.paths = append(transport.paths, request.URL.Path)
	transport.queries = append(transport.queries, request.URL.RawQuery)
	transport.forwardedHosts = append(transport.forwardedHosts, request.Header.Get("X-Forwarded-Host"))

	index := len(transport.hosts) - 1
	if index >= len(transport.results) {
		return nil, errors.New("unexpected extra round trip")
	}
	result := transport.results[index]
	if result.err != nil {
		return nil, result.err
	}
	return &http.Response{
		StatusCode: result.statusCode,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(result.body)),
		Request:    request,
	}, nil
}
