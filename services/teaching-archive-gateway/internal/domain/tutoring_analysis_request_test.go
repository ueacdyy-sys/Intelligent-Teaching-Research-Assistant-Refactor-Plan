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

func TestNormalizeListTutoringAnalysisRequestsInputDecodesCursor(t *testing.T) {
	cursor, err := domain.EncodeTutoringAnalysisRequestCursor(domain.TutoringAnalysisRequest{
		ID:        "tutor_req_cursor",
		CreatedAt: time.Date(2026, 5, 29, 14, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("EncodeTutoringAnalysisRequestCursor returned error: %v", err)
	}

	query, err := domain.NormalizeListTutoringAnalysisRequestsInput(domain.ListTutoringAnalysisRequestsInput{
		Status:                 domain.TutoringAnalysisStatusQueued,
		ArchiveItemID:          " tarch_item_001 ",
		SourceArchiveOwnerType: domain.OwnerTypeStudent,
		StudentID:              " student_001 ",
		PageSize:               25,
		Cursor:                 cursor,
	})
	if err != nil {
		t.Fatalf("NormalizeListTutoringAnalysisRequestsInput returned error: %v", err)
	}

	if query.ArchiveItemID != "tarch_item_001" {
		t.Fatalf("ArchiveItemID = %q", query.ArchiveItemID)
	}
	if query.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", query.StudentID)
	}
	if query.FetchLimit != 26 {
		t.Fatalf("FetchLimit = %d", query.FetchLimit)
	}
	if query.Cursor == nil || query.Cursor.ID != "tutor_req_cursor" {
		t.Fatalf("Cursor = %#v", query.Cursor)
	}
}

func TestBuildTutoringAnalysisRequestPageBuildsNextCursor(t *testing.T) {
	page, err := domain.BuildTutoringAnalysisRequestPage([]domain.TutoringAnalysisRequest{
		{ID: "tutor_req_2", CreatedAt: time.Date(2026, 5, 29, 14, 2, 0, 0, time.UTC)},
		{ID: "tutor_req_1", CreatedAt: time.Date(2026, 5, 29, 14, 1, 0, 0, time.UTC)},
	}, 1)
	if err != nil {
		t.Fatalf("BuildTutoringAnalysisRequestPage returned error: %v", err)
	}
	if len(page.Items) != 1 {
		t.Fatalf("items = %d", len(page.Items))
	}
	if !page.PageInfo.HasMore || page.PageInfo.NextCursor == "" {
		t.Fatalf("pageInfo = %#v", page.PageInfo)
	}
}
