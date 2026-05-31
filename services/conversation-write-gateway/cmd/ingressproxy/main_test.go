package main

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
)

func TestParseUpstreamBaseURLs(t *testing.T) {
	got, err := parseUpstreamBaseURLs("http://127.0.0.1:18080, http://127.0.0.1:18081/")
	if err != nil {
		t.Fatalf("parseUpstreamBaseURLs() error = %v", err)
	}
	want := []string{"http://127.0.0.1:18080", "http://127.0.0.1:18081"}

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
	upstreams, err := parseUpstreamBaseURLs("http://127.0.0.1:18080,http://127.0.0.1:18081")
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
		"http://127.0.0.1:18080",
		"http://127.0.0.1:18081",
		"http://127.0.0.1:18080",
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("pick %d = %q want %q", index, got[index], want[index])
		}
	}
}

func TestBuildUpstreamTransportProfile(t *testing.T) {
	config := proxyConfig{
		MaxConnsPerHost:        350,
		WarmConnectionsPerHost: 22,
	}

	_, profile := buildUpstreamTransport(config, 6)

	if profile.MaxConnsPerHost != 350 {
		t.Fatalf("MaxConnsPerHost = %d want 350", profile.MaxConnsPerHost)
	}
	if profile.WarmConnectionsPerHost != 22 {
		t.Fatalf("WarmConnectionsPerHost = %d want 22", profile.WarmConnectionsPerHost)
	}
	if profile.WarmConnectionsTotal != 132 {
		t.Fatalf("WarmConnectionsTotal = %d want 132", profile.WarmConnectionsTotal)
	}
	if profile.MaxIdleConns < 2100 || profile.MaxIdleConnsPerHost < 350 {
		t.Fatalf("idle connection profile is too small: %#v", profile)
	}
}

func TestIngressHandlerRoutesPostRequestsRoundRobin(t *testing.T) {
	upstreams, err := parseUpstreamBaseURLs("http://gateway-a.test,http://gateway-b.test")
	if err != nil {
		t.Fatalf("parseUpstreamBaseURLs() error = %v", err)
	}
	transport := &scriptedRoundTripper{
		results: []roundTripResult{
			{statusCode: http.StatusCreated, body: "created-a\n"},
			{statusCode: http.StatusCreated, body: "created-b\n"},
		},
	}
	handler := newIngressHandler(upstreams, transport)

	for _, title := range []string{"first", "second"} {
		request := httptest.NewRequest(
			http.MethodPost,
			"/v1/research/conversations?source=bench",
			strings.NewReader(`{"title":"`+title+`"}`),
		)
		request.Host = "research.local"
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusCreated {
			t.Fatalf("status = %d body = %q, want 201", response.Code, response.Body.String())
		}
	}

	if got, want := transport.hosts, []string{"gateway-a.test", "gateway-b.test"}; !slices.Equal(got, want) {
		t.Fatalf("upstream hosts = %#v want %#v", got, want)
	}
	if got, want := transport.paths, []string{"/v1/research/conversations", "/v1/research/conversations"}; !slices.Equal(got, want) {
		t.Fatalf("upstream paths = %#v want %#v", got, want)
	}
	if got, want := transport.queries, []string{"source=bench", "source=bench"}; !slices.Equal(got, want) {
		t.Fatalf("upstream queries = %#v want %#v", got, want)
	}
	if got, want := transport.forwardedHosts, []string{"research.local", "research.local"}; !slices.Equal(got, want) {
		t.Fatalf("forwarded hosts = %#v want %#v", got, want)
	}
	if got, want := transport.bodies, []string{`{"title":"first"}`, `{"title":"second"}`}; !slices.Equal(got, want) {
		t.Fatalf("bodies = %#v want %#v", got, want)
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
			{statusCode: http.StatusCreated, body: "should not be used\n"},
		},
	}
	handler := newIngressHandler(upstreams, transport)
	request := httptest.NewRequest(http.MethodPost, "/v1/research/conversations", strings.NewReader(`{"title":"Research"}`))
	request.Host = "research.local"
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadGateway {
		t.Fatalf("status = %d body = %q, want 502", response.Code, response.Body.String())
	}
	if got, want := transport.hosts, []string{"gateway-a.test"}; !slices.Equal(got, want) {
		t.Fatalf("upstream attempts = %#v want %#v", got, want)
	}
}

type scriptedRoundTripper struct {
	results        []roundTripResult
	hosts          []string
	paths          []string
	queries        []string
	forwardedHosts []string
	bodies         []string
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
	body, _ := io.ReadAll(request.Body)
	_ = request.Body.Close()
	transport.bodies = append(transport.bodies, string(body))

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
