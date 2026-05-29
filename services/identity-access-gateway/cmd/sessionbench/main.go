package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"math"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"ita-refactor/services/identity-access-gateway/internal/adapter/postgres"
	"ita-refactor/services/identity-access-gateway/internal/domain"
)

type benchmarkConfig struct {
	DatabaseURL        string
	OutPath            string
	Concurrency        int
	OperationsPerPhase int
	PoolMaxConns       int
	Timeout            time.Duration
}

type benchmarkReport struct {
	GeneratedAt        string                 `json:"generatedAt"`
	DatabaseURL        string                 `json:"databaseUrl"`
	Concurrency        int                    `json:"concurrency"`
	OperationsPerPhase int                    `json:"operationsPerPhase"`
	PoolMaxConns       int                    `json:"poolMaxConns"`
	TotalDurationMS    float64                `json:"totalDurationMs"`
	Phases             map[string]phaseReport `json:"phases"`
}

type phaseReport struct {
	Name       string         `json:"name"`
	Operations int            `json:"operations"`
	Errors     int64          `json:"errors"`
	RPS        float64        `json:"rps"`
	LatencyMS  latencySummary `json:"latencyMs"`
}

type latencySummary struct {
	MinMS float64 `json:"min"`
	AvgMS float64 `json:"avg"`
	P50MS float64 `json:"p50"`
	P95MS float64 `json:"p95"`
	P99MS float64 `json:"p99"`
	MaxMS float64 `json:"max"`
}

type sessionState struct {
	sessionID    string
	accessToken  string
	refreshToken string
	principal    domain.PrincipalContext
}

func main() {
	config := parseConfig()
	if err := run(config); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func parseConfig() benchmarkConfig {
	config := benchmarkConfig{}
	flag.StringVar(&config.DatabaseURL, "database-url", os.Getenv("IDENTITY_SESSION_BENCHMARK_DATABASE_URL"), "PostgreSQL or PgBouncer DSN")
	flag.StringVar(&config.OutPath, "out", "", "optional JSON report path")
	flag.IntVar(&config.Concurrency, "concurrency", 64, "number of concurrent workers")
	flag.IntVar(&config.OperationsPerPhase, "operations", 500, "operations to run for each phase")
	flag.IntVar(&config.PoolMaxConns, "pool-max-conns", 8, "pgx pool max connections")
	flag.DurationVar(&config.Timeout, "timeout", 60*time.Second, "benchmark timeout")
	flag.Parse()
	return config
}

func run(config benchmarkConfig) error {
	if config.DatabaseURL == "" {
		return errors.New("database-url or IDENTITY_SESSION_BENCHMARK_DATABASE_URL is required")
	}
	if config.Concurrency < 1 {
		return errors.New("concurrency must be positive")
	}
	if config.OperationsPerPhase < 1 {
		return errors.New("operations must be positive")
	}
	if config.PoolMaxConns < 1 {
		return errors.New("pool-max-conns must be positive")
	}

	ctx, cancel := context.WithTimeout(context.Background(), config.Timeout)
	defer cancel()

	poolConfig, err := pgxpool.ParseConfig(config.DatabaseURL)
	if err != nil {
		return fmt.Errorf("parse database URL: %w", err)
	}
	poolConfig.MinConns = 0
	poolConfig.MaxConns = int32(config.PoolMaxConns)

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return fmt.Errorf("open pool: %w", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("ping database: %w", err)
	}

	db := postgres.NewPoolDB(pool)
	if err := postgres.EnsureSchema(ctx, db); err != nil {
		return fmt.Errorf("ensure schema: %w", err)
	}

	store := postgres.NewSessionStore(db)
	runID := fmt.Sprintf("bench_%d", time.Now().UTC().UnixNano())
	defer cleanupSessions(context.Background(), db, runID)
	if err := cleanupSessions(ctx, db, runID); err != nil {
		return err
	}

	start := time.Now()
	accessPhase, err := runAccessLookupPhase(ctx, store, runID, config)
	if err != nil {
		return err
	}
	refreshPhase, err := runRefreshRotationPhase(ctx, store, runID, config)
	if err != nil {
		return err
	}
	revokePhase, err := runRevokeCyclePhase(ctx, store, runID, config)
	if err != nil {
		return err
	}
	report := benchmarkReport{
		GeneratedAt:        time.Now().UTC().Format(time.RFC3339Nano),
		DatabaseURL:        maskDatabaseURL(config.DatabaseURL),
		Concurrency:        config.Concurrency,
		OperationsPerPhase: config.OperationsPerPhase,
		PoolMaxConns:       config.PoolMaxConns,
		TotalDurationMS:    roundMillis(time.Since(start)),
		Phases: map[string]phaseReport{
			"accessLookup":    accessPhase,
			"refreshRotation": refreshPhase,
			"revokeCycle":     revokePhase,
		},
	}

	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return fmt.Errorf("encode report: %w", err)
	}
	if config.OutPath != "" {
		if err := os.MkdirAll(filepath.Dir(config.OutPath), 0o755); err != nil {
			return fmt.Errorf("create report directory: %w", err)
		}
		if err := os.WriteFile(config.OutPath, append(data, '\n'), 0o644); err != nil {
			return fmt.Errorf("write report: %w", err)
		}
	}
	fmt.Println(string(data))
	return nil
}

