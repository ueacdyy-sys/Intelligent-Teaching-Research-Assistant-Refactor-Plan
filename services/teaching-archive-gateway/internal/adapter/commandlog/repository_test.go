package commandlog_test

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/commandlog"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestCreateQuizSubmissionForAcceptedTeachingQuizUsesLocalDurableFactBeforeProjectionLookup(t *testing.T) {
	projection := &recordingProjection{items: map[string]domain.ArchiveItem{}}
	repository, err := commandlog.NewRepository(commandlog.Config{
		Path:              filepath.Join(t.TempDir(), "teaching-commands.jsonl"),
		AppendBatchSize:   1,
		QueueCapacity:     16,
		ProjectionWorkers: 1,
		Sync:              true,
		ArchiveProjection: projection,
		QuizProjection:    projection,
	})
	if err != nil {
		t.Fatalf("NewRepository returned error: %v", err)
	}
	defer repository.Close()

	item := domain.ArchiveItem{
		ID:           "tarch_quiz_001",
		OwnerType:    domain.OwnerTypeTeaching,
		MaterialType: domain.MaterialTypeQuiz,
		Title:        "Unit test quiz",
		Source:       domain.SourceTeacherUpload,
		ContentRef:   "local://quiz/001.json",
		OCRStatus:    domain.OCRStatusReserved,
		CreatedAt:    time.Date(2026, 6, 4, 10, 0, 0, 0, time.UTC),
	}
	if _, err := repository.Create(context.Background(), item); err != nil {
		t.Fatalf("Create returned error: %v", err)
	}

	created, _, err := repository.CreateQuizSubmissionForExistingTeachingQuiz(
		context.Background(),
		domain.QuizSubmission{
			ID:                     "quiz_sub_001",
			QuizArchiveItemID:      item.ID,
			StudentID:              "student_001",
			SubmittedByPrincipalID: "student_001",
			AnswerRef:              "local://answers/001.json",
			Status:                 domain.QuizSubmissionStatusSubmitted,
			SubmittedAt:            time.Date(2026, 6, 4, 10, 1, 0, 0, time.UTC),
		},
	)
	if err != nil {
		t.Fatalf("CreateQuizSubmissionForExistingTeachingQuiz returned error: %v", err)
	}
	if !created {
		t.Fatal("created = false, want true")
	}
	if projection.getByIDCalls != 0 {
		t.Fatalf("projection GetByID calls = %d, want 0", projection.getByIDCalls)
	}
}

func TestSubmitQuizDraftIntentRecordsCommandWithoutProjection(t *testing.T) {
	projection := &recordingProjection{items: map[string]domain.ArchiveItem{}}
	logPath := filepath.Join(t.TempDir(), "teaching-commands.jsonl")
	repository, err := commandlog.NewRepository(commandlog.Config{
		Path:              logPath,
		AppendBatchSize:   1,
		QueueCapacity:     16,
		ProjectionWorkers: 1,
		Sync:              true,
		ArchiveProjection: projection,
		QuizProjection:    projection,
	})
	if err != nil {
		t.Fatalf("NewRepository returned error: %v", err)
	}
	defer repository.Close()

	intent := domain.TeachingQuizDraftIntent{
		ID:                     "quiz_draft_intent_001",
		RequestedByPrincipalID: "teacher_001",
		SessionID:              "sess_teacher",
		Title:                  "Week 3 fractions check",
		SourceMaterialRefs:     []string{"tarch_lesson_001"},
		LearningObjectives:     []string{"compare fractions"},
		QuestionCount:          10,
		Difficulty:             domain.TeachingQuizDraftDifficultyMedium,
		SharedContextRef:       "shared-context://agent-task-001",
		GuardrailResultRef:     "guardrail://agent-task-001",
		RouteDecisionRef:       "route://agent-task-001",
		InputHash:              "sha256:abc123",
		OutputSummary:          "review-only quiz draft intent",
		ApprovalArtifactRef:    "approval://agent-task-001",
		RollbackPlanRef:        "rollback://agent-task-001",
		AuditTraceRef:          "audit://agent-task-001",
		IdempotencyKey:         "teaching-quiz-draft:week-3",
		Status:                 domain.TeachingQuizDraftIntentReviewRequired,
		ApprovalRequired:       true,
		EventType:              domain.TeachingQuizDraftIntentReviewRequiredEvent,
		CreatedAt:              time.Date(2026, 6, 4, 16, 0, 0, 0, time.UTC),
	}
	outcome, err := repository.SubmitQuizDraftIntent(context.Background(), intent)
	if err != nil {
		t.Fatalf("SubmitQuizDraftIntent returned error: %v", err)
	}
	if outcome.CommandID != commandlog.CommandIDForQuizDraftIntent(intent.ID) {
		t.Fatalf("CommandID = %q", outcome.CommandID)
	}
	stats := repository.TeachingCommandLogStats()
	if stats.AcceptedCommands != 1 {
		t.Fatalf("AcceptedCommands = %d, want 1", stats.AcceptedCommands)
	}
	if stats.ProjectionEnqueued != 0 || stats.QueueDepth != 0 {
		t.Fatalf("projection stats = %#v, want no projection", stats)
	}

	data, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("ReadFile returned error: %v", err)
	}
	for _, fragment := range [][]byte{
		[]byte(`"type":"submit_teaching_quiz_draft_intent"`),
		[]byte(`"quizDraftIntent"`),
		[]byte(`"approvalRequired":true`),
		[]byte(`"eventType":"AGENT_WRITE_INTENT_REVIEW_REQUIRED"`),
	} {
		if !bytes.Contains(data, fragment) {
			t.Fatalf("log missing %s in %s", fragment, string(data))
		}
	}
}

