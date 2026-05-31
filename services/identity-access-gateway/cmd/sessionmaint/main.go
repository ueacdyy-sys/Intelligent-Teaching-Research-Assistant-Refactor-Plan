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
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	identitypostgres "ita-refactor/services/identity-access-gateway/internal/adapter/postgres"
)

type maintenanceConfig struct {
	DatabaseURL    string
	OutPath        string
	Limit          int
	InactiveBefore time.Duration
	Timeout        time.Duration
	VacuumMode     string
}

type maintenanceReport struct {
	GeneratedAt    string            `json:"generatedAt"`
	Status         string            `json:"status"`
	DatabaseURL    string            `json:"databaseUrl"`
	Cutoff         string            `json:"cutoff"`
	InactiveBefore string            `json:"inactiveBefore"`
	Limit          int               `json:"limit"`
	VacuumMode     string            `json:"vacuumMode"`
	PrunedRows     int64             `json:"prunedRows"`
	Before         sessionTableStats `json:"before"`
	After          sessionTableStats `json:"after"`
}

type sessionTableStats struct {
	TotalRows         int64  `json:"totalRows"`
	ActiveRows        int64  `json:"activeRows"`
	RevokedRows       int64  `json:"revokedRows"`
	ExpiredActiveRows int64  `json:"expiredActiveRows"`
	TotalSizeBytes    int64  `json:"totalSizeBytes"`
	TableSizeBytes    int64  `json:"tableSizeBytes"`
	TotalSize         string `json:"totalSize"`
	TableSize         string `json:"tableSize"`
}

var keywordPasswordPattern = regexp.MustCompile(`(?i)(^|[\s?&;])(password=)('[^']*'|[^\s&;]+)`)