func runAccessLookupPhase(ctx context.Context, store *postgres.SessionStore, runID string, config benchmarkConfig) (phaseReport, error) {
	tokenCount := maxInt(config.Concurrency*2, 128)
	tokens := make([]string, tokenCount)
	for index := 0; index < tokenCount; index++ {
		state := newSessionState(runID, "lookup", index, 0)
		if err := store.SaveSession(ctx, state.accessToken, state.refreshToken, state.principal); err != nil {
			return phaseReport{}, fmt.Errorf("seed lookup session: %w", err)
		}
		tokens[index] = state.accessToken
	}

	phase, firstErr := runPhase("accessLookup", config.Concurrency, config.OperationsPerPhase, func(_ int, opIndex int) error {
		principal, ok, err := store.GetPrincipalByAccessToken(ctx, tokens[opIndex%len(tokens)])
		if err != nil {
			return err
		}
		if !ok || principal.SessionID == "" {
			return errors.New("lookup principal missing")
		}
		return nil
	})
	return phase, phaseError("accessLookup", phase, firstErr)
}

func runRefreshRotationPhase(ctx context.Context, store *postgres.SessionStore, runID string, config benchmarkConfig) (phaseReport, error) {
	states := make([]sessionState, config.Concurrency)
	for worker := range states {
		states[worker] = newSessionState(runID, "refresh", worker, 0)
		state := states[worker]
		if err := store.SaveSession(ctx, state.accessToken, state.refreshToken, state.principal); err != nil {
			return phaseReport{}, fmt.Errorf("seed refresh session: %w", err)
		}
	}

	phase, firstErr := runPhase("refreshRotation", config.Concurrency, config.OperationsPerPhase, func(workerID int, opIndex int) error {
		state := &states[workerID]
		nextAccess := fmt.Sprintf("%s_refresh_access_%d_%d", runID, workerID, opIndex+1)
		nextRefresh := fmt.Sprintf("%s_refresh_token_%d_%d", runID, workerID, opIndex+1)
		state.principal.IssuedAt = state.principal.IssuedAt.Add(time.Millisecond)
		state.principal.ExpiresAt = state.principal.ExpiresAt.Add(time.Millisecond)
		if err := store.RotateSession(ctx, state.refreshToken, nextAccess, nextRefresh, state.principal); err != nil {
			return err
		}
		state.accessToken = nextAccess
		state.refreshToken = nextRefresh
		return nil
	})
	return phase, phaseError("refreshRotation", phase, firstErr)
}

func runRevokeCyclePhase(ctx context.Context, store *postgres.SessionStore, runID string, config benchmarkConfig) (phaseReport, error) {
	states := make([]sessionState, config.Concurrency)
	for worker := range states {
		states[worker] = newSessionState(runID, "revoke", worker, 0)
	}

	phase, firstErr := runPhase("revokeCycle", config.Concurrency, config.OperationsPerPhase, func(workerID int, opIndex int) error {
		state := &states[workerID]
		state.accessToken = fmt.Sprintf("%s_revoke_access_%d_%d", runID, workerID, opIndex)
		state.refreshToken = fmt.Sprintf("%s_revoke_refresh_%d_%d", runID, workerID, opIndex)
		state.principal.IssuedAt = state.principal.IssuedAt.Add(time.Millisecond)
		state.principal.ExpiresAt = state.principal.ExpiresAt.Add(time.Millisecond)
		if err := store.SaveSession(ctx, state.accessToken, state.refreshToken, state.principal); err != nil {
			return err
		}
		if err := store.RevokeSession(ctx, state.sessionID); err != nil {
			return err
		}
		if _, ok, err := store.GetPrincipalByAccessToken(ctx, state.accessToken); err != nil || ok {
			if err != nil {
				return err
			}
			return errors.New("revoked access token still resolves")
		}
		return nil
	})
	return phase, phaseError("revokeCycle", phase, firstErr)
}

