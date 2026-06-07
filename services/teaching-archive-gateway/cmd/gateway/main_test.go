package main

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	teachingcache "ita-refactor/services/teaching-archive-gateway/internal/adapter/cache"
	teachingpostgres "ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestParsePostgresPoolSettingsDefaultsToSingleWarmConnection(t *testing.T) {
	settings, err := parsePostgresPoolSettings(func(string) string { return "" })
	if err != nil {
		t.Fatalf("parsePostgresPoolSettings returned error: %v", err)
	}

	if settings.MaxConns != 8 {
		t.Fatalf("MaxConns = %d, want 8", settings.MaxConns)
	}
	if settings.MinConns != 0 {
		t.Fatalf("MinConns = %d, want 0", settings.MinConns)
	}
	if settings.PrewarmConns != 1 {
		t.Fatalf("PrewarmConns = %d, want 1", settings.PrewarmConns)
	}
}

func TestParsePostgresPoolSettingsAcceptsProductionWarmPool(t *testing.T) {
	env := map[string]string{
		"DB_MAX_CONNS":     "12",
		"DB_MIN_CONNS":     "12",
		"DB_PREWARM_CONNS": "12",
	}
	settings, err := parsePostgresPoolSettings(func(key string) string { return env[key] })
	if err != nil {
		t.Fatalf("parsePostgresPoolSettings returned error: %v", err)
	}

	if settings != (postgresPoolSettings{MaxConns: 12, MinConns: 12, PrewarmConns: 12}) {
		t.Fatalf("settings = %#v", settings)
	}
}

func TestParsePostgresPoolSettingsRejectsOversizedWarmPool(t *testing.T) {
	for name, env := range map[string]map[string]string{
		"min": {
			"DB_MAX_CONNS": "8",
			"DB_MIN_CONNS": "9",
		},
		"prewarm": {
			"DB_MAX_CONNS":     "8",
			"DB_PREWARM_CONNS": "9",
		},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := parsePostgresPoolSettings(func(key string) string { return env[key] }); err == nil {
				t.Fatalf("parsePostgresPoolSettings returned nil error")
			}
		})
	}
}

func TestApplyPostgresPoolSettingsMapsToPgxPoolConfig(t *testing.T) {
	config, err := pgxpool.ParseConfig("postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable")
	if err != nil {
		t.Fatalf("ParseConfig returned error: %v", err)
	}

	applyPostgresPoolSettings(config, postgresPoolSettings{MaxConns: 12, MinConns: 6, PrewarmConns: 6})

	if config.MaxConns != 12 {
		t.Fatalf("MaxConns = %d, want 12", config.MaxConns)
	}
	if config.MinConns != 6 {
		t.Fatalf("MinConns = %d, want 6", config.MinConns)
	}
}

func TestArchiveReaderFromConfigDefaultsToDirectReader(t *testing.T) {
	t.Setenv("TEACHING_ARCHIVE_LIST_CACHE_TTL_MS", "")
	reader := fakeArchiveReader{}

	configured := archiveReaderFromConfig(reader)

	if configured != reader {
		t.Fatalf("reader = %T, want direct fakeArchiveReader", configured)
	}
}

func TestArchiveReaderFromConfigEnablesCache(t *testing.T) {
	t.Setenv("TEACHING_ARCHIVE_LIST_CACHE_TTL_MS", "250")
	t.Setenv("TEACHING_ARCHIVE_LIST_CACHE_MAX_ENTRIES", "4096")

	configured := archiveReaderFromConfig(fakeArchiveReader{})

	if _, ok := configured.(*teachingcache.ArchiveReaderCache); !ok {
		t.Fatalf("reader = %T, want *cache.ArchiveReaderCache", configured)
	}
}

func TestSchemaOptionsFromConfigDefaultsToFullIndexProfile(t *testing.T) {
	t.Setenv("TEACHING_ARCHIVE_SCHEMA_INDEX_PROFILE", "")

	options, err := schemaOptionsFromConfig()
	if err != nil {
		t.Fatalf("schemaOptionsFromConfig returned error: %v", err)
	}
	if options.IndexProfile != teachingpostgres.SchemaIndexProfileFull {
		t.Fatalf("IndexProfile = %q, want full", options.IndexProfile)
	}
}

func TestSchemaOptionsFromConfigAcceptsHotWriteIndexProfile(t *testing.T) {
	t.Setenv("TEACHING_ARCHIVE_SCHEMA_INDEX_PROFILE", "hot_write")

	options, err := schemaOptionsFromConfig()
	if err != nil {
		t.Fatalf("schemaOptionsFromConfig returned error: %v", err)
	}
	if options.IndexProfile != teachingpostgres.SchemaIndexProfileHotWrite {
		t.Fatalf("IndexProfile = %q, want hot_write", options.IndexProfile)
	}
}

func TestSchemaOptionsFromConfigRejectsUnsupportedIndexProfile(t *testing.T) {
	t.Setenv("TEACHING_ARCHIVE_SCHEMA_INDEX_PROFILE", "unsafe_fast")

	if _, err := schemaOptionsFromConfig(); err == nil {
		t.Fatalf("schemaOptionsFromConfig returned nil error")
	}
}

