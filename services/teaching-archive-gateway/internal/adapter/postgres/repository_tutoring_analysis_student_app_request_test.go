package postgres_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestCreateStudentAppAITutorRequestInsertsQueuedStudentArchiveJob(t *testing.T) {
	db := &recordingDB{}
	repository := postgres.NewArchiveRepository(db)
	createdAt := time.Date(2026, 6, 5, 0, 0, 0, 0, time.UTC)

	err := repository.CreateTutoringAnalysisRequest(context.Background(), domain.TutoringAnalysisRequest{
		ID:                     "tutor_req_student_app_001",
		ArchiveItemID:          "tarch_student_quiz_001",
		RequestedByPrincipalID: "student_001",
		AnalysisGoal:           "explain weak algebra skills",
		QuestionBankIntent:     domain.QuestionBankIntentGeneratePersonalizedCheck,
		Status:                 domain.TutoringAnalysisStatusQueued,
		SourceArchiveOwnerType: domain.OwnerTypeStudent,
		SourceArchiveStudentID: "student_001",
		SourceArchiveMaterial:  domain.MaterialTypeQuiz,
		CreatedAt:              createdAt,
		UpdatedAt:              createdAt,
	})
	if err != nil {
		t.Fatalf("CreateTutoringAnalysisRequest returned error: %v", err)
	}
	for _, fragment := range []string{
		"INSERT INTO teaching_tutoring_analysis_requests",
		"archive_item_id",
		"question_bank_intent",
		"source_archive_student_id",
	} {
		if !strings.Contains(db.lastExecSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastExecSQL)
		}
	}
	if len(db.execArgs) != 18 {
		t.Fatalf("exec args = %d, want 18", len(db.execArgs))
	}
	if db.execArgs[0] != "tutor_req_student_app_001" ||
		db.execArgs[1] != "tarch_student_quiz_001" ||
		db.execArgs[2] != "student_001" ||
		db.execArgs[4] != domain.QuestionBankIntentGeneratePersonalizedCheck ||
		db.execArgs[5] != domain.TutoringAnalysisStatusQueued ||
		db.execArgs[6] != domain.OwnerTypeStudent ||
		db.execArgs[7] != "student_001" ||
		db.execArgs[8] != domain.MaterialTypeQuiz {
		t.Fatalf("student app AI Tutor args = %#v", db.execArgs)
	}
}