func runPhase(name string, concurrency int, operations int, workerFunc func(workerID int, opIndex int) error) (phaseReport, error) {
	latencies := make([]time.Duration, operations)
	jobs := make(chan int)
	var errorsCount int64
	var firstErr error
	var firstErrMu sync.Mutex
	var wg sync.WaitGroup
	start := time.Now()

	for worker := 0; worker < concurrency; worker++ {
		workerID := worker
		wg.Add(1)
		go func() {
			defer wg.Done()
			for opIndex := range jobs {
				opStart := time.Now()
				if err := workerFunc(workerID, opIndex); err != nil {
					atomic.AddInt64(&errorsCount, 1)
					firstErrMu.Lock()
					if firstErr == nil {
						firstErr = err
					}
					firstErrMu.Unlock()
				}
				latencies[opIndex] = time.Since(opStart)
			}
		}()
	}

	for opIndex := 0; opIndex < operations; opIndex++ {
		jobs <- opIndex
	}
	close(jobs)
	wg.Wait()

	return buildPhaseReport(name, latencies, errorsCount, time.Since(start)), firstErr
}

func buildPhaseReport(name string, latencies []time.Duration, errorsCount int64, duration time.Duration) phaseReport {
	seconds := duration.Seconds()
	rps := 0.0
	if seconds > 0 {
		rps = roundFloat(float64(len(latencies)) / seconds)
	}
	return phaseReport{
		Name:       name,
		Operations: len(latencies),
		Errors:     errorsCount,
		RPS:        rps,
		LatencyMS:  summarizeLatencies(latencies),
	}
}

func summarizeLatencies(latencies []time.Duration) latencySummary {
	if len(latencies) == 0 {
		return latencySummary{}
	}
	sorted := append([]time.Duration(nil), latencies...)
	sort.Slice(sorted, func(left int, right int) bool {
		return sorted[left] < sorted[right]
	})
	var total time.Duration
	for _, latency := range sorted {
		total += latency
	}
	return latencySummary{
		MinMS: roundMillis(sorted[0]),
		AvgMS: roundMillis(total / time.Duration(len(sorted))),
		P50MS: roundMillis(percentile(sorted, 50)),
		P95MS: roundMillis(percentile(sorted, 95)),
		P99MS: roundMillis(percentile(sorted, 99)),
		MaxMS: roundMillis(sorted[len(sorted)-1]),
	}
}

func percentile(sorted []time.Duration, p int) time.Duration {
	if len(sorted) == 0 {
		return 0
	}
	index := int(math.Ceil((float64(p)/100)*float64(len(sorted)))) - 1
	if index < 0 {
		index = 0
	}
	if index >= len(sorted) {
		index = len(sorted) - 1
	}
	return sorted[index]
}

func newSessionState(runID string, phase string, worker int, iteration int) sessionState {
	sessionID := fmt.Sprintf("%s_%s_session_%d", runID, phase, worker)
	now := time.Now().UTC()
	return sessionState{
		sessionID:    sessionID,
		accessToken:  fmt.Sprintf("%s_%s_access_%d_%d", runID, phase, worker, iteration),
		refreshToken: fmt.Sprintf("%s_%s_refresh_%d_%d", runID, phase, worker, iteration),
		principal: domain.PrincipalContext{
			PrincipalID:     fmt.Sprintf("teacher_%s_%d", phase, worker),
			SubjectType:     domain.SubjectUser,
			Role:            domain.RoleTeacher,
			EntryPoint:      domain.EntryPointDesktopTeacher,
			DisplayName:     "Benchmark Teacher",
			Scopes:          []domain.Scope{domain.ScopeIdentityRead, domain.ScopeTeachingRead},
			KnowledgeAccess: domain.KnowledgeAccess{Public: true, Private: domain.PrivateAccessAssigned},
			StudentAccess:   domain.StudentAccess{Mode: domain.StudentAccessAssigned},
			SessionID:       sessionID,
			IssuedAt:        now,
			ExpiresAt:       now.Add(time.Hour),
		},
	}
}

func cleanupSessions(ctx context.Context, db postgres.DB, runID string) error {
	_, err := db.Exec(ctx, "DELETE FROM identity_sessions WHERE session_id LIKE $1", runID+"%")
	if err != nil {
		return fmt.Errorf("cleanup benchmark sessions: %w", err)
	}
	return nil
}

func phaseError(name string, phase phaseReport, firstErr error) error {
	if phase.Errors == 0 {
		return nil
	}
	return fmt.Errorf("%s failed with %d errors; first error: %w", name, phase.Errors, firstErr)
}

func maskDatabaseURL(databaseURL string) string {
	parsed, err := url.Parse(databaseURL)
	if err != nil || parsed.User == nil {
		return databaseURL
	}
	username := parsed.User.Username()
	if _, ok := parsed.User.Password(); !ok {
		return databaseURL
	}
	withoutUser := *parsed
	withoutUser.User = nil
	prefix := parsed.Scheme + "://"
	return prefix + username + ":***@" + strings.TrimPrefix(withoutUser.String(), prefix)
}

func roundMillis(duration time.Duration) float64 {
	return roundFloat(float64(duration) / float64(time.Millisecond))
}

func roundFloat(value float64) float64 {
	return math.Round(value*100) / 100
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}