func TestRetryPrewarmOperationRetriesTransientFailure(t *testing.T) {
	attempts := 0

	err := retryPrewarmOperation(context.Background(), 3, 0, func() error {
		attempts += 1
		if attempts < 3 {
			return errors.New("transient connect refused")
		}
		return nil
	})
	if err != nil {
		t.Fatalf("retryPrewarmOperation returned error: %v", err)
	}
	if attempts != 3 {
		t.Fatalf("attempts = %d, want 3", attempts)
	}
}

func TestRetryPrewarmOperationStopsAfterAttempts(t *testing.T) {
	transientErr := errors.New("transient connect refused")
	attempts := 0

	err := retryPrewarmOperation(context.Background(), 3, 0, func() error {
		attempts += 1
		return transientErr
	})
	if !errors.Is(err, transientErr) {
		t.Fatalf("retryPrewarmOperation error = %v, want %v", err, transientErr)
	}
	if attempts != 3 {
		t.Fatalf("attempts = %d, want 3", attempts)
	}
}

func TestArchiveCreateRepositoryFromConfigDefaultsToDirectRepository(t *testing.T) {
	t.Setenv("TEACHING_ARCHIVE_CREATE_BATCH_SIZE", "")

	repository := archiveCreateRepositoryFromConfig(fakeAcquireDB{})

	if _, ok := repository.(*teachingpostgres.ArchiveRepository); !ok {
		t.Fatalf("repository = %T, want *postgres.ArchiveRepository", repository)
	}
}

func TestArchiveCreateRepositoryFromConfigEnablesBatchingAboveOne(t *testing.T) {
	t.Setenv("TEACHING_ARCHIVE_CREATE_BATCH_SIZE", "64")
	t.Setenv("TEACHING_ARCHIVE_CREATE_BATCH_DELAY_MS", "0")
	t.Setenv("TEACHING_ARCHIVE_CREATE_BATCH_WORKERS", "2")
	t.Setenv("TEACHING_ARCHIVE_CREATE_BATCH_MODE", "copy")

	repository := archiveCreateRepositoryFromConfig(fakeAcquireDB{})
	batching, ok := repository.(*teachingpostgres.BatchingArchiveItemRepository)
	if !ok {
		t.Fatalf("repository = %T, want *postgres.BatchingArchiveItemRepository", repository)
	}
	defer batching.Close()

	if batching.WorkerCount() != 2 {
		t.Fatalf("WorkerCount = %d, want 2", batching.WorkerCount())
	}
	if batching.WriteMode() != teachingpostgres.ArchiveCreateBatchModeCopy {
		t.Fatalf("WriteMode = %q, want copy", batching.WriteMode())
	}
}

func TestQuizSubmissionRepositoryFromConfigDefaultsToDirectRepository(t *testing.T) {
	t.Setenv("TEACHING_ARCHIVE_CREATE_BATCH_SIZE", "")
	t.Setenv("TEACHING_QUIZ_SUBMISSION_BATCH_SIZE", "")

	repository := quizSubmissionRepositoryFromConfig(fakeAcquireDB{})

	if _, ok := repository.(*teachingpostgres.ArchiveRepository); !ok {
		t.Fatalf("repository = %T, want *postgres.ArchiveRepository", repository)
	}
}

func TestQuizSubmissionRepositoryFromConfigInheritsArchiveBatching(t *testing.T) {
	t.Setenv("TEACHING_ARCHIVE_CREATE_BATCH_SIZE", "64")
	t.Setenv("TEACHING_ARCHIVE_CREATE_BATCH_DELAY_MS", "0")
	t.Setenv("TEACHING_ARCHIVE_CREATE_BATCH_WORKERS", "2")

	repository := quizSubmissionRepositoryFromConfig(fakeAcquireDB{})
	batching, ok := repository.(*teachingpostgres.BatchingQuizSubmissionRepository)
	if !ok {
		t.Fatalf("repository = %T, want *postgres.BatchingQuizSubmissionRepository", repository)
	}
	defer batching.Close()

	if batching.WorkerCount() != 2 {
		t.Fatalf("WorkerCount = %d, want 2", batching.WorkerCount())
	}
}

type fakeAcquireDB struct{}

func (fakeAcquireDB) Exec(context.Context, string, ...any) (teachingpostgres.CommandTag, error) {
	return fakeCommandTag{}, nil
}

func (fakeAcquireDB) Query(context.Context, string, ...any) (teachingpostgres.Rows, error) {
	return nil, nil
}

func (fakeAcquireDB) Acquire(context.Context) (teachingpostgres.Conn, error) {
	return fakeConn{}, nil
}

type fakeConn struct{}

func (fakeConn) Exec(context.Context, string, ...any) (teachingpostgres.CommandTag, error) {
	return fakeCommandTag{}, nil
}

func (fakeConn) CopyFrom(context.Context, pgx.Identifier, []string, pgx.CopyFromSource) (int64, error) {
	return 0, nil
}

func (fakeConn) Release() {}

type fakeCommandTag struct{}

func (fakeCommandTag) RowsAffected() int64 {
	return 1
}

type fakeArchiveReader struct{}

func (fakeArchiveReader) List(context.Context, domain.ArchiveItemQuery) ([]domain.ArchiveItem, error) {
	return nil, nil
}