func main() {
	config, err := parseConfig(os.Args[1:])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	if err := run(config); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func parseConfig(args []string) (maintenanceConfig, error) {
	config := maintenanceConfig{}
	flags := flag.NewFlagSet("identity-session-maintenance", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	flags.StringVar(&config.DatabaseURL, "database-url", os.Getenv("IDENTITY_SESSION_MAINTENANCE_DATABASE_URL"), "PostgreSQL or PgBouncer DSN")
	flags.StringVar(&config.OutPath, "out", "", "optional JSON report path")
	flags.IntVar(&config.Limit, "limit", 100000, "maximum inactive session rows to prune")
	flags.DurationVar(&config.InactiveBefore, "inactive-before", 0, "prune sessions revoked or expired at or before now minus this duration")
	flags.DurationVar(&config.Timeout, "timeout", 60*time.Second, "maintenance timeout")
	flags.StringVar(&config.VacuumMode, "vacuum", "none", "optional vacuum mode: none, analyze, or full")
	if err := flags.Parse(args); err != nil {
		return maintenanceConfig{}, err
	}
	if err := validateConfig(config); err != nil {
		return maintenanceConfig{}, err
	}
	return config, nil
}

func validateConfig(config maintenanceConfig) error {
	if strings.TrimSpace(config.DatabaseURL) == "" {
		return errors.New("database-url or IDENTITY_SESSION_MAINTENANCE_DATABASE_URL is required")
	}
	if config.Limit < 1 {
		return errors.New("limit must be positive")
	}
	if config.InactiveBefore < 0 {
		return errors.New("inactive-before must be zero or positive")
	}
	if config.Timeout <= 0 {
		return errors.New("timeout must be positive")
	}
	switch config.VacuumMode {
	case "none", "analyze", "full":
		return nil
	default:
		return fmt.Errorf("vacuum must be one of none, analyze, or full: %s", config.VacuumMode)
	}
}

func run(config maintenanceConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), config.Timeout)
	defer cancel()

	poolConfig, err := pgxpool.ParseConfig(config.DatabaseURL)
	if err != nil {
		return fmt.Errorf("parse database URL: %w", err)
	}
	poolConfig.MinConns = 0
	poolConfig.MaxConns = 2
	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return fmt.Errorf("open pool: %w", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("ping database: %w", err)
	}

	db := identitypostgres.NewPoolDB(pool)
	if err := identitypostgres.EnsureSchema(ctx, db); err != nil {
		return fmt.Errorf("ensure schema: %w", err)
	}

	now := time.Now().UTC()
	cutoff := now.Add(-config.InactiveBefore)
	before, err := readSessionTableStats(ctx, db, cutoff)
	if err != nil {
		return fmt.Errorf("read session table before stats: %w", err)
	}

	store := identitypostgres.NewSessionStore(db)
	prunedRows, err := store.PruneInactiveSessions(ctx, cutoff, config.Limit)
	if err != nil {
		return fmt.Errorf("prune inactive sessions: %w", err)
	}
	if err := applyVacuum(ctx, db, config.VacuumMode); err != nil {
		return err
	}

	after, err := readSessionTableStats(ctx, db, cutoff)
	if err != nil {
		return fmt.Errorf("read session table after stats: %w", err)
	}

	report := buildMaintenanceReport(config, now, cutoff, before, after, prunedRows)
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

func readSessionTableStats(ctx context.Context, db identitypostgres.DB, cutoff time.Time) (sessionTableStats, error) {
	stats := sessionTableStats{}
	err := db.QueryRow(
		ctx,
		`SELECT
			COUNT(*) AS total_rows,
			COUNT(*) FILTER (WHERE revoked_at IS NULL AND expires_at > $1) AS active_rows,
			COUNT(*) FILTER (WHERE revoked_at IS NOT NULL) AS revoked_rows,
			COUNT(*) FILTER (WHERE revoked_at IS NULL AND expires_at <= $1) AS expired_active_rows,
			pg_total_relation_size('identity_sessions')::bigint AS total_size_bytes,
			pg_relation_size('identity_sessions')::bigint AS table_size_bytes
		FROM identity_sessions`,
		cutoff,
	).Scan(
		&stats.TotalRows,
		&stats.ActiveRows,
		&stats.RevokedRows,
		&stats.ExpiredActiveRows,
		&stats.TotalSizeBytes,
		&stats.TableSizeBytes,
	)
	if err != nil {
		return sessionTableStats{}, err
	}
	stats.TotalSize = prettyBytes(stats.TotalSizeBytes)
	stats.TableSize = prettyBytes(stats.TableSizeBytes)
	return stats, nil
}

func applyVacuum(ctx context.Context, db identitypostgres.DB, vacuumMode string) error {
	switch vacuumMode {
	case "none":
		return nil
	case "analyze":
		if _, err := db.Exec(ctx, `VACUUM (ANALYZE) identity_sessions`); err != nil {
			return fmt.Errorf("vacuum analyze identity_sessions: %w", err)
		}
		return nil
	case "full":
		if _, err := db.Exec(ctx, `VACUUM (FULL, ANALYZE) identity_sessions`); err != nil {
			return fmt.Errorf("vacuum full identity_sessions: %w", err)
		}
		return nil
	default:
		return fmt.Errorf("unsupported vacuum mode: %s", vacuumMode)
	}
}

func buildMaintenanceReport(
	config maintenanceConfig,
	now time.Time,
	cutoff time.Time,
	before sessionTableStats,
	after sessionTableStats,
	prunedRows int64,
) maintenanceReport {
	before = withPrettySizes(before)
	after = withPrettySizes(after)
	status := "READY"
	if prunedRows > 0 {
		status = "PRUNED"
	}
	return maintenanceReport{
		GeneratedAt:    now.Format(time.RFC3339Nano),
		Status:         status,
		DatabaseURL:    maskDatabaseURL(config.DatabaseURL),
		Cutoff:         cutoff.Format(time.RFC3339Nano),
		InactiveBefore: config.InactiveBefore.String(),
		Limit:          config.Limit,
		VacuumMode:     config.VacuumMode,
		PrunedRows:     prunedRows,
		Before:         before,
		After:          after,
	}
}

func withPrettySizes(stats sessionTableStats) sessionTableStats {
	stats.TotalSize = prettyBytes(stats.TotalSizeBytes)
	stats.TableSize = prettyBytes(stats.TableSizeBytes)
	return stats
}

func maskDatabaseURL(databaseURL string) string {
	parsed, err := url.Parse(databaseURL)
	if err != nil || parsed.User == nil {
		return maskKeywordPassword(databaseURL)
	}
	username := parsed.User.Username()
	if _, ok := parsed.User.Password(); !ok {
		return maskKeywordPassword(databaseURL)
	}
	withoutUser := *parsed
	withoutUser.User = nil
	prefix := parsed.Scheme + "://"
	return prefix + username + ":***@" + strings.TrimPrefix(withoutUser.String(), prefix)
}

func maskKeywordPassword(databaseURL string) string {
	return keywordPasswordPattern.ReplaceAllString(databaseURL, "${1}${2}***")
}

func prettyBytes(value int64) string {
	if value < 1024 {
		return fmt.Sprintf("%d B", value)
	}
	units := []string{"KB", "MB", "GB", "TB"}
	size := float64(value)
	for _, unit := range units {
		size /= 1024
		if size < 1024 {
			if math.Abs(size-math.Round(size)) < 0.05 {
				return fmt.Sprintf("%.0f %s", size, unit)
			}
			return fmt.Sprintf("%.1f %s", size, unit)
		}
	}
	return fmt.Sprintf("%.1f PB", size/1024)
}
