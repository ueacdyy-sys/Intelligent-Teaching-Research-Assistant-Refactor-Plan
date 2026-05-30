package httpapi_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/httpapi"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestListStudentAppAITutorRequestsReturnsOwnTutorRequestResponse(t *testing.T) {
	handler := newTestHandlerWithStudentAppAITutorRequests()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/ai-tutor-requests?status=SUCCEEDED&pageSize=10",
		nil,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"id":"tutor_req_completed"`),
		[]byte(`"archiveItemId":"tarch_http_3"`),
		[]byte(`"sourceArchiveStudentId":"student_001"`),
		[]byte(`"status":"SUCCEEDED"`),
		[]byte(`"resultSummary":"completed"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`tutor_req_other`),
		[]byte(`student_002`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func newTestHandlerWithStudentAppAITutorRequests() http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			archiveItem("tarch_http_3", "student_001", time.Date(2026, 5, 29, 10, 3, 0, 0, time.UTC)),
			archiveItem("tarch_http_other", "student_002", time.Date(2026, 5, 29, 10, 2, 30, 0, time.UTC)),
		},
		requests: []domain.TutoringAnalysisRequest{
			completedTutoringAnalysisRequest("tutor_req_completed", "tarch_http_3", "student_001", time.Date(2026, 5, 30, 10, 3, 0, 0, time.UTC)),
			tutoringAnalysisRequest("tutor_req_other", "tarch_http_other", "student_002", time.Date(2026, 5, 30, 10, 2, 30, 0, time.UTC)),
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		CreateStudentAppAITutorRequest: usecase.NewCreateStudentAppAITutorRequest(
			store,
			fixedIDs{id: "tutor_req_student_app"},
			fixedClock{now: time.Date(2026, 5, 30, 10, 30, 0, 0, time.UTC)},
		),
		ListStudentAppAITutorRequests: usecase.NewListStudentAppAITutorRequests(store),
		AgentAPIKey:                   "ueacd",
	}).Handler()
}
