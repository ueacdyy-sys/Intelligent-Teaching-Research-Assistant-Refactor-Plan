package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

func buildHTTPClient(config benchmarkConfig, gatewayCount int) (*http.Client, benchmarkTransportProfile) {
	warmConnectionsTotal := maxInt(0, config.WarmConnectionsPerHost) * maxInt(1, gatewayCount)
	maxIdleConns := maxInt(config.Concurrency*4, warmConnectionsTotal)
	maxIdleConnsPerHost := maxInt(config.Concurrency, config.WarmConnectionsPerHost)
	transport := &http.Transport{
		MaxIdleConns:        maxIdleConns,
		MaxIdleConnsPerHost: maxIdleConnsPerHost,
		MaxConnsPerHost:     config.MaxConnsPerHost,
		IdleConnTimeout:     30 * time.Second,
	}
	return &http.Client{
			Timeout:   10 * time.Second,
			Transport: transport,
		}, benchmarkTransportProfile{
			MaxIdleConns:           maxIdleConns,
			MaxIdleConnsPerHost:    maxIdleConnsPerHost,
			MaxConnsPerHost:        config.MaxConnsPerHost,
			WarmConnectionsPerHost: config.WarmConnectionsPerHost,
			WarmConnectionsTotal:   warmConnectionsTotal,
			WarmConnectionStrategy: warmConnectionStrategy(config.WarmConnectionsPerHost),
			WarmConnectionRetries:  config.WarmConnectionRetries,
		}
}

func warmHTTPConnections(
	ctx context.Context,
	client *http.Client,
	baseURLs []string,
	connectionsPerHost int,
	retries int,
) error {
	return warmHTTPConnectionsWithRequester(ctx, baseURLs, connectionsPerHost, retries, func(ctx context.Context, baseURL string) error {
		return requestHealth(ctx, client, baseURL)
	})
}

func warmHTTPConnectionsWithRequester(
	ctx context.Context,
	baseURLs []string,
	connectionsPerHost int,
	retries int,
	requester func(context.Context, string) error,
) error {
	if connectionsPerHost <= 0 {
		return nil
	}
	for _, baseURL := range baseURLs {
		if err := warmHTTPConnectionsForHost(ctx, baseURL, connectionsPerHost, retries, requester); err != nil {
			return err
		}
	}
	return nil
}

func warmHTTPConnectionsForHost(
	ctx context.Context,
	baseURL string,
	connectionsPerHost int,
	retries int,
	requester func(context.Context, string) error,
) error {
	var wg sync.WaitGroup
	errs := make(chan error, connectionsPerHost)
	start := make(chan struct{})
	for index := 0; index < connectionsPerHost; index++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if err := requestWithWarmRetries(ctx, baseURL, retries, requester); err != nil {
				errs <- err
			}
		}()
	}
	close(start)
	wg.Wait()
	close(errs)
	for err := range errs {
		return fmt.Errorf("warm transport connections: %w", err)
	}
	return nil
}

func requestWithWarmRetries(
	ctx context.Context,
	baseURL string,
	retries int,
	requester func(context.Context, string) error,
) error {
	attempts := maxInt(1, retries+1)
	var lastErr error
	for attempt := 0; attempt < attempts; attempt++ {
		if err := requester(ctx, baseURL); err != nil {
			lastErr = err
		} else {
			return nil
		}
		if attempt == attempts-1 {
			break
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(25 * time.Millisecond):
		}
	}
	return lastErr
}

func warmConnectionStrategy(connectionsPerHost int) string {
	if connectionsPerHost <= 0 {
		return "DISABLED"
	}
	return "PER_HOST_PARALLEL"
}

func waitHealth(ctx context.Context, client *http.Client, baseURL string) error {
	deadline, ok := ctx.Deadline()
	if !ok {
		deadline = time.Now().Add(30 * time.Second)
	}
	var lastErr error
	for time.Now().Before(deadline) {
		if err := requestHealth(ctx, client, baseURL); err != nil {
			lastErr = err
		} else {
			return nil
		}
		time.Sleep(200 * time.Millisecond)
	}
	return fmt.Errorf("gateway health check failed: %w", lastErr)
}

func requestHealth(ctx context.Context, client *http.Client, baseURL string) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/health", nil)
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
