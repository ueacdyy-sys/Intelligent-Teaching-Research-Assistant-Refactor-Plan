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

func TestCreateStudentAppAITutorRequestReturnsCreatedResponse(t *testing.T) {
	handler := newTestHandlerWithStudentAppAITutorRequest()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/ai-tutor-requests",
		bytes.NewBufferString(`{"studentArchiveItemId":" tarch_student_quiz ","analysisGoal":" explain weak skills "}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"id":"tutor_req_student_app"`),
		[]byte(`"archiveItemId":"tarch_student_quiz"`),
		[]byte(`"requestedByPrincipalId":"student_001"`),
		[]byte(`"questionBankIntent":"GENERATE_PERSONALIZED_CHECK"`),
		[]byte(`"sourceArchiveOwnerType":"STUDENT"`),
		[]byte(`"sourceArchiveStudentId":"student_001"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
}

func TestCreateStudentAppAITutorRequestRejectsUnsupportedMethod(t *testing.T) {
	handler := newTestHandlerWithStudentAppAITutorRequest()
	request := httptest.NewRequest(http.MethodGet, "/v1/student-app/ai-tutor-requests", http.NoBody)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func newTestHandlerWithStudentAppAITutorRequest() http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			archiveItem("tarch_student_quiz", "student_001", time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC)),
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		CreateStudentAppAITutorRequest: usecase.NewCreateStudentAppAITutorRequest(
			store,
			fixedIDs{id: "tutor_req_student_app"},
			fixedClock{now: time.Date(2026, 5, 30, 10, 30, 0, 0, time.UTC)},
		),
		AgentAPIKey: "ueacd",
	}).Handler()
}
