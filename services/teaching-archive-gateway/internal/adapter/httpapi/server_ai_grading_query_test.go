package httpapi_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/httpapi"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestListAIGradingRequestsReturnsPaginatedResponse(t *testing.T) {
	handler := newTestHandlerWithAIGradingRequests([]domain.AIGradingRequest{
		httpAIGradingRequest("grading_req_http_3", "tarch_http_3", "student_001", time.Date(2026, 5, 29, 10, 3, 0, 0, time.UTC)),
		httpAIGradingRequest("grading_req_http_other", "tarch_http_other", "student_002", time.Date(2026, 5, 29, 10, 2, 30, 0, time.UTC)),
		httpAIGradingRequest("grading_req_http_2", "tarch_http_2", "student_001", time.Date(2026, 5, 29, 10, 2, 0, 0, time.UTC)),
	})
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/teaching/ai-grading-requests?sourceArchiveOwnerType=STUDENT&pageSize=2",
		nil,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, teacherPrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"data"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"hasMore":true`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func TestListAIGradingRequestsScopesStudentPrincipalToOwnRequests(t *testing.T) {
	handler := newTestHandlerWithAIGradingRequests([]domain.AIGradingRequest{
		httpAIGradingRequest("grading_req_http_3", "tarch_http_3", "student_001", time.Date(2026, 5, 29, 10, 3, 0, 0, time.UTC)),
		httpAIGradingRequest("grading_req_http_other", "tarch_http_other", "student_002", time.Date(2026, 5, 29, 10, 2, 30, 0, time.UTC)),
	})
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/teaching/ai-grading-requests?sourceArchiveOwnerType=STUDENT&pageSize=10",
		nil,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if bytes.Contains(response.Body.Bytes(), []byte("student_002")) {
		t.Fatalf("student_002 leaked in body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte("student_001")) {
		t.Fatalf("student_001 missing in body = %s", response.Body.String())
	}
}

func newTestHandlerWithAIGradingRequests(requests []domain.AIGradingRequest) http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			archiveItem("tarch_http_3", "student_001", time.Date(2026, 5, 29, 10, 3, 0, 0, time.UTC)),
			archiveItem("tarch_http_other", "student_002", time.Date(2026, 5, 29, 10, 2, 30, 0, time.UTC)),
			archiveItem("tarch_http_2", "student_001", time.Date(2026, 5, 29, 10, 2, 0, 0, time.UTC)),
		},
		gradingRequests: append([]domain.AIGradingRequest(nil), requests...),
	}
	createArchiveItem := usecase.NewCreateArchiveItem(
		store,
		fixedIDs{id: "tarch_http"},
		fixedClock{now: time.Date(2026, 5, 29, 8, 0, 0, 0, time.UTC)},
	)
	listArchiveItems := usecase.NewListArchiveItems(store)
	createAIGradingRequest := usecase.NewCreateAIGradingRequest(
		store,
		fixedIDs{id: "grading_req_http"},
		fixedClock{now: time.Date(2026, 5, 29, 8, 20, 0, 0, time.UTC)},
	)
	listAIGradingRequests := usecase.NewListAIGradingRequests(store)
	createTutoringRequest := usecase.NewCreateTutoringAnalysisRequest(
		store,
		fixedIDs{id: "tutor_req_http"},
		fixedClock{now: time.Date(2026, 5, 29, 8, 30, 0, 0, time.UTC)},
	)
	listTutoringRequests := usecase.NewListTutoringAnalysisRequests(store)
	claimTutoringRequest := usecase.NewClaimTutoringAnalysisRequest(
		store,
		fixedClock{now: time.Date(2026, 5, 29, 8, 40, 0, 0, time.UTC)},
	)
	recordTutoringResult := usecase.NewRecordTutoringAnalysisResult(
		store,
		fixedClock{now: time.Date(2026, 5, 29, 8, 45, 0, 0, time.UTC)},
	)
	return httpapi.NewServer(
		createArchiveItem,
		listArchiveItems,
		createAIGradingRequest,
		listAIGradingRequests,
		createTutoringRequest,
		listTutoringRequests,
		claimTutoringRequest,
		recordTutoringResult,
		"ueacd",
	).Handler()
}

func (f *fakeRepository) ListAIGradingRequests(
	_ context.Context,
	query domain.AIGradingRequestQuery,
) ([]domain.AIGradingRequest, error) {
	requests := make([]domain.AIGradingRequest, 0, len(f.gradingRequests))
	for _, request := range f.gradingRequests {
		if query.Status != "" && request.Status != query.Status {
			continue
		}
		if query.ArchiveItemID != "" && request.ArchiveItemID != query.ArchiveItemID {
			continue
		}
		if query.SourceArchiveOwnerType != "" && request.SourceArchiveOwnerType != query.SourceArchiveOwnerType {
			continue
		}
		if query.StudentID != "" && request.SourceArchiveStudentID != query.StudentID {
			continue
		}
		if len(query.StudentIDs) > 0 && !containsString(query.StudentIDs, request.SourceArchiveStudentID) {
			continue
		}
		requests = append(requests, request)
		if query.FetchLimit > 0 && len(requests) >= query.FetchLimit {
			break
		}
	}
	return requests, nil
}

func httpAIGradingRequest(id string, archiveItemID string, studentID string, createdAt time.Time) domain.AIGradingRequest {
	return domain.AIGradingRequest{
		ID:                     id,
		ArchiveItemID:          archiveItemID,
		RequestedByPrincipalID: studentID,
		GradingInstructions:    "grade short answers",
		RubricRef:              "local://rubrics/week-3.json",
		Status:                 domain.AIGradingStatusQueued,
		SourceArchiveOwnerType: domain.OwnerTypeStudent,
		SourceArchiveStudentID: studentID,
		SourceArchiveMaterial:  domain.MaterialTypeQuiz,
		SourceArchiveOCRStatus: domain.OCRStatusReserved,
		CreatedAt:              createdAt,
		UpdatedAt:              createdAt,
	}
}
