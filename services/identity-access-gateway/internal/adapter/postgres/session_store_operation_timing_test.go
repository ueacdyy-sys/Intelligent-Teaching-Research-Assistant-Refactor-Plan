package postgres_test

import (
	"context"
	"testing"
	"time"

	"ita-refactor/services/identity-access-gateway/internal/adapter/postgres"
	"ita-refactor/services/identity-access-gateway/internal/platform"
)

func TestSessionStoreOperationTimingStatsAttributeReadsAndWrites(t *testing.T) {
	db := delayedDB{inner: newFakeDB(), delay: time.Millisecond}
	store := postgres.NewSessionStore(db)
	principal := teacherPrincipal("sess_operation_timing")
	now := principal.IssuedAt

	if err := store.SaveSession(context.Background(), "access_timing", "refresh_timing", principal); err != nil {
		t.Fatalf("SaveSession error = %v", err)
	}
	if _, ok, err := store.GetPrincipalByAccessToken(context.Background(), "access_timing"); err != nil || !ok {
		t.Fatalf("GetPrincipalByAccessToken ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetPrincipalByRefreshToken(context.Background(), "refresh_timing"); err != nil || !ok {
		t.Fatalf("GetPrincipalByRefreshToken ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.RotateRefreshSession(
		context.Background(),
		"refresh_timing",
		"access_timing_rotated",
		"refresh_timing_rotated",
		now.Add(time.Minute),
		now.Add(time.Hour),
	); err != nil || !ok {
		t.Fatalf("RotateRefreshSession ok=%v err=%v", ok, err)
	}
	if ok, err := store.RevokeOwnSession(
		context.Background(),
		"access_timing_rotated",
		"sess_operation_timing",
		now,
	); err != nil || !ok {
		t.Fatalf("RevokeOwnSession ok=%v err=%v", ok, err)
	}

	stats := store.SessionOperationTimingStats()
	assertOperationTiming(t, stats, "saveSession", 1)
	assertOperationTiming(t, stats, "getPrincipalByAccessToken", 1)
	assertOperationTiming(t, stats, "getPrincipalByRefreshToken", 1)
	assertOperationTiming(t, stats, "rotateRefreshSession", 1)
	assertOperationTiming(t, stats, "revokeOwnSession", 1)
}

func TestSessionStoreOperationTimingStatsExposeMeasuredDatabaseBreakdown(t *testing.T) {
	db := measuredExecDB{
		inner:       newFakeDB(),
		poolAcquire: 2 * time.Millisecond,
		dbExecute:   3 * time.Millisecond,
	}
	store := postgres.NewSessionStore(db)
	principal := teacherPrincipal("sess_measured_operation")

	if err := store.SaveSession(context.Background(), "access_measured", "refresh_measured", principal); err != nil {
		t.Fatalf("SaveSession error = %v", err)
	}
	if ok, err := store.RevokeOwnSession(
		context.Background(),
		"access_measured",
		"sess_measured_operation",
		principal.IssuedAt,
	); err != nil || !ok {
		t.Fatalf("RevokeOwnSession ok=%v err=%v", ok, err)
	}

	stats := store.SessionOperationTimingStats()
	assertMeasuredOperationTiming(t, stats, "saveSession")
	assertMeasuredOperationTiming(t, stats, "revokeOwnSession")
}

func TestSessionStoreOperationTimingStatsCountsZeroDurationMeasuredDatabaseBreakdown(t *testing.T) {
	db := measuredExecDB{inner: newFakeDB()}
	store := postgres.NewSessionStore(db)
	principal := teacherPrincipal("sess_zero_measured_operation")

	if err := store.SaveSession(context.Background(), "access_zero_measured", "refresh_zero_measured", principal); err != nil {
		t.Fatalf("SaveSession error = %v", err)
	}

	stats := store.SessionOperationTimingStats()
	stat := stats["saveSession"]
	if stat.PoolAcquireCount != 1 {
		t.Fatalf("saveSession pool acquire count = %d want 1", stat.PoolAcquireCount)
	}
	if stat.PoolAcquireElapsedMs != 0 || stat.AveragePoolAcquireElapsedMs != 0 {
		t.Fatalf("saveSession zero pool acquire elapsed = %#v", stat)
	}
	if stat.DBExecuteElapsedMs != 0 || stat.AverageDBExecuteElapsedMs != 0 {
		t.Fatalf("saveSession zero db execute elapsed = %#v", stat)
	}
}

func assertOperationTiming(
	t *testing.T,
	stats map[string]platform.SessionOperationTimingStat,
	operation string,
	wantCount int64,
) {
	t.Helper()
	stat, ok := stats[operation]
	if !ok {
		t.Fatalf("operation %s missing from timing stats: %#v", operation, stats)
	}
	if stat.Count != wantCount {
		t.Fatalf("%s count = %d want %d", operation, stat.Count, wantCount)
	}
	if stat.TotalElapsedMs <= 0 {
		t.Fatalf("%s total elapsed = %v want > 0", operation, stat.TotalElapsedMs)
	}
	if stat.AverageElapsedMs <= 0 {
		t.Fatalf("%s average elapsed = %v want > 0", operation, stat.AverageElapsedMs)
	}
	if stat.MaxElapsedMs <= 0 {
		t.Fatalf("%s max elapsed = %v want > 0", operation, stat.MaxElapsedMs)
	}
}

func assertMeasuredOperationTiming(
	t *testing.T,
	stats map[string]platform.SessionOperationTimingStat,
	operation string,
) {
	t.Helper()
	stat := stats[operation]
	if stat.PoolAcquireCount != 1 {
		t.Fatalf("%s pool acquire count = %d want 1", operation, stat.PoolAcquireCount)
	}
	if stat.PoolAcquireElapsedMs != 2 {
		t.Fatalf("%s pool acquire elapsed = %v want 2", operation, stat.PoolAcquireElapsedMs)
	}
	if stat.AveragePoolAcquireElapsedMs != 2 {
		t.Fatalf("%s average pool acquire = %v want 2", operation, stat.AveragePoolAcquireElapsedMs)
	}
	if stat.DBExecuteElapsedMs != 3 {
		t.Fatalf("%s db execute elapsed = %v want 3", operation, stat.DBExecuteElapsedMs)
	}
	if stat.AverageDBExecuteElapsedMs != 3 {
		t.Fatalf("%s average db execute = %v want 3", operation, stat.AverageDBExecuteElapsedMs)
	}
}

type delayedDB struct {
	inner *fakeDB
	delay time.Duration
}

func (db delayedDB) Exec(ctx context.Context, sql string, args ...any) (postgres.CommandTag, error) {
	time.Sleep(db.delay)
	return db.inner.Exec(ctx, sql, args...)
}

func (db delayedDB) QueryRow(ctx context.Context, sql string, args ...any) postgres.Row {
	return delayedRow{inner: db.inner.QueryRow(ctx, sql, args...), delay: db.delay}
}

type delayedRow struct {
	inner postgres.Row
	delay time.Duration
}

func (r delayedRow) Scan(dest ...any) error {
	time.Sleep(r.delay)
	return r.inner.Scan(dest...)
}

type measuredExecDB struct {
	inner       *fakeDB
	poolAcquire time.Duration
	dbExecute   time.Duration
}

func (db measuredExecDB) Exec(ctx context.Context, sql string, args ...any) (postgres.CommandTag, error) {
	return db.inner.Exec(ctx, sql, args...)
}

func (db measuredExecDB) ExecMeasured(ctx context.Context, sql string, args ...any) (postgres.CommandTag, postgres.DBOperationMeasurement, error) {
	tag, err := db.inner.Exec(ctx, sql, args...)
	return tag, postgres.DBOperationMeasurement{
		PoolAcquireElapsed:  db.poolAcquire,
		DBExecuteElapsed:    db.dbExecute,
		PoolAcquireMeasured: true,
		DBExecuteMeasured:   true,
	}, err
}

func (db measuredExecDB) QueryRow(ctx context.Context, sql string, args ...any) postgres.Row {
	return db.inner.QueryRow(ctx, sql, args...)
}
