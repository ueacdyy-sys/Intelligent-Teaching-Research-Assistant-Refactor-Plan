package domain_test

import (
	"errors"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNormalizeListStudentAppAITutorRequestsScopesOwnStudentRequests(t *testing.T) {
	query, err := domain.NormalizeListStudentAppAITutorRequestsInput(domain.ListStudentAppAITutorRequestsInput{
		Principal: studentPrincipal("student_001"),
		Status:    domain.TutoringAnalysisStatusSucceeded,
		PageSize:  20,
	})
	if err != nil {
		t.Fatalf("NormalizeListStudentAppAITutorRequestsInput returned error: %v", err)
	}
	if query.SourceArchiveOwnerType != domain.OwnerTypeStudent {
		t.Fatalf("SourceArchiveOwnerType = %q", query.SourceArchiveOwnerType)
	}
	if query.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", query.StudentID)
	}
	if query.Status != domain.TutoringAnalysisStatusSucceeded {
		t.Fatalf("Status = %q", query.Status)
	}
	if query.FetchLimit != 21 {
		t.Fatalf("FetchLimit = %d", query.FetchLimit)
	}
}

func TestNormalizeListStudentAppAITutorRequestsMapsProgressViewToSafeStatuses(t *testing.T) {
	query, err := domain.NormalizeListStudentAppAITutorRequestsInput(domain.ListStudentAppAITutorRequestsInput{
		Principal:    studentPrincipal("student_001"),
		ProgressView: " auto_refresh ",
		PageSize:     20,
	})
	if err != nil {
		t.Fatalf("NormalizeListStudentAppAITutorRequestsInput returned error: %v", err)
	}
	if query.Status != "" {
		t.Fatalf("Status = %q, want empty when progressView is used", query.Status)
	}
	if len(query.Statuses) != 2 ||
		query.Statuses[0] != domain.TutoringAnalysisStatusQueued ||
		query.Statuses[1] != domain.TutoringAnalysisStatusInProgress {
		t.Fatalf("Statuses = %#v", query.Statuses)
	}
}

func TestNormalizeListStudentAppAITutorRequestsRejectsAmbiguousStatusAndProgressView(t *testing.T) {
	_, err := domain.NormalizeListStudentAppAITutorRequestsInput(domain.ListStudentAppAITutorRequestsInput{
		Principal:    studentPrincipal("student_001"),
		Status:       domain.TutoringAnalysisStatusQueued,
		ProgressView: domain.StudentAppAITutorRequestProgressViewAutoRefresh,
	})
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestNormalizeListStudentAppAITutorRequestsRejectsUnsupportedProgressView(t *testing.T) {
	_, err := domain.NormalizeListStudentAppAITutorRequestsInput(domain.ListStudentAppAITutorRequestsInput{
		Principal:    studentPrincipal("student_001"),
		ProgressView: "RAW_WORKER_TRACE",
	})
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestNormalizeListStudentAppAITutorRequestsRejectsNonStudentAppPrincipals(t *testing.T) {
	studentWithoutOwnRead := studentPrincipal("student_001")
	studentWithoutOwnRead.Scopes = []domain.Scope{domain.ScopeTeachingRead}

	for name, principal := range map[string]domain.PrincipalContext{
		"teacher desktop":  teacherPrincipal(),
		"remote social":    remoteSocialPrincipal(),
		"service":          servicePrincipal(),
		"missing own read": studentWithoutOwnRead,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := domain.NormalizeListStudentAppAITutorRequestsInput(domain.ListStudentAppAITutorRequestsInput{
				Principal: principal,
			})
			if !errors.Is(err, domain.ErrForbidden) {
				t.Fatalf("error = %v, want ErrForbidden", err)
			}
		})
	}
}

func TestNormalizeReadStudentAppAITutorRequestProgressScopesOwnRequest(t *testing.T) {
	query, err := domain.NormalizeReadStudentAppAITutorRequestProgressInput(
		domain.ReadStudentAppAITutorRequestProgressInput{
			Principal: studentPrincipal("student_001"),
			RequestID: " tutor_req_progress_detail ",
		},
	)
	if err != nil {
		t.Fatalf("NormalizeReadStudentAppAITutorRequestProgressInput returned error: %v", err)
	}
	if query.ID != "tutor_req_progress_detail" ||
		query.SourceArchiveOwnerType != domain.OwnerTypeStudent ||
		query.StudentID != "student_001" ||
		query.PageSize != 1 ||
		query.FetchLimit != 1 {
		t.Fatalf("query = %#v", query)
	}
}

func TestNormalizeReadStudentAppAITutorRequestProgressRejectsUnsafeRequestID(t *testing.T) {
	_, err := domain.NormalizeReadStudentAppAITutorRequestProgressInput(
		domain.ReadStudentAppAITutorRequestProgressInput{
			Principal: studentPrincipal("student_001"),
			RequestID: "grading_req_wrong",
		},
	)
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestNormalizeReadStudentAppAITutorRequestProgressSummaryScopesOwnStudent(t *testing.T) {
	query, err := domain.NormalizeReadStudentAppAITutorRequestProgressSummaryInput(
		domain.ReadStudentAppAITutorRequestProgressSummaryInput{
			Principal: studentPrincipal("student_001"),
		},
	)
	if err != nil {
		t.Fatalf("NormalizeReadStudentAppAITutorRequestProgressSummaryInput returned error: %v", err)
	}
	if query.SourceArchiveOwnerType != domain.OwnerTypeStudent ||
		query.StudentID != "student_001" ||
		query.Status != "" ||
		query.FetchLimit != 0 ||
		query.Cursor != nil {
		t.Fatalf("query = %#v", query)
	}
}

func TestBuildStudentAppAITutorRequestProgressSummaryMapsStatusCounts(t *testing.T) {
	summary, err := domain.BuildStudentAppAITutorRequestProgressSummary(map[domain.TutoringAnalysisStatus]int{
		domain.TutoringAnalysisStatusQueued:     1,
		domain.TutoringAnalysisStatusInProgress: 1,
		domain.TutoringAnalysisStatusSucceeded:  2,
		domain.TutoringAnalysisStatusFailed:     1,
	})
	if err != nil {
		t.Fatalf("BuildStudentAppAITutorRequestProgressSummary returned error: %v", err)
	}
	if summary.TotalCount != 5 ||
		summary.AutoRefreshCount != 2 ||
		summary.ActionReadyCount != 2 ||
		summary.TeacherReviewRequiredCount != 1 ||
		summary.FailedCount != 1 {
		t.Fatalf("summary = %#v", summary)
	}
}

func TestBuildStudentAppAITutorRequestProgressSummaryRejectsUnsafeCounts(t *testing.T) {
	for name, counts := range map[string]map[domain.TutoringAnalysisStatus]int{
		"unsupported status": {
			domain.TutoringAnalysisStatus("RAW_WORKER_TRACE"): 1,
		},
		"negative count": {
			domain.TutoringAnalysisStatusQueued: -1,
		},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := domain.BuildStudentAppAITutorRequestProgressSummary(counts)
			if !errors.Is(err, domain.ErrValidation) {
				t.Fatalf("error = %v, want ErrValidation", err)
			}
		})
	}
}
