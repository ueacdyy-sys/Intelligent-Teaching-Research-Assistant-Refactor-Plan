package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNewAIGradingRequestQueuesEligibleArchiveMetadata(t *testing.T) {
	createdAt := time.Date(2026, 5, 29, 17, 0, 0, 0, time.UTC)
	request, err := domain.NewAIGradingRequest(
		"grading_req_fixed",
		domain.CreateAIGradingRequestInput{
			Principal:               teacherPrincipal(),
			ArchiveItemID:           "tarch_quiz",
			GradingInstructions:     " grade short answers against the rubric ",
			RubricRef:               " local://rubrics/week-3.json ",
			SourceArchiveOwnerType:  domain.OwnerTypeStudent,
			SourceArchiveStudentID:  "student_001",
			SourceArchiveContentRef: " local://archive/student/quiz.pdf ",
			SourceArchiveMaterial:   domain.MaterialTypeQuiz,
			SourceArchiveOCRStatus:  domain.OCRStatusReserved,
			SourceAnalysisIntents:   []domain.AnalysisIntent{domain.AnalysisIntentAIGrading},
		},
		createdAt,
	)
	if err != nil {
		t.Fatalf("NewAIGradingRequest returned error: %v", err)
	}

	if request.ID != "grading_req_fixed" {
		t.Fatalf("ID = %q", request.ID)
	}
	if request.Status != domain.AIGradingStatusQueued {
		t.Fatalf("Status = %q", request.Status)
	}
	if request.RequestedByPrincipalID != "teacher_001" {
		t.Fatalf("RequestedByPrincipalID = %q", request.RequestedByPrincipalID)
	}
	if request.GradingInstructions != "grade short answers against the rubric" {
		t.Fatalf("GradingInstructions = %q", request.GradingInstructions)
	}
	if request.RubricRef != "local://rubrics/week-3.json" {
		t.Fatalf("RubricRef = %q", request.RubricRef)
	}
	if request.SourceArchiveContentRef != "local://archive/student/quiz.pdf" {
		t.Fatalf("SourceArchiveContentRef = %q", request.SourceArchiveContentRef)
	}
	if request.SourceArchiveOCRStatus != domain.OCRStatusReserved {
		t.Fatalf("SourceArchiveOCRStatus = %q", request.SourceArchiveOCRStatus)
	}
	if !request.CreatedAt.Equal(createdAt) || !request.UpdatedAt.Equal(createdAt) {
		t.Fatalf("timestamps = %s / %s", request.CreatedAt, request.UpdatedAt)
	}
}

func TestNewAIGradingRequestRejectsMissingSourceContentRef(t *testing.T) {
	_, err := domain.NewAIGradingRequest(
		"grading_req_fixed",
		domain.CreateAIGradingRequestInput{
			Principal:              teacherPrincipal(),
			ArchiveItemID:          "tarch_quiz",
			GradingInstructions:    "grade it",
			SourceArchiveOwnerType: domain.OwnerTypeStudent,
			SourceArchiveStudentID: "student_001",
			SourceArchiveMaterial:  domain.MaterialTypeQuiz,
			SourceArchiveOCRStatus: domain.OCRStatusReserved,
			SourceAnalysisIntents:  []domain.AnalysisIntent{domain.AnalysisIntentAIGrading},
		},
		time.Date(2026, 5, 29, 17, 0, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestNewAIGradingRequestRejectsArchiveWithoutAIGradingIntent(t *testing.T) {
	_, err := domain.NewAIGradingRequest(
		"grading_req_fixed",
		domain.CreateAIGradingRequestInput{
			Principal:               teacherPrincipal(),
			ArchiveItemID:           "tarch_quiz",
			GradingInstructions:     "grade it",
			SourceArchiveOwnerType:  domain.OwnerTypeStudent,
			SourceArchiveStudentID:  "student_001",
			SourceArchiveContentRef: "local://archive/student/quiz.pdf",
			SourceArchiveMaterial:   domain.MaterialTypeQuiz,
			SourceArchiveOCRStatus:  domain.OCRStatusNotRequired,
			SourceAnalysisIntents:   []domain.AnalysisIntent{domain.AnalysisIntentTutoring},
		},
		time.Date(2026, 5, 29, 17, 0, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestNewAIGradingRequestRejectsTeachingMaterial(t *testing.T) {
	_, err := domain.NewAIGradingRequest(
		"grading_req_fixed",
		domain.CreateAIGradingRequestInput{
			Principal:               teacherPrincipal(),
			ArchiveItemID:           "tarch_lesson",
			GradingInstructions:     "grade it",
			SourceArchiveOwnerType:  domain.OwnerTypeTeaching,
			SourceArchiveContentRef: "local://archive/teaching/lesson.pdf",
			SourceArchiveMaterial:   domain.MaterialTypeTeachingMaterial,
			SourceArchiveOCRStatus:  domain.OCRStatusReserved,
			SourceAnalysisIntents:   []domain.AnalysisIntent{domain.AnalysisIntentAIGrading},
		},
		time.Date(2026, 5, 29, 17, 0, 0, 0, time.UTC),
	)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}
