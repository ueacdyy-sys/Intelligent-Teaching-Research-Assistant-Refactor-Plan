package domain_test

import (
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNewTutoringAnalysisRequestNormalizesMetadata(t *testing.T) {
	request, err := domain.NewTutoringAnalysisRequest(
		"tutor_req_fixed",
		domain.CreateTutoringAnalysisRequestInput{
			Principal:              teacherPrincipal(),
			ArchiveItemID:          " tarch_item_001 ",
			AnalysisGoal:           "  detect weak algebra skills  ",
			QuestionBankIntent:     domain.QuestionBankIntentGeneratePersonalizedCheck,
			SourceArchiveOwnerType: domain.OwnerTypeStudent,
			SourceArchiveStudentID: " student_001 ",
			SourceArchiveMaterial:  domain.MaterialTypeQuiz,
		},
		time.Date(2026, 5, 29, 14, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("NewTutoringAnalysisRequest returned error: %v", err)
	}

	if request.ArchiveItemID != "tarch_item_001" {
		t.Fatalf("ArchiveItemID = %q", request.ArchiveItemID)
	}
	if request.AnalysisGoal != "detect weak algebra skills" {
		t.Fatalf("AnalysisGoal = %q", request.AnalysisGoal)
	}
	if request.Status != domain.TutoringAnalysisStatusQueued {
		t.Fatalf("Status = %q", request.Status)
	}
	if request.SourceArchiveStudentID != "student_001" {
		t.Fatalf("SourceArchiveStudentID = %q", request.SourceArchiveStudentID)
	}
}
