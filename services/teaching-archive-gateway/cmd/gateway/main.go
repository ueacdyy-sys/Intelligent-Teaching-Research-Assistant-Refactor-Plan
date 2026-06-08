package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	teachingcache "ita-refactor/services/teaching-archive-gateway/internal/adapter/cache"
	teachingcommandlog "ita-refactor/services/teaching-archive-gateway/internal/adapter/commandlog"
	"ita-refactor/services/teaching-archive-gateway/internal/adapter/httpapi"
	teachingpostgres "ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/platform"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func main() {
	ctx := context.Background()
	pool := mustOpenPostgres(ctx)
	defer pool.Close()

	db := teachingpostgres.NewPoolDB(pool)
	schemaOptions, err := schemaOptionsFromConfig()
	if err != nil {
		log.Fatal(err)
	}
	if err := teachingpostgres.EnsureSchemaWithOptions(ctx, db, schemaOptions); err != nil {
		log.Fatal(err)
	}

	archiveRepository := teachingpostgres.NewArchiveRepository(db)
	archiveReader := archiveReaderFromConfig(archiveRepository)
	writeRepositories := teachingWriteRepositoriesFromConfig(db)
	createArchiveRepository := writeRepositories.ArchiveCreateRepository
	if closeable, ok := createArchiveRepository.(interface{ Close() }); ok {
		defer closeable.Close()
	}
	quizSubmissionRepository := writeRepositories.QuizSubmissionRepository
	if closeable, ok := quizSubmissionRepository.(interface{ Close() }); ok {
		defer closeable.Close()
	}
	teachingDraftCommandPort := writeRepositories.TeachingDraftCommandPort
	if closeable, ok := teachingDraftCommandPort.(interface{ Close() }); ok {
		defer closeable.Close()
	}
	createArchiveItem := usecase.NewCreateArchiveItem(
		createArchiveRepository,
		platform.IDGenerator{},
		platform.Clock{},
	)
	listArchiveItems := usecase.NewListArchiveItems(archiveReader)
	listStudentAppTeachingMaterials := usecase.NewListStudentAppTeachingMaterials(archiveReader)
	listStudentAppArchiveItems := usecase.NewListStudentAppArchiveItems(archiveRepository)
	readStudentAppArchiveItem := usecase.NewReadStudentAppArchiveItem(archiveRepository)
	readStudentAppArchiveItemContentPreview := usecase.NewReadStudentAppArchiveItemContentPreview(archiveRepository)
	renderStudentAppArchiveItemContentPreview := usecase.NewRenderStudentAppArchiveItemContentPreview(archiveRepository)
	readStudentAppArchiveItemStudyPacket := usecase.NewReadStudentAppArchiveItemStudyPacket(archiveRepository)
	readStudentAppArchiveItemLearningActions := usecase.NewReadStudentAppArchiveItemLearningActions(archiveRepository)
	listStudentAppQuizSubmissions := usecase.NewListStudentAppQuizSubmissions(archiveRepository)
	listStudentAppQuestionBankDrafts := usecase.NewListStudentAppQuestionBankDrafts(archiveRepository)
	readStudentAppQuestionBankDraftContent := usecase.NewReadStudentAppQuestionBankDraftContent(archiveRepository)
	submitStudentAppQuestionBankDraftAnswer := usecase.NewSubmitStudentAppQuestionBankDraftAnswer(
		archiveRepository,
		platform.QuestionBankDraftAnswerSubmissionIDGenerator{},
		platform.Clock{},
	)
	createStudentAppQuestionBankDraftAnswerScoringRequest := usecase.NewCreateStudentAppQuestionBankDraftAnswerScoringRequest(
		archiveRepository,
		platform.AIGradingRequestIDGenerator{},
		platform.Clock{},
	)
	readStudentAppQuestionBankDraftAnswerScoringResult := usecase.NewReadStudentAppQuestionBankDraftAnswerScoringResult(
		archiveRepository,
	)
	createStudentAppAITutorRequest := usecase.NewCreateStudentAppAITutorRequest(
		archiveRepository,
		platform.TutoringRequestIDGenerator{},
		platform.Clock{},
	)
	listStudentAppAITutorRequests := usecase.NewListStudentAppAITutorRequests(archiveRepository)
	createQuizSubmission := usecase.NewCreateQuizSubmission(
		quizSubmissionRepository,
		platform.QuizSubmissionIDGenerator{},
		platform.Clock{},
	)
	submitTeachingQuizDraftIntent := usecase.NewSubmitTeachingQuizDraftIntent(
		teachingDraftCommandPort,
		platform.TeachingQuizDraftIntentIDGenerator{},
		platform.Clock{},
	)
	submitArchiveMaterialDraftIntent := usecase.NewSubmitTeachingArchiveMaterialDraftIntent(
		teachingDraftCommandPort,
		platform.TeachingArchiveMaterialDraftIntentIDGenerator{},
		platform.Clock{},
	)
	createScannedQuizSubmission := usecase.NewCreateScannedQuizSubmission(
		quizSubmissionRepository,
		platform.QuizSubmissionIDGenerator{},
		platform.Clock{},
	)
	listQuizSubmissions := usecase.NewListQuizSubmissions(archiveRepository)
	createAIGradingRequest := usecase.NewCreateAIGradingRequest(
		archiveRepository,
		platform.AIGradingRequestIDGenerator{},
		platform.Clock{},
	)
	createQuizSubmissionAIGradingRequest := usecase.NewCreateQuizSubmissionAIGradingRequest(
		archiveRepository,
		platform.AIGradingRequestIDGenerator{},
		platform.Clock{},
	)
	listAIGradingRequests := usecase.NewListAIGradingRequests(archiveRepository)
	claimAIGradingRequest := usecase.NewClaimAIGradingRequest(
		archiveRepository,
		platform.Clock{},
	)
	recordAIGradingResult := usecase.NewRecordAIGradingResult(
		archiveRepository,
		platform.Clock{},
	)
	readQuestionBankDraftAnswerScoringInput := usecase.NewReadQuestionBankDraftAnswerScoringInput(
		archiveRepository,
		platform.Clock{},
	)
	createTutoringAnalysisRequest := usecase.NewCreateTutoringAnalysisRequest(
		archiveRepository,
		platform.TutoringRequestIDGenerator{},
		platform.Clock{},
	)
	listTutoringAnalysisRequests := usecase.NewListTutoringAnalysisRequests(archiveRepository)
	claimTutoringAnalysisRequest := usecase.NewClaimTutoringAnalysisRequest(
		archiveRepository,
		platform.Clock{},
	)
	recordTutoringAnalysisResult := usecase.NewRecordTutoringAnalysisResult(
		archiveRepository,
		platform.Clock{},
	)
	createAttendanceSession := usecase.NewCreateAttendanceSession(
		archiveRepository,
		platform.AttendanceSessionIDGenerator{},
		platform.Clock{},
	)
	createAttendanceRecord := usecase.NewCreateAttendanceRecord(
		archiveRepository,
		platform.AttendanceRecordIDGenerator{},
		platform.Clock{},
	)
	signInAttendance := usecase.NewSignInAttendance(
		archiveRepository,
		platform.AttendanceRecordIDGenerator{},
		platform.Clock{},
	)
	endAttendanceSession := usecase.NewEndAttendanceSession(
		archiveRepository,
		platform.Clock{},
	)
	selectAttendanceRandomStudents := usecase.NewSelectAttendanceRandomStudents(
		archiveRepository,
		platform.CryptoRandomSource{},
	)
	listAttendanceRecords := usecase.NewListAttendanceRecords(archiveRepository)
	listStudentAttendanceRecords := usecase.NewListStudentAttendanceRecords(archiveRepository)
	getAttendanceStatistics := usecase.NewGetAttendanceStatistics(archiveRepository)

	server := &http.Server{
		Addr: ":" + getenv("PORT", "18120"),
		Handler: httpapi.NewServer(httpapi.ServerConfig{
			CreateArchiveItem:                                     createArchiveItem,
			ListArchiveItems:                                      listArchiveItems,
			ListStudentAppTeachingMaterials:                       listStudentAppTeachingMaterials,
			ListStudentAppArchiveItems:                            listStudentAppArchiveItems,
			ReadStudentAppArchiveItem:                             readStudentAppArchiveItem,
			ReadStudentAppArchiveItemContentPreview:               readStudentAppArchiveItemContentPreview,
			RenderStudentAppArchiveItemContentPreview:             renderStudentAppArchiveItemContentPreview,
			ReadStudentAppArchiveItemStudyPacket:                  readStudentAppArchiveItemStudyPacket,
			ReadStudentAppArchiveItemLearningActions:              readStudentAppArchiveItemLearningActions,
			ListStudentAppQuizSubmissions:                         listStudentAppQuizSubmissions,
			ListStudentAppQuestionBankDrafts:                      listStudentAppQuestionBankDrafts,
			ReadStudentAppQuestionBankDraftContent:                readStudentAppQuestionBankDraftContent,
			SubmitStudentAppQuestionBankDraftAnswer:               submitStudentAppQuestionBankDraftAnswer,
			CreateStudentAppQuestionBankDraftAnswerScoringRequest: createStudentAppQuestionBankDraftAnswerScoringRequest,
			ReadStudentAppQuestionBankDraftAnswerScoringResult:    readStudentAppQuestionBankDraftAnswerScoringResult,
			CreateStudentAppAITutorRequest:                        createStudentAppAITutorRequest,
			ListStudentAppAITutorRequests:                         listStudentAppAITutorRequests,
			CreateAIGradingRequest:                                createAIGradingRequest,
			CreateQuizSubmissionAIGrading:                         createQuizSubmissionAIGradingRequest,
			ListAIGradingRequests:                                 listAIGradingRequests,
			ClaimAIGradingRequest:                                 claimAIGradingRequest,
			RecordAIGradingResult:                                 recordAIGradingResult,
			ReadQuestionBankDraftAnswerScoringInput:               readQuestionBankDraftAnswerScoringInput,
			CreateTutoringAnalysisRequest:                         createTutoringAnalysisRequest,
			ListTutoringAnalysisRequests:                          listTutoringAnalysisRequests,
			ClaimTutoringAnalysisRequest:                          claimTutoringAnalysisRequest,
			RecordTutoringAnalysisResult:                          recordTutoringAnalysisResult,
			SubmitTeachingQuizDraftIntent:                         submitTeachingQuizDraftIntent,
			SubmitArchiveMaterialDraftIntent:                      submitArchiveMaterialDraftIntent,
			CreateQuizSubmission:                                  createQuizSubmission,
			CreateScannedQuizSubmission:                           createScannedQuizSubmission,
			ListQuizSubmissions:                                   listQuizSubmissions,
			CreateAttendanceSession:                               createAttendanceSession,
			CreateAttendanceRecord:                                createAttendanceRecord,
			SignInAttendance:                                      signInAttendance,
			EndAttendanceSession:                                  endAttendanceSession,
			SelectAttendanceRandomStudents:                        selectAttendanceRandomStudents,
			ListAttendanceRecords:                                 listAttendanceRecords,
			ListStudentAttendanceRecords:                          listStudentAttendanceRecords,
			GetAttendanceStatistics:                               getAttendanceStatistics,
			AgentAPIKey:                                           getenv("AGENT_API_KEY", "ueacd"),
			DiagnosticsSecret:                                     getenv("INTERNAL_DIAGNOSTICS_SECRET", "ueacd"),
			DBPoolStatsProvider:                                   db,
			CommandLogProvider:                                    writeRepositories.CommandLogProvider,
		}).Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf("teaching-archive-gateway listening on %s", server.Addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

type teachingWriteRepositoryBundle struct {
	ArchiveCreateRepository  usecase.ArchiveRepository
	QuizSubmissionRepository usecase.QuizSubmissionRepository
	TeachingDraftCommandPort usecase.TeachingDraftCommandPort
	CommandLogProvider       platform.TeachingCommandLogStatsProvider
}

func teachingWriteRepositoriesFromConfig(db teachingpostgres.AcquireDB) teachingWriteRepositoryBundle {
	archiveProjection := archiveCreateRepositoryFromConfig(db)
	quizProjection := quizSubmissionRepositoryFromConfig(db)
	if teachingWriteAcceptanceModeFromConfig() != "durable-log" {
		return teachingWriteRepositoryBundle{
			ArchiveCreateRepository:  archiveProjection,
			QuizSubmissionRepository: quizProjection,
			TeachingDraftCommandPort: teachingIntentCommandPortFromConfig(),
		}
	}
	repository, err := teachingcommandlog.NewRepository(teachingcommandlog.Config{
		Path:              teachingCommandLogPathFromConfig(),
		AppendBatchSize:   getenvInt("TEACHING_COMMAND_LOG_APPEND_BATCH_SIZE", 64),
		QueueCapacity:     getenvInt("TEACHING_COMMAND_LOG_QUEUE_CAPACITY", 65536),
		ProjectionWorkers: getenvInt("TEACHING_COMMAND_LOG_PROJECTION_WORKERS", 4),
		Sync:              getenvBool("TEACHING_COMMAND_LOG_SYNC", true),
		ArchiveProjection: archiveProjection,
		QuizProjection:    quizProjection,
	})
	if err != nil {
		log.Fatal(err)
	}
	return teachingWriteRepositoryBundle{
		ArchiveCreateRepository:  repository,
		QuizSubmissionRepository: repository,
		TeachingDraftCommandPort: repository,
		CommandLogProvider:       repository,
	}
}

func teachingIntentCommandPortFromConfig() usecase.TeachingDraftCommandPort {
	repository, err := teachingcommandlog.NewIntentRepository(teachingcommandlog.IntentRepositoryConfig{
		Path:            teachingCommandLogPathFromConfig(),
		AppendBatchSize: getenvInt("TEACHING_COMMAND_LOG_APPEND_BATCH_SIZE", 64),
		Sync:            getenvBool("TEACHING_COMMAND_LOG_SYNC", true),
	})
	if err != nil {
		log.Fatal(err)
	}
	return repository
}

func teachingWriteAcceptanceModeFromConfig() string {
	value := strings.ToLower(strings.TrimSpace(getenv("TEACHING_WRITE_ACCEPTANCE_MODE", "sync")))
	switch value {
	case "sync", "durable-log":
		return value
	default:
		panic(fmt.Sprintf("TEACHING_WRITE_ACCEPTANCE_MODE must be %q or %q: %q", "sync", "durable-log", value))
	}
}

func teachingCommandLogPathFromConfig() string {
	if path := strings.TrimSpace(os.Getenv("TEACHING_COMMAND_LOG_PATH")); path != "" {
		return path
	}
	return filepath.Join("reports", "teaching-command-log", "teaching-"+getenv("PORT", "18120")+".jsonl")
}

func mustOpenPostgres(ctx context.Context) *pgxpool.Pool {
	databaseURL := getenv(
		"DATABASE_URL",
		"postgres://app_user:ueacd@127.0.0.1:6432/intelligent_teaching_assistant?sslmode=disable",
	)
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		log.Fatal(err)
	}

	settings, err := postgresPoolSettingsFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	applyPostgresPoolSettings(config, settings)
	config.MaxConnIdleTime = 10 * time.Minute
	config.MaxConnLifetime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		log.Fatal(err)
	}
	if err := prewarmPostgresPool(ctx, pool, settings.PrewarmConns); err != nil {
		pool.Close()
		log.Fatal(err)
	}
	log.Printf(
		"teaching archive postgres pool ready: maxConns=%d minConns=%d prewarmConns=%d",
		settings.MaxConns,
		settings.MinConns,
		settings.PrewarmConns,
	)
	return pool
}

func archiveReaderFromConfig(reader usecase.ArchiveReader) usecase.ArchiveReader {
	ttlMs := getenvNonNegativeInt("TEACHING_ARCHIVE_LIST_CACHE_TTL_MS", 0)
	if ttlMs == 0 {
		return reader
	}
	return teachingcache.NewArchiveReader(reader, teachingcache.ArchiveReaderConfig{
		TTL:        time.Duration(ttlMs) * time.Millisecond,
		MaxEntries: getenvInt("TEACHING_ARCHIVE_LIST_CACHE_MAX_ENTRIES", 1024),
	})
}

func schemaOptionsFromConfig() (teachingpostgres.SchemaOptions, error) {
	indexProfile, err := teachingpostgres.NormalizeSchemaIndexProfile(
		getenv("TEACHING_ARCHIVE_SCHEMA_INDEX_PROFILE", string(teachingpostgres.SchemaIndexProfileFull)),
	)
	if err != nil {
		return teachingpostgres.SchemaOptions{}, err
	}
	return teachingpostgres.SchemaOptions{
		IndexProfile: indexProfile,
	}, nil
}

type postgresPoolSettings struct {
	MaxConns     int
	MinConns     int
	PrewarmConns int
}

func postgresPoolSettingsFromEnv() (postgresPoolSettings, error) {
	return parsePostgresPoolSettings(os.Getenv)
}

func parsePostgresPoolSettings(getenv func(string) string) (postgresPoolSettings, error) {
	settings := postgresPoolSettings{}
	var err error
	settings.MaxConns, err = getenvIntFrom(getenv, "DB_MAX_CONNS", 8, true)
	if err != nil {
		return postgresPoolSettings{}, err
	}
	settings.MinConns, err = getenvIntFrom(getenv, "DB_MIN_CONNS", 0, false)
	if err != nil {
		return postgresPoolSettings{}, err
	}
	settings.PrewarmConns, err = getenvIntFrom(getenv, "DB_PREWARM_CONNS", 1, false)
	if err != nil {
		return postgresPoolSettings{}, err
	}
	if settings.MinConns > settings.MaxConns {
		return postgresPoolSettings{}, fmt.Errorf("DB_MIN_CONNS must be <= DB_MAX_CONNS: %d > %d", settings.MinConns, settings.MaxConns)
	}
	if settings.PrewarmConns > settings.MaxConns {
		return postgresPoolSettings{}, fmt.Errorf("DB_PREWARM_CONNS must be <= DB_MAX_CONNS: %d > %d", settings.PrewarmConns, settings.MaxConns)
	}
	return settings, nil
}

func applyPostgresPoolSettings(config *pgxpool.Config, settings postgresPoolSettings) {
	config.MaxConns = int32(settings.MaxConns)
	config.MinConns = int32(settings.MinConns)
}

func prewarmPostgresPool(ctx context.Context, pool *pgxpool.Pool, count int) error {
	if count == 0 {
		return nil
	}
	connections := make([]*pgxpool.Conn, 0, count)
	defer func() {
		for _, connection := range connections {
			connection.Release()
		}
	}()
	for index := 0; index < count; index++ {
		connection, err := acquirePrewarmPostgresConnection(ctx, pool)
		if err != nil {
			return err
		}
		connections = append(connections, connection)
	}
	return nil
}

func acquirePrewarmPostgresConnection(ctx context.Context, pool *pgxpool.Pool) (*pgxpool.Conn, error) {
	var connection *pgxpool.Conn
	err := retryPrewarmOperation(ctx, 8, 100*time.Millisecond, func() error {
		acquired, err := pool.Acquire(ctx)
		if err != nil {
			return err
		}
		if err := acquired.Ping(ctx); err != nil {
			acquired.Release()
			return err
		}
		connection = acquired
		return nil
	})
	return connection, err
}

func retryPrewarmOperation(ctx context.Context, attempts int, delay time.Duration, operation func() error) error {
	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		lastErr = operation()
		if lastErr == nil {
			return nil
		}
		if attempt == attempts {
			break
		}
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return errors.Join(lastErr, ctx.Err())
		case <-timer.C:
		}
	}
	return lastErr
}

