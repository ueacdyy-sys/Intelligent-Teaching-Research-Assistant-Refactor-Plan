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
		"source_type",
		"source_follow_up_depth",
		"source_archive_student_id",
	} {
		if !strings.Contains(db.lastExecSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastExecSQL)
		}
	}
	if len(db.execArgs) != 20 {
		t.Fatalf("exec args = %d, want 20", len(db.execArgs))
	}
	if db.execArgs[0] != "tutor_req_student_app_001" ||
		db.execArgs[1] != "tarch_student_quiz_001" ||
		db.execArgs[2] != "student_001" ||
		db.execArgs[4] != domain.QuestionBankIntentGeneratePersonalizedCheck ||
		db.execArgs[5] != domain.TutoringAnalysisStatusQueued ||
		db.execArgs[6] != domain.StudentAppAITutorLearningActionSourcePublishedStudyPacket ||
		db.execArgs[7] != 0 ||
		db.execArgs[8] != domain.OwnerTypeStudent ||
		db.execArgs[9] != "student_001" ||
		db.execArgs[10] != domain.MaterialTypeQuiz {
		t.Fatalf("student app AI Tutor args = %#v", db.execArgs)
	}
}

func TestFindPendingStudentAppAITutorResultArchiveFollowUpRequestUsesSourceDepthKey(t *testing.T) {
	db := &recordingDB{
		rows: &singleTutoringAnalysisRequestRow{
			status:        domain.TutoringAnalysisStatusQueued,
			sourceType:    domain.StudentAppAITutorLearningActionSourceResultArchive,
			followUpDepth: 1,
		},
	}
	repository := postgres.NewArchiveRepository(db)

	got, ok, err := repository.FindPendingStudentAppAITutorResultArchiveFollowUpRequest(
		context.Background(),
		domain.StudentAppAITutorResultArchiveFollowUpPendingRequestQuery{
			ArchiveItemID:          "tarch_student_ai_tutor_result_001",
			RequestedByPrincipalID: "student_001",
			QuestionBankIntent:     domain.QuestionBankIntentGeneratePersonalizedCheck,
			FollowUpDepth:          1,
			StudentID:              "student_001",
		},
	)
	if err != nil {
		t.Fatalf("FindPendingStudentAppAITutorResultArchiveFollowUpRequest returned error: %v", err)
	}
	if !ok {
		t.Fatal("ok = false, want pending request")
	}
	if domain.TutoringAnalysisRequestLearningActionSource(got) != domain.StudentAppAITutorLearningActionSourceResultArchive ||
		got.FollowUpDepth != 1 {
		t.Fatalf("request = %#v", got)
	}
	for _, fragment := range []string{
		"FROM teaching_tutoring_analysis_requests",
		"archive_item_id = $1",
		"requested_by_principal_id = $2",
		"question_bank_intent = $3",
		"source_type = $4",
		"source_follow_up_depth = $5",
		"source_archive_student_id = $6",
		"status IN ($7, $8)",
		"ORDER BY created_at ASC, id ASC",
		"LIMIT 1",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 8 ||
		db.args[0] != "tarch_student_ai_tutor_result_001" ||
		db.args[1] != "student_001" ||
		db.args[2] != domain.QuestionBankIntentGeneratePersonalizedCheck ||
		db.args[3] != domain.StudentAppAITutorLearningActionSourceResultArchive ||
		db.args[4] != 1 ||
		db.args[5] != "student_001" ||
		db.args[6] != domain.TutoringAnalysisStatusQueued ||
		db.args[7] != domain.TutoringAnalysisStatusInProgress {
		t.Fatalf("query args = %#v", db.args)
	}
}
