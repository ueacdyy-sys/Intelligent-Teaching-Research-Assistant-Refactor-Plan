package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

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
	if err := teachingpostgres.EnsureSchema(ctx, db); err != nil {
		log.Fatal(err)
	}

	archiveRepository := teachingpostgres.NewArchiveRepository(db)
	createArchiveItem := usecase.NewCreateArchiveItem(
		archiveRepository,
		platform.IDGenerator{},
		platform.Clock{},
	)
	listArchiveItems := usecase.NewListArchiveItems(archiveRepository)
	createQuizSubmission := usecase.NewCreateQuizSubmission(
		archiveRepository,
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

	server := &http.Server{
		Addr: ":" + getenv("PORT", "18120"),
		Handler: httpapi.NewServer(
			createArchiveItem,
			listArchiveItems,
			createAIGradingRequest,
			createQuizSubmissionAIGradingRequest,
			listAIGradingRequests,
			claimAIGradingRequest,
			recordAIGradingResult,
			createTutoringAnalysisRequest,
			listTutoringAnalysisRequests,
			claimTutoringAnalysisRequest,
			recordTutoringAnalysisResult,
			createQuizSubmission,
			listQuizSubmissions,
			createAttendanceSession,
			createAttendanceRecord,
			getenv("AGENT_API_KEY", "ueacd"),
		).Handler(),
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

func mustOpenPostgres(ctx context.Context) *pgxpool.Pool {
	databaseURL := getenv(
		"DATABASE_URL",
		"postgres://app_user:ueacd@127.0.0.1:6432/intelligent_teaching_assistant?sslmode=disable",
	)
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		log.Fatal(err)
	}

	maxConns := getenvInt("DB_MAX_CONNS", 8)
	config.MaxConns = int32(maxConns)
	config.MinConns = 0
	config.MaxConnIdleTime = 10 * time.Minute
	config.MaxConnLifetime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		log.Fatal(err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		log.Fatal(err)
	}
	log.Printf("teaching archive postgres pool ready: maxConns=%d", maxConns)
	return pool
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
	if parsed < 1 {
		panic(fmt.Sprintf("%s must be positive: %d", key, parsed))
	}
	return parsed
}