func archiveCreateRepositoryFromConfig(db teachingpostgres.AcquireDB) usecase.ArchiveRepository {
	batchSize := getenvNonNegativeInt("TEACHING_ARCHIVE_CREATE_BATCH_SIZE", 1)
	if batchSize <= 1 {
		return teachingpostgres.NewArchiveRepository(db)
	}
	return teachingpostgres.NewBatchingArchiveItemRepository(db, teachingpostgres.ArchiveCreateBatchConfig{
		MaxSize:  batchSize,
		MaxDelay: time.Duration(getenvNonNegativeInt("TEACHING_ARCHIVE_CREATE_BATCH_DELAY_MS", 0)) * time.Millisecond,
		Workers:  getenvInt("TEACHING_ARCHIVE_CREATE_BATCH_WORKERS", 1),
		Mode: teachingpostgres.ArchiveCreateBatchMode(
			getenv("TEACHING_ARCHIVE_CREATE_BATCH_MODE", string(teachingpostgres.ArchiveCreateBatchModeInsert)),
		),
	})
}

func quizSubmissionRepositoryFromConfig(db teachingpostgres.AcquireDB) usecase.QuizSubmissionRepository {
	defaultBatchSize := getenvNonNegativeInt("TEACHING_ARCHIVE_CREATE_BATCH_SIZE", 1)
	defaultBatchDelayMs := getenvNonNegativeInt("TEACHING_ARCHIVE_CREATE_BATCH_DELAY_MS", 0)
	defaultBatchWorkers := getenvInt("TEACHING_ARCHIVE_CREATE_BATCH_WORKERS", 1)
	batchSize := getenvNonNegativeInt("TEACHING_QUIZ_SUBMISSION_BATCH_SIZE", defaultBatchSize)
	if batchSize <= 1 {
		return teachingpostgres.NewArchiveRepository(db)
	}
	return teachingpostgres.NewBatchingQuizSubmissionRepository(db, teachingpostgres.QuizSubmissionBatchConfig{
		MaxSize:  batchSize,
		MaxDelay: time.Duration(getenvNonNegativeInt("TEACHING_QUIZ_SUBMISSION_BATCH_DELAY_MS", defaultBatchDelayMs)) * time.Millisecond,
		Workers:  getenvInt("TEACHING_QUIZ_SUBMISSION_BATCH_WORKERS", defaultBatchWorkers),
	})
}

func getenv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func getenvInt(key string, fallback int) int {
	parsed, err := getenvIntFrom(os.Getenv, key, fallback, true)
	if err != nil {
		panic(err.Error())
	}
	return parsed
}

func getenvNonNegativeInt(key string, fallback int) int {
	parsed, err := getenvIntFrom(os.Getenv, key, fallback, false)
	if err != nil {
		panic(err.Error())
	}
	return parsed
}

func getenvBool(key string, fallback bool) bool {
	value := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if value == "" {
		return fallback
	}
	switch value {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		panic(fmt.Sprintf("%s must be a boolean: %q", key, value))
	}
}

func getenvIntFrom(getenv func(string) string, key string, fallback int, positive bool) (int, error) {
	value := getenv(key)
	if value == "" {
		value = strconv.Itoa(fallback)
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer: %q", key, value)
	}
	if positive && parsed < 1 {
		return 0, fmt.Errorf("%s must be positive: %d", key, parsed)
	}
	if !positive && parsed < 0 {
		return 0, fmt.Errorf("%s must be non-negative: %d", key, parsed)
	}
	if !positive && fallback < 0 {
		return 0, errors.New("non-negative fallback must not be negative")
	}
	return parsed, nil
}
