package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNewAIGradingRequestQueuesQuizSubmissionSourceRefs(t *testing.T) {
	createdAt := time.Date(2026, 5, 30, 11, 0, 0, 0, time.UTC)
	request, err := domain.NewAIGradingRequest(
		"grading_req_submission",
		domain.CreateAIGradingRequestInput{
			Principal:               teacherPrincipalForQuiz("student_001"),
			ArchiveItemID:           "tarch_quiz_001",
			GradingInstructions:     "grade submitted answers",
			SourceArchiveOwnerType:  domain.OwnerTypeTeaching,
			SourceArchiveStudentID:  "student_001",
			SourceArchiveContentRef: " local://teaching/quizzes/week-3.pdf ",
			SourceQuizSubmissionID:  " quiz_sub_week_3 ",
			SourceAnswerRef:         " local://answers/student_001/week-3.json ",
			SourceArchiveMaterial:   domain.MaterialTypeQuiz,
			SourceArchiveOCRStatus:  domain.OCRStatusNotRequired,
			SourceAnalysisIntents:   []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly},
		},
		createdAt,
	)
	if err != nil {
		t.Fatalf("NewAIGradingRequest returned error: %v", err)
	}

	if request.SourceArchiveOwnerType != domain.OwnerTypeTeaching {
		t.Fatalf("SourceArchiveOwnerType = %q", request.SourceArchiveOwnerType)
	}
	if request.SourceQuizSubmissionID != "quiz_sub_week_3" {
		t.Fatalf("SourceQuizSubmissionID = %q", request.SourceQuizSubmissionID)
	}
	if request.SourceAnswerRef != "local://answers/student_001/week-3.json" {
		t.Fatalf("SourceAnswerRef = %q", request.SourceAnswerRef)
	}
}

func TestAuthorizeCreateQuizSubmissionAIGradingRequestAllowsAssignedTeacher(t *testing.T) {
	err := domain.AuthorizeCreateQuizSubmissionAIGradingRequest(
		teacherPrincipalForQuiz("student_001"),
		teachingQuizArchiveItem("tarch_quiz_001", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
		aiGradingQuizSubmission("quiz_sub_week_3", "tarch_quiz_001", "student_001"),
	)
	if err != nil {
		t.Fatalf("AuthorizeCreateQuizSubmissionAIGradingRequest returned error: %v", err)
	}
}

func TestAuthorizeCreateQuizSubmissionAIGradingRequestAllowsOwnStudent(t *testing.T) {
	err := domain.AuthorizeCreateQuizSubmissionAIGradingRequest(
		studentPrincipal("student_001"),
		teachingQuizArchiveItem("tarch_quiz_001", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
		aiGradingQuizSubmission("quiz_sub_week_3", "tarch_quiz_001", "student_001"),
	)
	if err != nil {
		t.Fatalf("AuthorizeCreateQuizSubmissionAIGradingRequest returned error: %v", err)
	}
}

func TestAuthorizeCreateQuizSubmissionAIGradingRequestRejectsMismatchedSubmission(t *testing.T) {
	err := domain.AuthorizeCreateQuizSubmissionAIGradingRequest(
		teacherPrincipalForQuiz("student_001"),
		teachingQuizArchiveItem("tarch_quiz_001", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
		aiGradingQuizSubmission("quiz_sub_week_3", "tarch_other_quiz", "student_001"),
	)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func aiGradingQuizSubmission(id string, quizArchiveItemID string, studentID string) domain.QuizSubmission {
	return domain.QuizSubmission{
		ID:                     id,
		QuizArchiveItemID:      quizArchiveItemID,
		StudentID:              studentID,
		SubmittedByPrincipalID: studentID,
		AnswerRef:              "local://answers/" + studentID + "/week-3.json",
		Status:                 domain.QuizSubmissionStatusSubmitted,
		SubmittedAt:            time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC),
	}
}
