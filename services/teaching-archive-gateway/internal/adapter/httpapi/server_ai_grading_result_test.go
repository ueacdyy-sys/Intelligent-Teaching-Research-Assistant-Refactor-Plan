package httpapi_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestRecordAIGradingResultReturnsUpdatedResponse(t *testing.T) {
	handler := newTestHandlerWithAIGradingClaimRequests([]domain.AIGradingRequest{
		claimedAIGradingRequest("grading_req_http_claim", "tarch_http_3", "student_001", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/ai-grading-requests/grading_req_http_claim/worker-result",
		bytes.NewBufferString(`{"status":"SUCCEEDED","workerId":"worker_ai_grading_01","scoreSummary":" score 93 ","resultRef":"local://grading/grading_req_http_claim/result.json"}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, servicePrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"status":"SUCCEEDED"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"scoreSummary":"score 93"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"completedAt"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func TestRecordAIGradingResultRejectsTeacherPrincipal(t *testing.T) {
	handler := newTestHandlerWithAIGradingClaimRequests([]domain.AIGradingRequest{
		claimedAIGradingRequest("grading_req_http_claim", "tarch_http_3", "student_001", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/ai-grading-requests/grading_req_http_claim/worker-result",
		bytes.NewBufferString(`{"status":"SUCCEEDED","workerId":"worker_ai_grading_01","scoreSummary":"summary","resultRef":"local://grading/grading_req_http_claim/result.json"}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, teacherPrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestRecordAIGradingResultRequiresWorkerID(t *testing.T) {
	handler := newTestHandlerWithAIGradingClaimRequests([]domain.AIGradingRequest{
		claimedAIGradingRequest("grading_req_http_claim", "tarch_http_3", "student_001", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/ai-grading-requests/grading_req_http_claim/worker-result",
		bytes.NewBufferString(`{"status":"SUCCEEDED","scoreSummary":"summary","resultRef":"local://grading/grading_req_http_claim/result.json"}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, servicePrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func claimedAIGradingRequest(id string, archiveItemID string, studentID string, claimedAt time.Time) domain.AIGradingRequest {
	request := httpAIGradingRequest(id, archiveItemID, studentID, claimedAt.Add(-time.Hour))
	request.Status = domain.AIGradingStatusInProgress
	request.ClaimedByWorkerID = "worker_ai_grading_01"
	request.ClaimExpiresAt = claimedAt.Add(time.Hour)
	request.UpdatedAt = claimedAt
	return request
}

func (f *fakeRepository) GetAIGradingRequestByID(
	_ context.Context,
	id string,
) (domain.AIGradingRequest, bool, error) {
	for _, request := range f.gradingRequests {
		if request.ID == id {
			return request, true, nil
		}
	}
	return domain.AIGradingRequest{}, false, nil
}

func (f *fakeRepository) RecordAIGradingResult(
	_ context.Context,
	updated domain.AIGradingRequest,
) error {
	for index, request := range f.gradingRequests {
		if request.ID == updated.ID {
			f.gradingRequests[index] = updated
			return nil
		}
	}
	f.gradingRequests = append(f.gradingRequests, updated)
	return nil
}