func TestSubmitArchiveMaterialDraftIntentRecordsCommandWithoutProjection(t *testing.T) {
	projection := &recordingProjection{items: map[string]domain.ArchiveItem{}}
	logPath := filepath.Join(t.TempDir(), "teaching-commands.jsonl")
	repository, err := commandlog.NewRepository(commandlog.Config{
		Path:              logPath,
		AppendBatchSize:   1,
		QueueCapacity:     16,
		ProjectionWorkers: 1,
		Sync:              true,
		ArchiveProjection: projection,
		QuizProjection:    projection,
	})
	if err != nil {
		t.Fatalf("NewRepository returned error: %v", err)
	}
	defer repository.Close()

	intent := domain.TeachingArchiveMaterialDraftIntent{
		ID:                     "archive_material_draft_intent_001",
		RequestedByPrincipalID: "teacher_001",
		SessionID:              "sess_teacher",
		OwnerType:              domain.OwnerTypeStudent,
		StudentID:              "student_001",
		MaterialType:           domain.MaterialTypeHandout,
		Title:                  "Student fraction portfolio packet",
		Source:                 domain.SourceTeacherUpload,
		SourceRefs:             []string{"tarch_quiz_001"},
		DraftArtifactRef:       "draft://archive-material/student_001/fractions-packet",
		Tags:                   []string{"fractions"},
		AnalysisIntents:        []domain.AnalysisIntent{domain.AnalysisIntentTutoring},
		SharedContextRef:       "shared-context://agent-task-archive-material-001",
		GuardrailResultRef:     "guardrail://agent-task-archive-material-001",
		RouteDecisionRef:       "route://agent-task-archive-material-001",
		InputHash:              "sha256:archive123",
		OutputSummary:          "review-only archive material draft intent",
		ApprovalArtifactRef:    "approval://agent-task-archive-material-001",
		RollbackPlanRef:        "rollback://agent-task-archive-material-001",
		AuditTraceRef:          "audit://agent-task-archive-material-001",
		IdempotencyKey:         "archive-material-draft:student_001:fractions",
		Status:                 domain.TeachingArchiveMaterialDraftIntentReviewRequired,
		ApprovalRequired:       true,
		EventType:              domain.TeachingArchiveMaterialDraftIntentReviewRequiredEvent,
		CreatedAt:              time.Date(2026, 6, 4, 17, 30, 0, 0, time.UTC),
	}
	outcome, err := repository.SubmitArchiveMaterialDraftIntent(context.Background(), intent)
	if err != nil {
		t.Fatalf("SubmitArchiveMaterialDraftIntent returned error: %v", err)
	}
	if outcome.CommandID != commandlog.CommandIDForArchiveMaterialDraftIntent(intent.ID) {
		t.Fatalf("CommandID = %q", outcome.CommandID)
	}
	stats := repository.TeachingCommandLogStats()
	if stats.AcceptedCommands != 1 {
		t.Fatalf("AcceptedCommands = %d, want 1", stats.AcceptedCommands)
	}
	if stats.ProjectionEnqueued != 0 || stats.QueueDepth != 0 {
		t.Fatalf("projection stats = %#v, want no projection", stats)
	}

	data, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("ReadFile returned error: %v", err)
	}
	for _, fragment := range [][]byte{
		[]byte(`"type":"submit_teaching_archive_material_draft_intent"`),
		[]byte(`"archiveMaterialDraftIntent"`),
		[]byte(`"draftArtifactRef":"draft://archive-material/student_001/fractions-packet"`),
		[]byte(`"approvalRequired":true`),
		[]byte(`"eventType":"AGENT_WRITE_INTENT_REVIEW_REQUIRED"`),
	} {
		if !bytes.Contains(data, fragment) {
			t.Fatalf("log missing %s in %s", fragment, string(data))
		}
	}
}

type recordingProjection struct {
	mu           sync.Mutex
	items        map[string]domain.ArchiveItem
	submissions  []domain.QuizSubmission
	getByIDCalls int
}

func (p *recordingProjection) Create(_ context.Context, item domain.ArchiveItem) (usecase.WritePersistenceOutcome, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.items[item.ID] = item
	return usecase.PersistedWriteOutcome(), nil
}

func (p *recordingProjection) GetByID(_ context.Context, id string) (domain.ArchiveItem, bool, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.getByIDCalls++
	item, ok := p.items[id]
	return item, ok, nil
}

func (p *recordingProjection) CreateQuizSubmission(
	_ context.Context,
	submission domain.QuizSubmission,
) (usecase.WritePersistenceOutcome, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.submissions = append(p.submissions, submission)
	return usecase.PersistedWriteOutcome(), nil
}
