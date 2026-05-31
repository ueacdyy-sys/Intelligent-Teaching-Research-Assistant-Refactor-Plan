package main

import "testing"

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
