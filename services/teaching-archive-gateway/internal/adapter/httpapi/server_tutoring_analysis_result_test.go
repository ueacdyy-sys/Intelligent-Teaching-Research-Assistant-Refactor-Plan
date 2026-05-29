package httpapi_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestRecordTutoringAnalysisResultRequiresWorkerID(t *testing.T) {
	handler := newTestHandlerWithRequests([]domain.TutoringAnalysisRequest{
		claimedTutoringAnalysisRequest("tutor_req_http_3", "tarch_http_3", "student_001", time.Date(2026, 5, 29, 8, 40, 0, 0, time.UTC)),
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/tutoring-analysis-requests/tutor_req_http_3/worker-result",
		bytes.NewBufferString(`{"status":"SUCCEEDED","resultSummary":"summary","resultRef":"local://analysis/tutor_req_http_3/result.json"}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, servicePrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func claimedTutoringAnalysisRequest(id string, archiveItemID string, studentID string, claimedAt time.Time) domain.TutoringAnalysisRequest {
	request := tutoringAnalysisRequest(id, archiveItemID, studentID, claimedAt.Add(-time.Hour))
	request.Status = domain.TutoringAnalysisStatusInProgress
	request.ClaimedByWorkerID = "worker_teaching_ai_01"
	request.ClaimExpiresAt = claimedAt.Add(time.Hour)
	request.UpdatedAt = claimedAt
	return request
}
